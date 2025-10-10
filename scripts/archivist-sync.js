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
import { ensureChatSlot } from './sidebar/ask-chat-tab.js';

/**
 * Initialize the module when Foundry VTT is ready
 */

Hooks.once('init', function () {
  try {
    console.log('[Archivist Sync] init');
  } catch (_) {}
  // Register the Archivist Chat tab with the core Sidebar early so it renders its
  // nav button and panel using the Application V2 TabGroup. Availability will be
  // handled at runtime by showing/hiding the button and panel.
  try {
    const Sidebar = foundry.applications.sidebar?.Sidebar;
    if (Sidebar) {
      const label = game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat';
      Sidebar.TABS = Sidebar.TABS || {};
      Sidebar.TABS['archivist-chat'] = {
        id: 'archivist-chat',
        title: label,
        icon: 'fa-solid fa-sparkles',
        group: 'primary',
        tooltip: label,
        tab: AskChatSidebarTab,
        app: AskChatSidebarTab,
      };
    }
  } catch (_) {
    /* no-op */
  }
});

Hooks.once('setup', function () {
  try {
    console.log('[Archivist Sync] setup');
  } catch (_) {}
  // Ensure registration also occurs here in case Sidebar wasn't ready during init
  try {
    const Sidebar = foundry.applications.sidebar?.Sidebar;
    if (Sidebar) {
      const label = game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat';
      Sidebar.TABS = Sidebar.TABS || {};
      Sidebar.TABS['archivist-chat'] = Sidebar.TABS['archivist-chat'] || {
        id: 'archivist-chat',
        title: label,
        icon: 'fa-solid fa-sparkles',
        group: 'primary',
        tooltip: label,
        tab: AskChatSidebarTab,
        app: AskChatSidebarTab,
      };
    }
  } catch (_) {
    /* no-op */
  }
});

Hooks.once('ready', async function () {
  console.log('[Archivist Sync] ready: begin');
  try {
    if (!document.getElementById('sidebar')) await ui.sidebar?.render?.();
  } catch (_) {
    /* no-op */
  }

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
  try {
    console.log('[Archivist Sync] after availability update', {
      activeTab: ui.sidebar?.activeTab,
      hasSidebar: !!ui.sidebar,
    });
  } catch (_) {}

  // Delegated renderer: when the archivist tab button is clicked, render chat into panel
  try {
    const onClick = ev => {
      const btn =
        ev.target && ev.target.closest?.('#sidebar [data-action="tab"][data-tab="archivist-chat"]');
      if (!btn) return;
      console.log('[Archivist Sync] Delegated click detected for archivist-chat');
      setTimeout(async () => {
        try {
          const sidebar = document.getElementById('sidebar');
          const tabsNav = sidebar?.querySelector?.('#sidebar-tabs, nav.tabs');
          const panel = sidebar?.querySelector?.('#archivist-chat.tab');
          console.log('[Archivist Sync] Post-click render attempt', {
            hasPanel: !!panel,
            activeTab: ui.sidebar?.activeTab,
            expanded: ui.sidebar?._expanded,
          });
          if (!panel) return;
          // Ensure this panel is visible/active even if core didn't switch
          try {
            const contentWrap = panel.parentElement;
            contentWrap?.querySelectorAll?.('.tab').forEach(el => {
              el.classList.remove('active');
              el.style.display = 'none';
            });
            panel.style.display = '';
            panel.classList.add('active');
            const myBtn = tabsNav?.querySelector?.('[data-tab="archivist-chat"]');
            if (myBtn) {
              myBtn.setAttribute('aria-pressed', 'true');
              myBtn.setAttribute('aria-selected', 'true');
              myBtn.classList?.add?.('active');
            }
          } catch (_) {}
          if (!window.__ARCHIVIST_SIDEBAR_CHAT__) {
            window.__ARCHIVIST_SIDEBAR_CHAT__ = new AskChatWindow({ popOut: false });
          }
          window.__ARCHIVIST_SIDEBAR_CHAT__._mountEl = panel;
          await window.__ARCHIVIST_SIDEBAR_CHAT__.render(false);
          console.log('[Archivist Sync] Delegated render complete');
        } catch (e) {
          console.warn('[Archivist Sync] Delegated render failed', e);
        }
      }, 0);
    };
    document.addEventListener('click', onClick, true);
  } catch (e) {
    console.warn('[Archivist Sync] Failed to install delegated renderer', e);
  }

  // Delegated cleanup: when any other tab is clicked, clear our forced overrides
  try {
    const onOtherTabClick = ev => {
      const other = ev.target && ev.target.closest?.('#sidebar [data-action="tab"][data-tab]');
      if (!other) return;
      const tabId = other.dataset?.tab;
      if (tabId === 'archivist-chat') return; // our renderer handles the archivist tab
      setTimeout(() => {
        try {
          const sidebar = document.getElementById('sidebar');
          const contentWrap =
            sidebar?.querySelector?.('#sidebar-content, section.content, .content') ||
            sidebar?.querySelector('section.tab, .tab')?.parentElement;
          if (contentWrap) {
            // Remove inline display overrides so core can manage visibility
            contentWrap.querySelectorAll('.tab').forEach(el => {
              el.style.display = '';
            });
            const panel = contentWrap.querySelector('#archivist-chat.tab');
            if (panel) panel.classList.remove('active');
          }
          const tabsNav = sidebar?.querySelector?.('#sidebar-tabs, nav.tabs');
          const myBtn = tabsNav?.querySelector?.('[data-action="tab"][data-tab="archivist-chat"]');
          if (myBtn) {
            myBtn.classList?.remove?.('active');
            myBtn.setAttribute('aria-pressed', 'false');
            myBtn.setAttribute('aria-selected', 'false');
          }
          console.log('[Archivist Sync] Cleared overrides for other tab switch', { to: tabId });
        } catch (e) {
          console.warn('[Archivist Sync] Failed clearing overrides', e);
        }
      }, 0);
    };
    document.addEventListener('click', onOtherTabClick, true);
  } catch (e) {
    console.warn('[Archivist Sync] Failed to install delegated cleanup', e);
  }

  // Do not force-switch tabs; allow user/system to control active tab

  // Install Real-Time Sync listeners (CRUD) if enabled and world is selected
  try {
    if (settingsManager.isWorldSelected() && settingsManager.isRealtimeSyncEnabled?.()) {
      installRealtimeSyncListeners();
      console.log('[Archivist Sync] Real-Time Sync listeners installed');
    } else {
      console.log('[Archivist Sync] Real-Time Sync disabled or no world selected');
    }
  } catch (e) {
    console.warn('[Archivist Sync] Failed to install Real-Time Sync listeners', e);
  }

  // Add a Scene Controls button for quick access (conditionally visible)
  Hooks.on('getSceneControlButtons', controls => {
    if (!settingsManager.isArchivistChatAvailable()) return;

    const tools = controls.find(c => c.name === 'token')?.tools;
    if (!tools) return;
    tools.push({
      name: 'archivist-chat',
      title: game.i18n.localize('ARCHIVIST_SYNC.Menu.AskChat.Label'),
      icon: 'archivist-icon',
      visible: true,
      onClick: () => {
        try {
          ui.sidebar?.expand?.();
          ui.sidebar?.changeTab?.('archivist-chat');
        } catch (_) {}
      },
      button: true,
    });
  });
});

/**
 * Update Archivist chat availability based on current settings
 * Shows or hides the sidebar tab and updates UI accordingly
 */
function updateArchivistChatAvailability() {
  const isAvailable = settingsManager.isArchivistChatAvailable();
  try {
    console.log('[Archivist Sync] updateArchivistChatAvailability()', { isAvailable });
  } catch (_) {}

  if (isAvailable) {
    // Ensure visibility of the nav button and panel if already rendered
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      const tabsNav = sidebar.querySelector('#sidebar-tabs, nav.tabs');
      const tabButton = sidebar.querySelector('[data-tab="archivist-chat"]');
      let tabPanel = sidebar.querySelector('#archivist-chat.tab');
      if (tabButton) {
        tabButton.style.display = '';
        const label =
          game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat';
        tabButton.setAttribute('title', label);
        tabButton.setAttribute('data-tooltip', label);
        tabButton.setAttribute('data-tooltip-direction', 'LEFT');
      }
      if (tabPanel) tabPanel.style.display = '';

      // Ensure a content panel exists (template slot or create one)
      try {
        ensureChatSlot();
      } catch (_) {}
      if (!tabPanel) {
        const contentWrap =
          sidebar.querySelector('#sidebar-content, section.content, .content') ||
          sidebar.querySelector('section.tab, .tab')?.parentElement;
        if (contentWrap && !contentWrap.querySelector('#archivist-chat.tab')) {
          const panel = document.createElement('section');
          panel.id = 'archivist-chat';
          panel.className = 'tab sidebar-tab';
          panel.dataset.tab = 'archivist-chat';
          panel.style.height = '100%';
          panel.style.overflow = 'hidden auto';
          contentWrap.appendChild(panel);
          tabPanel = panel;
        }
      }

      // Fallback: if the core Sidebar did not render the nav button, inject a compatible button
      if (!tabButton && tabsNav) {
        try {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ui-control plain icon';
          btn.setAttribute('data-action', 'tab');
          btn.setAttribute('role', 'tab');
          btn.setAttribute('aria-controls', 'archivist-chat');
          btn.setAttribute('data-group', tabsNav.getAttribute('data-group') || 'primary');
          btn.dataset.tab = 'archivist-chat';
          btn.setAttribute(
            'aria-label',
            game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat'
          );
          btn.setAttribute(
            'data-tooltip',
            game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') || 'Archivist Chat'
          );
          btn.setAttribute('data-tooltip-direction', 'RIGHT');
          const i = document.createElement('i');
          i.className = 'fa-solid fa-sparkles';
          btn.appendChild(i);
          btn.addEventListener('click', async ev => {
            ev.preventDefault();
            try {
              console.log('[Archivist Sync] Sidebar button click');
            } catch (_) {}
            const isActive = ui.sidebar?.activeTab === 'archivist-chat';
            const isExpanded = ui.sidebar?._expanded;
            try {
              console.log('[Archivist Sync] click state', { isActive, isExpanded });
            } catch (_) {}
            if (isActive && isExpanded) {
              try {
                ui.sidebar?.collapse?.();
              } catch (_) {}
            } else {
              try {
                ui.sidebar?.expand?.();
              } catch (_) {}
              try {
                ui.sidebar?.changeTab?.('archivist-chat');
              } catch (_) {}
              // Ensure panel exists and render the chat UI as a fallback
              const sb = document.getElementById('sidebar');
              let panel = sb?.querySelector?.('#archivist-chat.tab');
              if (!panel) {
                const contentWrap =
                  sb?.querySelector('#sidebar-content, section.content, .content') ||
                  sb?.querySelector('section.tab, .tab')?.parentElement;
                if (contentWrap) {
                  panel = document.createElement('section');
                  panel.id = 'archivist-chat';
                  panel.className = 'tab sidebar-tab active';
                  panel.dataset.tab = 'archivist-chat';
                  panel.style.height = '100%';
                  panel.style.overflow = 'hidden auto';
                  contentWrap.appendChild(panel);
                }
              }
              if (panel) {
                try {
                  console.log('[Archivist Sync] rendering fallback chat');
                  if (!window.__ARCHIVIST_SIDEBAR_CHAT__) {
                    window.__ARCHIVIST_SIDEBAR_CHAT__ = new AskChatWindow({ popOut: false });
                  }
                  window.__ARCHIVIST_SIDEBAR_CHAT__._mountEl = panel;
                  await window.__ARCHIVIST_SIDEBAR_CHAT__.render(false);
                } catch (e) {
                  console.warn('[Archivist Sync] Fallback chat render failed', e);
                }
              }
            }
          });
          li.appendChild(btn);
          const menu = tabsNav.querySelector('menu.flexcol') || tabsNav;
          menu.appendChild(li);
        } catch (e) {
          console.warn('[Archivist Sync] Failed to inject fallback Sidebar tab button', e);
        }
      }
    }
    // Re-render to reflect visibility changes
    try {
      ui.sidebar?.render?.({ force: true });
    } catch (e) {
      console.warn('[Archivist Sync] Sidebar render failed', e);
    }
  } else {
    // Hide/remove sidebar tab if conditions are not met
    try {
      // Hide existing tab button and panel if they exist
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        const tabButton = sidebar.querySelector('[data-tab="archivist-chat"]');
        const tabPanel = sidebar.querySelector('#archivist-chat.tab');
        if (tabButton) tabButton.style.display = 'none';
        if (tabPanel) {
          tabPanel.style.display = 'none';
          tabPanel.classList.remove('active');
        }
      }
      // Force sidebar re-render to hide the tab (Application V2 signature)
      try {
        ui.sidebar?.render?.({ force: true });
      } catch (e) {
        console.warn('[Archivist Sync] Sidebar render failed', e);
      }
    } catch (e) {
      console.warn('[Archivist Sync] Failed to hide chat tab:', e);
    }
  }

  // Update scene controls (they will be re-evaluated on next render)
  try {
    ui.controls?.render?.(true);
  } catch (_) {}

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
    AskChatWindow,
  };

  Utils.log('Debug interface initialized. Use window.ARCHIVIST_SYNC to access module components.');
}

// Export main components for potential use by other modules
export { CONFIG, settingsManager, archivistApi, Utils, SyncOptionsDialog };

/**
 * Real-Time Sync: listen to Foundry CRUD and POST/PATCH/DELETE to Archivist
 * Only runs for GMs and when a world is selected & setting enabled.
 */
function installRealtimeSyncListeners() {
  const isGM = game.user?.isGM;
  if (!isGM) return; // Only the GM client should perform API writes

  const apiKey = settingsManager.getApiKey();
  const worldId = settingsManager.getSelectedWorldId();
  if (!apiKey || !worldId) return;

  const toItemPayload = item => {
    const name = item?.name || 'Item';
    const rawImg = String(item?.img || '').trim();
    const image = rawImg.startsWith('https://') ? rawImg : undefined;
    const desc = String(item?.system?.description?.value || item?.system?.description || '');
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(desc) || desc,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };

  const toCharacterPayload = actor => Utils.toApiCharacterPayload(actor, worldId);
  const toFactionPayload = page => {
    const name = page?.name || 'Faction';
    const html = Utils.extractPageHtml(page);
    // Strip leading image since it's stored separately in the image property
    const cleaned = Utils.stripLeadingImage?.(html) ?? html;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      campaign_id: worldId,
    };
  };
  const toLocationPayload = page => {
    const name = page?.name || 'Location';
    const html = Utils.extractPageHtml(page);
    // Strip leading image since it's stored separately in the image property
    const cleaned = Utils.stripLeadingImage?.(html) ?? html;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      campaign_id: worldId,
    };
  };

  // Create
  Hooks.on('createActor', async doc => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (id) return; // already linked
      const payload = toCharacterPayload(doc);
      const res = await archivistApi.createCharacter(apiKey, payload);
      if (res?.success && res?.data?.id) {
        await doc.setFlag(CONFIG.MODULE_ID, 'archivistId', res.data.id);
      }
    } catch (e) {
      console.warn('[RTS] createActor failed', e);
    }
  });
  Hooks.on('createItem', async doc => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (id) return;
      const payload = toItemPayload(doc);
      const res = await archivistApi.createItem(apiKey, payload);
      if (res?.success && res?.data?.id) {
        await doc.setFlag(CONFIG.MODULE_ID, 'archivistId', res.data.id);
        await doc.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId);
      }
    } catch (e) {
      console.warn('[RTS] createItem failed', e);
    }
  });

  // JournalEntryPage create (Factions / Locations containers only)
  const isFactionPage = p => p?.parent?.name === 'Factions';
  const isLocationPage = p => p?.parent?.name === 'Locations';
  const isRecapPage = p => p?.parent?.name === 'Recaps';

  Hooks.on('createJournalEntryPage', async page => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      if (isRecapPage(page)) return; // Recaps are read-only for creation
      const metaId = page.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (metaId) return;
      if (isFactionPage(page)) {
        const res = await archivistApi.createFaction(apiKey, toFactionPayload(page));
        if (res?.success && res?.data?.id) {
          await Utils.setPageArchivistMeta(page, res.data.id, 'faction', worldId);
        }
      } else if (isLocationPage(page)) {
        const res = await archivistApi.createLocation(apiKey, toLocationPayload(page));
        if (res?.success && res?.data?.id) {
          await Utils.setPageArchivistMeta(page, res.data.id, 'location', worldId);
        }
      }
    } catch (e) {
      console.warn('[RTS] createJournalEntryPage failed', e);
    }
  });

  // Update
  Hooks.on('updateActor', async (doc, changes) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (!id) return;
      const res = await archivistApi.updateCharacter(apiKey, id, toCharacterPayload(doc));
      if (!res?.success) console.warn('[RTS] updateCharacter failed');
    } catch (e) {
      console.warn('[RTS] updateActor failed', e);
    }
  });
  Hooks.on('updateItem', async (doc, changes) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (!id) return;
      const res = await archivistApi.updateItem(apiKey, id, toItemPayload(doc));
      if (!res?.success) console.warn('[RTS] updateItem failed');
    } catch (e) {
      console.warn('[RTS] updateItem failed', e);
    }
  });
  Hooks.on('updateJournalEntryPage', async (page, changes) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const meta = Utils.getPageArchivistMeta(page);
      if (!meta?.id) return;
      if (isFactionPage(page)) {
        await archivistApi.updateFaction(apiKey, meta.id, toFactionPayload(page));
      } else if (isLocationPage(page)) {
        await archivistApi.updateLocation(apiKey, meta.id, toLocationPayload(page));
      } else if (isRecapPage(page)) {
        // Recaps: update session summary/title only; do not create/delete
        const title = page.name;
        const html = Utils.extractPageHtml(page);
        await archivistApi.updateSession(apiKey, meta.id, {
          title,
          summary: Utils.toMarkdownIfHtml?.(html) || html,
        });
      }
    } catch (e) {
      console.warn('[RTS] updateJournalEntryPage failed', e);
    }
  });

  // Delete (preDelete to capture flags before doc vanishes)
  Hooks.on('preDeleteActor', async doc => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (!id) return;
      // No deleteCharacter API currently; we skip or could introduce one in API later
    } catch (e) {
      console.warn('[RTS] preDeleteActor failed', e);
    }
  });
  Hooks.on('preDeleteItem', async doc => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const id = doc.getFlag(CONFIG.MODULE_ID, 'archivistId');
      if (!id) return;
      if (archivistApi.deleteItem) await archivistApi.deleteItem(apiKey, id);
    } catch (e) {
      console.warn('[RTS] preDeleteItem failed', e);
    }
  });
  Hooks.on('preDeleteJournalEntryPage', async page => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const meta = Utils.getPageArchivistMeta(page);
      if (!meta?.id) return;
      if (isRecapPage(page)) return; // Recaps are read-only for delete
      if (isFactionPage(page) && archivistApi.deleteFaction) {
        await archivistApi.deleteFaction(apiKey, meta.id);
      }
      if (isLocationPage(page) && archivistApi.deleteLocation) {
        await archivistApi.deleteLocation(apiKey, meta.id);
      }
    } catch (e) {
      console.warn('[RTS] preDeleteJournalEntryPage failed', e);
    }
  });
}
