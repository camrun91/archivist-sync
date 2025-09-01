import { CONFIG } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';

/**
 * Sync Options Dialog - Tabbed interface for world synchronization
 * Provides three main functions: World Selection, Title Sync, Character Mapping
 */
export class SyncOptionsDialog extends FormApplication {
  constructor() {
    super();
    this.worlds = [];
    this.actors = [];
    this.isLoading = false;
    this.syncInProgress = false;
  }

  /**
   * Default configuration options
   * @returns {Object} Default options for the dialog
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'archivist-sync-options',
      title: game.i18n.localize('ARCHIVIST_SYNC.dialog.title'),
      template: 'modules/archivist-sync/templates/sync-options-dialog.hbs',
      width: 600,
      height: 500,
      resizable: true,
      classes: ['archivist-sync-dialog'],
      tabs: [
        {
          navSelector: '.tabs',
          contentSelector: '.tab-content',
          initial: 'world'
        }
      ],
      submitOnChange: false,
      submitOnClose: false
    });
  }

  /**
   * Get data for template rendering
   * @returns {Object} Template data
   */
  getData() {
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
      actors: this.actors,
      isLoading: this.isLoading,
      syncInProgress: this.syncInProgress,
      foundryWorldTitle: game.world.title,
      foundryWorldDescription: game.world.description || ''
    };
  }



  /**
   * Activate event listeners after rendering
   * @param {jQuery} html - The rendered HTML
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Initialize tabs
    this._initializeTabs(html);
    
    // World selection events
    html.find('.sync-worlds-btn').click(this._onSyncWorlds.bind(this));
    html.find('#world-select').change(this._onWorldSelectChange.bind(this));
    html.find('.save-selection-btn').click(this._onSaveWorldSelection.bind(this));
    
    // Title sync events
    html.find('.sync-title-btn').click(this._onSyncTitle.bind(this));
    
    // Character mapping events
    html.find('.map-character-btn').click(this._onMapCharacter.bind(this));
    html.find('.sync-characters-btn').click(this._onSyncCharacters.bind(this));
  }

  /**
   * Initialize tab functionality
   * @param {jQuery} html - The rendered HTML
   */
  _initializeTabs(html) {
    // Activate the first tab by default
    const firstTab = html.find('.tabs .item[data-tab="world"]');
    const firstContent = html.find('.tab[data-tab="world"]');
    
    firstTab.addClass('active');
    firstContent.addClass('active');
    
    // Tab click handlers
    html.find('.tabs .item').click((event) => {
      const tab = event.currentTarget.dataset.tab;
      this._activateTab(html, tab);
    });
  }

  /**
   * Activate a specific tab
   * @param {jQuery} html - The rendered HTML
   * @param {string} tabName - Name of the tab to activate
   */
  _activateTab(html, tabName) {
    // Remove active class from all tabs and content
    html.find('.tabs .item').removeClass('active');
    html.find('.tab').removeClass('active');
    
    // Add active class to selected tab and content
    html.find(`.tabs .item[data-tab="${tabName}"]`).addClass('active');
    html.find(`.tab[data-tab="${tabName}"]`).addClass('active');
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
    const saveButton = event.target.closest('.tab').querySelector('.save-selection-btn');
    
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
    
    const worldSelect = event.target.closest('.tab').querySelector('#world-select');
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
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldSaved'));
      settingsManager.refreshSettingsUi();
      this.render();
    } catch (error) {
      console.error('Error saving world selection:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.saveFailed'));
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

  /**
   * Load actors when dialog is rendered
   */
  async _onRender(force, context) {
    await super._onRender(force, context);
    
    // Load actors for character mapping
    this.actors = game.actors.filter(actor => 
      actor.type === 'character' || actor.type === 'npc'
    ).map(actor => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img || 'icons/svg/mystery-man.svg'
    }));
  }
}