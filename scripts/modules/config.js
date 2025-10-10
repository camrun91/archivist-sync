/**
 * Configuration constants for Archivist Sync Module
 */
export const CONFIG = {
  MODULE_ID: 'archivist-sync',
  MODULE_TITLE: 'Archivist Sync',
  API_BASE_URL: 'https://api.myarchivist.ai/v1',
};

/**
 * Module setting keys and their configurations
 */
export const SETTINGS = {
  API_KEY: {
    key: 'apiKey',
    name: 'ARCHIVIST_SYNC.Settings.ApiKey.Name',
    hint: 'ARCHIVIST_SYNC.Settings.ApiKey.Hint',
    scope: 'world',
    config: false,
    type: String,
    default: '',
  },

  CHAT_HISTORY: {
    key: 'chatHistory',
    name: 'ARCHIVIST_SYNC.Settings.ChatHistory.Name',
    hint: 'ARCHIVIST_SYNC.Settings.ChatHistory.Hint',
    scope: 'client',
    config: false,
    type: String,
    default: '{}',
  },

  SEMANTIC_MAPPING_ENABLED: {
    key: 'semanticMappingEnabled',
    name: 'ARCHIVIST_SYNC.Settings.SemanticMappingEnabled.Name',
    hint: 'ARCHIVIST_SYNC.Settings.SemanticMappingEnabled.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  },

  SELECTED_WORLD_ID: {
    key: 'selectedWorldId',
    name: 'ARCHIVIST_SYNC.Settings.SelectedWorld.Name',
    hint: 'ARCHIVIST_SYNC.Settings.SelectedWorld.Hint',
    scope: 'world',
    config: false,
    type: String,
    default: '',
  },

  SELECTED_WORLD_NAME: {
    key: 'selectedWorldName',
    name: 'ARCHIVIST_SYNC.Settings.SelectedWorldName.Name',
    hint: 'ARCHIVIST_SYNC.Settings.SelectedWorldName.Hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'None selected',
  },
  /**
   * World-scoped import configuration (JSON string)
   * Holds mapping paths, source selections, filters, and write-back modes
   */
  IMPORT_CONFIG: {
    key: 'importConfig',
    name: 'ARCHIVIST_SYNC.Settings.ImportConfig.Name',
    hint: 'ARCHIVIST_SYNC.Settings.ImportConfig.Hint',
    scope: 'world',
    config: false,
    type: String,
    default: '{}',
  },

  WORLD_INITIALIZED: {
    key: 'worldInitialized',
    name: 'ARCHIVIST_SYNC.Settings.WorldInitialized.Name',
    hint: 'ARCHIVIST_SYNC.Settings.WorldInitialized.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  },
  REALTIME_SYNC_ENABLED: {
    key: 'realtimeSyncEnabled',
    name: 'ARCHIVIST_SYNC.Settings.RealtimeSync.Name',
    hint: 'ARCHIVIST_SYNC.Settings.RealtimeSync.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  },
};

/**
 * Menu configuration
 */
export const MENU_CONFIG = {
  SYNC_OPTIONS: {
    key: 'syncOptionsMenu',
    name: 'ARCHIVIST_SYNC.Menu.SyncOptions.Name',
    label: 'ARCHIVIST_SYNC.Menu.SyncOptions.Label',
    hint: 'ARCHIVIST_SYNC.Menu.SyncOptions.Hint',
    icon: 'fas fa-sync-alt',
    restricted: true,
  },
  ASK_CHAT: {
    key: 'askChatMenu',
    name: 'ARCHIVIST_SYNC.Menu.AskChat.Name',
    label: 'ARCHIVIST_SYNC.Menu.AskChat.Label',
    hint: 'ARCHIVIST_SYNC.Menu.AskChat.Hint',
    icon: 'archivist-icon',
    restricted: false,
  },
};

/**
 * Dialog configuration
 */
export const DIALOG_CONFIG = {
  SYNC_OPTIONS: {
    id: 'archivist-sync-options',
    title: 'ARCHIVIST_SYNC.Dialog.SyncOptions.Title',
    width: 700,
    height: 600,
    resizable: true,
    classes: ['archivist-sync-dialog'],
    tabs: [{ navSelector: '.tabs', contentSelector: '.content', initial: 'world' }],
  },
};

/**
 * Tab configuration
 */
export const TABS = {
  WORLD: 'world',
  TITLE: 'title',
  CHARACTERS: 'characters',
};
