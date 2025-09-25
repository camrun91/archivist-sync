import { CONFIG, SETTINGS, MENU_CONFIG } from './config.js';
import { SyncOptionsDialog } from '../dialogs/sync-options-dialog.js';
import { AskChatMenu } from '../dialogs/ask-chat-menu.js';

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
    this._registerChatHistory();
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
      default: setting.default
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

    // Register Ask chat menu: use a tiny ApplicationV2 that opens the sidebar tab and closes
    const chat = MENU_CONFIG.ASK_CHAT;
    game.settings.registerMenu(this.moduleId, chat.key, {
      name: game.i18n.localize(chat.name),
      label: game.i18n.localize(chat.label),
      hint: game.i18n.localize(chat.hint),
      icon: chat.icon,
      type: AskChatMenu,
      restricted: chat.restricted
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
}

// Create singleton instance
export const settingsManager = new SettingsManager();