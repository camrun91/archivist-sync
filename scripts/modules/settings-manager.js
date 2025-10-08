import { CONFIG, SETTINGS, MENU_CONFIG } from './config.js';
import { SyncOptionsDialog } from '../dialogs/sync-options-dialog.js';
import { Utils } from './utils.js';

/**
 * Settings Manager for Archivist Sync Module
 * Handles registration and management of all module settings
 */
export class SettingsManager {
  constructor() {
    this.moduleId = CONFIG.MODULE_ID;
    this.moduleTitle = CONFIG.MODULE_TITLE;
  }

  /**
   * Register all module settings
   */
  registerSettings() {
    this._registerApiKey();
    this._registerSemanticToggle();
    this._registerMappingOverride();
    this._registerSelectedWorldId();
    this._registerSelectedWorldName();
    this._registerImportConfig();
    this._registerChatHistory();
    this._registerWorldInitialized();
    this._registerRealtimeSync();
    this._registerMenu();
  }

  /**
   * Register API Key setting
   * @private
   */
  _registerApiKey() {
    const setting = SETTINGS.API_KEY;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
      onChange: value => {
        console.log(`${this.moduleTitle} | API Key updated`);
        this._onChatAvailabilityChange();
      }
    });
  }

  /**
   * Register AI enablement toggles
   * @private
   */
  _registerSemanticToggle() {
    const semantic = SETTINGS.SEMANTIC_MAPPING_ENABLED;
    game.settings.register(this.moduleId, semantic.key, {
      name: game.i18n.localize(semantic.name),
      hint: game.i18n.localize(semantic.hint),
      scope: semantic.scope,
      config: semantic.config,
      type: semantic.type,
      default: semantic.default
    });
  }

  /**
   * Register AI provider API keys
   * @private
   */
  // AI provider settings removed

  /**
   * Register default MCP scopes
   * @private
   */
  // MCP scopes setting removed

  /**
   * Mapping override JSON (per-world adjustable DSL tweaks)
   */
  _registerMappingOverride() {
    game.settings.register(this.moduleId, 'mappingOverride', {
      name: 'ARCHIVIST_SYNC.Settings.MappingOverride.Name',
      hint: 'ARCHIVIST_SYNC.Settings.MappingOverride.Hint',
      scope: 'world',
      config: false,
      type: String,
      default: '{}'
    });
  }

  /**
   * Register world-scoped import configuration setting (JSON)
   * @private
   */
  _registerImportConfig() {
    const setting = SETTINGS.IMPORT_CONFIG;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default
    });
  }

  /**
   * Register Selected World ID setting
   * @private
   */
  _registerSelectedWorldId() {
    const setting = SETTINGS.SELECTED_WORLD_ID;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
      onChange: value => {
        console.log(`${this.moduleTitle} | Selected world ID: ${value}`);
        this._onChatAvailabilityChange();
      }
    });
  }

  /**
   * Register Selected World Name setting
   * @private
   */
  _registerSelectedWorldName() {
    const setting = SETTINGS.SELECTED_WORLD_NAME;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
      onChange: value => {
        console.log(`${this.moduleTitle} | Selected world: ${value}`);
        this._onChatAvailabilityChange();
      }
    });
  }

  /**
   * Register settings menu
   * @private
   */
  _registerMenu() {
    const sync = MENU_CONFIG.SYNC_OPTIONS;
    game.settings.registerMenu(this.moduleId, sync.key, {
      name: game.i18n.localize(sync.name),
      label: game.i18n.localize(sync.label),
      hint: game.i18n.localize(sync.hint),
      icon: sync.icon,
      type: SyncOptionsDialog,
      restricted: sync.restricted
    });

    // Ask Chat menu removed - chat is now available in sidebar when world is properly configured
  }

  /**
   * Get a setting value
   * @param {string} key - The setting key
   * @returns {*} The setting value
   */
  getSetting(key) {
    return game.settings.get(this.moduleId, key);
  }

  /**
   * Set a setting value
   * @param {string} key - The setting key
   * @param {*} value - The setting value
   * @returns {Promise<*>} Promise that resolves when setting is saved
   */
  async setSetting(key, value) {
    return await game.settings.set(this.moduleId, key, value);
  }

  /**
   * Get API key
   * @returns {string} The API key
   */
  getApiKey() {
    return this.getSetting(SETTINGS.API_KEY.key);
  }

  /**
   * AI settings getters
   */
  getSemanticMappingEnabled() {
    return !!this.getSetting(SETTINGS.SEMANTIC_MAPPING_ENABLED.key);
  }
  // AI provider getters and MCP scopes getter removed

  getMappingOverride() {
    return game.settings.get(this.moduleId, 'mappingOverride');
  }

  async setMappingOverride(json) {
    return await game.settings.set(this.moduleId, 'mappingOverride', json);
  }

  /**
   * Get selected world ID
   * @returns {string} The selected world ID
   */
  getSelectedWorldId() {
    return this.getSetting(SETTINGS.SELECTED_WORLD_ID.key);
  }

  /**
   * Get selected world name
   * @returns {string} The selected world name
   */
  getSelectedWorldName() {
    return this.getSetting(SETTINGS.SELECTED_WORLD_NAME.key);
  }

  /**
   * Set selected world
   * @param {string} worldId - The world ID
   * @param {string} worldName - The world name
   * @returns {Promise<void>}
   */
  async setSelectedWorld(worldId, worldName) {
    await this.setSetting(SETTINGS.SELECTED_WORLD_ID.key, worldId);
    await this.setSetting(SETTINGS.SELECTED_WORLD_NAME.key, worldName);
  }

  /**
   * Import configuration helpers
   */
  getImportConfig() {
    try {
      const json = this.getSetting(SETTINGS.IMPORT_CONFIG.key) || '{}';
      const parsed = JSON.parse(json);
      return this._withImportDefaults(parsed);
    } catch (_) {
      return this._withImportDefaults({});
    }
  }

  async setImportConfig(config) {
    const json = JSON.stringify(config ?? {});
    await this.setSetting(SETTINGS.IMPORT_CONFIG.key, json);
  }

  _withImportDefaults(input) {
    const systemId = game.system?.id || 'generic';
    const defaults = {
      version: 1,
      actorMappings: {
        pc: { enabled: true, descriptionPath: this._defaultDescriptionPath(systemId, 'pc'), portraitPath: 'img', writeBack: 'none' },
        npc: { enabled: false, descriptionPath: this._defaultDescriptionPath(systemId, 'npc'), portraitPath: 'img', writeBack: 'none' }
      },
      includeRules: {
        sources: { worldActors: true, compendiumActorPacks: [], worldItems: false, compendiumItemPacks: [], journals: [] },
        filters: {
          actors: {
            mustHavePlayerOwner: true,
            npcRequirePlacedToken: true,
            includeFolders: { pcs: ['PCs'], npcs: [] }
          },
          items: {
            includeActorOwnedFrom: 'pc', // 'pc' | 'pc+npc'
            includeWorldItemFolders: []
          },
          factions: { journalFolders: [] }
        }
      },
      writeBack: { summaryMaxChars: 1200 }
    };
    return foundry.utils.mergeObject(defaults, input ?? {}, { inplace: false, insertKeys: true, insertValues: true, overwrite: false });
  }

  _defaultDescriptionPath(systemId, kind) {
    if (systemId === 'dnd5e') return 'system.details.biography.value';
    if (systemId === 'pf2e') return 'system.details.publicNotes';
    return 'system.details.biography.value';
  }

  /**
   * Check if API is configured
   * @returns {boolean} True if API key is set
   */
  isApiConfigured() {
    const apiKey = this.getApiKey();
    return apiKey && apiKey.length > 0;
  }

  /**
   * Check if world is selected
   * @returns {boolean} True if world is selected
   */
  isWorldSelected() {
    const worldId = this.getSelectedWorldId();
    return worldId && worldId.length > 0;
  }

  /**
   * Check if Archivist chat should be available
   * Requires both API configuration with world selection AND world initialization
   * @returns {boolean} True if chat should be available
   */
  isArchivistChatAvailable() {
    // Condition 1: API key configured and world selected
    const hasValidWorldSelection = this.isApiConfigured() && this.isWorldSelected();

    // Condition 2: World has been initialized with Archivist
    const isInitialized = this.isWorldInitialized();

    return hasValidWorldSelection && isInitialized;
  }

  /**
   * Check if world is initialized with Archivist
   * @returns {boolean} True if world has been initialized
   */
  isWorldInitialized() {
    return this.getSetting(SETTINGS.WORLD_INITIALIZED.key);
  }

  /**
   * Set world initialization status
   * @param {boolean} initialized - Whether the world is initialized
   * @returns {Promise<void>}
   */
  async setWorldInitialized(initialized = true) {
    await this.setSetting(SETTINGS.WORLD_INITIALIZED.key, initialized);
    Utils.log(`World initialization status set to: ${initialized}`);
  }

  /**
   * Ensure world initialization flag exists and is properly set
   * Only sets up the flag structure, does not mark as initialized
   * @returns {Promise<boolean>} True if flag was created, false if already existed
   */
  async ensureWorldInitializationFlag() {
    // Check if the setting already has a value (including false)
    const currentValue = this.getSetting(SETTINGS.WORLD_INITIALIZED.key);

    // If it's undefined (first time), set it to false
    if (currentValue === undefined || currentValue === null) {
      Utils.log('Setting up world initialization flag for first time (false)');
      await this.setSetting(SETTINGS.WORLD_INITIALIZED.key, false);
      return true;
    }

    Utils.log(`World initialization flag already exists: ${currentValue}`);
    return false;
  }

  /**
   * Complete world initialization (called when user finishes setup wizard)
   * @returns {Promise<void>}
   */
  async completeWorldInitialization() {
    Utils.log('Completing world initialization through setup wizard');
    await this.setWorldInitialized(true);

    // Perform any additional setup completion tasks here
    // For example: set default import config, create initial folders, etc.

    ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldInitialized'));
  }

  /**
   * Reset world initialization (for testing/development purposes)
   * @returns {Promise<void>}
   */
  async resetWorldInitialization() {
    Utils.log('Resetting world initialization flag to false');
    await this.setWorldInitialized(false);
    ui.notifications.warn('World initialization has been reset. The setup wizard will appear again.');
  }

  /**
   * Refresh settings UI
   */
  refreshSettingsUi() {
    if (ui.settings && ui.settings.rendered) {
      ui.settings.render();
    }
  }

  _registerChatHistory() {
    const setting = SETTINGS.CHAT_HISTORY;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default
    });
  }

  /**
   * Handle changes that affect chat availability
   * @private
   */
  _onChatAvailabilityChange() {
    // Defer to next tick to ensure all settings have been updated
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.ARCHIVIST_SYNC?.updateChatAvailability) {
        window.ARCHIVIST_SYNC.updateChatAvailability();
      }
    }, 0);
  }

  /**
   * Register World Initialized setting
   * @private
   */
  _registerWorldInitialized() {
    const setting = SETTINGS.WORLD_INITIALIZED;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
      onChange: value => {
        console.log(`${this.moduleTitle} | World initialized: ${value}`);
        this._onChatAvailabilityChange();
      }
    });
  }

  /**
   * Register Real-Time Sync world toggle
   * @private
   */
  _registerRealtimeSync() {
    const setting = SETTINGS.REALTIME_SYNC_ENABLED;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default
    });
  }

  isRealtimeSyncEnabled() {
    return !!this.getSetting(SETTINGS.REALTIME_SYNC_ENABLED.key);
  }
}

// Create singleton instance
export const settingsManager = new SettingsManager();