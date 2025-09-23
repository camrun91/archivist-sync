/**
 * Archivist Sync Module for Foundry VTT v13
 * 
 * A comprehensive module for synchronizing world data with the Archivist API.
 * This is the main orchestrator that coordinates all module components.
 */

// Import all module components
import { CONFIG } from './modules/config.js';
import { settingsManager } from './modules/settings-manager.js';
import { archivistApi } from './services/archivist-api.js';
import { Utils } from './modules/utils.js';
import { SyncOptionsDialog } from './dialogs/sync-options-dialog.js';
import { AskChatWindow } from './dialogs/ask-chat-window.js';

/**
 * Initialize the module when Foundry VTT is ready
 */
Hooks.once('ready', async function () {
  Utils.log('Module initialized');

  // Register module settings and menu
  settingsManager.registerSettings();

  // Initialize debugging interface
  initializeDebugInterface();
});

/**
 * Initialize global debugging interface
 * Makes key components available in the console for debugging
 */
function initializeDebugInterface() {
  window.ARCHIVIST_SYNC = {
    CONFIG,
    settingsManager,
    archivistApi,
    Utils,
    SyncOptionsDialog,
    AskChatWindow
  };

  Utils.log('Debug interface initialized. Use window.ARCHIVIST_SYNC to access module components.');
}

// Export main components for potential use by other modules
export {
  CONFIG,
  settingsManager,
  archivistApi,
  Utils,
  SyncOptionsDialog
};