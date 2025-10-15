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
    config: true,
    type: String,
    default: '',
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

  AUTO_SORT: {
    key: 'autoSort',
    name: 'ARCHIVIST_SYNC.Settings.AutoSort.Name',
    hint: 'ARCHIVIST_SYNC.Settings.AutoSort.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  },

  HIDE_BY_OWNERSHIP: {
    key: 'hideByOwnership',
    name: 'ARCHIVIST_SYNC.Settings.HideByOwnership.Name',
    hint: 'ARCHIVIST_SYNC.Settings.HideByOwnership.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  },

  ORGANIZE_FOLDERS: {
    key: 'organizeFolders',
    name: 'ARCHIVIST_SYNC.Settings.OrganizeFolders.Name',
    hint: 'ARCHIVIST_SYNC.Settings.OrganizeFolders.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  },

  MAX_LOCATION_DEPTH: {
    key: 'maxLocationDepth',
    name: 'ARCHIVIST_SYNC.Settings.MaxLocationDepth.Name',
    hint: 'ARCHIVIST_SYNC.Settings.MaxLocationDepth.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 5,
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

  CHAT_HISTORY: {
    key: 'chatHistory',
    name: 'ARCHIVIST_SYNC.Settings.ChatHistory.Name',
    hint: 'ARCHIVIST_SYNC.Settings.ChatHistory.Hint',
    scope: 'world',
    config: false,
    type: String,
    default: '[]',
  },

  SEMANTIC_MAPPING_ENABLED: {
    key: 'semanticMappingEnabled',
    name: 'ARCHIVIST_SYNC.Settings.SemanticMapping.Name',
    hint: 'ARCHIVIST_SYNC.Settings.SemanticMapping.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  },
};

/**
 * Menu configuration
 */

const ICON = 'modules/archivist-sync/assets/icons/archivist.svg';

export const MENU_CONFIG = {
  RUN_SETUP_AGAIN: {
    key: 'runSetupAgain',
    name: 'ARCHIVIST_SYNC.Menu.RunSetup.Name',
    label: 'ARCHIVIST_SYNC.Menu.RunSetup.Label',
    hint: 'ARCHIVIST_SYNC.Menu.RunSetup.Hint',
    icon: 'fas fa-wand-magic-sparkles',
    restricted: true,
  },
};

/**
 * Dialog configuration
 */
export const DIALOG_CONFIG = {};

/**
 * Tab configuration
 */
export const TABS = {};
