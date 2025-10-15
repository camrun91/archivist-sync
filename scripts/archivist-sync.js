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
import { linkIndexer } from './modules/links/indexer.js';
import { AskChatWindow } from './dialogs/ask-chat-window.js';
import AskChatSidebarTab from './sidebar/ask-chat-sidebar-tab.js';
import { ensureChatSlot } from './sidebar/ask-chat-tab.js';
import { ArchivistHub } from './modules/toc/toc-window.js';
import { WorldSetupDialog } from './dialogs/world-setup-dialog.js';
// import { openV2SheetFor } from './modules/sheets/v2-sheets.js';
import { LinkHelpers } from './modules/links/helpers.js';

/**
 * Initialize the module when Foundry VTT is ready
 */

Hooks.once('init', async function () {
  try {
    console.log('[Archivist Sync] init');
  } catch (_) { }
  // Register settings as early as possible so other early hooks can read them
  try {
    settingsManager.registerSettings?.();
  } catch (e) {
    console.warn('[Archivist Sync] Settings registration failed during init', e);
  }
  // Register custom Journal sheets (v13)
  // Disable V1 DocumentSheet registrations in favor of V2 apps
  // (We rely on directory and TOC intercepts to open V2 sheets.)
  try {
    /* intentionally not registering V1 sheets */
  } catch (e) {
    console.warn('[Archivist Sync] Sheet registration skipped; using V2 sheets only', e);
  }

  // Register JournalEntry sheet classes with the core sheet registry (V2 DocumentSheet)
  try {
    const {
      EntryPageSheetV2,
      PCPageSheetV2,
      NPCPageSheetV2,
      CharacterPageSheetV2,
      ItemPageSheetV2,
      LocationPageSheetV2,
      FactionPageSheetV2,
      RecapPageSheetV2,
    } = await import('./modules/sheets/page-sheet-v2.js');

    const DSC = foundry?.applications?.apps?.DocumentSheetConfig || DocumentSheetConfig;
    DSC.registerSheet(JournalEntry, 'archivist-sync', EntryPageSheetV2, { label: 'Archivist: Entry', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', PCPageSheetV2, { label: 'Archivist: PC', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', NPCPageSheetV2, { label: 'Archivist: NPC', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', ItemPageSheetV2, { label: 'Archivist: Item', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', LocationPageSheetV2, { label: 'Archivist: Location', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', FactionPageSheetV2, { label: 'Archivist: Faction', types: ['base'], makeDefault: false });
    DSC.registerSheet(JournalEntry, 'archivist-sync', RecapPageSheetV2, { label: 'Archivist: Recap', types: ['base'], makeDefault: false });
  } catch (e) {
    console.error('[Archivist Sync] Failed to register V2 DocumentSheet sheets', e);
  }
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
  } catch (_) { }
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

// Register Scene Controls immediately (outside ready) so it's available on reloads
Hooks.on('getSceneControlButtons', controls => {
  try {
    // Guard against settings not yet registered during very early lifecycle
    let isWorldSelected = false;
    try { isWorldSelected = !!settingsManager.isWorldSelected?.(); } catch (_) { isWorldSelected = false; }
    console.log('[Archivist Sync] getSceneControlButtons hook fired', {
      controlsType: Array.isArray(controls) ? 'array' : typeof controls,
      isWorldSelected,
      worldId: (function () { try { return settingsManager.getSelectedWorldId?.(); } catch (_) { return null; } })(),
    });

    const openHub = () => {
      try {
        if (window.__ARCHIVIST_HUB__ && window.__ARCHIVIST_HUB__.rendered) {
          window.__ARCHIVIST_HUB__.close();
          return;
        }
        (window.__ARCHIVIST_HUB__ ||= new ArchivistHub()).render(true);
      } catch (e) {
        console.error('[Archivist Sync] Failed to render Archivist Hub', e);
      }
    };

    // Object-shaped API (v13+)
    if (!Array.isArray(controls) && controls && typeof controls === 'object') {
      const groupName = 'archivist-sync';
      controls[groupName] = {
        name: groupName,
        title: 'Archivist',
        icon: 'fas fa-book',
        visible: !!isWorldSelected,
        button: true,
        order: Object.keys(controls).length + 1,
        onChange: (event, active) => { if (active) canvas.tokens?.activate?.(); },
        onToolChange: () => { },
        tools: {
          'archivist-hub': {
            name: 'archivist-hub',
            title: 'Archivist Hub',
            icon: 'fas fa-book',
            button: true,
            order: 10,
            onChange: () => openHub(),
          },
        },
        activeTool: 'archivist-hub',
      };
      console.log('[Archivist Sync] Registered scene controls group');
      return;
    }

    // Legacy/array-shaped API
    const notes = Array.isArray(controls) ? controls.find(c => c.name === 'notes') : null;
    if (!notes) return;
    notes.tools.push({
      name: 'archivist-hub',
      title: 'Archivist Hub',
      icon: 'fas fa-book',
      visible: !!isWorldSelected,
      onClick: () => openHub(),
      button: true,
    });
    console.log('[Archivist Sync] Added Archivist Hub tool to Notes group (array API)');
  } catch (e) {
    console.error('[Archivist Sync] getSceneControlButtons failed', e);
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
  // Ensure organized folders exist (always during ready) so imports land correctly
  try {
    await Utils.ensureArchivistFolders();
  } catch (_) { }

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
  } catch (_) { }

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
          } catch (_) { }
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

  // Build initial link index from local world flags
  try {
    linkIndexer.buildFromWorld();
  } catch (e) {
    console.warn('[Archivist Sync] Link index build failed', e);
  }

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

  // (moved) getSceneControlButtons hook is registered at top-level below

  // Inject a Journal Directory header button to open Archivist Hub
  Hooks.on('renderJournalDirectory', (app, html) => {
    try {
      const root = html instanceof jQuery ? html[0] : (html?.element || html);
      if (!root) return;
      const header =
        root.querySelector('header.directory-header') ||
        root.querySelector('header.header') ||
        root.querySelector('header') ||
        root.querySelector('.directory-header') ||
        root.querySelector('.header');
      if (!header) return;
      if (header.querySelector?.('.archivist-hub-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'archivist-hub-btn';
      btn.textContent = 'Archivist Hub';
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        try {
          (window.__ARCHIVIST_HUB__ ||= new ArchivistHub()).render(true);
        } catch (_) { }
      });
      header.appendChild(btn);
    } catch (_) { }
  });

  // Inject quick-create buttons for Archivist sheets in the Journal Directory header
  Hooks.on('renderJournalDirectory', (app, html) => {
    try {
      if (!game.user?.isGM) return;
      const root = html instanceof jQuery ? html[0] : (html?.element || html);
      if (!root) return;
      const header =
        root.querySelector('header.directory-header') ||
        root.querySelector('header.header') ||
        root.querySelector('header') ||
        root.querySelector('.directory-header') ||
        root.querySelector('.header');
      if (!header) return;
      if (header.querySelector('.archivist-create-buttons')) return;

      const wrap = document.createElement('div');
      wrap.className = 'archivist-create-buttons';
      wrap.style.display = 'flex';
      wrap.style.flexWrap = 'wrap';
      wrap.style.gap = '6px';
      wrap.style.marginTop = '6px';

      const types = [
        { key: 'pc', label: 'PC', icon: 'fa-user', tooltip: 'Create New PC' },
        { key: 'npc', label: 'NPC', icon: 'fa-user-ninja', tooltip: 'Create New NPC' },
        { key: 'item', label: 'Item', icon: 'fa-gem', tooltip: 'Create New Item' },
        { key: 'location', label: 'Location', icon: 'fa-location-dot', tooltip: 'Create New Location' },
        { key: 'faction', label: 'Faction', icon: 'fa-people-group', tooltip: 'Create New Faction' },
      ];

      const promptForName = async (title) => {
        try {
          const name = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content: `
              <div class="form-group">
                <label>Name:</label>
                <input type="text" name="name" placeholder="Enter name..." autofocus style="width: 100%;" />
              </div>
            `,
            ok: {
              icon: '<i class="fas fa-check"></i>',
              label: 'Create',
              callback: (event, button) => {
                const enteredName = button.form.elements.name.value.trim();
                return enteredName || null;
              }
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancel' },
            rejectClose: true,
          });
          return name;
        } catch (_) {
          return null;
        }
      };

      const makeBtn = (t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'archivist-create-btn';
        b.innerHTML = `<i class="fas ${t.icon}"></i>`;
        b.title = t.tooltip;
        b.dataset.type = t.key;
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          try {
            const worldId = settingsManager.getSelectedWorldId?.();
            const name = await promptForName(`Create ${t.label}`);
            if (!name) return;

            let journal = null;
            if (t.key === 'pc') journal = await Utils.createPcJournal({ name, worldId });
            else if (t.key === 'npc') journal = await Utils.createNpcJournal({ name, worldId });
            else if (t.key === 'item') journal = await Utils.createItemJournal({ name, worldId });
            else if (t.key === 'location') journal = await Utils.createLocationJournal({ name, worldId });
            else if (t.key === 'faction') journal = await Utils.createFactionJournal({ name, worldId });

            // DocumentSheet registry will open the selected sheet when the journal is opened by the user
          } catch (e) {
            console.warn('[Archivist Sync] create button failed', e);
          }
        });
        return b;
      };

      for (const t of types) wrap.appendChild(makeBtn(t));
      header.appendChild(wrap);
    } catch (e) {
      console.warn('[Archivist Sync] Failed to inject create buttons', e);
    }
  });

  // Add Archivist type selector to Create Journal dialog (optional)
  Hooks.on('renderDialogV2', (dialog, html, data) => {
    try {
      if (dialog.title !== 'Create Journal Entry') return;
      const form = html.querySelector('form');
      if (!form || form.querySelector('[name="flags.archivist-sync.archivist.sheetType"]')) return;
      const sel = document.createElement('div');
      sel.className = 'form-group';
      sel.innerHTML = `
        <label>Archivist Type</label>
        <div class="form-fields">
          <select name="flags.archivist-sync.archivist.sheetType">
            <option value="">Standard</option>
            <optgroup label="Archivist">
              <option value="pc">PC</option>
              <option value="npc">NPC</option>
              <option value="item">Item</option>
              <option value="location">Location</option>
              <option value="faction">Faction</option>
            </optgroup>
          </select>
        </div>`;
      const nameInput = form.querySelector('input[name="name"]');
      if (nameInput) nameInput.closest('.form-group')?.insertAdjacentElement('afterend', sel);
    } catch (_) { }
  });

  // Auto-place new Archivist journals into organized folders and seed a text page
  Hooks.on('createJournalEntry', async (entry, options, userId) => {
    try {
      if (game.user.id !== userId) return;
      const flags = entry.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
      const type = String(flags.sheetType || '').toLowerCase();
      if (!type) return;
      // Move to organized folder when enabled
      try { await Utils.moveJournalToTypeFolder(entry); } catch (_) { }
      // Ensure it has a text page seeded with a header
      const pages = entry.pages?.contents || [];
      if (!pages.some(p => p.type === 'text')) {
        await entry.createEmbeddedDocuments('JournalEntryPage', [
          { name: 'Overview', type: 'text', text: { content: `<h1>${foundry.utils.escapeHTML(entry.name)}</h1>`, markdown: `# ${entry.name}`, format: 2 } }
        ]);
      }
    } catch (e) {
      console.warn('[Archivist Sync] createJournalEntry post-hook failed', e);
    }
  });

  // No auto-switch; DocumentSheet registrations handle sheet selection

  // Keep LinkIndexer current when archivist flags change
  Hooks.on('updateJournalEntry', (doc, changes) => {
    try {
      if (changes?.flags?.[CONFIG.MODULE_ID]?.archivist) {
        try { linkIndexer.buildFromWorld(); } catch (_) { }
      }
    } catch (_) { }
  });
  Hooks.on('updateJournalEntryPage', (page, changes) => {
    try {
      if (changes?.flags?.[CONFIG.MODULE_ID]?.archivist) {
        try { linkIndexer.buildFromWorld(); } catch (_) { }
      }
    } catch (_) { }
  });

  // Canvas drop: place Actor tokens when a UUID or linked Actor is dropped
  Hooks.on('dropCanvasData', async (canvasApp, data) => {
    try {
      const uuid = data?.uuid || data?.data?.uuid;
      if (!uuid) return false;
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) return false;

      let actor = null;
      if (doc.documentName === 'Actor') actor = doc;
      if (!actor && doc.documentName === 'JournalEntry') {
        const flags = doc.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
        const actorIds = Array.isArray(flags?.foundryRefs?.actors) ? flags.foundryRefs.actors : [];
        if (actorIds.length) actor = game.actors.get(actorIds[0]) || null;
      }
      if (!actor) return false;

      if (!canvas?.ready) {
        ui.notifications?.warn?.('Open a Scene first.');
        return false;
      }
      const x = Number.isFinite(data?.x) ? data.x : canvas.app.renderer.width / 2;
      const y = Number.isFinite(data?.y) ? data.y : canvas.app.renderer.height / 2;
      const pt = canvas.stage.worldTransform.applyInverse({ x, y });
      const tokenData = await actor.getTokenDocument({ x: pt.x, y: pt.y });
      await canvas.scene.createEmbeddedDocuments('Token', [tokenData]);
      return true;
    } catch (e) {
      console.warn('[Archivist Sync] dropCanvasData handler failed', e);
      return false;
    }
  });

  // Remove AppV2 sheet intercepts in favor of registered DocumentSheet V2

  // Force scene controls to initialize and render on ready to ensure our button appears
  try {
    // Wait a tick to ensure canvas is ready before initializing controls
    setTimeout(() => {
      try {
        if (ui.controls) {
          // v13+: render accepts { controls, tool } to rebuild control set
          ui.controls.render({ controls: ui.controls.control?.name || 'notes', tool: ui.controls.tool?.name || undefined });
        }
      } catch (e) {
        console.warn('[Archivist Sync] Failed to initialize/render scene controls', e);
      }
    }, 100);
  } catch (e) {
    console.warn('[Archivist Sync] Failed to setup scene controls on ready', e);
  }

  // Auto-open World Setup wizard for GMs when not initialized
  try {
    if (game.user?.isGM && !settingsManager.isWorldInitialized()) {
      (window.__ARCHIVIST_SETUP__ ||= new WorldSetupDialog()).render(true);
    }
  } catch (_) { }

  // Restore Archivist Hub on canvas ready if tool is active and hub was open
  Hooks.on('canvasReady', () => {
    try {
      // Force scene controls to initialize and re-render to ensure button appears after canvas draws
      if (ui.controls) {
        ui.controls.render({ controls: ui.controls.control?.name || 'notes', tool: ui.controls.tool?.name || undefined });
      }

      const isWorldSelected = settingsManager.isWorldSelected();
      if (!isWorldSelected) return;

      // Check if our scene control group is active (v13+ API)
      const activeControl = ui.controls?.control?.name;
      const activeTool = ui.controls?.tool?.name;

      // Object-shaped API check (v13)
      if (activeControl === 'archivist-sync' || activeTool === 'archivist-hub') {
        // Re-render Hub if it was previously rendered or if the tool is active
        if (window.__ARCHIVIST_HUB__ && window.__ARCHIVIST_HUB__.rendered) {
          window.__ARCHIVIST_HUB__.render(false);
        } else if (activeTool === 'archivist-hub' || activeControl === 'archivist-sync') {
          (window.__ARCHIVIST_HUB__ ||= new ArchivistHub()).render(true);
        }
      }
    } catch (e) {
      console.warn('[Archivist Sync] canvasReady Archivist Hub restore failed', e);
    }
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
  } catch (_) { }

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
      } catch (_) { }
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
            } catch (_) { }
            const isActive = ui.sidebar?.activeTab === 'archivist-chat';
            const isExpanded = ui.sidebar?._expanded;
            try {
              console.log('[Archivist Sync] click state', { isActive, isExpanded });
            } catch (_) { }
            if (isActive && isExpanded) {
              try {
                ui.sidebar?.collapse?.();
              } catch (_) { }
            } else {
              try {
                ui.sidebar?.expand?.();
              } catch (_) { }
              try {
                ui.sidebar?.changeTab?.('archivist-chat');
              } catch (_) { }
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
  } catch (_) { }

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
    installRealtimeSyncListeners,
    Utils,
    AskChatWindow,
  };

  Utils.log('Debug interface initialized. Use window.ARCHIVIST_SYNC to access module components.');
}

// Export main components for potential use by other modules
export { CONFIG, settingsManager, archivistApi, Utils };

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
    const rawImg = String(page?.parent?.img || '').trim();
    const image = rawImg.startsWith('https://') ? rawImg : undefined;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };
  const toLocationPayload = page => {
    const name = page?.name || 'Location';
    const html = Utils.extractPageHtml(page);
    // Strip leading image since it's stored separately in the image property
    const cleaned = Utils.stripLeadingImage?.(html) ?? html;
    const rawImg = String(page?.parent?.img || '').trim();
    const image = rawImg.startsWith('https://') ? rawImg : undefined;
    return {
      name,
      description: Utils.toMarkdownIfHtml?.(cleaned) || cleaned,
      ...(image ? { image } : {}),
      campaign_id: worldId,
    };
  };

  // Create
  Hooks.on('createActor', async doc => {
    try {
      // Always-on realtime rules; respect suppression during bulk ops
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
      // Do not auto-create Archivist Characters from Foundry actor creations
      return;
    } catch (e) {
      console.warn('[RTS] createActor failed', e);
    }
  });
  Hooks.on('createItem', async doc => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
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

  // JournalEntry create - create Archivist entities when a custom page-based sheet is created
  Hooks.on('createJournalEntry', async (entry, options, userId) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
      if (game.user.id !== userId) return;

      // Determine sheet type from flags set at creation time
      const flags = entry.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
      const sheetType = String(flags.sheetType || '').toLowerCase();
      if (!sheetType) return;

      // Skip if already linked
      if (flags.archivistId) return;

      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      if (!apiKey || !worldId) return;

      // Gather description from first text page
      const pages = entry.pages?.contents || [];
      const textPage = pages.find(p => p.type === 'text') || pages[0];
      const html = textPage?.text?.content || '';
      const description = Utils.toMarkdownIfHtml?.(html) || html || '';

      let res = { success: false, data: null };
      if (sheetType === 'pc' || sheetType === 'npc' || sheetType === 'character') {
        const payload = {
          character_name: entry.name || 'Character',
          description,
          type: sheetType === 'npc' ? 'NPC' : 'PC',
          campaign_id: worldId,
        };
        res = await archivistApi.createCharacter(apiKey, payload);
      } else if (sheetType === 'item') {
        res = await archivistApi.createItem(apiKey, {
          name: entry.name || 'Item',
          description,
          campaign_id: worldId,
        });
      } else if (sheetType === 'location') {
        const rawImg = String(entry?.img || '').trim();
        const image = rawImg.startsWith('https://') ? rawImg : undefined;
        res = await archivistApi.createLocation(apiKey, {
          name: entry.name || 'Location',
          description,
          ...(image ? { image } : {}),
          campaign_id: worldId,
        });
      } else if (sheetType === 'faction') {
        const rawImg = String(entry?.img || '').trim();
        const image = rawImg.startsWith('https://') ? rawImg : undefined;
        res = await archivistApi.createFaction(apiKey, {
          name: entry.name || 'Faction',
          description,
          ...(image ? { image } : {}),
          campaign_id: worldId,
        });
      }

      if (res.success && res.data?.id) {
        await entry.setFlag(CONFIG.MODULE_ID, 'archivist', {
          sheetType,
          archivistId: res.data.id,
          archivistWorldId: worldId,
          archivistRefs: { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] },
          foundryRefs: { actors: [], items: [], scenes: [], journals: [] },
        });
      }
    } catch (e) {
      console.warn('[RTS] createJournalEntry (flags) failed', e);
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
      // Always-on realtime rules; respect suppression during bulk ops
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
      // Do not PATCH Archivist Characters from Foundry actor updates
      return;
    } catch (e) {
      console.warn('[RTS] updateActor failed', e);
    }
  });
  Hooks.on('updateItem', async (doc, changes) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
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
      // Always-on realtime rules; respect suppression during bulk ops
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
      const meta = Utils.getPageArchivistMeta(page);
      if (!meta?.id) return;
      // Faction pages: update Faction
      if (isFactionPage(page)) {
        await archivistApi.updateFaction(apiKey, meta.id, toFactionPayload(page));
        // Location pages: update Location
      } else if (isLocationPage(page)) {
        await archivistApi.updateLocation(apiKey, meta.id, toLocationPayload(page));
        // Recap pages: update Session title/summary only
      } else if (isRecapPage(page)) {
        // Recaps: update session summary/title only; do not create/delete
        const title = page.name;
        const html = Utils.extractPageHtml(page);
        await archivistApi.updateSession(apiKey, meta.id, {
          title,
          summary: Utils.toMarkdownIfHtml?.(html) || html,
        });
      } else {
        // If the parent journal is flagged as character (pc/npc) or item, update those entities
        const parent = page?.parent;
        const flags = parent?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
        const html = Utils.extractPageHtml(page);
        const isCharacter = flags?.sheetType === 'pc' || flags?.sheetType === 'npc' || flags?.sheetType === 'character';
        if (isCharacter && flags.archivistId) {
          await archivistApi.updateCharacter(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
        }
        if (flags?.sheetType === 'item' && flags.archivistId) {
          await archivistApi.updateItem(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
        }
        if (flags?.sheetType === 'location' && flags.archivistId) {
          await archivistApi.updateLocation(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
        }
        if (flags?.sheetType === 'faction' && flags.archivistId) {
          await archivistApi.updateFaction(apiKey, flags.archivistId, {
            description: Utils.toMarkdownIfHtml?.(html) || html,
          });
        }
      }
    } catch (e) {
      console.warn('[RTS] updateJournalEntryPage failed', e);
    }
  });

  // When a sheet's title changes, PATCH the corresponding Archivist entity name/title
  Hooks.on('updateJournalEntry', async (entry, diff) => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      if (settingsManager.isRealtimeSyncSuppressed?.()) return;
      const flags = entry.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
      const id = flags?.archivistId;
      const st = String(flags?.sheetType || '');
      if (!id || !diff?.name) return;
      const name = String(diff.name);
      const isCharacter = st === 'pc' || st === 'npc' || st === 'character';
      if (isCharacter) {
        await archivistApi.updateCharacter(apiKey, id, { character_name: name });
      } else if (st === 'item') {
        await archivistApi.updateItem(apiKey, id, { name });
      } else if (st === 'location') {
        await archivistApi.updateLocation(apiKey, id, { name });
      } else if (st === 'faction') {
        await archivistApi.updateFaction(apiKey, id, { name });
      }
    } catch (e) {
      console.warn('[RTS] updateJournalEntry (title sync) failed', e);
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
      // Character sheets: delete Character in Archivist when custom Character sheet root is deleted
      const parent = page?.parent;
      const flags = parent?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
      const isCharacter = flags?.sheetType === 'pc' || flags?.sheetType === 'npc' || flags?.sheetType === 'character';
      if (isCharacter && flags.archivistId && archivistApi.deleteCharacter) {
        await archivistApi.deleteCharacter(apiKey, flags.archivistId);
      }
    } catch (e) {
      console.warn('[RTS] preDeleteJournalEntryPage failed', e);
    }
  });

  // Delete custom sheets when the JournalEntry itself is deleted
  Hooks.on('preDeleteJournalEntry', async entry => {
    try {
      if (!settingsManager.isRealtimeSyncEnabled?.()) return;
      const flags = entry.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
      const id = flags?.archivistId;
      const st = String(flags?.sheetType || '').toLowerCase();
      if (!id) return;
      if (st === 'recap') return; // Never create/delete recaps
      if ((st === 'pc' || st === 'npc' || st === 'character') && archivistApi.deleteCharacter) {
        await archivistApi.deleteCharacter(apiKey, id);
      } else if (st === 'item' && archivistApi.deleteItem) {
        await archivistApi.deleteItem(apiKey, id);
      } else if (st === 'location' && archivistApi.deleteLocation) {
        await archivistApi.deleteLocation(apiKey, id);
      } else if (st === 'faction' && archivistApi.deleteFaction) {
        await archivistApi.deleteFaction(apiKey, id);
      }
    } catch (e) {
      console.warn('[RTS] preDeleteJournalEntry failed', e);
    }
  });
}

// Header controls (v13): add quick-create buttons to Journal Directory
Hooks.on('getJournalDirectoryHeaderButtons', (app, buttons) => {
  try {
    if (!game.user?.isGM) return;

    const promptForName = async (title) => {
      try {
        const name = await foundry.applications.api.DialogV2.prompt({
          window: { title },
          content: `
            <div class="form-group">
              <label>Name:</label>
              <input type="text" name="name" placeholder="Enter name..." autofocus style="width: 100%;" />
            </div>
          `,
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: 'Create',
            callback: (event, button) => {
              const enteredName = button.form.elements.name.value.trim();
              return enteredName || null;
            }
          },
          cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancel' },
          rejectClose: true,
        });
        return name;
      } catch (_) {
        return null;
      }
    };

    const make = (key, label, icon) => ({
      class: `archivist-header-create-${key}`,
      label,
      icon,
      onclick: async (ev) => {
        ev?.preventDefault?.();
        try {
          const worldId = settingsManager.getSelectedWorldId?.();
          const name = await promptForName(`Create ${label}`);
          if (!name) return;
          let journal = null;
          if (key === 'pc') journal = await Utils.createPcJournal({ name, worldId });
          else if (key === 'npc') journal = await Utils.createNpcJournal({ name, worldId });
          else if (key === 'item') journal = await Utils.createItemJournal({ name, worldId });
          else if (key === 'location') journal = await Utils.createLocationJournal({ name, worldId });
          else if (key === 'faction') journal = await Utils.createFactionJournal({ name, worldId });
          // DocumentSheet registry will handle opening the chosen sheet
        } catch (e) {
          console.warn('[Archivist Sync] header create failed', e);
        }
      }
    });

    // Add buttons to the left of default controls (unshift to place first)
    buttons.unshift(make('faction', 'Faction', 'fas fa-people-group'));
    buttons.unshift(make('location', 'Location', 'fas fa-location-dot'));
    buttons.unshift(make('item', 'Item', 'fas fa-gem'));
    buttons.unshift(make('npc', 'NPC', 'fas fa-user-ninja'));
    buttons.unshift(make('pc', 'PC', 'fas fa-user'));
  } catch (e) {
    console.warn('[Archivist Sync] getJournalDirectoryHeaderButtons failed', e);
  }
});
