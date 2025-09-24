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
import AskChatSidebarTab from './sidebar/ask-chat-sidebar-tab.js';
import { ensureChatSlot, installArchivistChatDelegates } from './sidebar/ask-chat-tab.js';

/**
 * Initialize the module when Foundry VTT is ready
 */

Hooks.once('init', function () {
  try {
    const Sidebar = foundry.applications.sidebar?.Sidebar;
    if (Sidebar) {
      const label = game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat';
      Sidebar.TABS = Sidebar.TABS || {};
      Sidebar.TABS['archivist-chat'] = {
        id: 'archivist-chat',
        title: label,
        icon: 'fa-solid fa-sparkles',
        tab: AskChatSidebarTab
      };
      console.log('[Archivist Sync] init: Registered AskChatSidebarTab in Sidebar.TABS');
    }
  } catch (e) {
    console.warn('[Archivist Sync] init: failed to register AskChatSidebarTab', e);
  }
});

Hooks.once('setup', function () {
  // No-op; registration handled in init
});

Hooks.once('ready', async function () {
  console.log('[Archivist Sync] ready: begin');
  try {
    if (!document.getElementById('sidebar')) await ui.sidebar?.render?.();
  } catch (_) { /* no-op */ }

  Utils.log('Module initialized');

  // Register module settings and menu
  settingsManager.registerSettings();

  // Initialize debugging interface
  initializeDebugInterface();

  // Re-render sidebar to ensure our registered tab appears, then ensure our slot replaces any <template>
  try { console.log('[Archivist Sync] ready: forcing sidebar render'); ui.sidebar?.render?.(true); } catch (e) { console.warn('[Archivist Sync] ready: sidebar render failed', e); }
  try { ensureChatSlot(); } catch (_) { }
  try { installArchivistChatDelegates(); } catch (_) { }

  // Do not force-switch tabs; allow user/system to control active tab

  // Add a Scene Controls button for quick access (visible to all users)
  Hooks.on('getSceneControlButtons', (controls) => {
    const tools = controls.find(c => c.name === 'token')?.tools;
    if (!tools) return;
    tools.push({
      name: 'archivist-chat',
      title: game.i18n.localize('ARCHIVIST_SYNC.Menu.AskChat.Label'),
      icon: 'archivist-icon',
      visible: true,
      onClick: () => { try { ui.sidebar?.expand?.(); ui.sidebar?.changeTab?.('archivist-chat'); } catch (_) { } },
      button: true
    });
  });
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