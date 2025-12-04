import { CONFIG, SETTINGS } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';
import { AdapterRegistry } from '../modules/projection/adapter-registry.js';

/**
 * World Setup Dialog - Step-by-step initialization process for new Foundry worlds
 * Guides users through the process of connecting their Foundry world to Archivist
 */
export class WorldSetupDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor() {
    super();
    this.currentStep = 1;
    this.totalSteps = 6; // Steps: 1 Welcome, 2 API, 3 Campaign, 4 Reconcile, 5 Create Foundry Objects, 6 Summary
    this.isLoading = false;
    this.isValidatingApi = false;
    this.worlds = [];
    this.setupData = {
      apiKey: '',
      apiKeyValid: false,
      selectedWorldId: '',
      selectedWorldName: '',
      setupComplete: false,
      // Mapping removed
      systemPreset: '',
      destinations: { pc: '', npc: '', item: '', location: '', faction: '' },
      // Step 4 selections
      selections: { pcs: [], npcs: [], items: [], locations: [], factions: [] },
      // Step 5: Create Foundry core objects choices
      createFoundry: { actors: [], items: [], scenes: [] },
    };
    // Mapping discovery caches removed
    this.folderOptions = { pc: [], npc: [], item: [], location: [], faction: [] };
    // Mapping options removed (keep empty object to avoid legacy access)
    this.mappingOptions = { actor: [], item: [] };
    this.archivistCandidates = { characters: [], items: [], locations: [], factions: [] };
    this.eligibleDocs = { pcs: [], npcs: [], items: [], locations: [], factions: [] };
    this.syncPlan = { createInFoundry: [], createInArchivist: [], link: [] };
    this.syncStatus = { total: 0, processed: 0, current: '', logs: [], descriptionTooLongErrors: [] };
    // Sync re-entrancy and lifecycle flags
    this._syncRunning = false;
    this._syncStarted = false;
    // Track active tabs across renders
    this._activeReconTab = null;
    this._activeCreateTab = null;
  }

  /**
   * Prepare default selections for creating Foundry core objects from Archivist imports
   */
  async _prepareCreateFoundryChoices() {
    try {
      const R = this.setupData?.reconcile || {};
      const arr = v => (Array.isArray(v) ? v : []);
      const unmatched = rows => arr(rows).filter(r => r && r.selected && !r.match);

      const existing = this.setupData?.createFoundry || { actors: [], items: [], scenes: [] };
      const actorIds = new Set((existing.actors || []).map(String));
      const itemIds = new Set((existing.items || []).map(String));
      const sceneIds = new Set((existing.scenes || []).map(String));

      const characterIds = unmatched(R.characters?.archivist).map(r => r.id);
      const itemIdsSrc = unmatched(R.items?.archivist).map(r => r.id);
      const locationIds = unmatched(R.locations?.archivist).map(r => r.id);

      if (actorIds.size === 0) characterIds.forEach(id => actorIds.add(String(id)));
      if (itemIds.size === 0) itemIdsSrc.forEach(id => itemIds.add(String(id)));
      if (sceneIds.size === 0) locationIds.forEach(id => sceneIds.add(String(id)));

      this.setupData.createFoundry = {
        actors: Array.from(actorIds),
        items: Array.from(itemIds),
        scenes: Array.from(sceneIds),
      };
    } catch (_) { }
  }

  _getCreateCandidates() {
    const R = this.setupData?.reconcile || {};
    const pick = rows => (Array.isArray(rows) ? rows.filter(r => r && r.selected && !r.match) : []);
    return {
      actors: pick(R.characters?.archivist),
      items: pick(R.items?.archivist),
      scenes: pick(R.locations?.archivist),
    };
  }

  async _onToggleCreateChoice(event) {
    const el = event?.target;
    const kind = el?.dataset?.kind;
    const id = el?.dataset?.id;
    if (!kind || !id) return;
    const list = Array.isArray(this.setupData.createFoundry?.[kind]) ? this.setupData.createFoundry[kind] : [];
    const sid = String(id);
    const i = list.map(String).indexOf(sid);
    if (el.checked && i === -1) list.push(sid);
    if (!el.checked && i !== -1) list.splice(i, 1);
  }

  async _onCreateSelectAll(event) {
    const kind = event?.target?.dataset?.kind;
    if (!kind) return;
    const cand = this._getCreateCandidates()[kind] || [];
    this.setupData.createFoundry[kind] = cand.map(c => String(c.id));
    // Update checkboxes in DOM without full re-render
    const root = this.element;
    if (root) {
      root.querySelectorAll(`input[data-action="toggleCreateChoice"][data-kind="${kind}"]`).forEach(cb => {
        cb.checked = true;
      });
    }
  }

  async _onCreateSelectNone(event) {
    const kind = event?.target?.dataset?.kind;
    if (!kind) return;
    this.setupData.createFoundry[kind] = [];
    // Update checkboxes in DOM without full re-render
    const root = this.element;
    if (root) {
      root.querySelectorAll(`input[data-action="toggleCreateChoice"][data-kind="${kind}"]`).forEach(cb => {
        cb.checked = false;
      });
    }
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
      resizable: true,
    },
    position: {
      width: 850,
      height: 900,
    },
    classes: ['archivist-sync-dialog', 'world-setup-dialog'],
    actions: {
      nextStep: WorldSetupDialog.prototype._onNextStep,
      prevStep: WorldSetupDialog.prototype._onPrevStep,
      validateApiKey: WorldSetupDialog.prototype._onValidateApiKey,
      syncWorlds: WorldSetupDialog.prototype._onSyncWorlds,
      selectWorld: WorldSetupDialog.prototype._onSelectWorld,
      openDocumentation: WorldSetupDialog.prototype._onOpenDocumentation,
      // Step 3 actions
      loadCampaigns: WorldSetupDialog.prototype._onLoadCampaigns,
      createCampaign: WorldSetupDialog.prototype._onCreateCampaign,
      campaignSelectChange: WorldSetupDialog.prototype._onCampaignSelectChange,
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
      cancel: WorldSetupDialog.prototype._onCancel,
    },
  };

  /**
   * Template path for the dialog
   * @returns {string} Template path
   */
  static PARTS = {
    form: {
      template: 'modules/archivist-sync/templates/world-setup-dialog.hbs',
    },
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
          sample: value.length > 50 ? value.substring(0, 47) + '...' : value,
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
        'name',
        'img',
        'system.details.biography.value',
        'system.details.biography.public',
        'system.details.trait',
        'system.details.ideal',
        'system.details.bond',
        'system.details.flaw',
        'system.details.appearance',
        'system.description.value',
      ];

      const itemPriorityFields = [
        'name',
        'img',
        'system.description.value',
        'system.description.short',
        'system.description.chat',
      ];

      this.mappingOptions.actor = sortWithPriority(this.mappingOptions.actor, actorPriorityFields);
      this.mappingOptions.item = sortWithPriority(this.mappingOptions.item, itemPriorityFields);

      console.log(
        `Archivist Sync | Property discovery complete: ${this.mappingOptions.actor.length} actor properties, ${this.mappingOptions.item.length} item properties`
      );
    } catch (error) {
      console.warn('Error preparing mapping options:', error);
      // Ensure we have fallback options
      this.mappingOptions.actor = [
        { path: 'name', type: 'string', sample: 'Actor name' },
        { path: 'img', type: 'string', sample: 'Actor image path' },
      ];
      this.mappingOptions.item = [
        { path: 'name', type: 'string', sample: 'Item name' },
        { path: 'img', type: 'string', sample: 'Item image path' },
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
    for (const actor of existingActors.slice(0, 2)) {
      // Sample max 2 existing
      try {
        const actorData = actor.toObject();
        const properties = this._discoverStringProperties(actorData);
        for (const prop of properties) {
          allProperties.set(prop.path, prop);
        }
        console.log(
          `Archivist Sync | Discovered ${properties.length} properties from existing ${actor.type} actor: ${actor.name}`
        );
      } catch (error) {
        console.warn(`Error discovering properties from existing actor ${actor.name}:`, error);
      }
    }

    // Try to discover properties from system data model templates instead of creating actors
    for (const actorType of actorTypes) {
      const hasExistingOfType = existingActors.some(a => a.type === actorType);

      if (!hasExistingOfType) {
        try {
          console.log(
            `Archivist Sync | Attempting system template discovery for ${actorType} actor`
          );

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
                sample: `${prop.sample} (from template)`,
              };
              allProperties.set(systemProp.path, systemProp);
            }

            console.log(
              `Archivist Sync | Discovered ${templateProperties.length} properties from ${actorType} system template`
            );
          } else {
            // Fallback: use predefined property sets for this actor type
            console.log(
              `Archivist Sync | No system template found for ${actorType}, using fallback properties`
            );
            const fallbackProperties = this._getFallbackActorProperties(actorType);
            for (const prop of fallbackProperties) {
              allProperties.set(prop.path, prop);
            }
            console.log(
              `Archivist Sync | Used ${fallbackProperties.length} fallback properties for ${actorType} actor`
            );
          }
        } catch (error) {
          console.warn(`Error discovering properties for ${actorType} actor:`, error);

          // Final fallback: use predefined property sets
          try {
            const fallbackProperties = this._getFallbackActorProperties(actorType);
            for (const prop of fallbackProperties) {
              allProperties.set(prop.path, prop);
            }
            console.log(
              `Archivist Sync | Used fallback properties for ${actorType} actor after error`
            );
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
      { path: 'system.biography.public', sample: 'Public biography (alt path)' },
    ];

    for (const pathInfo of knownPaths) {
      if (!allProperties.has(pathInfo.path)) {
        allProperties.set(pathInfo.path, {
          path: pathInfo.path,
          type: 'string',
          sample: pathInfo.sample,
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
      { path: 'img', type: 'string', sample: 'Actor image path' },
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
        { path: 'system.details.background', type: 'string', sample: 'Character background' },
      ];
    } else if (actorType === 'npc') {
      return [
        ...baseProperties,
        { path: 'system.details.biography.value', type: 'string', sample: 'Full biography text' },
        {
          path: 'system.details.biography.public',
          type: 'string',
          sample: 'Public biography text',
        },
        { path: 'system.description.value', type: 'string', sample: 'Description text' },
      ];
    }

    return baseProperties;
  }


  /**
   * Prepare context data for template rendering
   * @returns {Object} Template data
   */
  async _prepareContext() {
    // Prepare folder options when needed
    try {
      const folders = game.folders?.contents || [];
      const pick = type =>
        folders
          .filter(f => f.type === type)
          .map(f => ({ id: f.id, name: f.name, depth: f.depth || 0 }))
          .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
      this.folderOptions = {
        pc: pick('Actor'),
        npc: pick('Actor'),
        item: pick('Item'),
        location: pick('JournalEntry'),
        faction: pick('JournalEntry'),
      };
    } catch (_) {
      /* no-op */
    }

    // Mapping step removed; skip legacy mapping preparation entirely

    const contextData = {
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
      syncStatusPct:
        this.syncStatus.total > 0
          ? Math.round((this.syncStatus.processed / this.syncStatus.total) * 100)
          : 0,
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
      progressPercentage: Math.round((this.currentStep / this.totalSteps) * 100),
    };

    // Provide flattened summary rows for Step 6 to avoid template path issues
    try {
      if (this.currentStep === 6) {
        let sp = this.syncPlan || {};
        let imp = sp.importFromArchivist || {};
        let exp = sp.exportToArchivist || {};
        let lnk = sp.linked || {};

        const hasPlanNumbers =
          typeof imp.characters === 'number' ||
          typeof imp.items === 'number' ||
          typeof imp.locations === 'number' ||
          typeof imp.factions === 'number' ||
          typeof imp.recaps === 'number';

        // Fallback: derive counts directly from reconciliation selections if plan not populated
        if (!hasPlanNumbers) {
          const R = this.setupData?.reconcile || {};
          const arr = v => (Array.isArray(v) ? v : []);
          const isSel = r => r && (r.selected !== false);

          const count = {
            imp: { characters: 0, items: 0, locations: 0, factions: 0, recaps: 0 },
            exp: { characters: 0, items: 0, locations: 0, factions: 0 },
            lnk: { characters: 0, items: 0, locations: 0 },
          };

          for (const row of arr(R.characters?.archivist)) {
            if (!isSel(row)) continue;
            if (row.match) count.lnk.characters++; else count.imp.characters++;
          }
          for (const row of arr(R.characters?.foundry)) {
            if (!isSel(row)) continue;
            if (!row.match) count.exp.characters++;
          }

          for (const row of arr(R.items?.archivist)) {
            if (!isSel(row)) continue;
            if (row.match) count.lnk.items++; else count.imp.items++;
          }
          for (const row of arr(R.items?.foundry)) {
            if (!isSel(row)) continue;
            if (!row.match) count.exp.items++;
          }

          for (const row of arr(R.locations?.archivist)) {
            if (!isSel(row)) continue;
            if (row.match) count.lnk.locations++; else count.imp.locations++;
          }
          for (const row of arr(R.locations?.foundry)) {
            if (!isSel(row)) continue;
            if (!row.match) count.exp.locations++;
          }

          // Import-only buckets
          count.imp.factions = this.archivistCandidates?.factions?.length || 0;
          count.imp.recaps = this.archivistCandidates?.recaps?.length || 0;

          imp = count.imp; exp = count.exp; lnk = count.lnk;
        }

        const cf = this.setupData?.createFoundry || { actors: [], items: [], scenes: [] };
        const createCounts = {
          characters: Array.isArray(cf.actors) ? cf.actors.length : 0,
          items: Array.isArray(cf.items) ? cf.items.length : 0,
          locations: Array.isArray(cf.scenes) ? cf.scenes.length : 0,
        };

        const charactersToArchivistCount = Number(exp.characters || 0);
        const itemsToArchivistCount = Number(exp.items || 0);
        const locationsToArchivistCount = Number(exp.locations || 0);

        contextData.summaryRows = [
          { key: 'Characters', fromArchivist: Number(imp.characters || 0), createFoundry: Number(createCounts.characters || 0), toArchivist: charactersToArchivistCount, linked: Number(lnk.characters || 0), highVolumeExport: charactersToArchivistCount > 100 },
          { key: 'Items', fromArchivist: Number(imp.items || 0), createFoundry: Number(createCounts.items || 0), toArchivist: itemsToArchivistCount, linked: Number(lnk.items || 0), highVolumeExport: itemsToArchivistCount > 100 },
          { key: 'Locations', fromArchivist: Number(imp.locations || 0), createFoundry: Number(createCounts.locations || 0), toArchivist: locationsToArchivistCount, linked: Number(lnk.locations || 0), noteNoExport: true, highVolumeExport: locationsToArchivistCount > 100 },
          { key: 'Factions', fromArchivist: Number(imp.factions || 0), createFoundry: 0, toArchivist: 0, linked: 0, noteNoExport: true },
          { key: 'Recaps', fromArchivist: Number(imp.recaps || 0), createFoundry: 0, toArchivist: 0, linked: 0, noteNoExport: true },
        ];

        // Set warning flag if any of Characters, Items, or Locations have > 100 exports
        contextData.showHighVolumeWarning = charactersToArchivistCount > 100 || itemsToArchivistCount > 100 || locationsToArchivistCount > 100;
      }
    } catch (_) { }

    // Provide a quick lookup map for Step 5 checked states in template
    try {
      if (this.currentStep === 5) {
        const cf = this.setupData?.createFoundry || { actors: [], items: [], scenes: [] };
        contextData.createFoundryMap = {
          actors: (cf.actors || []).reduce((m, id) => { m[String(id)] = true; return m; }, {}),
          items: (cf.items || []).reduce((m, id) => { m[String(id)] = true; return m; }, {}),
          scenes: (cf.scenes || []).reduce((m, id) => { m[String(id)] = true; return m; }, {}),
        };
        // Provide flags for whether there are any create candidates
        const candidates = this._getCreateCandidates();
        contextData.hasCreateCandidates = {
          actors: (candidates.actors || []).length > 0,
          items: (candidates.items || []).length > 0,
          scenes: (candidates.scenes || []).length > 0,
        };
      }
    } catch (_) { }

    if (this.currentStep === 4) {
      console.log('[World Setup] _prepareContext for Step 4:', {
        hasReconcileData: !!contextData.setupData?.reconcile,
        hasAnyCandidates: contextData.setupData?.hasAnyCandidates,
        isLoading: contextData.isLoading,
        reconcileKeys: Object.keys(contextData.setupData?.reconcile || {}),
        charactersArchivistCount: contextData.setupData?.reconcile?.characters?.archivist?.length || 0,
        charactersFoundryCount: contextData.setupData?.reconcile?.characters?.foundry?.length || 0,
      });
    }

    return contextData;
  }

  /**
   * Check if user can proceed from current step
   * @returns {boolean} True if can proceed
   * @private
   */
  _canProceedFromCurrentStep() {
    switch (this.currentStep) {
      case 1:
        return true; // Welcome step, always can proceed
      case 2:
        return this.setupData.apiKeyValid; // Need valid API key
      case 3:
        // Allow proceeding once a campaign has been selected (or created)
        // Prefer in-memory selection, fall back to settings helper
        return !!this.setupData.selectedWorldId || settingsManager.isWorldSelected();
      case 4:
        return true; // selection step
      case 5:
        return true; // create choices step
      case 6:
        // Disable completion until sync has started and finished
        // If syncStatus.total is 0, sync hasn't begun yet, so allow "Begin Sync" but not "Complete"
        // Once sync starts (total > 0), only allow completion when processed >= total
        if (this.syncStatus.total === 0) {
          // Sync hasn't begun, can't complete yet
          return false;
        }
        // Sync has started, can complete only when finished
        return this.syncStatus.processed >= this.syncStatus.total;
      default:
        return false;
    }
  }

  /**
   * Handle next step button click
   * @param {Event} event - Click event
   * @private
   */
  async _onNextStep(event) {
    event.preventDefault();
    console.log('[World Setup] _onNextStep called, currentStep before increment:', this.currentStep);

    // Special handling: if leaving step 4, must build sync plan first
    if (this.currentStep === 4 && this._canProceedFromCurrentStep()) {
      console.log('[World Setup] _onNextStep from step 4: building sync plan via _onConfirmSelections');
      await this._onConfirmSelections(event);
      // _onConfirmSelections already advances to step 5 and renders, so return here
      return;
    }

    if (this.currentStep < this.totalSteps && this._canProceedFromCurrentStep()) {
      this.currentStep++;
      console.log('[World Setup] _onNextStep, currentStep after increment:', this.currentStep);
      // Auto-prepare reconciliation data when entering Step 4
      if (this.currentStep === 4) {
        console.log('[World Setup] _onNextStep triggering _onPrepareSelections for Step 4');
        await this._onPrepareSelections(event);
        return;
      }
      // Prepare create choices when entering Step 5
      if (this.currentStep === 5) {
        console.log('[World Setup] _onNextStep preparing create choices for Step 5');
        await this._prepareCreateFoundryChoices();
        await this.render();
        return;
      }
      await this.render();
    } else {
      console.log('[World Setup] _onNextStep cannot proceed:', {
        currentStep: this.currentStep,
        totalSteps: this.totalSteps,
        canProceed: this._canProceedFromCurrentStep()
      });
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

        // Store campaigns data
        this.worlds = response.data || [];

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
        ui.notifications.error(
          response.message || 'Invalid API key. Please check your key and try again.'
        );
      }
    } catch (error) {
      console.error('Error validating API key:', error);
      this.setupData.apiKeyValid = false;
      ui.notifications.error(
        'Failed to validate API key. Please check your connection and try again.'
      );
    } finally {
      this.isValidatingApi = false;
      await this.render();
    }
  }

  /**
   * Handle open documentation button click
   * @param {Event} event - Click event
   * @private
   */
  async _onOpenDocumentation(event) {
    event.preventDefault();
    try {
      const { DocumentationWindow } = await import('./documentation-window.js');
      (window.__ARCHIVIST_DOCS__ ||= new DocumentationWindow()).render(true);
    } catch (e) {
      console.error('[Archivist Sync] Failed to open documentation window', e);
      ui.notifications?.error?.('Failed to open documentation window');
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
      this.isLoading = true;
      try {
        await this.render();
      } catch (_) {
        /* ignore after close */
      }
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
      this.isLoading = false;
      await this.render();
    }
  }

  /**
   * Step 3: Create a campaign with Foundry world title
   */
  async _onCreateCampaign(event) {
    event?.preventDefault?.();
    try {
      this.isLoading = true;
      await this.render();
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
      this.isLoading = false;
      await this.render();
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
    try {
      if (worldId) {
        // Persist immediately so helper checks pass if used elsewhere
        await settingsManager.setSelectedWorld(worldId, this.setupData.selectedWorldName);
      }
    } catch (_) { }
    await this.render();
  }

  /**
   * Step 5: Prepare selections — gather Foundry docs and Archivist candidates
   */
  async _onPrepareSelections(event) {
    event?.preventDefault?.();
    try {
      console.log('[World Setup] Starting _onPrepareSelections');
      this.isLoading = true;
      await this.render();
      const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
      // Always prefer the explicit selection from Step 3; fallback to saved setting only if necessary
      const campaignId = this.setupData.selectedWorldId || settingsManager.getSelectedWorldId();
      console.log('[World Setup] Using campaignId:', campaignId);
      if (!campaignId) {
        ui.notifications.warn('Please select a campaign in Step 3 before continuing.');
        this.currentStep = 3;
        await this.render();
        return;
      }
      // Foundry side — gather all Actors, Items, and Scenes (exclude compendium packs)
      const getAll = (coll) => (coll?.contents || []).filter(d => !d?.pack);
      const foundryActors = getAll(game.actors);
      const foundryItems = getAll(game.items);
      const foundryScenes = getAll(game.scenes);
      console.log('[World Setup] Foundry docs:', {
        actors: foundryActors.length,
        items: foundryItems.length,
        scenes: foundryScenes.length,
      });

      // Archivist side
      console.log('[World Setup] Fetching Archivist data...');
      const [chars, its, locs, facs, sessions] = await Promise.all([
        archivistApi.listCharacters(apiKey, campaignId),
        archivistApi.listItems(apiKey, campaignId),
        archivistApi.listLocations(apiKey, campaignId),
        archivistApi.listFactions(apiKey, campaignId),
        archivistApi.listSessions(apiKey, campaignId),
      ]);
      console.log('[World Setup] Archivist API responses:', { chars, its, locs, facs, sessions });
      this.archivistCandidates.characters = chars.success ? (chars.data || []) : [];
      this.archivistCandidates.items = its.success ? (its.data || []) : [];
      this.archivistCandidates.locations = locs.success ? (locs.data || []) : [];
      this.archivistCandidates.factions = facs.success ? (facs.data || []) : [];
      this.archivistCandidates.recaps = sessions.success ? (sessions.data || []) : [];
      console.log('[World Setup] Archivist docs:', {
        characters: this.archivistCandidates.characters.length,
        items: this.archivistCandidates.items.length,
        locations: this.archivistCandidates.locations.length,
        factions: this.archivistCandidates.factions.length,
        recaps: this.archivistCandidates.recaps.length,
      });

      // Build reconciliation model with initial matches and selections
      console.log('[World Setup] Building reconciliation model...');
      const reconcile = this._buildReconciliationModel({
        archivist: {
          characters: this.archivistCandidates.characters,
          items: this.archivistCandidates.items,
          locations: this.archivistCandidates.locations,
          factions: this.archivistCandidates.factions,
        },
        foundry: {
          actors: foundryActors,
          items: foundryItems,
          scenes: foundryScenes,
        },
      });
      console.log('[World Setup] Reconciliation model built:', reconcile);
      console.log('[World Setup] Detailed reconciliation counts:', {
        charactersArchivist: reconcile?.characters?.archivist?.length || 0,
        charactersFoundry: reconcile?.characters?.foundry?.length || 0,
        itemsArchivist: reconcile?.items?.archivist?.length || 0,
        itemsFoundry: reconcile?.items?.foundry?.length || 0,
        locationsArchivist: reconcile?.locations?.archivist?.length || 0,
        locationsFoundry: reconcile?.locations?.foundry?.length || 0,
        factionsArchivist: reconcile?.factions?.archivist?.length || 0,
        factionsFoundry: reconcile?.factions?.foundry?.length || 0,
      });

      this.setupData.reconcile = reconcile;
      this.setupData.hasAnyCandidates = Boolean(
        (reconcile?.characters?.archivist?.length || 0) +
        (reconcile?.characters?.foundry?.length || 0) +
        (reconcile?.items?.archivist?.length || 0) +
        (reconcile?.items?.foundry?.length || 0) +
        (reconcile?.locations?.archivist?.length || 0) +
        (reconcile?.locations?.foundry?.length || 0) +
        (reconcile?.factions?.archivist?.length || 0) +
        (reconcile?.factions?.foundry?.length || 0)
      );
      console.log('[World Setup] Has candidates:', this.setupData.hasAnyCandidates);
      console.log('[World Setup] setupData.reconcile assigned:', this.setupData.reconcile);
      console.log('[World Setup] Sample archivist character (first item):', reconcile?.characters?.archivist?.[0]);
      console.log('[World Setup] Sample archivist location (first item):', reconcile?.locations?.archivist?.[0]);

      // stay on Selection step after refresh
      this.currentStep = 4;
      try {
        await this.render();
      } catch (_) {
        /* ignore after close */
      }
    } catch (e) {
      console.error('Prepare selections error', e);
      ui.notifications.error('Failed to prepare selections');
    } finally {
      this.isLoading = false;
      try {
        await this.render();
      } catch (_) {
        /* ignore after close */
      }
    }
  }

  _updateSelection(kind, id, updates) {
    const arr = this.setupData.selections[kind] || [];
    const idx = arr.findIndex(x => x.id === id);
    if (idx >= 0) Object.assign(arr[idx], updates);
  }

  async _onToggleSelection(event) {
    const el = event?.target;
    const kind = el?.dataset?.kind;
    const id = el?.dataset?.id;
    if (!kind || !id) return;
    this._updateSelection(kind, id, { selected: el.checked });
  }

  async _onChangeMatch(event) {
    const el = event?.target;
    const kind = el?.dataset?.kind;
    const id = el?.dataset?.id;
    if (!kind || !id) return;
    this._updateSelection(kind, id, {
      match: { id: el.value, label: el.options[el.selectedIndex]?.text || '' },
    });
  }

  async _onSelectAll(event) {
    const kind = event?.target?.dataset?.kind;
    if (!kind) return;
    (this.setupData.selections[kind] || []).forEach(s => (s.selected = true));
    await this.render();
  }

  async _onSelectNone(event) {
    const kind = event?.target?.dataset?.kind;
    if (!kind) return;
    (this.setupData.selections[kind] || []).forEach(s => (s.selected = false));
    await this.render();
  }

  async _onConfirmSelections(event) {
    event?.preventDefault?.();
    // Build plan from reconciliation model
    const plan = {
      createInArchivist: [],
      link: [],
      importFromArchivist: { characters: 0, items: 0, locations: 0, factions: 0, recaps: 0 },
      exportToArchivist: { characters: 0, items: 0, locations: 0, factions: 0 },
      linked: { characters: 0, items: 0, locations: 0 },
      counts: { create: { pc: 0, npc: 0, item: 0, location: 0, faction: 0 }, link: { pc: 0, npc: 0, item: 0, location: 0, faction: 0 } },
      summary: { pc: [], npc: [], item: [], location: [], faction: [], session: [] },
      totalsBySource: { archivist: { characters: 0, items: 0, locations: 0, factions: 0, recaps: 0 }, foundry: { characters: 0, items: 0, locations: 0, factions: 0, recaps: 0 } },
    };
    const push = (arr, obj) => { arr.push(obj); };
    const inc = (bucket, key) => { plan.counts[bucket][key]++; };

    const R = this.setupData.reconcile || {};
    const ensure = v => Array.isArray(v) ? v : [];

    // Characters: archivist (PC/NPC) to foundry actors
    for (const side of ['archivist', 'foundry']) {
      for (const row of ensure(R.characters?.[side])) {
        if (!row.selected) continue;
        if (side === 'archivist') {
          // If matched, it's a link; otherwise it's an import from Archivist
          if (row.match) {
            const kind = row.type === 'PC' ? 'pc' : 'npc';
            push(plan.link, { kind: row.type, archivistId: row.id, foundryId: row.match, name: row.name });
            plan.summary[kind].push({ name: row.name, action: 'link', foundryId: row.match });
            inc('link', kind);
            plan.linked.characters++;
          } else {
            // Archivist character with no match -> import to Foundry
            plan.importFromArchivist.characters++;
          }
        } else {
          // Foundry-only actor with no match -> export to Archivist
          if (!row.match) {
            const isPc = String(row.type || '').toLowerCase() === 'character';
            const kind = isPc ? 'pc' : 'npc';
            push(plan.createInArchivist, { kind: isPc ? 'PC' : 'NPC', foundryId: row.id, name: row.name });
            plan.summary[kind].push({ name: row.name, action: 'create' });
            inc('create', kind);
            plan.exportToArchivist.characters++;
          }
        }
      }
    }

    // Items
    for (const row of ensure(R.items?.archivist)) {
      if (!row.selected) continue;
      if (row.match) {
        push(plan.link, { kind: 'Item', archivistId: row.id, foundryId: row.match, name: row.name });
        plan.summary.item.push({ name: row.name, action: 'link', foundryId: row.match });
        inc('link', 'item');
        plan.linked.items++;
      } else {
        // Archivist item with no match -> import to Foundry
        plan.importFromArchivist.items++;
      }
    }
    for (const row of ensure(R.items?.foundry)) {
      if (!row.selected) continue;
      if (!row.match) {
        push(plan.createInArchivist, { kind: 'Item', foundryId: row.id, name: row.name });
        plan.summary.item.push({ name: row.name, action: 'create' });
        inc('create', 'item');
        plan.exportToArchivist.items++;
      }
    }

    // Locations (Archivist <-> Foundry Scenes)
    for (const row of ensure(R.locations?.archivist)) {
      if (!row.selected) continue;
      if (row.match) {
        push(plan.link, { kind: 'Location', archivistId: row.id, foundryId: row.match, name: row.name });
        plan.summary.location.push({ name: row.name, action: 'link', foundryId: row.match });
        inc('link', 'location');
        plan.linked.locations++;
      } else {
        // Archivist location with no match -> import to Foundry
        plan.importFromArchivist.locations++;
      }
    }
    for (const row of ensure(R.locations?.foundry)) {
      if (!row.selected) continue;
      if (!row.match) {
        // Foundry scene with no match -> create Location in Archivist
        push(plan.createInArchivist, { kind: 'Location', foundryId: row.id, name: row.name });
        plan.summary.location.push({ name: row.name, action: 'create' });
        inc('create', 'location');
        plan.exportToArchivist.locations++;
      }
    }

    // Factions (Archivist-only, no reconciliation needed - import all)
    plan.importFromArchivist.factions = this.archivistCandidates.factions?.length || 0;

    // Recaps (Archivist-only from game sessions - import all)
    plan.importFromArchivist.recaps = this.archivistCandidates.recaps?.length || 0;

    this.syncPlan = plan;
    this.currentStep = 5;
    await this._prepareCreateFoundryChoices();
    await this.render();
  }

  async _onBeginSync(event) {
    event?.preventDefault?.();
    // Prevent multiple starts
    if (this._syncStarted) return;

    // Projection confirmation (once per run)
    let result;
    try {
      const current = !!settingsManager.getProjectDescriptionsEnabled?.();
      result = await foundry.applications.api.DialogV2.prompt({
        window: { title: 'Confirm Sync & Projection' },
        position: { width: 560 },
        content: `
          <section class="archivist-setup-confirm" style="line-height:1.4">
            <p>This will begin your initial sync. You can control whether Archivist appends description sections to core Actor and Item description fields during setup.</p>
            <label style="display:flex; align-items:center; gap:.5rem; margin-top: .75rem;">
              <input type="checkbox" name="projectDescriptions" ${current ? 'checked' : ''} />
              <span><strong>Project Descriptions</strong> — Append an Archivist section to the most likely description field.</span>
            </label>
            <label style="display:flex; align-items:center; gap:.5rem; margin-top: .75rem;">
              <input type="checkbox" name="realtimeSync" ${settingsManager.isRealtimeSyncEnabled?.() ? 'checked' : ''} />
              <span><strong>Real‑Time Sync</strong> — When enabled, changes you make to Actors, Items, and selected Journals in Foundry will be mirrored to Archivist automatically. Disable during bulk imports to avoid unintended updates.</span>
            </label>
          </section>
        `,
        ok: {
          label: 'Begin Sync',
          icon: 'fas fa-check',
          callback: (ev, button) => {
            const form = button.form;
            const fd = new FormData(form);
            return { project: fd.get('projectDescriptions') === 'on', realtime: fd.get('realtimeSync') === 'on' };
          }
        },
        cancel: { label: 'Cancel', icon: 'fas fa-times' },
        rejectClose: true
      });
    } catch (_) {
      // User cancelled or closed the dialog - do not proceed with sync
      console.log('[World Setup] Sync cancelled by user');
      return;
    }

    if (!result) return;

    // Apply settings from dialog
    const enabled = !!result.project;
    try { await game.settings.set(CONFIG.MODULE_ID, SETTINGS.PROJECT_DESCRIPTIONS.key, enabled); } catch (_) { }
    try { await game.settings.set(CONFIG.MODULE_ID, SETTINGS.REALTIME_SYNC_ENABLED.key, !!result.realtime); } catch (_) { }

    // Mark sync as started
    this._syncStarted = true;
    // Re-entrancy guard: prevent double execution
    if (this._syncRunning) return;
    this._syncRunning = true;
    try {
      // Disable Begin Sync button while running
      this.isLoading = true;
      try { await this.render(); } catch (_) { }

      const apiKey = this.setupData.apiKey || settingsManager.getApiKey();
      const campaignId = this.setupData.selectedWorldId || settingsManager.getSelectedWorldId();

      console.log('Archivist Sync | Beginning sync with:', {
        apiKey: apiKey ? `***${apiKey.slice(-4)}` : 'none',
        campaignId,
      });

      // CRITICAL: Suppress realtime sync during setup to avoid unintended PATCH/creates
      console.warn('[World Setup] ⚠️  Real-time sync DISABLED during initial world setup');
      try { settingsManager.suppressRealtimeSync?.(); } catch (_) { }

      // Verify suppression is active
      if (!settingsManager.isRealtimeSyncSuppressed?.()) {
        console.error('[World Setup] ❌ CRITICAL: Realtime sync suppression FAILED!');
        ui.notifications?.error?.('Critical error: Unable to disable sync during setup.');
        this._syncRunning = false;
        await this.render();
        return;
      }
      console.log('[World Setup] ✓ Real-time sync successfully suppressed');

      // Ensure Journal folders exist for each sheet type BEFORE importing
      try {
        console.log('[World Setup] Creating organized folders...');
        const ensureFolder = async name => {
          try { return await Utils.ensureJournalFolder(name); } catch (_) { return null; }
        };
        const folders = {
          pc: await ensureFolder('Archivist - PCs'),
          npc: await ensureFolder('Archivist - NPCs'),
          item: await ensureFolder('Archivist - Items'),
          location: await ensureFolder('Archivist - Locations'),
          faction: await ensureFolder('Archivist - Factions'),
          recap: await ensureFolder('Recaps'),
        };

        console.log('[World Setup] Folders created:', {
          pc: folders.pc || 'failed',
          npc: folders.npc || 'failed',
          item: folders.item || 'failed',
          location: folders.location || 'failed',
          faction: folders.faction || 'failed',
          recap: folders.recap || 'failed',
        });

        this.setupData.destinations = {
          pc: folders.pc,
          npc: folders.npc,
          item: folders.item,
          location: folders.location,
          faction: folders.faction,
        };

        console.log('[World Setup] Destinations set:', {
          pc: this.setupData.destinations.pc || 'none',
          npc: this.setupData.destinations.npc || 'none',
          item: this.setupData.destinations.item || 'none',
          location: this.setupData.destinations.location || 'none',
          faction: this.setupData.destinations.faction || 'none',
        });
      } catch (e) {
        console.error('[World Setup] Folder creation failed:', e);
      }

      // Build work list for Archivist-side operations first (export/link)
      const work = [...(this.syncPlan.createInArchivist || []), ...(this.syncPlan.link || [])];
      console.log(`Archivist Sync | Processing ${work.length} sync jobs:`, {
        createInArchivist: this.syncPlan.createInArchivist?.length || 0,
        link: this.syncPlan.link?.length || 0,
      });

      // Also account for Foundry creations requested in Step 5
      const cf = this.setupData?.createFoundry || { actors: [], items: [], scenes: [] };
      const foundryCreatesTotal = (cf.actors?.length || 0) + (cf.items?.length || 0) + (cf.scenes?.length || 0);
      this.syncStatus.total = work.length + foundryCreatesTotal;
      this.syncStatus.processed = 0;
      await this.render();

      const getDoc = async (kind, id) => {
        if (kind === 'PC' || kind === 'NPC') return game.actors.get(id);
        if (kind === 'Item') return game.items.get(id);
        if (kind === 'Location') {
          // Location creation from Scene - get the Scene document
          return game.scenes.get(id);
        }
        if (kind === 'Faction') {
          // Supports JournalEntry id or JournalEntryPage UUID
          try {
            return await fromUuid(id);
          } catch (_) {
            /* fallthrough */
          }
          return game.journal.get(id);
        }
        return null;
      };

      const getMappedFields = (kind, doc) => {
        // Best-guess description extraction using AdapterRegistry candidates
        const httpsOnly = s => {
          const v = String(s || '').trim();
          return v.startsWith('https://') ? v : undefined;
        };
        const toPlain = html => Utils.toMarkdownIfHtml?.(String(html || '')) || String(html || '');
        const gatherDescription = () => {
          try {
            const docType = doc?.documentName;
            const candidates = AdapterRegistry.getCandidates(docType) || [
              { path: 'system.description.value', weight: 90, html: true },
              { path: 'system.details.description', weight: 85, html: true },
              { path: 'system.details.biography.value', weight: 80, html: true },
              { path: 'system.details.biography', weight: 75, html: true },
              { path: 'flags.core.summary', weight: 70, html: true },
            ];
            const viable = candidates
              .map(c => ({ ...c, val: foundry.utils.getProperty(doc, c.path) }))
              .filter(c => typeof c.val === 'string' && c.val.trim().length > 0);
            if (!viable.length) return '';
            const scored = viable
              .map(c => {
                const s = String(c.val || '');
                const hasHtml = !!c.html || /<\/?[a-z][\s\S]*>/i.test(s);
                const score = (c.weight || 0) + (s.length ? 15 : 0) + (hasHtml ? 10 : 0);
                return { score, s };
              })
              .sort((a, b) => b.score - a.score)[0];
            return toPlain(scored?.s || '');
          } catch (_) {
            return '';
          }
        };

        if (kind === 'PC' || kind === 'NPC') {
          const image = httpsOnly(doc?.img);
          const description = gatherDescription();
          return {
            character_name: String(doc?.name || ''),
            ...(description ? { description } : {}),
            ...(image ? { image } : {}),
          };
        }
        if (kind === 'Item') {
          const image = httpsOnly(doc?.img);
          const description = gatherDescription();
          return {
            name: String(doc?.name || ''),
            ...(description ? { description } : {}),
            ...(image ? { image } : {}),
          };
        }
        if (kind === 'Location') {
          const description = gatherDescription();
          return {
            name: String(doc?.name || ''),
            ...(description ? { description } : {}),
          };
        }
        return {};
      };

      const setArchivistFlag = async (kind, doc, archivistId) => {
        try {
          await doc.setFlag(CONFIG.MODULE_ID, 'archivistId', archivistId);
        } catch (_) { }
      };

      // 1) Create Foundry core objects for unmatched Archivist entities as requested
      try {
        // Characters → create Actors
        for (const id of (cf.actors || [])) {
          const row = (this.setupData?.reconcile?.characters?.archivist || []).find(r => String(r.id) === String(id));
          if (!row) { this.syncStatus.processed++; continue; }
          const actorType = String(row.type || 'PC').toUpperCase() === 'NPC' ? 'npc' : 'character';
          const folderId = actorType === 'npc' ? this.setupData.destinations.npc : this.setupData.destinations.pc;
          const actor = await Actor.create({ name: row.name || 'Character', type: actorType, folder: folderId || null, ...(row.img ? { img: row.img } : {}) }, { render: false });
          try { await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', row.id); } catch (_) { }
          this.syncStatus.logs.push(`Created Actor '${actor.name}' for Archivist Character ${row.id}`);
          this.syncStatus.processed++;
          await this.render();
        }
        // Items → create Items
        for (const id of (cf.items || [])) {
          const row = (this.setupData?.reconcile?.items?.archivist || []).find(r => String(r.id) === String(id));
          if (!row) { this.syncStatus.processed++; continue; }
          const folderId = this.setupData.destinations.item || null;
          const safeType = Utils.resolveItemType({ type: row?.type });
          const item = await Item.create({ name: row.name || 'Item', type: safeType, folder: folderId, ...(row.img ? { img: row.img } : {}) }, { render: false });
          try { await item.setFlag(CONFIG.MODULE_ID, 'archivistId', row.id); } catch (_) { }
          this.syncStatus.logs.push(`Created Item '${item.name}' for Archivist Item ${row.id}`);
          this.syncStatus.processed++;
          await this.render();
        }
        // Locations → create Scenes (new capability)
        for (const id of (cf.scenes || [])) {
          const row = (this.setupData?.reconcile?.locations?.archivist || []).find(r => String(r.id) === String(id));
          if (!row) { this.syncStatus.processed++; continue; }
          const sceneData = { name: row.name || 'Scene' };
          const scene = await Scene.create(sceneData, { render: false });
          try { await scene.setFlag(CONFIG.MODULE_ID, 'archivistId', row.id); } catch (_) { }
          // Also link the created Scene to the Location journal if present later during journal creation
          this.syncStatus.logs.push(`Created Scene '${scene.name}' for Archivist Location ${row.id}`);
          this.syncStatus.processed++;
          await this.render();
        }
      } catch (e) {
        console.warn('[World Setup] Foundry create phase encountered an error', e);
      }

      // 2) Import existing Archivist data AFTER Foundry creations are prepared
      await this._importArchivistMissing(apiKey, campaignId);

      // 3) Create Recaps journals from game sessions
      await this._syncRecapsFromSessions(apiKey, campaignId);

      // 4) Proceed with Archivist export/link jobs
      for (const job of work) {
        this.syncStatus.current = `${job.kind}: ${job.name}`;
        await this.render();
        const doc = await getDoc(job.kind, job.foundryId);
        if (!doc) {
          this.syncStatus.processed++;
          continue;
        }
        if (job.archivistId) {
          await setArchivistFlag(job.kind, doc, job.archivistId);
          // Special case: linking an Archivist Location to a Foundry Scene
          if (job.kind === 'Location') {
            try {
              // Find the Location journal by archivistId
              const journals = game.journal?.contents || [];
              const locJournal = journals.find(j => {
                const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                return f.sheetType === 'location' && String(f.archivistId || '') === String(job.archivistId);
              });
              if (locJournal && doc?.id) {
                const flags = locJournal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                flags.foundryRefs.scenes = [doc.id];
                await locJournal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
              }
            } catch (_) { /* noop */ }
          }
          // Ensure a custom journal sheet exists for this mapped entity; create if missing
          try {
            const journals = game.journal?.contents || [];
            const existing = journals.find(j => {
              const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
              return String(f.archivistId || '') === String(job.archivistId || '');
            });
            if (!existing) {
              let sheetType = null;
              let targetFolderId = null;
              let html = '';
              let imageUrl = undefined;
              if (job.kind === 'PC' || job.kind === 'NPC') {
                sheetType = job.kind === 'PC' ? 'pc' : 'npc';
                targetFolderId = job.kind === 'PC' ? this.setupData.destinations.pc : this.setupData.destinations.npc;
                const desc = doc?.system?.details?.biography?.value || doc?.system?.description || doc?.system?.details?.biography || '';
                html = Utils.toMarkdownIfHtml(String(desc || ''));
                imageUrl = doc?.img || undefined;
              } else if (job.kind === 'Item') {
                sheetType = 'item';
                targetFolderId = this.setupData.destinations.item;
                const desc = doc?.system?.description?.value || doc?.system?.description || '';
                html = Utils.toMarkdownIfHtml(String(desc || ''));
                imageUrl = doc?.img || undefined;
              } else if (job.kind === 'Location') {
                sheetType = 'location';
                targetFolderId = this.setupData.destinations.location;
                // Scenes don't have descriptions in their core data
                html = '';
                imageUrl = doc?.thumb || doc?.background?.src || undefined;
              }
              if (sheetType) {
                const journal = await Utils.createCustomJournalForImport({
                  name: doc.name,
                  html,
                  imageUrl,
                  sheetType,
                  archivistId: job.archivistId,
                  worldId: campaignId,
                  folderId: targetFolderId || null,
                });
                if (journal && doc?.id) {
                  const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                  flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                  if (job.kind === 'PC' || job.kind === 'NPC') flags.foundryRefs.actors = [doc.id];
                  if (job.kind === 'Item') flags.foundryRefs.items = [doc.id];
                  if (job.kind === 'Location') flags.foundryRefs.scenes = [doc.id];
                  await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                }
              }
            }
          } catch (e) {
            console.warn('[World Setup] Failed ensuring custom journal for mapped entity', e);
          }
          this.syncStatus.logs.push(`Linked ${job.kind} '${doc.name}' → ${job.archivistId}`);
          this.syncStatus.processed++;
          await this.render();
          continue;
        }

        // Create in Archivist
        let res = { success: false, data: null };
        if (job.kind === 'PC' || job.kind === 'NPC') {
          const payload = {
            ...getMappedFields(job.kind, doc),
            type: job.kind,
            campaign_id: campaignId,
          };
          console.log(`Archivist Sync | Creating ${job.kind} character:`, {
            name: payload.character_name,
            campaignId,
          });
          res = await archivistApi.createCharacter(apiKey, payload);
        } else if (job.kind === 'Item') {
          const payload = { ...getMappedFields('Item', doc), campaign_id: campaignId };
          console.log(`Archivist Sync | Creating item:`, { name: payload.name, campaignId });
          res = await archivistApi.createItem(apiKey, payload);
        } else if (job.kind === 'Location') {
          // Creating Location from Foundry Scene (no description)
          const name = doc?.name || 'Location';
          const rawImg = String(doc?.thumb || doc?.background?.src || '');
          const image = String(rawImg || '')
            .trim()
            .startsWith('https://')
            ? String(rawImg).trim()
            : undefined;
          const payload = {
            name,
            ...(image ? { image } : {}),
            campaign_id: campaignId,
          };
          console.log(`Archivist Sync | Creating location from Scene:`, { name: payload.name, campaignId });
          res = await archivistApi.createLocation(apiKey, payload);
        }

        // Track description length errors
        if (!res.success && res.isDescriptionTooLong) {
          this.syncStatus.descriptionTooLongErrors.push({
            name: res.entityName || doc?.name || 'Unknown',
            type: res.entityType || job.kind,
          });
          this.syncStatus.logs.push(`❌ Failed ${job.kind} '${doc.name}': Description too long (max 10,000 characters)`);
          this.syncStatus.processed++;
          await this.render();
          continue;
        }

        const newId = res?.data?.id;
        if (res.success && newId) {
          await setArchivistFlag(job.kind, doc, newId);
          this.syncStatus.logs.push(`Created ${job.kind} '${doc.name}' in Archivist → ${newId}`);

          // Create custom journal sheet for the newly exported entity
          try {
            let sheetType, targetFolderId, html, imageUrl;

            if (job.kind === 'PC' || job.kind === 'NPC') {
              sheetType = job.kind === 'PC' ? 'pc' : 'npc';
              targetFolderId = job.kind === 'PC' ? this.setupData.destinations.pc : this.setupData.destinations.npc;
              // Extract description from actor
              const desc = doc?.system?.details?.biography?.value || doc?.system?.description || doc?.system?.details?.biography || '';
              html = Utils.toMarkdownIfHtml(String(desc || ''));
              imageUrl = doc?.img || undefined;

              console.log(`[World Setup] Creating journal for exported ${job.kind}:`, {
                name: doc.name,
                archivistId: newId,
                targetFolderId: targetFolderId || 'none',
              });

              const journal = await Utils.createCustomJournalForImport({
                name: doc.name,
                html,
                imageUrl,
                sheetType,
                archivistId: newId,
                worldId: campaignId,
                folderId: targetFolderId || null,
              });

              if (journal && doc?.id) {
                const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                flags.foundryRefs.actors = [doc.id];
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
              }
            } else if (job.kind === 'Item') {
              sheetType = 'item';
              targetFolderId = this.setupData.destinations.item;
              const desc = doc?.system?.description?.value || doc?.system?.description || '';
              html = Utils.toMarkdownIfHtml(String(desc || ''));
              imageUrl = doc?.img || undefined;

              console.log(`[World Setup] Creating journal for exported Item:`, {
                name: doc.name,
                archivistId: newId,
                targetFolderId: targetFolderId || 'none',
              });

              const journal = await Utils.createCustomJournalForImport({
                name: doc.name,
                html,
                imageUrl,
                sheetType,
                archivistId: newId,
                worldId: campaignId,
                folderId: targetFolderId || null,
              });

              if (journal && doc?.id) {
                const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                flags.foundryRefs.items = [doc.id];
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
              }
            } else if (job.kind === 'Location') {
              sheetType = 'location';
              targetFolderId = this.setupData.destinations.location;
              // Scenes don't have descriptions in their core data
              html = '';
              imageUrl = doc?.thumb || doc?.background?.src || undefined;

              console.log(`[World Setup] Creating journal for exported Location:`, {
                name: doc.name,
                archivistId: newId,
                targetFolderId: targetFolderId || 'none',
              });

              const journal = await Utils.createCustomJournalForImport({
                name: doc.name,
                html,
                imageUrl,
                sheetType,
                archivistId: newId,
                worldId: campaignId,
                folderId: targetFolderId || null,
              });

              if (journal && doc?.id) {
                const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                flags.foundryRefs.scenes = [doc.id];
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
              }
            }
          } catch (e) {
            console.warn(`[World Setup] Failed to create journal for ${job.kind}:`, e);
            // Non-fatal: continue sync even if journal creation fails
          }
        }
        this.syncStatus.processed++;
        await this.render();
      }

      // Mark world as initialized after first sync
      try {
        await settingsManager.completeWorldInitialization();
      } catch (_) { }

      // Save folder destinations for later use by Sync Dialog
      try {
        await settingsManager.setJournalDestinations(this.setupData.destinations);
        console.log('[World Setup] Journal destinations saved to settings:', this.setupData.destinations);
      } catch (e) {
        console.warn('[World Setup] Failed to save journal destinations:', e);
      }

      if (window.ARCHIVIST_SYNC?.updateChatAvailability) {
        try {
          window.ARCHIVIST_SYNC.updateChatAvailability();
        } catch (_) { }
      }

      // Resume realtime sync now that batch operations are complete
      try {
        settingsManager.resumeRealtimeSync?.();
        console.log('[World Setup] ✓ Real-time sync resumed after successful setup');
      } catch (_) { }

      // Check for description length errors
      if (this.syncStatus.descriptionTooLongErrors && this.syncStatus.descriptionTooLongErrors.length > 0) {
        const errorNames = this.syncStatus.descriptionTooLongErrors.map(e => `${e.name} (${e.type})`).join(', ');
        const count = this.syncStatus.descriptionTooLongErrors.length;
        const message = count === 1
          ? `Failed to process ${errorNames}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`
          : `Failed to process ${count} entities: ${errorNames}. Their descriptions exceed the maximum length of 10,000 characters. Please shorten the descriptions and try again.`;
        ui.notifications.error(message, { permanent: true });
      } else {
        ui.notifications.info('Sync completed');
      }

      try {
        await this.close();
      } catch (_) { }
    } catch (e) {
      try {
        settingsManager.resumeRealtimeSync?.();
        console.log('[World Setup] Real-time sync resumed after error');
      } catch (_) { }
      console.error('[World Setup] ❌ Begin sync failed', e);
      ui.notifications.error('Sync failed');
    } finally {
      // Re-enable Begin Sync button
      this.isLoading = false;
      this._syncRunning = false;
      try { await this.render(); } catch (_) { }
    }
  }

  // _persistMappingToSettings removed (import config setting removed)

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
        archivistApi.listFactions(apiKey, campaignId),
      ]);
      const allCharacters = chars.success ? chars.data || [] : [];
      const allItems = its.success ? its.data || [] : [];
      const allLocations = locs.success ? locs.data || [] : [];
      const factions = facs.success ? facs.data || [] : [];

      // Build reconciliation lookup maps to avoid duplicating existing Foundry docs when user mapped them
      const reconcile = this.setupData?.reconcile || {};
      const mappedActorByArchivistId = new Map();
      const mappedItemByArchivistId = new Map();
      try {
        const aChars = Array.isArray(reconcile?.characters?.archivist)
          ? reconcile.characters.archivist
          : [];
        for (const row of aChars) {
          if (row?.id && row?.match) mappedActorByArchivistId.set(String(row.id), String(row.match));
        }
      } catch (_) { }
      try {
        const aItems = Array.isArray(reconcile?.items?.archivist) ? reconcile.items.archivist : [];
        for (const row of aItems) {
          if (row?.id && row?.match) mappedItemByArchivistId.set(String(row.id), String(row.match));
        }
      } catch (_) { }

      // Respect Step 4 imports: only import Archivist rows the user selected and that have no Foundry match
      const ensure = v => (Array.isArray(v) ? v : []);
      const selectedArchivist = {
        characters: new Set(
          ensure(reconcile.characters?.archivist)
            .filter(r => r && r.selected && !r.match)
            .map(r => String(r.id))
        ),
        items: new Set(
          ensure(reconcile.items?.archivist)
            .filter(r => r && r.selected && !r.match)
            .map(r => String(r.id))
        ),
        locations: new Set(
          ensure(reconcile.locations?.archivist)
            .filter(r => r && r.selected && !r.match)
            .map(r => String(r.id))
        ),
      };

      // Filter Archivist lists down to what the user actually chose to import
      const characters = allCharacters.filter(c => selectedArchivist.characters.has(String(c.id)));
      const items = allItems.filter(i => selectedArchivist.items.has(String(i.id)));
      const locations = allLocations.filter(l => selectedArchivist.locations.has(String(l.id)));

      const total = characters.length + items.length + locations.length + factions.length;
      console.log(
        `Archivist Sync | Found ${characters.length} characters, ${items.length} items, ${locations.length} locations, ${factions.length} factions in Archivist`
      );

      if (!total) {
        console.log('Archivist Sync | No existing data found in Archivist to import');
        return;
      }

      this.syncStatus.total += total;
      await this.render();

      // Step 5 choices: create Foundry core docs only for explicitly selected Archivist IDs
      const cf = this.setupData?.createFoundry || { actors: [], items: [], scenes: [] };
      const shouldCreateActor = new Set((cf.actors || []).map(id => String(id)));
      const shouldCreateItem = new Set((cf.items || []).map(id => String(id)));

      // If projection is enabled, we should also project descriptions/images into any
      // pre-existing Foundry documents the user mapped by name in Step 4, even if we
      // aren't creating those documents now.
      const projectionEnabled = !!settingsManager.getProjectDescriptionsEnabled?.();

      // Hydrate mapped existing Foundry Actors with Archivist content
      if (projectionEnabled) {
        try {
          const { SlotResolver } = await import('../modules/projection/slot-resolver.js');
          // Actors
          for (const [archId, foundryId] of mappedActorByArchivistId.entries()) {
            try {
              const actor = game.actors?.get?.(foundryId) || null;
              const c = allCharacters.find(x => String(x.id) === String(archId));
              if (!actor || !c) continue;
              if (c.description) {
                const html = Utils.markdownToStoredHtml(String(c.description || ''));
                await SlotResolver.projectDescription(actor, html);
              }
              // Do NOT overwrite img for existing actors - users may already have artwork
              // const imageUrl = typeof c.image === 'string' && c.image.trim().length ? c.image.trim() : '';
              // if (imageUrl) {
              //   const update = { img: imageUrl };
              //   if (imageUrl.includes('myarchivist.ai')) {
              //     update.prototypeToken = { texture: { src: 'icons/svg/mystery-man.svg' } };
              //   }
              //   await actor.update(update, { render: false });
              // }
            } catch (_) { /* continue */ }
          }
          // Items
          for (const [archId, foundryId] of mappedItemByArchivistId.entries()) {
            try {
              const item = game.items?.get?.(foundryId) || null;
              const it = allItems.find(x => String(x.id) === String(archId));
              if (!item || !it) continue;
              if (it.description) {
                const html = Utils.markdownToStoredHtml(String(it.description || ''));
                await SlotResolver.projectDescription(item, html);
              }
              // Do NOT overwrite img for existing items - users may already have artwork
              // const imageUrl = typeof it.image === 'string' && it.image.trim().length ? it.image.trim() : '';
              // if (imageUrl) {
              //   await item.update({ img: imageUrl }, { render: false });
              // }
            } catch (_) { /* continue */ }
          }
        } catch (_) { /* ignore projection errors */ }
      }

      // Helper: find already-created docs by archivistId flag to avoid duplicates
      const findActorByArchivistId = id => {
        try {
          const actors = game.actors?.contents || [];
          const sid = String(id);
          return actors.find(a => String(a.getFlag(CONFIG.MODULE_ID, 'archivistId') || '') === sid) || null;
        } catch (_) { return null; }
      };
      const findItemByArchivistId = id => {
        try {
          const coll = game.items?.contents || [];
          const sid = String(id);
          return coll.find(it => String(it.getFlag(CONFIG.MODULE_ID, 'archivistId') || '') === sid) || null;
        } catch (_) { return null; }
      };

      const createActor = async c => {
        // Use the 'type' field from Archivist API (either 'PC' or 'NPC')
        const archivistType = String(c.type || c.character_type || 'PC').toUpperCase();
        const foundryType = archivistType === 'NPC' ? 'npc' : 'character';
        const folderId =
          archivistType === 'NPC'
            ? this.setupData.destinations.npc || null
            : this.setupData.destinations.pc || null;

        // If user mapped this Archivist character to an existing Foundry Actor, link instead of creating
        const mappedFoundryId = mappedActorByArchivistId.get(String(c.id));
        let actor = null;
        if (mappedFoundryId) {
          try { actor = game.actors?.get?.(mappedFoundryId) || null; } catch (_) { actor = null; }
          if (actor) {
            try { await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', c.id); } catch (_) { }
            // If projection is enabled, apply Archivist description to the existing Actor
            if (projectionEnabled) {
              try {
                if (c.description) {
                  const { SlotResolver } = await import('../modules/projection/slot-resolver.js');
                  const html = Utils.markdownToStoredHtml(String(c.description || ''));
                  await SlotResolver.projectDescription(actor, html);
                }
              } catch (_) { }
              // Do NOT overwrite img for existing actors - users may already have artwork
              // try {
              //   const imageUrl = typeof c.image === 'string' && c.image.trim().length ? c.image.trim() : '';
              //   if (imageUrl) {
              //     // Update portrait image while preserving prototype token workaround when needed
              //     const update = { img: imageUrl };
              //     if (imageUrl.includes('myarchivist.ai')) {
              //       update.prototypeToken = { texture: { src: 'icons/svg/mystery-man.svg' } };
              //     }
              //     await actor.update(update, { render: false });
              //   }
              // } catch (_) { }
            }
          }
        }
        // If no explicit mapping, check if we already created an Actor earlier in this run
        if (!actor) {
          actor = findActorByArchivistId(c.id);
        }
        if (!actor && shouldCreateActor.has(String(c.id))) {
          // Create actor (no system-mapped description write); map Archivist image to Foundry img when available
          const imageUrl = typeof c.image === 'string' && c.image.trim().length ? c.image.trim() : undefined;
          const actorData = {
            name: c.character_name || c.name || 'Character',
            type: foundryType,
            folder: folderId || null,
            ...(imageUrl ? { img: imageUrl } : {}),
          };

          // WORKAROUND: Set prototype token to use Foundry's default mystery-man to avoid CORS issues
          // The Actor portrait (img) will still use the Archivist URL for sheet display
          // This prevents CORS errors when placing tokens on the canvas
          if (imageUrl && imageUrl.includes('myarchivist.ai')) {
            actorData.prototypeToken = {
              texture: {
                src: 'icons/svg/mystery-man.svg'
              }
            };
          }

          console.log(`Archivist Sync | Creating ${archivistType} actor:`, {
            name: actorData.name,
            type: foundryType,
            folderId,
            hasDescription: !!c.description,
            hasImage: !!imageUrl,
            usingFallbackToken: !!(imageUrl && imageUrl.includes('myarchivist.ai')),
          });

          actor = await Actor.create(actorData, { render: false });
          try { await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', c.id); } catch (_) { }
        }

        // Create a standalone JournalEntry for this character with the custom sheet
        try {
          const name = c.character_name || c.name || actor.name || 'Character';
          const html = Utils.toMarkdownIfHtml(String(c.description || ''));
          const imageUrl = c.image || undefined;
          const targetFolderId = (archivistType === 'NPC'
            ? this.setupData.destinations.npc
            : this.setupData.destinations.pc);

          console.log(`[World Setup] Creating journal for ${archivistType}:`, {
            name,
            archivistId: c.id,
            archivistType,
            targetFolderId: targetFolderId || 'none',
            descriptionLength: html.length,
            descriptionPreview: html.substring(0, 100),
          });

          const journal = await Utils.createCustomJournalForImport({
            name,
            html,
            imageUrl,
            sheetType: (archivistType === 'NPC' ? 'npc' : 'pc'),
            archivistId: c.id,
            worldId: campaignId,
            folderId: targetFolderId || null,
          });
          if (journal) {
            const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
            if (actor?.id) flags.foundryRefs.actors = [actor.id];
            await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
          }
        } catch (e) {
          console.warn('Failed to create Character journal entry', e);
        }

        // Project description into Actor if enabled
        try {
          const enabled = !!settingsManager.getProjectDescriptionsEnabled?.();
          if (enabled && actor && c.description) {
            const { SlotResolver } = await import('../modules/projection/slot-resolver.js');
            const html = Utils.markdownToStoredHtml(String(c.description || ''));
            await SlotResolver.projectDescription(actor, html);
          }
        } catch (_) { }
      };
      const createItem = async i => {
        const folderId = this.setupData.destinations.item || null;
        const safeType = Utils.resolveItemType(i);

        // If user mapped this Archivist item to an existing Foundry Item, link instead of creating
        const mappedFoundryId = mappedItemByArchivistId.get(String(i.id));
        let item = null;
        if (mappedFoundryId) {
          try { item = game.items?.get?.(mappedFoundryId) || null; } catch (_) { item = null; }
          if (item) {
            try { await item.setFlag(CONFIG.MODULE_ID, 'archivistId', i.id); } catch (_) { }
            // If projection is enabled, apply Archivist description to the existing Item
            if (projectionEnabled) {
              try {
                if (i.description) {
                  const { SlotResolver } = await import('../modules/projection/slot-resolver.js');
                  const html = Utils.markdownToStoredHtml(String(i.description || ''));
                  await SlotResolver.projectDescription(item, html);
                }
              } catch (_) { }
              // Do NOT overwrite img for existing items - users may already have artwork
              // try {
              //   const imageUrl = typeof i.image === 'string' && i.image.trim().length ? i.image.trim() : '';
              //   if (imageUrl) {
              //     await item.update({ img: imageUrl }, { render: false });
              //   }
              // } catch (_) { }
            }
          }
        }
        if (!item) {
          // If we already created this item earlier in this run, use it
          item = findItemByArchivistId(i.id);
        }
        if (!item && shouldCreateItem.has(String(i.id))) {
          // Create item (no system-mapped description write); map Archivist image to Foundry img when available
          const imageUrl = typeof i.image === 'string' && i.image.trim().length ? i.image.trim() : undefined;
          const itemData = {
            name: i.name || 'Item',
            type: safeType,
            folder: folderId || null,
            ...(imageUrl ? { img: imageUrl } : {}),
          };
          // Description no longer written into item system during setup

          console.log(`Archivist Sync | Creating item:`, {
            name: itemData.name,
            folderId,
            hasDescription: !!i.description,
            hasImage: !!imageUrl,
          });

          item = await Item.create(itemData, { render: false });
          try { await item.setFlag(CONFIG.MODULE_ID, 'archivistId', i.id); } catch (_) { }
        }

        // Create a standalone JournalEntry for this item with the custom sheet
        try {
          const name = i.name || item.name || 'Item';
          const html = Utils.toMarkdownIfHtml(String(i.description || ''));
          const imageUrl = i.image || undefined;
          const targetFolderId = this.setupData.destinations.item;

          console.log(`[World Setup] Creating journal for Item:`, {
            name,
            archivistId: i.id,
            targetFolderId: targetFolderId || 'none',
            descriptionLength: html.length,
            descriptionPreview: html.substring(0, 100),
          });

          const journal = await Utils.createCustomJournalForImport({
            name,
            html,
            imageUrl,
            sheetType: 'item',
            archivistId: i.id,
            worldId: campaignId,
            folderId: targetFolderId || null,
          });
          if (journal) {
            const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
            if (item?.id) flags.foundryRefs.items = [item.id];
            await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
          }
        } catch (e) {
          console.warn('Failed to create Item journal entry', e);
        }

        // Project description into Item if enabled
        try {
          const enabled = !!settingsManager.getProjectDescriptionsEnabled?.();
          if (enabled && item && i.description) {
            const { SlotResolver } = await import('../modules/projection/slot-resolver.js');
            const html = Utils.markdownToStoredHtml(String(i.description || ''));
            await SlotResolver.projectDescription(item, html);
          }
        } catch (_) { }
      };
      const upsertIntoContainer = async (e, kind) => {
        // Create a standalone JournalEntry for location/faction
        try {
          const name = `${e.name || e.title || kind}`;
          const html = Utils.toMarkdownIfHtml(String(e.description || ''));
          const imageUrl =
            typeof e.image === 'string' && e.image.trim().length ? e.image.trim() : null;
          const targetFolderId = kind === 'Location'
            ? this.setupData.destinations.location
            : this.setupData.destinations.faction;

          const sheetType = kind.toLowerCase();

          console.log(`[World Setup] Creating journal for ${kind}:`, {
            name,
            archivistId: e.id,
            sheetType,
            targetFolderId: targetFolderId || 'none',
            descriptionLength: html.length,
            descriptionPreview: html.substring(0, 100),
            rawEntityKeys: Object.keys(e),
          });

          const journal = await Utils.createCustomJournalForImport({
            name,
            html,
            imageUrl,
            sheetType,
            archivistId: e.id,
            worldId: campaignId,
            folderId: targetFolderId || null,
          });
          // Ensure the journal has a visible thumbnail and lead image when provided
          try { if (journal && imageUrl) await Utils.ensureJournalLeadImage(journal, imageUrl); } catch (_) { }
          if (journal && sheetType === 'location' && e.parent_id) {
            try {
              const { setLocationParent } = await import('../modules/links/helpers.js');
              await setLocationParent(journal, String(e.parent_id));
            } catch (_) { /* noop */ }
          }
          // Link created Scene (if any) that was created in Step 5 for this Location
          if (journal && sheetType === 'location') {
            try {
              const scenes = game.scenes?.contents || [];
              const scene = scenes.find(sc => String(sc.getFlag(CONFIG.MODULE_ID, 'archivistId') || '') === String(e.id));
              if (scene) {
                const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                const arr = Array.isArray(flags.foundryRefs.scenes) ? flags.foundryRefs.scenes : [];
                if (!arr.includes(scene.id)) arr.push(scene.id);
                flags.foundryRefs.scenes = arr;
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
              }
            } catch (_) { }
          }
        } catch (err) {
          console.warn(`Failed to create ${kind} journal entry`, err);
        }
      };

      for (const c of characters) {
        this.syncStatus.current = `Import ${c.type || c.character_type || 'PC'}: ${c.character_name || c.name}`;
        await this.render();
        await createActor(c);
        this.syncStatus.processed++;
        await this.render();
      }
      for (const it of items) {
        this.syncStatus.current = `Import Item: ${it.name}`;
        await this.render();
        await createItem(it);
        this.syncStatus.processed++;
        await this.render();
      }
      // Insert Locations alphabetically
      locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      for (const l of locations) {
        this.syncStatus.current = `Import Location: ${l.name || l.title}`;
        await this.render();
        await upsertIntoContainer(l, 'Location');
        this.syncStatus.processed++;
        await this.render();
      }
      // Insert Factions alphabetically
      factions.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      for (const f of factions) {
        this.syncStatus.current = `Import Faction: ${f.name || f.title}`;
        await this.render();
        await upsertIntoContainer(f, 'Faction');
        this.syncStatus.processed++;
        await this.render();
      }
      // After creating journals and pages, hydrate link graph from Archivist Links
      try {
        // Ensure parent/child relationships for Locations using helper before indexing
        try {
          const { setLocationParent } = await import('../modules/links/helpers.js');
          const journals = game.journal?.contents || [];
          const findLocJournalByArchivistId = id => {
            const sid = String(id);
            return journals.find(j => {
              const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
              return f.sheetType === 'location' && String(f.archivistId || '') === sid;
            }) || null;
          };
          for (const l of locations) {
            if (!l?.id) continue;
            const j = findLocJournalByArchivistId(l.id);
            if (!j) continue;
            const parentId = l?.parent_id ? String(l.parent_id) : null;
            if (parentId) await setLocationParent(j, parentId);
          }
        } catch (_) { }
        await this._hydrateLinksFromArchivist(apiKey, campaignId);
        try { const { linkIndexer } = await import('../modules/links/indexer.js'); linkIndexer.buildFromWorld(); } catch (_) { }
      } catch (e) {
        console.warn('Hydrating links from Archivist failed', e);
      }
    } catch (e) {
      console.warn('Import from Archivist into Foundry skipped/failed:', e);
    }
  }

  /**
   * Build journal link flags from Archivist Links API
   */
  async _hydrateLinksFromArchivist(apiKey, campaignId) {
    const resp = await archivistApi.listLinks(apiKey, campaignId);
    if (!resp?.success) return;
    const links = Array.isArray(resp.data) ? resp.data : [];

    // Helper: find a JournalEntry by Archivist ID
    const findJournalByArchivistId = id => {
      try {
        const journals = game.journal?.contents || [];
        for (const j of journals) {
          const flags = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
          if (String(flags.archivistId || '') === String(id || '')) return j;
        }
      } catch (_) { }
      return null;
    };

    // For each Link, add reciprocal references and a directional outbound reference on 'from'
    for (const L of links) {
      const fromId = L?.from_id;
      const toId = L?.to_id;
      if (!fromId || !toId) continue;
      const fromJournal = findJournalByArchivistId(fromId);
      const toJournal = findJournalByArchivistId(toId);
      if (!fromJournal || !toJournal) continue;

      const updateRefs = async (journal, otherId) => {
        const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
        flags.archivistRefs = flags.archivistRefs || {
          characters: [],
          items: [],
          entries: [],
          factions: [],
          locationsAssociative: [],
        };
        const otherType = (String(otherId || '') === String(toId || '') ? L?.to_type : L?.from_type) || '';
        const keyMap = { Character: 'characters', Item: 'items', Location: 'locationsAssociative', Faction: 'factions' };
        const bucket = keyMap[otherType] || 'entries';
        const arr = Array.isArray(flags.archivistRefs[bucket]) ? flags.archivistRefs[bucket] : [];
        const otherKey = String(otherId || '');
        const next = arr.map(String);
        if (!next.includes(otherKey)) arr.push(otherId);
        flags.archivistRefs[bucket] = arr;
        // Also maintain directional outbound if this is the 'from' journal
        if (String(journal.getFlag(CONFIG.MODULE_ID, 'archivist')?.archivistId || '') === String(fromId)) {
          flags.archivistOutbound = flags.archivistOutbound || {
            characters: [], items: [], entries: [], factions: [], locationsAssociative: []
          };
          const obArr = Array.isArray(flags.archivistOutbound[bucket]) ? flags.archivistOutbound[bucket] : [];
          if (!obArr.map(String).includes(otherKey)) obArr.push(otherId);
          flags.archivistOutbound[bucket] = obArr;
        }
        await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
      };

      await updateRefs(fromJournal, toId);
      await updateRefs(toJournal, fromId);
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
   * Convert markdown to HTML with proper paragraph and line break handling
   */
  _mdToHtml(md) {
    const s = String(md || '').trim();
    if (!s) return '';
    return s
      .replace(/\r\n/g, '\n')
      .split('\n\n')  // Split on double newlines to create paragraphs
      .map(para => {
        // Within each paragraph, convert single newlines to <br>
        const content = para
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          .replace(/_(.*?)_/g, '<em>$1</em>');
        return `<p>${content}</p>`;
      })
      .join('');
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
      sessions.sort(
        (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
      );

      // Create individual Recap journals, one per session, inside Recaps folder
      // Use 'm' (manual) sorting mode so entries are ordered by their sort field in ascending order
      const recapFolderId = this.setupData.destinations?.recap || (await Utils.ensureJournalFolder('Recaps', { sorting: 'm' }));

      // Ensure the recap folder has correct sorting, even if manually selected
      if (recapFolderId) {
        const recapFolder = game.folders?.get(recapFolderId);
        if (recapFolder && recapFolder.sorting !== 'm') {
          try {
            await recapFolder.update({ sorting: 'm' });
            const updated = game.folders?.get(recapFolderId);
          } catch (e) {
            console.warn('[Archivist Sync] Failed to update Recaps folder sorting:', e);
          }
        }
      }
      for (const s of sessions) {
        const title = s.title || 'Session';
        const html = String(s.summary || '');
        // Use session_date timestamp as sort value for proper ordering in Foundry sidebar
        const sortValue = new Date(s.session_date).getTime();
        const journal = await Utils.createCustomJournalForImport({
          name: title,
          html,
          imageUrl: null,
          sheetType: 'recap',
          archivistId: s.id,
          worldId: campaignId,
          folderId: recapFolderId || null,
          sort: sortValue,
        });
        if (journal) {
          try { await journal.setFlag(CONFIG.MODULE_ID, 'sessionDate', String(s.session_date)); } catch (_) { }
        }
      }

      // After creation/update, enforce chronological ordering for ALL recaps in the folder
      try {
        const entries = (game.journal?.contents || [])
          .filter(j => (j.folder?.id || null) === (recapFolderId || null))
          .filter(j => String((j.getFlag(CONFIG.MODULE_ID, 'archivist') || {}).sheetType || '') === 'recap');
        const withDates = entries.map(j => ({
          j,
          dateMs: (() => {
            const iso = String(j.getFlag(CONFIG.MODULE_ID, 'sessionDate') || '').trim();
            const t = iso ? new Date(iso).getTime() : NaN;
            return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; // undated go to end
          })()
        }));

        withDates.sort((a, b) => a.dateMs - b.dateMs);
        let index = 0;
        for (const { j } of withDates) {
          const desired = index * 1000; // normalize to small ascending integers
          index += 1;
          if (j.sort !== desired) {
            try { await j.update({ sort: desired }, { render: false }); } catch (_) { /* ignore */ }
          }
        }
        const recapFolder = game.folders?.get(recapFolderId || '');
      } catch (_) { /* ignore ordering failures */ }
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

      // Install Real-Time Sync listeners immediately after setup completes
      try {
        if (window.ARCHIVIST_SYNC?.installRealtimeSyncListeners) {
          window.ARCHIVIST_SYNC.installRealtimeSyncListeners();
          console.log('[Archivist Sync] Real-Time Sync listeners installed after setup');
        }
      } catch (_) { }
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
      _schema_version: '1.0',
      _description:
        "Archivist Sync Configuration File - Edit the paths below to match your game system's data structure",
      _instructions: {
        actorMappings: 'Configure how PC and NPC data is mapped from Foundry actors',
        itemMappings: 'Configure how Item data is mapped from Foundry items',
        destinations: 'Configure where different entity types are synced to in Archivist',
      },
      actorMappings: {
        pc: {
          namePath: 'name',
          imagePath: 'img',
          descriptionPath: 'system.details.biography.value',
          _examples: {
            namePath: 'name (actor name field)',
            imagePath: 'img (actor image field)',
            descriptionPath:
              'system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)',
          },
        },
        npc: {
          namePath: 'name',
          imagePath: 'img',
          descriptionPath: 'system.details.biography.value',
          _examples: {
            namePath: 'name (actor name field)',
            imagePath: 'img (actor image field)',
            descriptionPath:
              'system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)',
          },
        },
      },
      itemMappings: {
        namePath: 'name',
        imagePath: 'img',
        descriptionPath: 'system.description.value',
        _examples: {
          namePath: 'name (item name field)',
          imagePath: 'img (item image field)',
          descriptionPath:
            'system.description.value (D&D 5e), system.description (PF2e), system.description.value (other systems)',
        },
      },
      destinations: {
        pc: 'pc',
        npc: 'npc',
        item: 'item',
        location: 'location',
        faction: 'faction',
        _options: {
          pc: ['pc', 'npc'],
          npc: ['npc', 'pc'],
          item: ['item', 'note'],
          location: ['location', 'note'],
          faction: ['faction', 'note'],
        },
      },
    };

    // Open the sample config in a new tab
    window.open(
      'https://raw.githubusercontent.com/camrun91/archivist-sync/main/archivist-sync-sample-config.json',
      '_blank'
    );

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
        apiKeyInput.addEventListener('keypress', event => {
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
        campaignSelect.addEventListener('change', ev => {
          const nextVal = ev?.target?.value || '';
          if (nextVal === this.setupData.selectedWorldId) return;
          this._onCampaignSelectChange(ev);
          // Recompute Next button enablement immediately after selection change
          const nextBtn = this.element.querySelector('[data-action="nextStep"]');
          if (nextBtn) nextBtn.disabled = !this._canProceedFromCurrentStep();
        });
        campaignSelect.dataset.bound = 'true';
      }
    }

    // Step 4: Reconciliation event bindings
    if (context.isStep4) {
      const root = this.element;
      if (!root) return;

      // Activate tabs for reconciliation
      const tabGroup = root.querySelector('nav.tabs[data-group="recon"]');
      if (tabGroup && !tabGroup.dataset.boundTabs) {
        const tabLinks = tabGroup.querySelectorAll('a.item[data-tab]');
        const tabContents = root.querySelectorAll('section.tab[data-tab]');

        // Activate first tab by default
        if (tabLinks.length > 0 && tabContents.length > 0) {
          tabLinks[0].classList.add('active');
          tabContents[0].classList.add('active');
        }

        // Handle tab clicks
        tabLinks.forEach(link => {
          link.addEventListener('click', ev => {
            ev.preventDefault();
            const targetTab = ev.currentTarget.dataset.tab;

            // Save active tab
            this._activeReconTab = targetTab;

            // Deactivate all tabs
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Activate clicked tab
            ev.currentTarget.classList.add('active');
            const content = root.querySelector(`section.tab[data-tab="${targetTab}"]`);
            if (content) content.classList.add('active');
          });
        });

        tabGroup.dataset.boundTabs = 'true';
      }

      // Restore active tab if we have one
      if (this._activeReconTab) {
        const links = tabGroup ? Array.from(tabGroup.querySelectorAll('a.item[data-tab]')) : [];
        const contents = Array.from(root.querySelectorAll('section.tab[data-tab]'));
        const targetLink = links.find(l => l.dataset.tab === this._activeReconTab);
        const targetContent = root.querySelector(`section.tab[data-tab="${this._activeReconTab}"]`);
        if (targetLink && targetContent) {
          links.forEach(l => l.classList.remove('active'));
          contents.forEach(c => c.classList.remove('active'));
          targetLink.classList.add('active');
          targetContent.classList.add('active');
        }
      }

      // Select All / None per tab
      const bindClick = (selector, handler) => {
        const el = root.querySelector(selector);
        if (el && !el.dataset.bound) {
          el.addEventListener('click', handler);
          el.dataset.bound = 'true';
        }
      };

      // Select All/None toggle checkboxes in header
      root.querySelectorAll('[data-action="recon-select-all-toggle"]').forEach(cb => {
        // Update checkbox state based on current selections
        const tab = cb.dataset?.tab;
        const side = cb.dataset?.side;
        if (tab && side) {
          const r = this.setupData.reconcile?.[tab];
          if (r) {
            const list = r[side] || [];
            const allSelected = list.length > 0 && list.every(row => row.selected);
            cb.checked = allSelected;
          }
        }

        if (!cb.dataset.bound) {
          cb.addEventListener('change', async ev => {
            const tab = ev.currentTarget?.dataset?.tab;
            const side = ev.currentTarget?.dataset?.side;
            const checked = ev.currentTarget?.checked;
            if (!tab || !side) return;
            const r = this.setupData.reconcile?.[tab];
            if (!r) return;
            const list = r[side] || [];
            for (const row of list) {
              row.selected = checked;
            }
            // Update all checkboxes in the DOM without re-rendering
            root.querySelectorAll(`input[data-action="recon-toggle-select"][data-tab="${tab}"][data-side="${side}"]`).forEach(checkbox => {
              checkbox.checked = checked;
            });
          });
          cb.dataset.bound = 'true';
        }
      });

      // Delegate checkbox toggle
      if (!root.dataset.boundReconToggle) {
        root.addEventListener('change', async ev => {
          const cb = ev.target?.closest?.('input[type="checkbox"][data-action="recon-toggle-select"]');
          if (!cb) return;
          const tab = cb.dataset.tab;
          const side = cb.dataset.side;
          const id = cb.dataset.id;
          const checked = cb.checked;
          const r = this.setupData.reconcile?.[tab];
          if (!r) return;
          const list = r[side] || [];
          const row = list.find(x => x.id === id);
          if (!row) return;
          row.selected = checked;
          // Sync with matched counterpart
          const otherSide = side === 'archivist' ? 'foundry' : 'archivist';
          const mid = row.match || null;
          if (mid) {
            const otherRow = (r[otherSide] || []).find(x => x.id === mid);
            if (otherRow) {
              otherRow.selected = checked;
              // Update the matched checkbox in the DOM
              const matchedCheckbox = root.querySelector(`input[data-action="recon-toggle-select"][data-tab="${tab}"][data-side="${otherSide}"][data-id="${mid}"]`);
              if (matchedCheckbox) matchedCheckbox.checked = checked;
            }
          }
          // Update header "select all" checkbox state
          const allSelected = list.length > 0 && list.every(x => x.selected);
          const headerCheckbox = root.querySelector(`input[data-action="recon-select-all-toggle"][data-tab="${tab}"][data-side="${side}"]`);
          if (headerCheckbox) headerCheckbox.checked = allSelected;
        });
        root.dataset.boundReconToggle = 'true';
      }

      // Delegate match dropdown change
      if (!root.dataset.boundReconMatch) {
        root.addEventListener('change', async ev => {
          const sel = ev.target?.closest?.('select[data-action="recon-change-match"]');
          if (!sel) return;
          const tab = sel.dataset.tab;
          const side = sel.dataset.side;
          const id = sel.dataset.id;
          const value = sel.value;
          const r = this.setupData.reconcile?.[tab];
          if (!r) return;
          const list = r[side] || [];
          const row = list.find(x => x.id === id);
          if (!row) return;

          // Clear previous symmetric link if any
          const otherSide = side === 'archivist' ? 'foundry' : 'archivist';
          const prev = row.match || null;
          if (prev) {
            const prevRow = (r[otherSide] || []).find(x => x.id === prev);
            if (prevRow && prevRow.match === row.id) {
              prevRow.match = null;
              // Update the previous match's dropdown in the DOM
              const prevSelect = root.querySelector(`select[data-action="recon-change-match"][data-tab="${tab}"][data-side="${otherSide}"][data-id="${prev}"]`);
              if (prevSelect) prevSelect.value = 'NA';
            }
          }

          // Apply new symmetric link
          const nextId = value && value !== 'NA' ? value : null;
          row.match = nextId;
          if (nextId) {
            const target = (r[otherSide] || []).find(x => x.id === nextId);
            if (target) {
              target.match = row.id;
              // Update the matched dropdown in the DOM
              const matchedSelect = root.querySelector(`select[data-action="recon-change-match"][data-tab="${tab}"][data-side="${otherSide}"][data-id="${nextId}"]`);
              if (matchedSelect) matchedSelect.value = id;
            }
          }
        });
        root.dataset.boundReconMatch = 'true';
      }
    }

    // Step 5: Create Foundry core objects UI
    if (context.isStep5) {
      const root = this.element;
      if (!root) return;
      // Tabs activation similar to recon
      const tabGroup = root.querySelector('nav.tabs[data-group="create"]');
      if (tabGroup && !tabGroup.dataset.boundTabs) {
        const tabLinks = tabGroup.querySelectorAll('a.item[data-tab]');
        const tabContents = root.querySelectorAll('main.ws-recon-content section.tab[data-tab]');
        if (tabLinks.length > 0 && tabContents.length > 0) {
          tabLinks[0].classList.add('active');
          tabContents[0].classList.add('active');
        }
        tabLinks.forEach(link => {
          link.addEventListener('click', ev => {
            ev.preventDefault();
            const targetTab = ev.currentTarget.dataset.tab;

            // Save active tab
            this._activeCreateTab = targetTab;

            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            ev.currentTarget.classList.add('active');
            const content = root.querySelector(`main.ws-recon-content section.tab[data-tab="${targetTab}"]`);
            if (content) content.classList.add('active');
          });
        });
        tabGroup.dataset.boundTabs = 'true';
      }

      // Restore active tab if we have one
      if (this._activeCreateTab) {
        const links = tabGroup ? Array.from(tabGroup.querySelectorAll('a.item[data-tab]')) : [];
        const contents = Array.from(root.querySelectorAll('main.ws-recon-content section.tab[data-tab]'));
        const targetLink = links.find(l => l.dataset.tab === this._activeCreateTab);
        const targetContent = root.querySelector(`main.ws-recon-content section.tab[data-tab="${this._activeCreateTab}"]`);
        if (targetLink && targetContent) {
          links.forEach(l => l.classList.remove('active'));
          contents.forEach(c => c.classList.remove('active'));
          targetLink.classList.add('active');
          targetContent.classList.add('active');
        }
      }

      if (!root.dataset.boundCreateChoices) {
        root.addEventListener('change', async ev => {
          const cb = ev.target?.closest?.('input[type="checkbox"][data-action="toggleCreateChoice"]');
          if (cb) {
            await this._onToggleCreateChoice(ev);
            return;
          }
          const selAll = ev.target?.closest?.('[data-action="createSelectAll"]');
          if (selAll) {
            const kind = selAll.dataset?.kind;
            if (!kind) return;
            if (selAll.checked) {
              // Select all
              const cand = this._getCreateCandidates()[kind] || [];
              this.setupData.createFoundry[kind] = cand.map(c => String(c.id));
              root.querySelectorAll(`input[data-action="toggleCreateChoice"][data-kind="${kind}"]`).forEach(checkbox => {
                checkbox.checked = true;
              });
            } else {
              // Deselect all
              this.setupData.createFoundry[kind] = [];
              root.querySelectorAll(`input[data-action="toggleCreateChoice"][data-kind="${kind}"]`).forEach(checkbox => {
                checkbox.checked = false;
              });
            }
            return;
          }
        });
        // Handle Clear buttons via click
        root.addEventListener('click', async ev => {
          const clearBtn = ev.target?.closest?.('[data-action="createSelectNone"]');
          if (clearBtn) {
            ev.preventDefault();
            await this._onCreateSelectNone(ev);
            return;
          }
        });
        root.dataset.boundCreateChoices = 'true';
      }
    }

    // Legacy Step 4 (Mapping) removed – skip binding for legacy controls
    if (false && context.isStep4) {
      const val = sel => this.element.querySelector(sel)?.value?.trim() || '';
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
        '#map-pc-name',
        '#map-pc-image',
        '#map-pc-desc',
        '#map-npc-name',
        '#map-npc-image',
        '#map-npc-desc',
        '#map-item-name',
        '#map-item-image',
        '#map-item-desc',
        '#dest-pc',
        '#dest-npc',
        '#dest-item',
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
        configFileInput.addEventListener('change', async event => {
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
            ui.notifications.error(
              'Failed to load configuration file. Please check the file format.'
            );
          }

          // Clear the file input
          event.target.value = '';
        });
        configFileInput.dataset.boundSetup = 'true';
      }
      // Bind preset change validation in Step 4 (if the dropdown exists here)
      const presetSelect = this.element.querySelector('#ws-system-preset');
      if (presetSelect && !presetSelect.dataset.boundSetup) {
        presetSelect.addEventListener('change', async e => {
          const key = e?.target?.value || '';
          if (!key) {
            this.setupData.systemPreset = '';
            return;
          }
          try {
            await this._validateOrRejectPreset(key);
            this.setupData.systemPreset = key;
            this._applyPresetToSetupData(key);
            await this.render();
            ui.notifications.info(
              `Applied ${presetSelect.options[presetSelect.selectedIndex].text} preset`
            );
          } catch (err) {
            ui.notifications.error(
              String(err?.message || err || 'Preset unavailable for this system.')
            );
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
          pc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.details.biography.value',
          },
          npc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.details.biography.public',
          },
        },
        itemMappings: {
          namePath: 'name',
          imagePath: 'img',
          descriptionPath: 'system.description.value',
        },
      },
      pf2e: {
        name: 'Pathfinder 2e',
        actorMappings: {
          pc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.details.biography.value',
          },
          npc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.details.publicNotes',
          },
        },
        itemMappings: {
          namePath: 'name',
          imagePath: 'img',
          descriptionPath: 'system.description.value',
        },
      },
      coc7: {
        name: 'Call of Cthulhu 7e',
        actorMappings: {
          pc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.biography.personal.description',
          },
          npc: {
            namePath: 'name',
            imagePath: 'img',
            descriptionPath: 'system.biography.personal.description',
          },
        },
        itemMappings: {
          namePath: 'name',
          imagePath: 'img',
          descriptionPath: 'system.description.value',
        },
      },
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
      } catch (_) {
        /* try next */
      }
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
      preset.itemMappings?.descriptionPath,
    ].filter(Boolean);

    // Use our discovered mapping options to validate existence
    const availableActor = new Set((this.mappingOptions.actor || []).map(o => o.path));
    const availableItem = new Set((this.mappingOptions.item || []).map(o => o.path));

    const exists = p => {
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
      throw new Error(
        `Preset unavailable: missing properties in this system → ${missing.join(', ')}`
      );
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
      try {
        return foundry.utils.getProperty(o, p) ?? fb;
      } catch (_) {
        return fb;
      }
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

// Build reconciliation model for Step 4
WorldSetupDialog.prototype._buildReconciliationModel = function (input) {
  console.log('[World Setup] _buildReconciliationModel called with:', input);
  const A = input.archivist || {};
  const F = input.foundry || {};
  const toName = v => String(v || '').trim();
  const normName = v => toName(v).toLowerCase();

  // Foundry actors classification with fallback
  const actors = Array.isArray(F.actors) ? F.actors : [];
  const actorsBase = actors.map(a => ({ id: a.id, name: toName(a.name), img: a.img || '', type: String(a.type || ''), doc: a }));
  let pcActors = actorsBase.filter(a => a.type.toLowerCase() === 'character');
  let npcActors = actorsBase.filter(a => a.type.toLowerCase() === 'npc' || a.type.toLowerCase() === 'monster');
  if (pcActors.length === 0 && npcActors.length === 0 && actorsBase.length > 0) {
    const acChars = Array.isArray(A.characters) ? A.characters : [];
    const acByName = new Map();
    for (const c of acChars) {
      const n = normName(c.character_name || c.name);
      if (n) acByName.set(n, (c.type || c.character_type || '').toUpperCase());
    }
    for (const a of actorsBase) {
      const kind = acByName.get(normName(a.name)) || 'NPC';
      if (kind === 'PC') pcActors.push(a); else npcActors.push(a);
    }
  }

  // Foundry items and scenes
  const fItems = (Array.isArray(F.items) ? F.items : []).map(i => ({ id: i.id, name: toName(i.name), img: i.img || '', doc: i }));
  const fScenes = (Array.isArray(F.scenes) ? F.scenes : []).map(s => ({ id: s.id, name: toName(s.name), img: s.thumb || s.background?.src || '', doc: s }));

  // Archivist lists normalized
  const aChars = (Array.isArray(A.characters) ? A.characters : []).map(c => ({ id: String(c.id), name: toName(c.character_name || c.name), img: toName(c.image || ''), type: String(c.type || c.character_type || 'PC').toUpperCase() }));
  const aItems = (Array.isArray(A.items) ? A.items : []).map(i => ({ id: String(i.id), name: toName(i.name), img: toName(i.image || '') }));
  const aLocs = (Array.isArray(A.locations) ? A.locations : []).map(l => ({ id: String(l.id), name: toName(l.name || l.title), img: toName(l.image || '') }));
  const aFactions = (Array.isArray(A.factions) ? A.factions : []).map(f => ({ id: String(f.id), name: toName(f.name || f.title), img: toName(f.image || '') }));

  // Matching helpers (one-to-one by name and type/bucket)
  const matchByName = (left, right, getLeftName, getRightName, constraint) => {
    const usedRight = new Set();
    const leftOut = [];
    for (const L of left) {
      let hit = null;
      for (const R of right) {
        if (usedRight.has(R.id)) continue;
        if (constraint && !constraint(L, R)) continue;
        if (normName(getLeftName(L)) === normName(getRightName(R))) { hit = R; break; }
      }
      if (hit) { usedRight.add(hit.id); leftOut.push({ ...L, match: hit.id, selected: false }); }
      else { leftOut.push({ ...L, match: null, selected: false }); }
    }
    // Right side mirror
    const rightOut = right.map(R => {
      const L = leftOut.find(x => x.match === R.id) || null;
      return { ...R, match: L ? L.id : null, selected: false };
    });
    return { leftOut, rightOut };
  };

  // Characters: allow PC->character and NPC->npc by constraint
  const allActors = [...pcActors, ...npcActors];
  // More lenient constraint: if types exist, respect them; otherwise allow any match
  const charConstraint = (ac, fa) => {
    // If Foundry actor has no meaningful type, allow match
    if (!fa.type || fa.type === '' || fa.type === 'base') return true;
    // Otherwise respect type matching
    return ac.type === 'PC' ? fa.type.toLowerCase() === 'character' : (fa.type.toLowerCase() === 'npc' || fa.type.toLowerCase() === 'monster');
  };
  const { leftOut: aCharsOut, rightOut: fActorsOut } = matchByName(aChars, allActors, x => x.name, x => x.name, charConstraint);

  // Items
  const { leftOut: aItemsOut, rightOut: fItemsOut } = matchByName(aItems, fItems, x => x.name, x => x.name);

  // Locations vs Scenes
  const { leftOut: aLocsOut, rightOut: fScenesOut } = matchByName(aLocs, fScenes, x => x.name, x => x.name);

  // Factions — Foundry side empty by default
  const aFactionsOut = aFactions.map(f => ({ ...f, match: null, selected: false }));
  const fFactionsOut = [];

  const result = {
    characters: { archivist: aCharsOut, foundry: fActorsOut },
    items: { archivist: aItemsOut, foundry: fItemsOut },
    locations: { archivist: aLocsOut, foundry: fScenesOut },
    factions: { archivist: aFactionsOut, foundry: fFactionsOut },
  };

  // Post-pass: ensure exact-name matches are linked if still unmatched (helps systems without types)
  try {
    const ensureNameMatch = (leftArr, rightArr) => {
      const rightByName = new Map(rightArr.map(r => [normName(r.name), r]));
      for (const l of leftArr) {
        if (!l.match) {
          const r = rightByName.get(normName(l.name));
          if (r && !r.match) {
            l.match = r.id;
            r.match = l.id;
          }
        }
      }
    };

    ensureNameMatch(result.characters.archivist, result.characters.foundry);
    ensureNameMatch(result.items.archivist, result.items.foundry);
    ensureNameMatch(result.locations.archivist, result.locations.foundry);
  } catch (_) {
    /* ignore */
  }

  // Sort all lists alphabetically by name for display in Steps 4 and 5
  const sortByName = (arr) => arr.sort((a, b) => toName(a.name).localeCompare(toName(b.name)));
  try {
    sortByName(result.characters.archivist);
    sortByName(result.characters.foundry);
    sortByName(result.items.archivist);
    sortByName(result.items.foundry);
    sortByName(result.locations.archivist);
    sortByName(result.locations.foundry);
    sortByName(result.factions.archivist);
    sortByName(result.factions.foundry);
  } catch (_) {
    /* ignore */
  }
  console.log('[World Setup] Reconciliation result:', {
    charactersArchivist: aCharsOut.length,
    charactersFoundry: fActorsOut.length,
    itemsArchivist: aItemsOut.length,
    itemsFoundry: fItemsOut.length,
    locationsArchivist: aLocsOut.length,
    locationsFoundry: fScenesOut.length,
    factionsArchivist: aFactionsOut.length,
  });
  return result;
};
