import { CONFIG } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';

/**
 * World Setup Dialog - Step-by-step initialization process for new Foundry worlds
 * Guides users through the process of connecting their Foundry world to Archivist
 */
export class WorldSetupDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor() {
        super();
        this.currentStep = 1;
        this.totalSteps = 6;
        this.isLoading = false;
        this.isValidatingApi = false;
        this.worlds = [];
        this.setupData = {
            apiKey: '',
            apiKeyValid: false,
            selectedWorldId: '',
            selectedWorldName: '',
            setupComplete: false,
            // Step 4 mapping
            mapping: {
                pc: { namePath: '', imagePath: '', descPath: '' },
                npc: { namePath: '', imagePath: '', descPath: '' },
                item: { namePath: '', imagePath: '', descPath: '' }
            },
            systemPreset: '',
            destinations: { pc: '', npc: '', item: '', location: '', faction: '' },
            // Step 5 selections
            selections: { pcs: [], npcs: [], items: [], locations: [], factions: [] }
        };
        this.fieldsCache = { actorString: [], itemString: [] };
        this.folderOptions = { pc: [], npc: [], item: [], location: [], faction: [] };
        this.mappingOptions = { actor: [], item: [] };
        this.archivistCandidates = { characters: [], items: [], locations: [], factions: [] };
        this.eligibleDocs = { pcs: [], npcs: [], items: [], locations: [], factions: [] };
        this.syncPlan = { createInFoundry: [], createInArchivist: [], link: [] };
        this.syncStatus = { total: 0, processed: 0, current: '', logs: [] };
    }

    /**
     * Application v2 configuration
     * @returns {Object} Application configuration
     */
    static DEFAULT_OPTIONS = {
        id: 'archivist-world-setup',
        tag: 'dialog',
        window: {
            title: 'ARCHIVIST_SYNC.worldSetup.title',
            icon: 'fas fa-magic',
            minimizable: false,
            resizable: true
        },
        position: {
            width: 1200,
            height: 900
        },
        classes: ['archivist-sync-dialog', 'world-setup-dialog'],
        actions: {
            nextStep: WorldSetupDialog.prototype._onNextStep,
            prevStep: WorldSetupDialog.prototype._onPrevStep,
            validateApiKey: WorldSetupDialog.prototype._onValidateApiKey,
            syncWorlds: WorldSetupDialog.prototype._onSyncWorlds,
            selectWorld: WorldSetupDialog.prototype._onSelectWorld,
            // Step 3 actions
            loadCampaigns: WorldSetupDialog.prototype._onLoadCampaigns,
            createCampaign: WorldSetupDialog.prototype._onCreateCampaign,
            campaignSelectChange: WorldSetupDialog.prototype._onCampaignSelectChange,
            confirmCampaign: WorldSetupDialog.prototype._onConfirmCampaign,
            // Step 5 actions
            prepareSelections: WorldSetupDialog.prototype._onPrepareSelections,
            toggleSelection: WorldSetupDialog.prototype._onToggleSelection,
            changeMatch: WorldSetupDialog.prototype._onChangeMatch,
            confirmSelections: WorldSetupDialog.prototype._onConfirmSelections,
            selectAll: WorldSetupDialog.prototype._onSelectAll,
            selectNone: WorldSetupDialog.prototype._onSelectNone,
            // Step 6 actions
            beginSync: WorldSetupDialog.prototype._onBeginSync,
            // Configuration file actions
            downloadSampleConfig: WorldSetupDialog.prototype._onDownloadSampleConfig,
            // Finalization
            completeSetup: WorldSetupDialog.prototype._onCompleteSetup,
            cancel: WorldSetupDialog.prototype._onCancel
        }
    };

    /**
     * Template path for the dialog
     * @returns {string} Template path
     */
    static PARTS = {
        form: {
            template: 'modules/archivist-sync/templates/world-setup-dialog.hbs'
        }
    };

    /**
     * Discover string properties in object model recursively
     * @param {Object} obj - Object to traverse
     * @param {string} basePath - Current path prefix
     * @param {Array} results - Array to collect results
     * @param {number} maxDepth - Maximum recursion depth
     * @param {number} currentDepth - Current recursion depth
     * @private
     */
    _discoverStringProperties(obj, basePath = '', results = [], maxDepth = 6, currentDepth = 0) {
        if (!obj || currentDepth >= maxDepth || typeof obj !== 'object') return results;

        for (const [key, value] of Object.entries(obj)) {
            const path = basePath ? `${basePath}.${key}` : key;

            if (typeof value === 'string' && value.trim().length > 0) {
                // Only include non-empty string properties
                results.push({
                    path,
                    type: 'string',
                    sample: value.length > 50 ? value.substring(0, 47) + '...' : value
                });
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recurse into nested objects
                this._discoverStringProperties(value, path, results, maxDepth, currentDepth + 1);
            }
        }

        return results;
    }

    /**
     * Prepare mapping options by discovering string properties in Actor and Item models
     * Uses temporary document creation to ensure complete property discovery
     * @private
     */
    async _prepareMappingOptions() {
        try {
            console.log('Archivist Sync | Discovering document properties...');

            // Discover Actor properties by creating temporary actors
            this.mappingOptions.actor = await this._discoverActorProperties();

            // Discover Item properties by creating temporary items  
            this.mappingOptions.item = await this._discoverItemProperties();

            // Sort options with priority for commonly used fields
            const sortWithPriority = (options, priorityFields = []) => {
                return options.sort((a, b) => {
                    const aPriority = priorityFields.indexOf(a.path);
                    const bPriority = priorityFields.indexOf(b.path);

                    // If both are priority fields, sort by priority order
                    if (aPriority !== -1 && bPriority !== -1) {
                        return aPriority - bPriority;
                    }

                    // Priority fields come first
                    if (aPriority !== -1) return -1;
                    if (bPriority !== -1) return 1;

                    // Then sort by path depth (simpler first), then alphabetically
                    const depthDiff = a.path.split('.').length - b.path.split('.').length;
                    return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
                });
            };

            const actorPriorityFields = [
                'name', 'img',
                'system.details.biography.value',
                'system.details.biography.public',
                'system.details.trait',
                'system.details.ideal',
                'system.details.bond',
                'system.details.flaw',
                'system.details.appearance',
                'system.description.value'
            ];

            const itemPriorityFields = [
                'name', 'img',
                'system.description.value',
                'system.description.short',
                'system.description.chat'
            ];

            this.mappingOptions.actor = sortWithPriority(this.mappingOptions.actor, actorPriorityFields);
            this.mappingOptions.item = sortWithPriority(this.mappingOptions.item, itemPriorityFields);

            console.log(`Archivist Sync | Property discovery complete: ${this.mappingOptions.actor.length} actor properties, ${this.mappingOptions.item.length} item properties`);

        } catch (error) {
            console.warn('Error preparing mapping options:', error);
            // Ensure we have fallback options
            this.mappingOptions.actor = [
                { path: 'name', type: 'string', sample: 'Actor name' },
                { path: 'img', type: 'string', sample: 'Actor image path' }
            ];
            this.mappingOptions.item = [
                { path: 'name', type: 'string', sample: 'Item name' },
                { path: 'img', type: 'string', sample: 'Item image path' }
            ];
        }
    }

    /**
     * Discover Actor properties by creating temporary actors of different types
     * Uses the new Document() constructor (v13+) instead of deprecated { temporary: true }
     * @private
     */
    async _discoverActorProperties() {
        const allProperties = new Map(); // Use Map to avoid duplicates by path
        const actorTypes = ['character', 'npc']; // Common D&D 5e actor types

        // First, try to use existing actors
        const existingActors = game.actors?.contents || [];
        for (const actor of existingActors.slice(0, 2)) { // Sample max 2 existing
            try {
                const actorData = actor.toObject();
                const properties = this._discoverStringProperties(actorData);
                for (const prop of properties) {
                    allProperties.set(prop.path, prop);
                }
                console.log(`Archivist Sync | Discovered ${properties.length} properties from existing ${actor.type} actor: ${actor.name}`);
            } catch (error) {
                console.warn(`Error discovering properties from existing actor ${actor.name}:`, error);
            }
        }

        // Try to discover properties from system data model templates instead of creating actors
        for (const actorType of actorTypes) {
            const hasExistingOfType = existingActors.some(a => a.type === actorType);

            if (!hasExistingOfType) {
                try {
                    console.log(`Archivist Sync | Attempting system template discovery for ${actorType} actor`);

                    // Try to access system data model template if available
                    let templateProperties = [];

                    // Check if we can access the system's data model templates
                    if (game.system?.model?.Actor?.[actorType]) {
                        console.log(`Archivist Sync | Found system template for ${actorType}`);
                        const template = game.system.model.Actor[actorType];
                        templateProperties = this._discoverStringProperties(template);

                        for (const prop of templateProperties) {
                            // Prefix with 'system.' since these are system model properties
                            const systemProp = {
                                ...prop,
                                path: prop.path.startsWith('system.') ? prop.path : `system.${prop.path}`,
                                sample: `${prop.sample} (from template)`
                            };
                            allProperties.set(systemProp.path, systemProp);
                        }

                        console.log(`Archivist Sync | Discovered ${templateProperties.length} properties from ${actorType} system template`);
                    } else {
                        // Fallback: use predefined property sets for this actor type
                        console.log(`Archivist Sync | No system template found for ${actorType}, using fallback properties`);
                        const fallbackProperties = this._getFallbackActorProperties(actorType);
                        for (const prop of fallbackProperties) {
                            allProperties.set(prop.path, prop);
                        }
                        console.log(`Archivist Sync | Used ${fallbackProperties.length} fallback properties for ${actorType} actor`);
                    }

                } catch (error) {
                    console.warn(`Error discovering properties for ${actorType} actor:`, error);

                    // Final fallback: use predefined property sets
                    try {
                        const fallbackProperties = this._getFallbackActorProperties(actorType);
                        for (const prop of fallbackProperties) {
                            allProperties.set(prop.path, prop);
                        }
                        console.log(`Archivist Sync | Used fallback properties for ${actorType} actor after error`);
                    } catch (fallbackError) {
                        console.warn(`Fallback also failed for ${actorType}:`, fallbackError);
                    }
                }
            }
        }

        // Add known D&D 5e paths that might not have been discovered
        const knownPaths = [
            { path: 'name', sample: 'Actor name' },
            { path: 'img', sample: 'Actor image path' },
            { path: 'system.details.biography.value', sample: 'Full biography text' },
            { path: 'system.details.biography.public', sample: 'Public biography text' },
            { path: 'system.description.value', sample: 'Description text' },
            { path: 'system.details.trait', sample: 'Personality traits' },
            { path: 'system.details.ideal', sample: 'Ideals' },
            { path: 'system.details.bond', sample: 'Bonds' },
            { path: 'system.details.flaw', sample: 'Flaws' },
            { path: 'system.details.appearance', sample: 'Physical appearance' },
            { path: 'system.details.background', sample: 'Character background' },
            { path: 'system.details.race', sample: 'Character race' },
            { path: 'system.details.class', sample: 'Character class' },
            { path: 'system.biography.value', sample: 'Biography (alt path)' },
            { path: 'system.biography.public', sample: 'Public biography (alt path)' }
        ];

        for (const pathInfo of knownPaths) {
            if (!allProperties.has(pathInfo.path)) {
                allProperties.set(pathInfo.path, {
                    path: pathInfo.path,
                    type: 'string',
                    sample: pathInfo.sample
                });
            }
        }

        return Array.from(allProperties.values());
    }

    /**
     * Get fallback properties for actor types when temporary document creation fails
     * @private
     */
    _getFallbackActorProperties(actorType) {
        const baseProperties = [
            { path: 'name', type: 'string', sample: 'Actor name' },
            { path: 'img', type: 'string', sample: 'Actor image path' }
        ];

        if (actorType === 'character') {
            return [
                ...baseProperties,
                { path: 'system.details.biography.value', type: 'string', sample: 'Full biography text' },
                { path: 'system.details.trait', type: 'string', sample: 'Personality traits' },
                { path: 'system.details.ideal', type: 'string', sample: 'Ideals' },
                { path: 'system.details.bond', type: 'string', sample: 'Bonds' },
                { path: 'system.details.flaw', type: 'string', sample: 'Flaws' },
                { path: 'system.details.appearance', type: 'string', sample: 'Physical appearance' },
                { path: 'system.details.background', type: 'string', sample: 'Character background' }
            ];
        } else if (actorType === 'npc') {
            return [
                ...baseProperties,
                { path: 'system.details.biography.value', type: 'string', sample: 'Full biography text' },
                { path: 'system.details.biography.public', type: 'string', sample: 'Public biography text' },
                { path: 'system.description.value', type: 'string', sample: 'Description text' }
            ];
        }

        return baseProperties;
    }

    /**
     * Discover Item properties by creating temporary items of different types
     * Uses the new Document() constructor (v13+) instead of deprecated { temporary: true }
     * @private
     */
    async _discoverItemProperties() {
        const allProperties = new Map(); // Use Map to avoid duplicates by path
        const itemTypes = ['weapon', 'equipment', 'consumable', 'spell', 'feat', 'loot']; // Common D&D 5e item types

        // First, try to use existing items
        const existingItems = game.items?.contents || [];
        for (const item of existingItems.slice(0, 2)) { // Sample max 2 existing
            try {
                const itemData = item.toObject();
                const properties = this._discoverStringProperties(itemData);
                for (const prop of properties) {
                    allProperties.set(prop.path, prop);
                }
                console.log(`Archivist Sync | Discovered ${properties.length} properties from existing ${item.type} item: ${item.name}`);
            } catch (error) {
                console.warn(`Error discovering properties from existing item ${item.name}:`, error);
            }
        }

        // Try to discover properties from system data model templates instead of creating items
        for (const itemType of itemTypes.slice(0, 3)) { // Limit to first 3 types
            try {
                console.log(`Archivist Sync | Attempting system template discovery for ${itemType} item`);

                // Try to access system data model template if available
                let templateProperties = [];

                // Check if we can access the system's data model templates
                if (game.system?.model?.Item?.[itemType]) {
                    console.log(`Archivist Sync | Found system template for ${itemType}`);
                    const template = game.system.model.Item[itemType];
                    templateProperties = this._discoverStringProperties(template);

                    for (const prop of templateProperties) {
                        // Prefix with 'system.' since these are system model properties
                        const systemProp = {
                            ...prop,
                            path: prop.path.startsWith('system.') ? prop.path : `system.${prop.path}`,
                            sample: `${prop.sample} (from template)`
                        };
                        allProperties.set(systemProp.path, systemProp);
                    }

                    console.log(`Archivist Sync | Discovered ${templateProperties.length} properties from ${itemType} system template`);
                } else {
                    // Fallback: use predefined property sets for this item type
                    console.log(`Archivist Sync | No system template found for ${itemType}, using fallback properties`);
                    const fallbackProperties = this._getFallbackItemProperties(itemType);
                    for (const prop of fallbackProperties) {
                        allProperties.set(prop.path, prop);
                    }
                    console.log(`Archivist Sync | Used ${fallbackProperties.length} fallback properties for ${itemType} item`);
                }

            } catch (error) {
                console.warn(`Error discovering properties for ${itemType} item:`, error);

                // Final fallback: use predefined property sets
                try {
                    const fallbackProperties = this._getFallbackItemProperties(itemType);
                    for (const prop of fallbackProperties) {
                        allProperties.set(prop.path, prop);
                    }
                    console.log(`Archivist Sync | Used fallback properties for ${itemType} item after error`);
                } catch (fallbackError) {
                    console.warn(`Fallback also failed for ${itemType}:`, fallbackError);
                }
            }
        }

        // Add known D&D 5e item paths
        const knownPaths = [
            { path: 'name', sample: 'Item name' },
            { path: 'img', sample: 'Item image path' },
            { path: 'system.description.value', sample: 'Item description' },
            { path: 'system.description.short', sample: 'Short description' },
            { path: 'system.description.chat', sample: 'Chat description' },
            { path: 'system.source', sample: 'Item source' },
            { path: 'system.requirements', sample: 'Requirements' },
            { path: 'system.chatFlavor', sample: 'Chat flavor text' },
            { path: 'system.unidentified.description', sample: 'Unidentified description' }
        ];

        for (const pathInfo of knownPaths) {
            if (!allProperties.has(pathInfo.path)) {
                allProperties.set(pathInfo.path, {
                    path: pathInfo.path,
                    type: 'string',
                    sample: pathInfo.sample
                });
            }
        }

        return Array.from(allProperties.values());
    }

    /**
     * Get fallback properties for item types when temporary document creation fails
     * @private
     */
    _getFallbackItemProperties(itemType) {
        return [
            { path: 'name', type: 'string', sample: 'Item name' },
            { path: 'img', type: 'string', sample: 'Item image path' },
            { path: 'system.description.value', type: 'string', sample: 'Item description' },
            { path: 'system.description.short', type: 'string', sample: 'Short description' },
            { path: 'system.description.chat', type: 'string', sample: 'Chat description' },
            { path: 'system.source', type: 'string', sample: 'Item source' }
        ];
    }

    /**
     * Prepare context data for template rendering
     * @returns {Object} Template data
     */
    async _prepareContext() {
        // Prepare folder options when needed
        try {
            const folders = game.folders?.contents || [];
            const pick = (type) => folders.filter(f => f.type === type).map(f => ({ id: f.id, name: f.name, depth: f.depth || 0 }))
                .sort((a, b) => (a.depth - b.depth) || a.name.localeCompare(b.name));
            this.folderOptions = {
                pc: pick('Actor'),
                npc: pick('Actor'),
                item: pick('Item'),
                location: pick('JournalEntry'),
                faction: pick('JournalEntry')
            };
        } catch (_) { /* no-op */ }

        // Prepare mapping options for step 4
        if (this.currentStep === 4) {
            await this._prepareMappingOptions();
            // Auto-detect system preset only if nothing is chosen yet and no mapping set
            const mappingEmpty = !this.setupData.mapping?.pc?.namePath && !this.setupData.mapping?.npc?.namePath && !this.setupData.mapping?.item?.namePath;
            if (!this.setupData.systemPreset && mappingEmpty) {
                const detected = await this._autoDetectPreset();
                if (detected) {
                    this.setupData.systemPreset = detected;
                    this._applyPresetToSetupData(detected);
                }
            }
        }

        return {
            currentStep: this.currentStep,
            totalSteps: this.totalSteps,
            isLoading: this.isLoading,
            isValidatingApi: this.isValidatingApi,
            foundryWorldTitle: game.world.title,
            foundryWorldDescription: game.world.description || '',
            worlds: this.worlds,
            setupData: this.setupData,
            folderOptions: this.folderOptions,
            mappingOptions: this.mappingOptions,
            archivistCandidates: this.archivistCandidates,
            syncPlan: this.syncPlan,
            syncStatus: this.syncStatus,
            syncStatusPct: (this.syncStatus.total > 0) ? Math.round((this.syncStatus.processed / this.syncStatus.total) * 100) : 0,
            steps: Array.from({ length: this.totalSteps }, (_, i) => i + 1),
            // Step-specific data
            isStep1: this.currentStep === 1,
            isStep2: this.currentStep === 2,
            isStep3: this.currentStep === 3,
            isStep4: this.currentStep === 4,
            isStep5: this.currentStep === 5,
            isStep6: this.currentStep === 6,
            isFirstStep: this.currentStep === 1,
            isLastStep: this.currentStep === this.totalSteps,
            canProceed: this._canProceedFromCurrentStep(),
            progressPercentage: Math.round((this.currentStep / this.totalSteps) * 100)
        };
    }

    /**
     * Check if user can proceed from current step
     * @returns {boolean} True if can proceed
     * @private
     */
    _canProceedFromCurrentStep() {
        switch (this.currentStep) {
            case 1: return true; // Welcome step, always can proceed
            case 2: return this.setupData.apiKeyValid; // Need valid API key
            case 3: return settingsManager.isWorldSelected();
            case 4: return true; // mapping always allowed; user must save to continue
            case 5: return true; // selections optional
            case 6: return true;
            default: return false;
        }
    }

    /**
     * Handle next step button click
     * @param {Event} event - Click event
     * @private
     */
    async _onNextStep(event) {
        event.preventDefault();

        if (this.currentStep < this.totalSteps && this._canProceedFromCurrentStep()) {
            // If leaving Step 4, persist mapping/destinations to settings
            if (this.currentStep === 4) {
                try { await this._persistMappingToSettings(); } catch (_) { }
            }
            this.currentStep++;
            // If we just moved into Step 5, auto-prepare selections
            if (this.currentStep === 5) {
                await this._onPrepareSelections(event);
                return;
            }
            await this.render();
        }
    }

    /**
     * Handle previous step button click
     * @param {Event} event - Click event
     * @private
     */
    async _onPrevStep(event) {
        event.preventDefault();

        if (this.currentStep > 1) {
            this.currentStep--;
            await this.render();
        }
    }

    /**
     * Handle API key validation
     * @param {Event} event - Click event or input event
     * @private
     */
    async _onValidateApiKey(event) {
        event.preventDefault();

        // Get API key from input field
        const apiKeyInput = this.element.querySelector('#api-key-input');
        const apiKey = apiKeyInput?.value?.trim();

        if (!apiKey) {
            ui.notifications.warn('Please enter your API key');
            return;
        }

        this.isValidatingApi = true;
        this.setupData.apiKeyValid = false;
        await this.render();

        try {
            // Test the API key by trying to fetch campaigns
            const response = await archivistApi.fetchCampaignsList(apiKey);

            if (response.success) {
                // API key is valid
                this.setupData.apiKey = apiKey;
                this.setupData.apiKeyValid = true;

                // Save to settings
                await settingsManager.setSetting('apiKey', apiKey);

                ui.notifications.info('API key validated successfully!');

                // Auto-advance to next step after short delay
                setTimeout(async () => {
                    if (this.currentStep === 2) {
                        this.currentStep++;
                        await this.render();
                    }
                }, 1000);

            } else {
                // API key is invalid
                this.setupData.apiKeyValid = false;
                ui.notifications.error(response.message || 'Invalid API key. Please check your key and try again.');
            }
        } catch (error) {
            console.error('Error validating API key:', error);
            this.setupData.apiKeyValid = false;
            ui.notifications.error('Failed to validate API key. Please check your connection and try again.');
        } finally {
            this.isValidatingApi = false;
            await this.render();
        }
    }

    /**
     * Handle sync worlds button click
     * @param {Event} event - Click event
     * @private
     */
    async _onSyncWorlds(event) {
        // Delegate to load campaigns (legacy compatibility)
        return await this._onLoadCampaigns(event);
    }

    /**
     * Step 3: Load user's campaigns using validated API key
     */
    async _onLoadCampaigns(event) {
        event?.preventDefault?.();
        try {
            this.isLoading = true; await this.render();
            const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
            if (!apiKey) throw new Error('Missing API key');
            const resp = await archivistApi.fetchCampaignsList(apiKey);
            if (resp.success) {
                this.worlds = resp.data || [];
                // Move to step 3 if not already there
                if (this.currentStep < 3) this.currentStep = 3;
                await this.render();
            } else {
                ui.notifications.error(resp.message || 'Failed to load campaigns');
            }
        } catch (e) {
            console.error('Load campaigns error', e);
            ui.notifications.error('Failed to load campaigns');
        } finally {
            this.isLoading = false; await this.render();
        }
    }

    /**
     * Step 3: Create a campaign with Foundry world title
     */
    async _onCreateCampaign(event) {
        event?.preventDefault?.();
        try {
            this.isLoading = true; await this.render();
            const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
            const title = game.world.title;
            const description = game.world.description || '';
            const res = await archivistApi.createCampaign(apiKey, { title, description });
            if (!res.success) throw new Error(res.message || 'Create failed');
            const id = res?.data?.id;
            const name = res?.data?.name || res?.data?.title || title || 'World';
            if (id) {
                await settingsManager.setSelectedWorld(id, name);
                this.setupData.selectedWorldId = id;
                this.setupData.selectedWorldName = name;
                ui.notifications.info('Archivist campaign created');
                // Reload campaigns to reflect new one
                await this._onLoadCampaigns(new Event('load'));
            }
        } catch (e) {
            console.error('Create campaign error', e);
            ui.notifications.error('Failed to create campaign');
        } finally {
            this.isLoading = false; await this.render();
        }
    }

    /**
     * Step 3: Track selection change
     */
    async _onCampaignSelectChange(event) {
        const worldId = event?.target?.value || '';
        const selected = this.worlds.find(w => w.id === worldId);
        this.setupData.selectedWorldId = worldId;
        this.setupData.selectedWorldName = selected?.name || selected?.title || '';
        await this.render();
    }

    /**
     * Step 3: Confirm selection and persist
     */
    async _onConfirmCampaign(event) {
        event?.preventDefault?.();
        try {
            const id = this.setupData.selectedWorldId;
            const name = this.setupData.selectedWorldName;
            if (!id) {
                ui.notifications.warn('Please select a campaign');
                return;
            }
            await settingsManager.setSelectedWorld(id, name || 'World');
            // Advance to Step 4
            this.currentStep = 4; await this.render();
        } catch (e) {
            console.error('Confirm campaign error', e);
            ui.notifications.error('Failed to save selection');
        }
    }

    /**
     * Step 5: Prepare selections — gather Foundry docs and Archivist candidates
     */
    async _onPrepareSelections(event) {
        event?.preventDefault?.();
        try {
            this.isLoading = true; await this.render();
            const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
            // Always prefer the explicit selection from Step 3; fallback to saved setting only if necessary
            const campaignId = this.setupData.selectedWorldId || settingsManager.getSelectedWorldId();
            if (!campaignId) {
                ui.notifications.warn('Please select a campaign in Step 3 before continuing.');
                this.currentStep = 3; await this.render();
                return;
            }
            // Foundry side
            const actors = game.actors?.contents || [];
            this.eligibleDocs.pcs = actors.filter(a => a.type === 'character').map(a => ({ id: a.id, name: a.name, img: a.img || '', type: 'PC' }));
            this.eligibleDocs.npcs = actors.filter(a => a.type === 'npc').map(a => ({ id: a.id, name: a.name, img: a.img || '', type: 'NPC' }));
            const items = game.items?.contents || [];
            this.eligibleDocs.items = items.map(i => ({ id: i.id, name: i.name, img: i.img || '', type: 'Item' }));
            const journals = game.journal?.contents || [];
            // For Locations and Factions, include both JournalEntry containers and their individual pages for selection
            const locEntries = [];
            const facEntries = [];
            for (const j of journals) {
                const base = { entryId: j.id, entryName: j.name, img: j.img || '' };
                // Include the JournalEntry itself as a selectable unit
                locEntries.push({ id: j.id, name: j.name, img: base.img, type: 'Location' });
                facEntries.push({ id: j.id, name: j.name, img: base.img, type: 'Faction' });
                // Include each page as its own selectable unit using UUIDs
                const pages = j.pages?.contents || [];
                for (const p of pages) {
                    const pageLabel = `${j.name} ➜ ${p.name}`;
                    const pid = p.uuid || `${j.uuid}.JournalEntryPage.${p.id}`;
                    locEntries.push({ id: pid, name: pageLabel, img: base.img, type: 'Location' });
                    facEntries.push({ id: pid, name: pageLabel, img: base.img, type: 'Faction' });
                }
            }
            this.eligibleDocs.locations = locEntries;
            this.eligibleDocs.factions = facEntries;

            // Archivist side
            const [chars, its, locs, facs] = await Promise.all([
                archivistApi.listCharacters(apiKey, campaignId),
                archivistApi.listItems(apiKey, campaignId),
                archivistApi.listLocations(apiKey, campaignId),
                archivistApi.listFactions(apiKey, campaignId)
            ]);
            this.archivistCandidates.characters = chars.success ? (chars.data || []) : [];
            this.archivistCandidates.items = its.success ? (its.data || []) : [];
            this.archivistCandidates.locations = locs.success ? (locs.data || []) : [];
            this.archivistCandidates.factions = facs.success ? (facs.data || []) : [];

            // Simple name-based suggestions
            const byName = (arr) => {
                const m = new Map();
                for (const x of arr) m.set(String((x.name || x.title || '')).toLowerCase(), x);
                return m;
            };
            const charMap = byName(this.archivistCandidates.characters);
            const itemMap = byName(this.archivistCandidates.items);
            const locMap = byName(this.archivistCandidates.locations);
            const facMap = byName(this.archivistCandidates.factions);

            const suggest = (name, map) => {
                const k = String(name || '').toLowerCase();
                const hit = map.get(k);
                return hit ? { id: hit.id, label: hit.name || hit.title } : { id: 'NEW', label: 'New' };
            };

            const withSuggestion = (arr, map) => arr.map(d => ({ ...d, selected: true, match: suggest(d.name, map) }));
            this.setupData.selections.pcs = withSuggestion(this.eligibleDocs.pcs, charMap);
            this.setupData.selections.npcs = withSuggestion(this.eligibleDocs.npcs, charMap);
            this.setupData.selections.items = withSuggestion(this.eligibleDocs.items, itemMap);
            this.setupData.selections.locations = withSuggestion(this.eligibleDocs.locations, locMap);
            this.setupData.selections.factions = withSuggestion(this.eligibleDocs.factions, facMap);

            // advance to step 5
            this.currentStep = 5; await this.render();
        } catch (e) {
            console.error('Prepare selections error', e);
            ui.notifications.error('Failed to prepare selections');
        } finally {
            this.isLoading = false; await this.render();
        }
    }

    _updateSelection(kind, id, updates) {
        const arr = this.setupData.selections[kind] || [];
        const idx = arr.findIndex(x => x.id === id);
        if (idx >= 0) Object.assign(arr[idx], updates);
    }

    async _onToggleSelection(event) {
        const el = event?.target;
        const kind = el?.dataset?.kind; const id = el?.dataset?.id;
        if (!kind || !id) return;
        this._updateSelection(kind, id, { selected: el.checked });
    }

    async _onChangeMatch(event) {
        const el = event?.target;
        const kind = el?.dataset?.kind; const id = el?.dataset?.id;
        if (!kind || !id) return;
        this._updateSelection(kind, id, { match: { id: el.value, label: el.options[el.selectedIndex]?.text || '' } });
    }

    async _onSelectAll(event) {
        const kind = event?.target?.dataset?.kind;
        if (!kind) return;
        (this.setupData.selections[kind] || []).forEach(s => s.selected = true);
        await this.render();
    }

    async _onSelectNone(event) {
        const kind = event?.target?.dataset?.kind;
        if (!kind) return;
        (this.setupData.selections[kind] || []).forEach(s => s.selected = false);
        await this.render();
    }

    async _onConfirmSelections(event) {
        event?.preventDefault?.();
        // Build a simple sync plan summary
        const plan = { createInArchivist: [], link: [], counts: { create: { pc: 0, npc: 0, item: 0, location: 0, faction: 0 }, link: { pc: 0, npc: 0, item: 0, location: 0, faction: 0 } } };
        const push = (arr, obj) => { arr.push(obj); };
        const tally = (bucket, kind) => { plan.counts[bucket][kind.toLowerCase()]++; };

        const visit = (kindKey, kindLabel) => {
            for (const s of (this.setupData.selections[kindKey] || [])) {
                if (!s.selected) continue;
                if (!s.match || s.match.id === 'NEW') {
                    push(plan.createInArchivist, { kind: kindLabel, foundryId: s.id, name: s.name });
                    tally('create', kindLabel);
                } else {
                    push(plan.link, { kind: kindLabel, foundryId: s.id, archivistId: s.match.id, name: s.name });
                    tally('link', kindLabel);
                }
            }
        };
        visit('pcs', 'PC');
        visit('npcs', 'NPC');
        visit('items', 'Item');
        visit('locations', 'Location');
        visit('factions', 'Faction');

        this.syncPlan = plan;
        this.currentStep = 6; await this.render();
    }

    async _onBeginSync(event) {
        event?.preventDefault?.();
        try {
            const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
            const campaignId = this.setupData.selectedWorldId || settingsManager.getSelectedWorldId();

            console.log('Archivist Sync | Beginning sync with:', {
                apiKey: apiKey ? `***${apiKey.slice(-4)}` : 'none',
                campaignId
            });

            // Import existing Archivist data BEFORE processing the sync plan
            await this._importArchivistMissing(apiKey, campaignId);

            // Create Recaps journals from game sessions
            await this._syncRecapsFromSessions(apiKey, campaignId);

            const work = [...(this.syncPlan.createInArchivist || []), ...(this.syncPlan.link || [])];
            console.log(`Archivist Sync | Processing ${work.length} sync jobs:`, {
                createInArchivist: this.syncPlan.createInArchivist?.length || 0,
                link: this.syncPlan.link?.length || 0
            });

            this.syncStatus.total = work.length; this.syncStatus.processed = 0; await this.render();

            const getDoc = async (kind, id) => {
                if (kind === 'PC' || kind === 'NPC') return game.actors.get(id);
                if (kind === 'Item') return game.items.get(id);
                if (kind === 'Location' || kind === 'Faction') {
                    // Supports JournalEntry id or JournalEntryPage UUID
                    try { return await fromUuid(id); } catch (_) { /* fallthrough */ }
                    return game.journal.get(id);
                }
                return null;
            };

            const getMappedFields = (kind, doc) => {
                const gp = foundry.utils.getProperty;
                const m = this.setupData.mapping;
                const safe = (p, fb) => { try { const v = gp(doc, p); return v ?? fb; } catch (_) { return fb; } };
                const httpsOnly = (s) => { const v = String(s || '').trim(); return v.startsWith('https://') ? v : undefined; };
                if (kind === 'PC') {
                    const image = httpsOnly(safe(m.pc.imagePath || 'img', doc.img));
                    return {
                        character_name: safe(m.pc.namePath || 'name', doc.name),
                        ...(image ? { image } : {}),
                        description: String(safe(m.pc.descPath || 'system.details.biography.value', ''))
                    };
                }
                if (kind === 'NPC') {
                    const image = httpsOnly(safe(m.npc.imagePath || 'img', doc.img));
                    return {
                        character_name: safe(m.npc.namePath || 'name', doc.name),
                        ...(image ? { image } : {}),
                        description: String(safe(m.npc.descPath || 'system.details.biography.value', ''))
                    };
                }
                if (kind === 'Item') {
                    const image = httpsOnly(safe(m.item.imagePath || 'img', doc.img));
                    return {
                        name: safe(m.item.namePath || 'name', doc.name),
                        ...(image ? { image } : {}),
                        description: String(safe(m.item.descPath || 'system.description.value', ''))
                    };
                }
                return {};
            };

            const setArchivistFlag = async (kind, doc, archivistId) => {
                try { await doc.setFlag(CONFIG.MODULE_ID, 'archivistId', archivistId); } catch (_) { }
            };

            for (const job of work) {
                this.syncStatus.current = `${job.kind}: ${job.name}`; await this.render();
                const doc = await getDoc(job.kind, job.foundryId);
                if (!doc) { this.syncStatus.processed++; continue; }
                if (job.archivistId) {
                    await setArchivistFlag(job.kind, doc, job.archivistId);
                    this.syncStatus.logs.push(`Linked ${job.kind} '${doc.name}' → ${job.archivistId}`);
                    this.syncStatus.processed++; await this.render();
                    continue;
                }

                // Create in Archivist
                let res = { success: false, data: null };
                if (job.kind === 'PC' || job.kind === 'NPC') {
                    const payload = { ...getMappedFields(job.kind, doc), type: job.kind, campaign_id: campaignId };
                    console.log(`Archivist Sync | Creating ${job.kind} character:`, { name: payload.character_name, campaignId });
                    res = await archivistApi.createCharacter(apiKey, payload);
                } else if (job.kind === 'Item') {
                    const payload = { ...getMappedFields('Item', doc), campaign_id: campaignId };
                    console.log(`Archivist Sync | Creating item:`, { name: payload.name, campaignId });
                    res = await archivistApi.createItem(apiKey, payload);
                } else if (job.kind === 'Location') {
                    const isPage = doc?.documentName === 'JournalEntryPage';
                    const name = isPage ? (doc.name || 'Location') : (doc.name || 'Location');
                    const description = isPage ? (String(doc?.text?.content || '')) : String(doc.system?.description?.value || '');
                    const rawImg = isPage ? String(doc?.image?.src || doc?.img || '') : String(doc?.img || '');
                    const image = String(rawImg || '').trim().startsWith('https://') ? String(rawImg).trim() : undefined;
                    const payload = { name, ...(image ? { image } : {}), description, campaign_id: campaignId };
                    console.log(`Archivist Sync | Creating location:`, { name: payload.name, campaignId });
                    res = await archivistApi.createLocation(apiKey, payload);
                } else if (job.kind === 'Faction') {
                    const isPage = doc?.documentName === 'JournalEntryPage';
                    const name = isPage ? (doc.name || 'Faction') : (doc.name || 'Faction');
                    const description = isPage ? (String(doc?.text?.content || '')) : String(doc.system?.description?.value || '');
                    const rawImg = isPage ? String(doc?.image?.src || doc?.img || '') : String(doc?.img || '');
                    const image = String(rawImg || '').trim().startsWith('https://') ? String(rawImg).trim() : undefined;
                    const payload = { name, ...(image ? { image } : {}), description, campaign_id: campaignId };
                    console.log(`Archivist Sync | Creating faction:`, { name: payload.name, campaignId });
                    res = await archivistApi.createFaction(apiKey, payload);
                }
                const newId = res?.data?.id;
                if (res.success && newId) {
                    await setArchivistFlag(job.kind, doc, newId);
                    this.syncStatus.logs.push(`Created ${job.kind} '${doc.name}' in Archivist → ${newId}`);
                }
                this.syncStatus.processed++; await this.render();
            }

            // Mark world as initialized after first sync
            try { await settingsManager.completeWorldInitialization(); } catch (_) { }
            if (window.ARCHIVIST_SYNC?.updateChatAvailability) {
                try { window.ARCHIVIST_SYNC.updateChatAvailability(); } catch (_) { }
            }

            ui.notifications.info('Sync completed');
            try { await this.close(); } catch (_) { }
        } catch (e) {
            console.error('Begin sync failed', e);
            ui.notifications.error('Sync failed');
        }
    }

    async _persistMappingToSettings() {
        // Build a trimmed import config-like object
        const cfg = settingsManager.getImportConfig?.() || {};
        const next = foundry.utils.deepClone(cfg);
        next.actorMappings = next.actorMappings || {};
        next.actorMappings.pc = next.actorMappings.pc || {};
        next.actorMappings.npc = next.actorMappings.npc || {};
        next.actorMappings.pc.descriptionPath = this.setupData.mapping.pc.descPath || next.actorMappings.pc.descriptionPath;
        next.actorMappings.npc.descriptionPath = this.setupData.mapping.npc.descPath || next.actorMappings.npc.descriptionPath;
        // Store simple portrait/img hints
        next.actorMappings.pc.portraitPath = this.setupData.mapping.pc.imagePath || next.actorMappings.pc.portraitPath || 'img';
        next.actorMappings.npc.portraitPath = this.setupData.mapping.npc.imagePath || next.actorMappings.npc.portraitPath || 'img';
        // Include folders
        next.includeRules = next.includeRules || { filters: { actors: { includeFolders: { pcs: [], npcs: [] } }, items: {}, factions: {} }, sources: {} };
        next.includeRules.filters.actors.includeFolders.pcs = next.includeRules.filters.actors.includeFolders.pcs || [];
        next.includeRules.filters.actors.includeFolders.npcs = next.includeRules.filters.actors.includeFolders.npcs || [];
        if (this.setupData.destinations.pc) next.includeRules.filters.actors.includeFolders.pcs = [this.setupData.destinations.pc];
        if (this.setupData.destinations.npc) next.includeRules.filters.actors.includeFolders.npcs = [this.setupData.destinations.npc];
        // Save
        await settingsManager.setImportConfig?.(next);
    }


    // Removed Archivist journal folder setup; journals are created only in user destinations

    async _importArchivistMissing(apiKey, campaignId, jf) {
        try {
            console.log('Archivist Sync | Importing existing data from Archivist...');

            // Always import existing Archivist data to Foundry during world setup
            // This ensures that existing campaign data is available in the new Foundry world

            // Pull candidates from Archivist
            const [chars, its, locs, facs] = await Promise.all([
                archivistApi.listCharacters(apiKey, campaignId),
                archivistApi.listItems(apiKey, campaignId),
                archivistApi.listLocations(apiKey, campaignId),
                archivistApi.listFactions(apiKey, campaignId)
            ]);
            const characters = chars.success ? (chars.data || []) : [];
            const items = its.success ? (its.data || []) : [];
            const locations = locs.success ? (locs.data || []) : [];
            const factions = facs.success ? (facs.data || []) : [];

            const total = characters.length + items.length + locations.length + factions.length;
            console.log(`Archivist Sync | Found ${characters.length} characters, ${items.length} items, ${locations.length} locations, ${factions.length} factions in Archivist`);

            if (!total) {
                console.log('Archivist Sync | No existing data found in Archivist to import');
                return;
            }

            this.syncStatus.total += total; await this.render();

            const mdToHtml = (md) => {
                // Minimal MD→HTML: paragraphs and bold/italic
                const s = String(md || '');
                return s
                    .replace(/\r\n/g, '\n')
                    .replace(/\n\n+/g, '</p><p>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/_(.*?)_/g, '<em>$1</em>')
                    .replace(/^/, '<p>').replace(/$/, '</p>');
            };

            const createActor = async (c) => {
                // Use the 'type' field from Archivist API (either 'PC' or 'NPC')
                const archivistType = String(c.type || c.character_type || 'PC').toUpperCase();
                const foundryType = archivistType === 'NPC' ? 'npc' : 'character';
                const folderId = archivistType === 'NPC' ? (this.setupData.destinations.npc || null) : (this.setupData.destinations.pc || null);

                // Create actor with description mapped to the user's configured path
                const actorData = {
                    name: c.character_name || c.name || 'Character',
                    type: foundryType,
                    img: c.image || null,
                    folder: folderId || null
                };

                // Apply description to the configured path for this character type
                if (c.description) {
                    const mappingPath = archivistType === 'NPC' ?
                        this.setupData.mapping.npc.descPath :
                        this.setupData.mapping.pc.descPath;

                    if (mappingPath) {
                        // Convert Markdown from Archivist to sanitized HTML for Foundry storage
                        const html = Utils.markdownToStoredHtml(c.description);
                        foundry.utils.setProperty(actorData, mappingPath, html);
                    }
                }

                console.log(`Archivist Sync | Creating ${archivistType} actor:`, {
                    name: actorData.name,
                    type: foundryType,
                    folderId,
                    hasDescription: !!c.description
                });

                const actor = await Actor.create(actorData, { render: false });
                try { await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', c.id); } catch (_) { }
            };
            const createItem = async (i) => {
                const folderId = this.setupData.destinations.item || null;

                // Resolve a safe item type for system (fallback to 'loot')
                const resolveItemType = (src) => {
                    try {
                        const raw = String(src?.type ?? src?.item_type ?? src?.category ?? '').trim().toLowerCase();
                        const candidates = ['weapon', 'equipment', 'consumable', 'spell', 'feat', 'tool', 'loot', 'backpack'];
                        if (candidates.includes(raw)) return raw;
                        if (/weapon/.test(raw)) return 'weapon';
                        if (/armor|equipment/.test(raw)) return 'equipment';
                        if (/consum/.test(raw)) return 'consumable';
                        if (/spell/.test(raw)) return 'spell';
                        if (/feat|ability/.test(raw)) return 'feat';
                        if (/tool/.test(raw)) return 'tool';
                        if (/pack|bag|backpack/.test(raw)) return 'backpack';
                        return 'loot';
                    } catch (_) {
                        return 'loot';
                    }
                };
                const safeType = resolveItemType(i);

                // Create item with description mapped to the user's configured path
                const itemData = {
                    name: i.name || 'Item',
                    type: safeType,
                    img: i.image || null,
                    folder: folderId || null
                };

                // Apply description to the configured path for items
                if (i.description) {
                    const mappingPath = this.setupData.mapping.item.descPath;
                    if (mappingPath) {
                        const html = Utils.markdownToStoredHtml(i.description);
                        foundry.utils.setProperty(itemData, mappingPath, html);
                    }
                }

                console.log(`Archivist Sync | Creating item:`, {
                    name: itemData.name,
                    folderId,
                    hasDescription: !!i.description
                });

                const item = await Item.create(itemData, { render: false });
                try { await item.setFlag(CONFIG.MODULE_ID, 'archivistId', i.id); } catch (_) { }
            };
            const upsertIntoContainer = async (e, kind) => {
                const containerName = kind === 'Location' ? 'Locations' : 'Factions';
                const container = await Utils.ensureRootJournalContainer(containerName);
                const name = `${e.name || e.title || kind}`;
                const body = String(e.description || '').trim();
                const imageUrl = (typeof e.image === 'string' && e.image.trim().length) ? e.image.trim() : null;
                await Utils.upsertContainerTextPage(container, {
                    name,
                    html: body,
                    imageUrl,
                    flags: { archivistId: e.id, archivistType: kind.toLowerCase(), archivistWorldId: campaignId }
                });
            };

            for (const c of characters) {
                this.syncStatus.current = `Import ${c.type || c.character_type || 'PC'}: ${c.character_name || c.name}`; await this.render();
                await createActor(c); this.syncStatus.processed++; await this.render();
            }
            for (const it of items) {
                this.syncStatus.current = `Import Item: ${it.name}`; await this.render();
                await createItem(it); this.syncStatus.processed++; await this.render();
            }
            // Insert Locations alphabetically
            locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            for (const l of locations) {
                this.syncStatus.current = `Import Location: ${l.name || l.title}`; await this.render();
                await upsertIntoContainer(l, 'Location'); this.syncStatus.processed++; await this.render();
            }
            // Insert Factions alphabetically
            factions.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            for (const f of factions) {
                this.syncStatus.current = `Import Faction: ${f.name || f.title}`; await this.render();
                await upsertIntoContainer(f, 'Faction'); this.syncStatus.processed++; await this.render();
            }
        } catch (e) {
            console.warn('Import from Archivist into Foundry skipped/failed:', e);
        }
    }

    /**
     * Handle world selection
     * @param {Event} event - Change event
     * @private
     */
    async _onSelectWorld(event) {
        event.preventDefault();

        const worldId = event.target.value;
        if (!worldId) {
            this.setupData.selectedWorldId = '';
            this.setupData.selectedWorldName = '';
            return;
        }

        const selectedWorld = this.worlds.find(w => w.id === worldId);
        if (selectedWorld) {
            const displayName = selectedWorld?.name || selectedWorld?.title || 'World';
            this.setupData.selectedWorldId = worldId;
            this.setupData.selectedWorldName = displayName;

            // Save to settings immediately
            try {
                await settingsManager.setSelectedWorld(worldId, displayName);
                ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldSaved'));
            } catch (error) {
                console.error('Error saving world selection during setup:', error);
                ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.saveFailed'));
            }
        }

        await this.render();
    }

    /**
     * Create a Recaps folder and a journal per session, ordered by date
     */
    async _syncRecapsFromSessions(apiKey, campaignId) {
        try {
            const sessionsResp = await archivistApi.listSessions(apiKey, campaignId);
            if (!sessionsResp.success) return;
            const sessions = (sessionsResp.data || []).filter(s => !!s.session_date);

            // Sort by ascending date (oldest first)
            sessions.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());

            // Ensure single container JournalEntry at root
            const container = await Utils.ensureRootJournalContainer('Recaps');

            // Insert or update pages in chronological order; page names should not include date
            for (const s of sessions) {
                const title = s.title || 'Session';
                const html = String(s.summary || '').trim();
                const page = await Utils.upsertContainerTextPage(container, {
                    name: title,
                    html,
                    imageUrl: null,
                    flags: { archivistId: s.id, archivistType: 'recap', archivistWorldId: campaignId }
                });
                // Stash date on page flags for future use
                try { await page.setFlag(CONFIG.MODULE_ID, 'sessionDate', String(s.session_date)); } catch (_) { }
            }

            // Sort pages by session_date ascending using flag
            await Utils.sortContainerPages(container, (a, b) => {
                const ad = new Date(a.getFlag(CONFIG.MODULE_ID, 'sessionDate') || 0).getTime();
                const bd = new Date(b.getFlag(CONFIG.MODULE_ID, 'sessionDate') || 0).getTime();
                return ad - bd;
            });
        } catch (e) {
            console.warn('Recaps sync skipped/failed:', e);
        }
    }

    /**
     * Handle complete setup button click
     * @param {Event} event - Click event
     * @private
     */
    async _onCompleteSetup(event) {
        event.preventDefault();

        try {
            // Complete world initialization through the proper method
            await settingsManager.completeWorldInitialization();
            this.setupData.setupComplete = true;

            ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.worldSetup.setupComplete'));

            // Close the setup dialog
            await this.close();

            // Trigger chat availability update
            if (window.ARCHIVIST_SYNC?.updateChatAvailability) {
                window.ARCHIVIST_SYNC.updateChatAvailability();
            }

        } catch (error) {
            console.error('Error completing world setup:', error);
            ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.worldSetup.setupFailed'));
        }
    }

    /**
     * Handle cancel button click
     * @param {Event} event - Click event
     * @private
     */
    /**
     * Generate and download a sample configuration file
     */
    async _onDownloadSampleConfig(event) {
        event?.preventDefault?.();

        // Generate sample configuration with schema and examples
        const sampleConfig = {
            "_schema_version": "1.0",
            "_description": "Archivist Sync Configuration File - Edit the paths below to match your game system's data structure",
            "_instructions": {
                "actorMappings": "Configure how PC and NPC data is mapped from Foundry actors",
                "itemMappings": "Configure how Item data is mapped from Foundry items",
                "destinations": "Configure where different entity types are synced to in Archivist"
            },
            "actorMappings": {
                "pc": {
                    "namePath": "name",
                    "imagePath": "img",
                    "descriptionPath": "system.details.biography.value",
                    "_examples": {
                        "namePath": "name (actor name field)",
                        "imagePath": "img (actor image field)",
                        "descriptionPath": "system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)"
                    }
                },
                "npc": {
                    "namePath": "name",
                    "imagePath": "img",
                    "descriptionPath": "system.details.biography.value",
                    "_examples": {
                        "namePath": "name (actor name field)",
                        "imagePath": "img (actor image field)",
                        "descriptionPath": "system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)"
                    }
                }
            },
            "itemMappings": {
                "namePath": "name",
                "imagePath": "img",
                "descriptionPath": "system.description.value",
                "_examples": {
                    "namePath": "name (item name field)",
                    "imagePath": "img (item image field)",
                    "descriptionPath": "system.description.value (D&D 5e), system.description (PF2e), system.description.value (other systems)"
                }
            },
            "destinations": {
                "pc": "pc",
                "npc": "npc",
                "item": "item",
                "location": "location",
                "faction": "faction",
                "_options": {
                    "pc": ["pc", "npc"],
                    "npc": ["npc", "pc"],
                    "item": ["item", "note"],
                    "location": ["location", "note"],
                    "faction": ["faction", "note"]
                }
            }
        };

        // Open the sample config in a new tab
        window.open('https://raw.githubusercontent.com/camrun91/archivist-sync/main/archivist-sync-sample-config.json', '_blank');

        ui.notifications.info('Sample configuration opened in new tab.');
    }

    async _onCancel(event) {
        event.preventDefault();
        await this.close();
    }

    /**
     * Handle rendering
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     */
    _onRender(context, options) {
        super._onRender(context, options);

        // Update progress bar
        const progressBar = this.element.querySelector('.progress-fill');
        if (progressBar) {
            progressBar.style.width = `${context.progressPercentage}%`;
        }

        // Add keyboard shortcuts for Step 2
        if (context.isStep2) {
            const apiKeyInput = this.element.querySelector('#api-key-input');
            if (apiKeyInput) {
                // Focus the input field
                apiKeyInput.focus();

                // Add Enter key listener for validation
                apiKeyInput.addEventListener('keypress', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this._onValidateApiKey(event);
                    }
                });
            }

        }

        // Step 3: attach change handler to campaign select without triggering on click/focus
        if (context.isStep3) {
            const campaignSelect = this.element.querySelector('#campaign-select');
            if (campaignSelect && !campaignSelect.dataset.bound) {
                campaignSelect.addEventListener('change', (ev) => {
                    const nextVal = ev?.target?.value || '';
                    if (nextVal === this.setupData.selectedWorldId) return;
                    this._onCampaignSelectChange(ev);
                });
                campaignSelect.dataset.bound = 'true';
            }
        }

        // Capture Step 4 mapping and destination selects on change
        if (context.isStep4) {
            const val = (sel) => this.element.querySelector(sel)?.value?.trim() || '';
            const updateMappingData = () => {
                this.setupData.mapping.pc.namePath = val('#map-pc-name');
                this.setupData.mapping.pc.imagePath = val('#map-pc-image');
                this.setupData.mapping.pc.descPath = val('#map-pc-desc');
                this.setupData.mapping.npc.namePath = val('#map-npc-name');
                this.setupData.mapping.npc.imagePath = val('#map-npc-image');
                this.setupData.mapping.npc.descPath = val('#map-npc-desc');
                this.setupData.mapping.item.namePath = val('#map-item-name');
                this.setupData.mapping.item.imagePath = val('#map-item-image');
                this.setupData.mapping.item.descPath = val('#map-item-desc');
                this.setupData.destinations.pc = val('#dest-pc');
                this.setupData.destinations.npc = val('#dest-npc');
                this.setupData.destinations.item = val('#dest-item');
            };

            // Attach change listeners to all mapping and destination selects
            const selectors = [
                '#map-pc-name', '#map-pc-image', '#map-pc-desc',
                '#map-npc-name', '#map-npc-image', '#map-npc-desc',
                '#map-item-name', '#map-item-image', '#map-item-desc',
                '#dest-pc', '#dest-npc', '#dest-item'
            ];

            selectors.forEach(selector => {
                const element = this.element.querySelector(selector);
                if (element && !element.dataset.boundSetup) {
                    element.addEventListener('change', updateMappingData);
                    element.dataset.boundSetup = 'true';
                }
            });

            // Add file input handler for config loading
            const configFileInput = this.element.querySelector('#config-file-input');
            if (configFileInput && !configFileInput.dataset.boundSetup) {
                configFileInput.addEventListener('change', async (event) => {
                    const file = event.target.files[0];
                    if (!file) return;

                    try {
                        const text = await file.text();
                        const config = JSON.parse(text);

                        // Apply configuration to form fields
                        if (config.actorMappings?.pc) {
                            if (config.actorMappings.pc.namePath) {
                                const pcNameSelect = this.element.querySelector('#map-pc-name');
                                if (pcNameSelect) pcNameSelect.value = config.actorMappings.pc.namePath;
                            }
                            if (config.actorMappings.pc.imagePath) {
                                const pcImageSelect = this.element.querySelector('#map-pc-image');
                                if (pcImageSelect) pcImageSelect.value = config.actorMappings.pc.imagePath;
                            }
                            if (config.actorMappings.pc.descriptionPath) {
                                const pcDescSelect = this.element.querySelector('#map-pc-desc');
                                if (pcDescSelect) pcDescSelect.value = config.actorMappings.pc.descriptionPath;
                            }
                        }

                        if (config.actorMappings?.npc) {
                            if (config.actorMappings.npc.namePath) {
                                const npcNameSelect = this.element.querySelector('#map-npc-name');
                                if (npcNameSelect) npcNameSelect.value = config.actorMappings.npc.namePath;
                            }
                            if (config.actorMappings.npc.imagePath) {
                                const npcImageSelect = this.element.querySelector('#map-npc-image');
                                if (npcImageSelect) npcImageSelect.value = config.actorMappings.npc.imagePath;
                            }
                            if (config.actorMappings.npc.descriptionPath) {
                                const npcDescSelect = this.element.querySelector('#map-npc-desc');
                                if (npcDescSelect) npcDescSelect.value = config.actorMappings.npc.descriptionPath;
                            }
                        }

                        if (config.itemMappings) {
                            if (config.itemMappings.namePath) {
                                const itemNameSelect = this.element.querySelector('#map-item-name');
                                if (itemNameSelect) itemNameSelect.value = config.itemMappings.namePath;
                            }
                            if (config.itemMappings.imagePath) {
                                const itemImageSelect = this.element.querySelector('#map-item-image');
                                if (itemImageSelect) itemImageSelect.value = config.itemMappings.imagePath;
                            }
                            if (config.itemMappings.descriptionPath) {
                                const itemDescSelect = this.element.querySelector('#map-item-desc');
                                if (itemDescSelect) itemDescSelect.value = config.itemMappings.descriptionPath;
                            }
                        }

                        // Update internal data
                        updateMappingData();

                        ui.notifications.info('Configuration loaded successfully.');

                    } catch (error) {
                        console.error('Failed to load configuration file:', error);
                        ui.notifications.error('Failed to load configuration file. Please check the file format.');
                    }

                    // Clear the file input
                    event.target.value = '';
                });
                configFileInput.dataset.boundSetup = 'true';
            }
            // Bind preset change validation in Step 4 (if the dropdown exists here)
            const presetSelect = this.element.querySelector('#ws-system-preset');
            if (presetSelect && !presetSelect.dataset.boundSetup) {
                presetSelect.addEventListener('change', async (e) => {
                    const key = e?.target?.value || '';
                    if (!key) { this.setupData.systemPreset = ''; return; }
                    try {
                        await this._validateOrRejectPreset(key);
                        this.setupData.systemPreset = key;
                        this._applyPresetToSetupData(key);
                        await this.render();
                        ui.notifications.info(`Applied ${presetSelect.options[presetSelect.selectedIndex].text} preset`);
                    } catch (err) {
                        ui.notifications.error(String(err?.message || err || 'Preset unavailable for this system.'));
                        // revert selection
                        presetSelect.value = this.setupData.systemPreset || '';
                    }
                });
                presetSelect.dataset.boundSetup = 'true';
            }
        }
    }

    /**
     * Get shared system presets (mirrors sync options dialog)
     */
    _getSystemPresets() {
        return {
            dnd5e: {
                name: 'D&D 5e',
                actorMappings: {
                    pc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.details.biography.value' },
                    npc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.details.biography.public' }
                },
                itemMappings: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.description.value' }
            },
            pf2e: {
                name: 'Pathfinder 2e',
                actorMappings: {
                    pc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.details.biography.value' },
                    npc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.details.publicNotes' }
                },
                itemMappings: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.description.value' }
            },
            coc7: {
                name: 'Call of Cthulhu 7e',
                actorMappings: {
                    pc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.biography.personal.description' },
                    npc: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.biography.personal.description' }
                },
                itemMappings: { namePath: 'name', imagePath: 'img', descriptionPath: 'system.description.value' }
            }
        };
    }

    /**
     * Try auto-detect preset based on whether all preset paths exist in system model
     * Order: dnd5e -> pf2e -> coc7
     */
    async _autoDetectPreset() {
        const order = ['dnd5e', 'pf2e', 'coc7'];
        for (const key of order) {
            try {
                await this._validateOrRejectPreset(key);
                return key;
            } catch (_) { /* try next */ }
        }
        return '';
    }

    /**
     * Validate preset against current system model; throws if invalid
     */
    async _validateOrRejectPreset(key) {
        const presets = this._getSystemPresets();
        const preset = presets[key];
        if (!preset) throw new Error('Unknown preset');

        // Validate that each mapping path exists in the system model/property graph
        const testPaths = [
            preset.actorMappings?.pc?.namePath,
            preset.actorMappings?.pc?.imagePath,
            preset.actorMappings?.pc?.descriptionPath,
            preset.actorMappings?.npc?.namePath,
            preset.actorMappings?.npc?.imagePath,
            preset.actorMappings?.npc?.descriptionPath,
            preset.itemMappings?.namePath,
            preset.itemMappings?.imagePath,
            preset.itemMappings?.descriptionPath
        ].filter(Boolean);

        // Use our discovered mapping options to validate existence
        const availableActor = new Set((this.mappingOptions.actor || []).map(o => o.path));
        const availableItem = new Set((this.mappingOptions.item || []).map(o => o.path));

        const exists = (p) => {
            if (!p) return false;
            if (p === 'name' || p === 'img') return true; // safe defaults always exist
            if (p.startsWith('system.')) {
                // Try actor first, then item
                return availableActor.has(p) || availableItem.has(p);
            }
            return availableActor.has(p) || availableItem.has(p);
        };

        const missing = testPaths.filter(p => !exists(p));
        if (missing.length) {
            throw new Error(`Preset unavailable: missing properties in this system → ${missing.join(', ')}`);
        }
        return true;
    }

    /**
     * Apply preset mappings to setupData (does not touch destinations)
     */
    _applyPresetToSetupData(key) {
        const presets = this._getSystemPresets();
        const preset = presets[key];
        if (!preset) return;
        const gp = (o, p, fb = '') => {
            try { return foundry.utils.getProperty(o, p) ?? fb; } catch (_) { return fb; }
        };
        this.setupData.mapping.pc.namePath = gp(preset, 'actorMappings.pc.namePath');
        this.setupData.mapping.pc.imagePath = gp(preset, 'actorMappings.pc.imagePath');
        this.setupData.mapping.pc.descPath = gp(preset, 'actorMappings.pc.descriptionPath');
        this.setupData.mapping.npc.namePath = gp(preset, 'actorMappings.npc.namePath');
        this.setupData.mapping.npc.imagePath = gp(preset, 'actorMappings.npc.imagePath');
        this.setupData.mapping.npc.descPath = gp(preset, 'actorMappings.npc.descriptionPath');
        this.setupData.mapping.item.namePath = gp(preset, 'itemMappings.namePath');
        this.setupData.mapping.item.imagePath = gp(preset, 'itemMappings.imagePath');
        this.setupData.mapping.item.descPath = gp(preset, 'itemMappings.descriptionPath');
    }
}
