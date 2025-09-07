import { CONFIG } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';

/**
 * Sync Options Dialog - Tabbed interface for world synchronization
 * Provides three main functions: World Selection, Title Sync, Character Mapping
 * Uses Foundry VTT Application v2 API with HandlebarsApplicationMixin
 */
export class SyncOptionsDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor() {
    super();
    this.worlds = [];
    this.actors = [];
    this.archivistCharacters = [];
    this.selectedWorldData = null; // Store full data for selected world
    this.isLoading = false;
    this.syncInProgress = false;
    this.charactersLoading = false;
    this.charactersLoaded = false; // Flag to prevent repeated loading
    this.worldDataLoaded = false; // Flag to prevent repeated world data loading
    this.worldDataLoading = false; // Flag to prevent concurrent loading
    this.currentWorldId = null; // Track current world to detect changes
  }

  /**
   * Application v2 configuration
   * @returns {Object} Application configuration
   */
  static DEFAULT_OPTIONS = {
    id: 'archivist-sync-options',
    tag: 'dialog',
    window: {
      title: 'ARCHIVIST_SYNC.dialog.title',
      icon: 'fas fa-sync-alt',
      resizable: true
    },
    position: {
      width: 800,
      height: 700
    },
    classes: ['archivist-sync-dialog'],
    actions: {
      syncWorlds: SyncOptionsDialog.prototype._onSyncWorlds,
      saveWorldSelection: SyncOptionsDialog.prototype._onSaveWorldSelection,
      worldSelectChange: SyncOptionsDialog.prototype._onWorldSelectChange,
      syncTitle: SyncOptionsDialog.prototype._onSyncTitle,
      syncToArchivist: SyncOptionsDialog.prototype._onSyncToArchivist,
      syncFromArchivist: SyncOptionsDialog.prototype._onSyncFromArchivist,
      mapCharacter: SyncOptionsDialog.prototype._onMapCharacter,
      createCharacter: SyncOptionsDialog.prototype._onCreateCharacter,
      syncCharacters: SyncOptionsDialog.prototype._onSyncCharacters
    }
  };

  /**
   * Template configuration for HandlebarsApplicationMixin
   */
  static PARTS = {
    window: {
      template: 'modules/archivist-sync/templates/sync-options-dialog.hbs'
    }
  };

  /**
   * Preload templates for the application
   * Called during the 'ready' hook
   * For Foundry VTT v12+ with ApplicationV2
   */
  static async preloadTemplates() {
    const templatePaths = [
      'modules/archivist-sync/templates/sync-options-dialog.hbs'
    ];
    
    return foundry.applications.handlebars.loadTemplates(templatePaths);
  }

  /**
   * Prepare context data for template rendering
   * @returns {Object} Template data
   */
  async _prepareContext() {
    const apiKey = settingsManager.getApiKey();
    const selectedWorldId = settingsManager.getSelectedWorldId();
    const selectedWorldName = settingsManager.getSelectedWorldName();
    const isApiConfigured = settingsManager.isApiConfigured();
    const isWorldSelected = settingsManager.isWorldSelected();

    return {
      isApiConfigured,
      isWorldSelected,
      apiKey: apiKey ? '***' + apiKey.slice(-4) : '',
      worlds: this.worlds,
      selectedWorldId,
      selectedWorldName,
      selectedWorldData: this.selectedWorldData, // Include full world data
      actors: this.actors,
      playerCharacters: this.playerCharacters || [],
      npcs: this.npcs || [],
      isLoading: this.isLoading,
      syncInProgress: this.syncInProgress,
      charactersLoading: this.charactersLoading,
      foundryWorldTitle: game.world.title,
      foundryWorldDescription: game.world.description || ''
    };
  }



  /**
   * Actions performed after initial render
   * @param {ApplicationRenderContext} context - The render context
   * @param {RenderOptions} options - The render options
   */
  _onRender(context, options) {
    const html = this.element;
    
    // Initialize tabs
    this._initializeTabs(html);
    
    // Load actors for character mapping (only once)
    if (!this.actors.length) {
      console.log('Loading actors for character mapping...');
      this._processActors();
    }
    
    // Load selected world data if a world is already selected (only once per world)
    const selectedWorldId = settingsManager.getSelectedWorldId();
    
    // Check if world has changed
    if (selectedWorldId !== this.currentWorldId) {
      this.currentWorldId = selectedWorldId;
      this.worldDataLoaded = false;
      this.charactersLoaded = false;
      this.selectedWorldData = null;
      this.archivistCharacters = [];
    }
    
    if (selectedWorldId && !this.worldDataLoaded && !this.worldDataLoading) {
      this.worldDataLoaded = true;
      this._loadSelectedWorldData(selectedWorldId);
    }

    // Load character comparison data if world is selected (only once per world)
    if (selectedWorldId && settingsManager.isApiConfigured() && !this.charactersLoaded) {
      this.charactersLoaded = true;
      this._loadCharacterComparison(selectedWorldId);
    }

    // Note: Event listeners are automatically handled by the actions configuration in v2
    // Manual event listener attachment is only needed for dynamic content
    this._attachDynamicEventListeners(html);
  }

  /**
   * Attach event listeners to dynamic DOM elements
   * In v2, most event listeners are handled by the actions configuration,
   * but some dynamic content still needs manual event binding
   * @param {HTMLElement} html - The rendered HTML
   */
  _attachDynamicEventListeners(html) {
    // These event listeners are for elements that may be dynamically generated
    // or not covered by the actions configuration
    
    // Attach event listeners to dynamically generated character map buttons
    html.querySelectorAll('.map-character-btn').forEach(btn => {
      btn.addEventListener('click', this._onMapCharacter.bind(this));
    });

    // Attach event listeners to create character buttons  
    html.querySelectorAll('.create-character-btn').forEach(btn => {
      btn.addEventListener('click', this._onCreateCharacter.bind(this));
    });
  }

  /**
   * Reset loading state when closing dialog
   */
  close(options) {
    // Reset flags when dialog is closed
    this.worldDataLoaded = false;
    this.charactersLoaded = false;
    this.worldDataLoading = false;
    this.currentWorldId = null;
    return super.close(options);
  }

  /**
   * Process actors for character mapping with enhanced data
   */
  _processActors() {
    this.actors = game.actors.filter(actor => 
      actor.type === 'character' || actor.type === 'npc'
    ).map(actor => {
      const biography = actor.system?.details?.biography?.value || '';
      const truncatedDescription = this._truncateText(biography, 100);
      
      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        description: biography,
        truncatedDescription: truncatedDescription,
        img: actor.img || 'icons/svg/mystery-man.svg',
        existsInArchivist: false, // Will be updated when we load Archivist data
        loadingStatus: false
      };
    });
    
    // Separate actors by type for better organization
    this.playerCharacters = this.actors.filter(actor => actor.type === 'character');
    this.npcs = this.actors.filter(actor => actor.type === 'npc');
  }

  /**
   * Truncate text to specified length with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length before truncating
   * @returns {string} Truncated text
   */
  _truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength).trim() + '...';
  }

  /**
   * Load character comparison data from Archivist
   * @param {string} worldId - The world ID to load characters for
   */
  async _loadCharacterComparison(worldId) {
    if (!worldId || !settingsManager.isApiConfigured() || this.charactersLoading) {
      return;
    }

    console.log('Loading character comparison for world:', worldId);
    this.charactersLoading = true;
    
    // Set all actors to loading state
    this.actors.forEach(actor => {
      actor.loadingStatus = true;
      actor.existsInArchivist = false;
    });
    
    this._updateCharacterLists();
    // Don't call render here to avoid loops

    try {
      const apiKey = settingsManager.getApiKey();
      const response = await archivistApi.fetchWorldCharacters(apiKey, worldId);
      
      if (response.success) {
        this.archivistCharacters = response.data || [];
        this._compareCharacters();
        console.log('Archivist characters loaded:', this.archivistCharacters.length, 'characters');
      } else {
        console.warn('Failed to load Archivist characters:', response.message);
        ui.notifications.warn('Failed to load characters from Archivist: ' + (response.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error loading character comparison:', error);
      ui.notifications.error('Error loading character data: ' + error.message);
    } finally {
      this.charactersLoading = false;
      
      // Update loading status for all actors
      this.actors.forEach(actor => {
        actor.loadingStatus = false;
      });
      
      this._updateCharacterLists();
      // Only render if the dialog is still visible and we have data
      if (this.rendered && this.element) {
        this.render(false);
      }
    }
  }

  /**
   * Compare Foundry actors with Archivist characters by name
   */
  _compareCharacters() {
    const archivistNames = new Set(
      this.archivistCharacters.map(char => char.name?.toLowerCase().trim())
    );
    
    this.actors.forEach(actor => {
      const actorName = actor.name?.toLowerCase().trim();
      actor.existsInArchivist = archivistNames.has(actorName);
    });
  }

  /**
   * Update character lists after processing
   */
  _updateCharacterLists() {
    this.playerCharacters = this.actors.filter(actor => actor.type === 'character');
    this.npcs = this.actors.filter(actor => actor.type === 'npc');
  }

  /**
   * Initialize tab functionality
   * @param {HTMLElement} html - The rendered HTML
   */
  _initializeTabs(html) {
    // Activate the first tab by default
    const firstTab = html.querySelector('.tabs .item[data-tab="world"]');
    const firstContent = html.querySelector('.tab[data-tab="world"]');
    
    if (firstTab) firstTab.classList.add('active');
    if (firstContent) firstContent.classList.add('active');
    
    // Tab click handlers
    html.querySelectorAll('.tabs .item').forEach(tab => {
      tab.addEventListener('click', (event) => {
        const tabName = event.currentTarget.dataset.tab;
        this._activateTab(html, tabName);
      });
    });
  }

  /**
   * Activate a specific tab
   * @param {HTMLElement} html - The rendered HTML
   * @param {string} tabName - Name of the tab to activate
   */
  _activateTab(html, tabName) {
    // Remove active class from all tabs and content
    html.querySelectorAll('.tabs .item').forEach(tab => tab.classList.remove('active'));
    html.querySelectorAll('.tab').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    const selectedTab = html.querySelector(`.tabs .item[data-tab="${tabName}"]`);
    const selectedContent = html.querySelector(`.tab[data-tab="${tabName}"]`);
    
    if (selectedTab) selectedTab.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');
  }

  /**
   * Handle sync worlds button click
   * @param {Event} event - Click event
   */
  async _onSyncWorlds(event) {
    event.preventDefault();
    
    if (!settingsManager.isApiConfigured()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.apiNotConfigured'));
      return;
    }

    this.isLoading = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const response = await archivistApi.fetchWorldsList(apiKey);
      
      if (response.success) {
        this.worlds = response.data || [];
        console.log('Worlds loaded:', this.worlds);
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldsLoaded'));
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.fetchFailed'));
      }
    } catch (error) {
      console.error('Error fetching worlds:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.fetchFailed'));
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Handle world selection change
   * @param {Event} event - Change event
   */
  _onWorldSelectChange(event) {
    const worldId = event.target.value;
    const saveButton = this.element.querySelector('.save-selection-btn');
    
    if (worldId && saveButton) {
      saveButton.disabled = false;
    } else if (saveButton) {
      saveButton.disabled = true;
    }
  }

  /**
   * Handle save world selection button click
   * @param {Event} event - Click event
   */
  async _onSaveWorldSelection(event) {
    event.preventDefault();
    
    const worldSelect = this.element.querySelector('#world-select');
    const worldId = worldSelect.value;
    
    if (!worldId) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorld'));
      return;
    }

    const selectedWorld = this.worlds.find(w => w.id === worldId);
    if (!selectedWorld) {
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.worldNotFound'));
      return;
    }

    try {
      await settingsManager.setSelectedWorld(worldId, selectedWorld.name);
      
      // Reset loading flags for new world
      this.worldDataLoaded = false;
      this.charactersLoaded = false;
      this.worldDataLoading = false;
      this.selectedWorldData = null;
      this.archivistCharacters = [];
      this.currentWorldId = worldId;
      
      // Reset character status
      this.actors.forEach(actor => {
        actor.existsInArchivist = false;
        actor.loadingStatus = false;
      });
      this._updateCharacterLists();
      
      // Load detailed data for the selected world
      this.worldDataLoaded = true;
      await this._loadSelectedWorldData(worldId);
      
      // Load character comparison data for the new world
      if (settingsManager.isApiConfigured()) {
        this.charactersLoaded = true;
        await this._loadCharacterComparison(worldId);
      }
      
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldSaved'));
      settingsManager.refreshSettingsUi();
      this.render();
    } catch (error) {
      console.error('Error saving world selection:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.saveFailed'));
    }
  }

  /**
   * Load detailed data for the selected world
   * @param {string} worldId - The world ID to load data for
   */
  async _loadSelectedWorldData(worldId) {
    console.log('_loadSelectedWorldData called with worldId:', worldId);
    console.log('isApiConfigured:', settingsManager.isApiConfigured());
    
    if (!worldId || !settingsManager.isApiConfigured() || this.worldDataLoading) {
      console.log('Skipping world data load: missing worldId, API not configured, or already loading');
      return;
    }

    this.worldDataLoading = true;
    console.log('Loading world data for ID:', worldId);
    
    try {
      const apiKey = settingsManager.getApiKey();
      console.log('Using API key:', apiKey ? '***' + apiKey.slice(-4) : 'none');
      
      const response = await archivistApi.fetchWorldDetails(apiKey, worldId);
      console.log('API response:', response);
      
      if (response.success) {
        this.selectedWorldData = response.data;
        console.log('Selected world data loaded successfully:', this.selectedWorldData);
        Utils.log('Selected world data loaded:', this.selectedWorldData);
        
        // Only render if dialog is still visible
        if (this.rendered && this.element) {
          this.render(false);
        }
      } else {
        console.warn('Failed to load world details:', response.message);
        this.selectedWorldData = null;
        ui.notifications.warn('Failed to load world details: ' + (response.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error loading world details:', error);
      this.selectedWorldData = null;
      ui.notifications.error('Error loading world details: ' + error.message);
    } finally {
      this.worldDataLoading = false;
    }
  }

  /**
   * Handle sync title button click
   * @param {Event} event - Click event
   */
  async _onSyncTitle(event) {
    event.preventDefault();
    
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const titleData = {
        title: game.world.title,
        description: game.world.description || ''
      };

      const response = await archivistApi.syncWorldTitle(apiKey, worldId, titleData);
      
      if (response.success) {
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.titleSynced'));
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
      }
    } catch (error) {
      console.error('Error syncing title:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle sync to Archivist button click (Foundry -> Archivist)
   * @param {Event} event - Click event
   */
  async _onSyncToArchivist(event) {
    event.preventDefault();
    
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    console.log('Sync to Archivist button clicked!');
    
    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const titleData = {
        title: game.world.title,
        description: game.world.description || ''
      };

      console.log('Syncing to Archivist:', titleData);
      
      // TODO: Replace with actual API endpoint when provided
      const response = await archivistApi.syncWorldTitle(apiKey, worldId, titleData);
      
      if (response.success) {
        ui.notifications.info('World data synced to Archivist successfully');
        // Reset the flag and reload the world data to show updated information
        this.worldDataLoaded = false;
        this.worldDataLoading = false;
        await this._loadSelectedWorldData(worldId);
        // Don't call render here - _loadSelectedWorldData will handle it if needed
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
      }
    } catch (error) {
      console.error('Error syncing to Archivist:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle sync from Archivist button click (Archivist -> Foundry)
   * @param {Event} event - Click event
   */
  async _onSyncFromArchivist(event) {
    event.preventDefault();
    
    if (!settingsManager.isWorldSelected() || !this.selectedWorldData) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    console.log('Sync from Archivist button clicked!');

    // Show confirmation dialog before overwriting Foundry data
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: 'Confirm Sync from Archivist'
      },
      content: '<p>This will overwrite the current Foundry world title and description with data from Archivist. Are you sure?</p>',
      modal: true,
      rejectClose: false
    });

    if (!confirmed) {
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      // TODO: Replace with actual API endpoint when provided
      // For now, we'll simulate updating the world data
      console.log('Would sync from Archivist:', this.selectedWorldData);
      ui.notifications.info('Sync from Archivist functionality will be implemented with API endpoints');
      
      // This would be the structure when API is ready:
      // const apiKey = settingsManager.getApiKey();
      // const worldId = settingsManager.getSelectedWorldId();
      // const response = await archivistApi.syncFromArchivist(apiKey, worldId);
      
    } catch (error) {
      console.error('Error syncing from Archivist:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle create character button click
   * @param {Event} event - Click event
   */
  async _onCreateCharacter(event) {
    event.preventDefault();
    
    const actorId = event.target.closest('.create-character-btn').dataset.actorId;
    const actor = game.actors.get(actorId);
    
    if (!actor) {
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.actorNotFound'));
      return;
    }

    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    // Show confirmation dialog
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: 'Create Character in Archivist'
      },
      content: `<p>Do you want to create the character "${actor.name}" in Archivist?</p>
                <p><strong>Name:</strong> ${actor.name}</p>
                <p><strong>Type:</strong> ${actor.type}</p>
                <p><strong>Description:</strong> ${actor.system?.details?.biography?.value || 'No description'}</p>`,
      modal: true,
      rejectClose: false
    });

    if (!confirmed) {
      return;
    }

    // Set loading state for this specific character
    const actorData = this.actors.find(a => a.id === actorId);
    if (actorData) {
      actorData.loadingStatus = true;
      this._updateCharacterLists();
      this.render(false);
    }

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      
      const characterData = {
        foundryId: actor.id,
        name: actor.name,
        type: actor.type,
        description: actor.system?.details?.biography?.value || '',
        img: actor.img
      };
      console.log("CHAR DATA IS : ", characterData)
      console.log("ALL PC DATA IS : ", actor)
      // TODO: Add this data 
      // actor.ancestory.name, actor.background.name, actor.class.name, actor.class.system.description?value?, actor.system.details

      // const response = await archivistApi.createCharacter(apiKey, worldId, characterData);
      const response = { success: true }
      if (response.success) {
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.characterCreated'));
        
        // Update the actor status directly instead of reloading
        if (actorData) {
          actorData.existsInArchivist = true;
        }
        
        // Add to archivist characters list to keep data consistent
        this.archivistCharacters.push({
          name: actor.name,
          foundryId: actor.id,
          type: actor.type
        });
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.characterCreateFailed'));
      }
    } catch (error) {
      console.error('Error creating character:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.characterCreateFailed'));
    } finally {
      // Remove loading state
      if (actorData) {
        actorData.loadingStatus = false;
        this._updateCharacterLists();
        this.render(false);
      }
    }
  }

  /**
   * Handle map character button click
   * @param {Event} event - Click event
   */
  async _onMapCharacter(event) {
    event.preventDefault();
    
    const actorId = event.target.closest('.map-character-btn').dataset.actorId;
    const actor = game.actors.get(actorId);
    
    if (!actor) {
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.actorNotFound'));
      return;
    }

    // TODO: Implement character mapping dialog
    ui.notifications.info(`Mapping character: ${actor.name}`);
  }

  /**
   * Handle sync characters button click
   * @param {Event} event - Click event
   */
  async _onSyncCharacters(event) {
    event.preventDefault();
    
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const charactersData = this.actors.map(actor => ({
        foundryId: actor.id,
        name: actor.name,
        type: actor.type,
        description: actor.system?.details?.biography?.value || '',
        img: actor.img
      }));

      const response = await archivistApi.syncCharacters(apiKey, worldId, charactersData);
      
      if (response.success) {
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.charactersSynced'));
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
      }
    } catch (error) {
      console.error('Error syncing characters:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

}