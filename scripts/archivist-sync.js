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
import { ensureChatSlot, installArchivistChatDelegates, registerArchivistSidebarTab } from './sidebar/ask-chat-tab.js';

/**
 * Initialize the module when Foundry VTT is ready
 */

Hooks.once('init', function () {
  // Note: We'll conditionally register the sidebar tab in the 'ready' hook
  // after settings are available and we can check availability conditions
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

  // Ensure world initialization flag exists (but don't auto-initialize)
  try {
    const flagCreated = await settingsManager.ensureWorldInitializationFlag();
    if (flagCreated) {
      Utils.log('Created world initialization flag (set to false - awaiting setup)');
    }
  } catch (error) {
    console.error('[Archivist Sync] Failed to ensure world initialization flag:', error);
  }

  // Initialize debugging interface
  initializeDebugInterface();

  // Conditionally set up Archivist chat based on availability
  updateArchivistChatAvailability();

  // Install chat delegates (always needed for when conditions become met)
  try { installArchivistChatDelegates(); } catch (_) { }

  // Do not force-switch tabs; allow user/system to control active tab

  // Add a Scene Controls button for quick access (conditionally visible)
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!settingsManager.isArchivistChatAvailable()) return;

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
 * Update Archivist chat availability based on current settings
 * Shows or hides the sidebar tab and updates UI accordingly
 */
function updateArchivistChatAvailability() {
  const isAvailable = settingsManager.isArchivistChatAvailable();

  if (isAvailable) {
    // Register sidebar tab if conditions are met
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
        console.log('[Archivist Sync] Chat available: Registered AskChatSidebarTab in Sidebar.TABS');
      }

      // Also register manually for fallback
      registerArchivistSidebarTab();
      ensureChatSlot();

      // Force sidebar re-render to show the new tab
      try { ui.sidebar?.render?.(true); } catch (e) { console.warn('[Archivist Sync] Sidebar render failed', e); }

    } catch (e) {
      console.warn('[Archivist Sync] Failed to register chat tab:', e);
    }
  } else {
    // Hide/remove sidebar tab if conditions are not met
    try {
      const Sidebar = foundry.applications.sidebar?.Sidebar;
      if (Sidebar && Sidebar.TABS && Sidebar.TABS['archivist-chat']) {
        delete Sidebar.TABS['archivist-chat'];
        console.log('[Archivist Sync] Chat unavailable: Removed AskChatSidebarTab from Sidebar.TABS');
      }

      // Hide existing tab button and panel if they exist
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        const tabButton = sidebar.querySelector('[data-tab="archivist-chat"]');
        const tabPanel = sidebar.querySelector('#archivist-chat.tab');

        if (tabButton) {
          tabButton.style.display = 'none';
        }
        if (tabPanel) {
          tabPanel.style.display = 'none';
          tabPanel.classList.remove('active');
        }
      }

      // Force sidebar re-render to hide the tab
      try { ui.sidebar?.render?.(true); } catch (e) { console.warn('[Archivist Sync] Sidebar render failed', e); }

    } catch (e) {
      console.warn('[Archivist Sync] Failed to hide chat tab:', e);
    }
  }

  // Update scene controls (they will be re-evaluated on next render)
  try { ui.controls?.render?.(true); } catch (_) { }

  Utils.log(`Archivist chat availability updated: ${isAvailable}`);
}

/**
 * Initialize global debugging interface
 * Makes key components available in the console for debugging
 */
function initializeDebugInterface() {
  window.ARCHIVIST_SYNC = {
    CONFIG,
    settingsManager,
    archivistApi,
    updateChatAvailability: updateArchivistChatAvailability,
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