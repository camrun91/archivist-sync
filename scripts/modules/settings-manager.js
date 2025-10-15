import { CONFIG, SETTINGS, MENU_CONFIG } from './config.js';
import { Utils } from './utils.js';

/**
 * Settings Manager for Archivist Sync Module
 * Handles registration and management of all module settings
 */
export class SettingsManager {
  constructor() {
    this.moduleId = CONFIG.MODULE_ID;
    this.moduleTitle = CONFIG.MODULE_TITLE;
    // Counter-based suppression for realtime sync (supports nesting)
    this._realtimeSuppressed = 0;
  }

  /**
   * Register all module settings
   */
  registerSettings() {
    this._registerApiKey();
    this._registerSelectedWorldId();
    this._registerSelectedWorldName();
    this._registerImportConfig();
    this._registerWorldInitialized();
    this._registerAutoSort();
    this._registerHideByOwnership();
    this._registerOrganizeFolders();
    this._registerMaxLocationDepth();
    this._registerRealtimeSync();
    this._registerChatHistory();
    this._registerSemanticToggle();
    this._registerRunSetupAgainMenu();
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
      secret: true,
      onChange: value => {
        console.log(`${this.moduleTitle} | API Key updated`);
        this._onChatAvailabilityChange();
      },
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
      default: semantic.default,
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
      default: '{}',
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
      default: setting.default,
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
      },
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
      },
    });
  }

  /**
   * Register settings menu
   * @private
   */
  _registerRunSetupAgainMenu() {
    game.settings.registerMenu(this.moduleId, MENU_CONFIG.RUN_SETUP_AGAIN.key, {
      name: game.i18n.localize(MENU_CONFIG.RUN_SETUP_AGAIN.name),
      label: game.i18n.localize(MENU_CONFIG.RUN_SETUP_AGAIN.label),
      hint: game.i18n.localize(MENU_CONFIG.RUN_SETUP_AGAIN.hint),
      icon: MENU_CONFIG.RUN_SETUP_AGAIN.icon,
      type: class extends FormApplication {
        constructor(...args) { super(...args); }
        static get defaultOptions() { return foundry.utils.mergeObject(super.defaultOptions, { id: 'archivist-run-setup', title: game.i18n.localize('ARCHIVIST_SYNC.Menu.RunSetup.Title') }); }
        async render(force = false, options = {}) {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize('ARCHIVIST_SYNC.Menu.RunSetup.Title') },
            content: `<p>${game.i18n.localize('ARCHIVIST_SYNC.Menu.RunSetup.Confirm')}</p>`,
          });
          if (confirmed) {
            try {
              const { settingsManager } = await import('./settings-manager.js');
              await settingsManager.setWorldInitialized(false);
              ui.notifications?.info?.(game.i18n.localize('ARCHIVIST_SYNC.messages.worldInitializedReset'));
              // Reload to trigger setup flow again
              window.location.reload();
            } catch (e) {
              console.warn('[Archivist Sync] Failed to reset world initialization', e);
              ui.notifications?.error?.(game.i18n.localize('ARCHIVIST_SYNC.errors.resetFailed') || 'Reset failed');
            }
          }
          return this;
        }
      },
      restricted: MENU_CONFIG.RUN_SETUP_AGAIN.restricted,
    });
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
        pc: {
          enabled: true,
          descriptionPath: this._defaultDescriptionPath(systemId, 'pc'),
          portraitPath: 'img',
          writeBack: 'none',
        },
        npc: {
          enabled: false,
          descriptionPath: this._defaultDescriptionPath(systemId, 'npc'),
          portraitPath: 'img',
          writeBack: 'none',
        },
      },
      includeRules: {
        sources: {
          worldActors: true,
          compendiumActorPacks: [],
          worldItems: false,
          compendiumItemPacks: [],
          journals: [],
        },
        filters: {
          actors: {
            mustHavePlayerOwner: true,
            npcRequirePlacedToken: true,
            includeFolders: { pcs: ['PCs'], npcs: [] },
          },
          items: {
            includeActorOwnedFrom: 'pc', // 'pc' | 'pc+npc'
            includeWorldItemFolders: [],
          },
          factions: { journalFolders: [] },
        },
      },
      writeBack: { summaryMaxChars: 1200 },
    };
    return foundry.utils.mergeObject(defaults, input ?? {}, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: false,
    });
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
    ui.notifications.warn(
      'World initialization has been reset. The setup wizard will appear again.'
    );
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
      default: setting.default,
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
      },
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
      default: setting.default,
    });
  }

  _registerAutoSort() {
    const setting = SETTINGS.AUTO_SORT;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
    });
  }

  _registerHideByOwnership() {
    const setting = SETTINGS.HIDE_BY_OWNERSHIP;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
    });
  }

  getAutoSort() {
    return !!this.getSetting(SETTINGS.AUTO_SORT.key);
  }

  getHideByOwnership() {
    return !!this.getSetting(SETTINGS.HIDE_BY_OWNERSHIP.key);
  }

  _registerOrganizeFolders() {
    const setting = SETTINGS.ORGANIZE_FOLDERS;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
    });
  }

  getOrganizeFolders() {
    return !!this.getSetting(SETTINGS.ORGANIZE_FOLDERS.key);
  }

  _registerMaxLocationDepth() {
    const setting = SETTINGS.MAX_LOCATION_DEPTH;
    game.settings.register(this.moduleId, setting.key, {
      name: game.i18n.localize(setting.name),
      hint: game.i18n.localize(setting.hint),
      scope: setting.scope,
      config: setting.config,
      type: setting.type,
      default: setting.default,
      range: { min: 1, max: 10, step: 1 },
    });
  }

  getMaxLocationDepth() {
    return Number(this.getSetting(SETTINGS.MAX_LOCATION_DEPTH.key) || 5);
  }

  isRealtimeSyncEnabled() {
    // Always enabled; runtime suppression is handled via isRealtimeSyncSuppressed()
    return true;
  }

  /**
   * Temporarily suppress realtime sync hooks (non-persistent, session-only)
   * Use for bulk operations like initial world setup to prevent unintended API writes.
   */
  suppressRealtimeSync() {
    this._realtimeSuppressed = Math.max(0, Number(this._realtimeSuppressed || 0)) + 1;
  }

  /**
   * Resume realtime sync hooks after suppression.
   */
  resumeRealtimeSync() {
    this._realtimeSuppressed = Math.max(0, Number(this._realtimeSuppressed || 0) - 1);
  }

  /**
   * Returns true if realtime sync is currently suppressed.
   */
  isRealtimeSyncSuppressed() {
    return Number(this._realtimeSuppressed || 0) > 0;
  }
}

// Create singleton instance
export const settingsManager = new SettingsManager();
