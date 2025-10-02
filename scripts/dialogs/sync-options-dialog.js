import { CONFIG } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';
import { toMarkdownIfHtml } from '../modules/importer-normalizer.js';
// Ask Chat removed from Sync Options dialog
import { WorldSetupDialog } from './world-setup-dialog.js';
import { writeBestBiography, writeBestJournalDescription } from '../modules/field-mapper.js';
import { importerService } from '../services/importer-service.js';

/**
 * Sync Options Dialog - Tabbed interface for world synchronization
 * Provides three main functions: World Selection, Title Sync, Character Mapping
 * Uses Foundry VTT Application v2 API with HandlebarsApplicationMixin
 */
export class SyncOptionsDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor() {
    super();
    this.worlds = [];
    this.actors = [];
    this.factionJournals = [];
    this.locationJournals = [];
    this.selectedWorldData = null; // Store full data for selected world
    this.isLoading = false;
    this.syncInProgress = false;
    this.activeTab = 'world';
    this.importerSampleJson = '';
    this.importerPreview = [];
    this.importerGroups = { Actor: [], Journal: [], Scene: [], Item: [] };
    this.importerOptions = {}; // by uuid → field options
    this.thresholdA = 0.6;
    this.thresholdB = 0.3;
    this.importerViewMode = 'all'; // 'sample' | 'all'
    this.importerActiveKind = 'All'; // 'All' | 'Actor' | 'Journal' | 'Scene' | 'Item'

    // Progress tracking for sync operations
    this.syncProgress = {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentType: '',
      currentEntity: '',
      phase: 'idle' // 'idle', 'processing', 'retrying', 'complete'
    };
    // Unified list rows per tab
    this.charactersRows = [];
    this.factionsRows = [];
    this.locationsRows = [];
    this.itemsRows = [];
    this.recapsRows = [];
    // Tab loading guards
    this._tabLoaded = { characters: false, factions: false, locations: false, items: false, recaps: false };
    this._loadingTabs = new Set();
  }

  /**
   * Application v2 configuration
   * @returns {Object} Application configuration
   */
  static DEFAULT_OPTIONS = {
    id: 'archivist-sync-options',
    tag: 'dialog',
    window: {
      title: 'ARCHIVIST_SYNC.dialog.title',
      icon: 'fas fa-sync-alt',
      resizable: true
    },
    position: {
      width: 1200,
      height: 1100
    },
    classes: ['archivist-sync-dialog'],
    actions: {
      syncWorlds: SyncOptionsDialog.prototype._onSyncWorlds,
      saveWorldSelection: SyncOptionsDialog.prototype._onSaveWorldSelection,
      worldSelectChange: SyncOptionsDialog.prototype._onWorldSelectChange,
      syncTitle: SyncOptionsDialog.prototype._onSyncTitle,
      syncToArchivist: SyncOptionsDialog.prototype._onSyncToArchivist,
      syncFromArchivist: SyncOptionsDialog.prototype._onSyncFromArchivist,
      mapCharacter: SyncOptionsDialog.prototype._onMapCharacter,
      syncCharacters: SyncOptionsDialog.prototype._onSyncCharacters,
      pullCharacters: SyncOptionsDialog.prototype._onPullCharacters,
      pushFactions: SyncOptionsDialog.prototype._onPushFactions,
      pullFactions: SyncOptionsDialog.prototype._onPullFactions,
      pushLocations: SyncOptionsDialog.prototype._onPushLocations,
      pullLocations: SyncOptionsDialog.prototype._onPullLocations,
      openWorldSetup: SyncOptionsDialog.prototype._onOpenWorldSetup,
      validateApiKey: SyncOptionsDialog.prototype._onValidateApiKey,
      saveConfig: SyncOptionsDialog.prototype._onSaveConfig,
      loadConfig: SyncOptionsDialog.prototype._onLoadConfig,
      downloadSampleConfig: SyncOptionsDialog.prototype._onDownloadSampleConfig,
      pullItems: SyncOptionsDialog.prototype._onPullItems,
      pushItems: SyncOptionsDialog.prototype._onPushItems
    }
  };

  /**
   * Template configuration for HandlebarsApplicationMixin
   */
  static PARTS = {
    window: {
      template: 'modules/archivist-sync/templates/sync-options-dialog.hbs'
    }
  };

  /**
   * Prepare context data for template rendering
   * @returns {Object} Template data
   */
  async _prepareContext() {
    // Ensure the world initialization flag exists before gating UI
    try { await settingsManager.ensureWorldInitializationFlag(); } catch (_) { /* no-op */ }
    const apiKey = settingsManager.getApiKey();
    const selectedWorldId = settingsManager.getSelectedWorldId();
    const selectedWorldName = settingsManager.getSelectedWorldName();
    const isApiConfigured = settingsManager.isApiConfigured();
    const isWorldSelected = settingsManager.isWorldSelected();
    const isWorldInitialized = settingsManager.isWorldInitialized();

    return {
      isApiConfigured,
      isWorldSelected,
      isWorldInitialized,
      // Show setup mode if world is not initialized
      showSetupMode: !isWorldInitialized,
      apiKey: apiKey ? '***' + apiKey.slice(-4) : '',
      worlds: this.worlds,
      selectedWorldId,
      selectedWorldName,
      selectedWorldData: this.selectedWorldData, // Include full world data
      actors: this.actors,
      playerCharacters: this.playerCharacters || [],
      npcs: this.npcs || [],
      factionJournals: this.factionJournals || [],
      locationJournals: this.locationJournals || [],
      isLoading: this.isLoading,
      syncInProgress: this.syncInProgress,
      syncProgress: {
        ...this.syncProgress,
        progressPercentage: this.syncProgress.total > 0 ? Math.round((this.syncProgress.processed / this.syncProgress.total) * 100) : 0
      },
      foundryWorldTitle: game.world.title,
      foundryWorldDescription: game.world.description || '',
      importerSampleJson: this.importerSampleJson || '',
      importerGroups: this.importerGroups || { Actor: [], Journal: [], Scene: [], Item: [] },
      importerOptions: this.importerOptions || {}
      , thresholdA: this.thresholdA
      , thresholdB: this.thresholdB
      , mappingOverrideJson: settingsManager.getMappingOverride() || ''
      // New wizard data
      , actorStringProperties: this._getActorStringProperties()
      , itemStringProperties: this._getItemStringProperties()
      , actorFolders: this._getAvailableFolders('Actor')
      , journalFolders: this._getAvailableFolders('JournalEntry')
      , itemFolders: this._getAvailableFolders('Item')
      , charactersRows: this.charactersRows || []
      , factionsRows: this.factionsRows || []
      , locationsRows: this.locationsRows || []
      , itemsRows: this.itemsRows || []
      , recapsRows: this.recapsRows || []
      , isLoadingCharacters: this._loadingTabs?.has('characters') || false
      , isLoadingFactions: this._loadingTabs?.has('factions') || false
      , isLoadingLocations: this._loadingTabs?.has('locations') || false
      , isLoadingItems: this._loadingTabs?.has('items') || false
      , isLoadingRecaps: this._loadingTabs?.has('recaps') || false
    };
  }

  /**
   * Update sync progress and re-render the dialog
   */
  updateSyncProgress(updates) {
    Object.assign(this.syncProgress, updates);
    this.render(); // Re-render to update the progress display
  }

  /**
   * Reset sync progress to initial state
   */
  resetSyncProgress() {
    this.syncProgress = {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentType: '',
      currentEntity: '',
      phase: 'idle'
    };
  }

  _normalizeFieldValue(value) {
    try {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) {
        const joined = value
          .map(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? String(v) : '')
          .filter(Boolean)
          .join(', ');
        if (joined) return joined;
      }
      if (typeof value === 'object') {
        // Prefer common content-like fields
        if (typeof value.value === 'string' && value.value.trim().length) return value.value;
        if (typeof value.public === 'string' && value.public.trim().length) return value.public;
        // Depth-first search up to 3 levels for first string leaf
        const stack = [{ v: value, d: 0 }];
        while (stack.length) {
          const { v, d } = stack.pop();
          if (d > 3 || v == null) continue;
          if (typeof v === 'string' && v.trim().length) return v;
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
          if (Array.isArray(v)) {
            for (const el of v) stack.push({ v: el, d: d + 1 });
          } else if (typeof v === 'object') {
            for (const k of Object.keys(v)) stack.push({ v: v[k], d: d + 1 });
          }
        }
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Get available string properties from Actor object model for description path selection
   * @returns {Array} Array of property paths with previews
   */
  _getActorStringProperties() {
    const actors = game.actors.contents.filter(actor =>
      actor.type === 'character' || actor.type === 'npc'
    );

    if (!actors.length) return [];

    const firstActor = actors[0];
    const properties = [];

    // Function to recursively explore object properties
    const exploreObject = (obj, path = '', depth = 0) => {
      if (depth > 4 || obj == null) return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === 'string' && value.trim().length > 0) {
          // Get preview value from the first actor
          const preview = value.length > 50 ? `${value.substring(0, 50)}...` : value;
          properties.push({
            path: currentPath,
            preview: preview,
            type: 'string'
          });
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          exploreObject(value, currentPath, depth + 1);
        }
      }
    };

    // Start exploration from actor.system
    exploreObject(firstActor.system, 'system');

    // Also add some common top-level properties
    if (firstActor.name) {
      properties.unshift({
        path: 'name',
        preview: firstActor.name,
        type: 'string'
      });
    }

    // Sort by relevance (bio/description fields first)
    properties.sort((a, b) => {
      const aRelevant = /(bio|desc|summary|notes)/i.test(a.path);
      const bRelevant = /(bio|desc|summary|notes)/i.test(b.path);
      if (aRelevant && !bRelevant) return -1;
      if (!aRelevant && bRelevant) return 1;
      return a.path.localeCompare(b.path);
    });

    return properties;
  }

  /**
   * Get available string properties from Item object model for path selection
   * @returns {Array} Array of property paths with previews
   */
  _getItemStringProperties() {
    const items = game.items.contents;

    if (!items.length) return [];

    const firstItem = items[0];
    const properties = [];

    // Function to recursively explore object properties
    const exploreObject = (obj, path = '', depth = 0) => {
      if (depth > 4 || obj == null) return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === 'string' && value.trim().length > 0) {
          // Get preview value from the first item
          const preview = value.length > 50 ? `${value.substring(0, 50)}...` : value;
          properties.push({
            path: currentPath,
            preview: preview,
            type: 'string'
          });
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          exploreObject(value, currentPath, depth + 1);
        }
      }
    };

    // Start exploration from item.system
    exploreObject(firstItem.system, 'system');

    // Also add some common top-level properties
    if (firstItem.name) {
      properties.unshift({
        path: 'name',
        preview: firstItem.name,
        type: 'string'
      });
    }

    if (firstItem.img) {
      properties.push({
        path: 'img',
        preview: firstItem.img,
        type: 'string'
      });
    }

    // Sort by relevance (name/img first, then description fields)
    properties.sort((a, b) => {
      const aRelevant = /(name|img)/i.test(a.path);
      const bRelevant = /(name|img)/i.test(b.path);
      const aDesc = /(desc|summary|notes)/i.test(a.path);
      const bDesc = /(desc|summary|notes)/i.test(b.path);

      if (aRelevant && !bRelevant) return -1;
      if (!aRelevant && bRelevant) return 1;
      if (aDesc && !bDesc) return -1;
      if (!aDesc && bDesc) return 1;
      return a.path.localeCompare(b.path);
    });

    return properties;
  }

  /**
   * Get available folders by type
   * @param {string} type - Folder type ('Actor', 'JournalEntry', 'Item')
   * @returns {Array} Array of folder objects with names and IDs
   */
  _getAvailableFolders(type) {
    const folders = game.folders?.contents || [];
    return folders
      .filter(folder => folder.type === type)
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        depth: folder.depth || 0
      }))
      .sort((a, b) => {
        // Sort by depth first, then by name
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name);
      });
  }




  /**
   * Actions performed after initial render
   * @param {ApplicationRenderContext} context - The render context
   * @param {RenderOptions} options - The render options
   */
  _onRender(context, options) {
    const html = this.element;

    // Initialize tabs
    this._initializeTabs(html);

    // Load actors for character mapping
    console.log('Loading actors for character mapping...');
    console.log('ACTORS', game.actors)
    this.actors = game.actors.filter(actor =>
      actor.type === 'character' || actor.type === 'npc'
    ).map(actor => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img || 'icons/svg/mystery-man.svg'
    }));

    // Separate actors by type for better organization
    this.playerCharacters = this.actors.filter(actor => actor.type === 'character');
    this.npcs = this.actors.filter(actor => actor.type === 'npc');

    // Load factions and locations from journals (include images for UI)
    const factionJournals = Utils.getFactionJournals();
    const locationJournals = Utils.getLocationJournals();
    this.factionJournals = factionJournals.map(j => ({ id: j.id, name: j.name, img: j.img || 'icons/svg/book.svg', archivistId: j.getFlag(CONFIG.MODULE_ID, 'archivistId') || '' }));
    this.locationJournals = locationJournals.map(j => ({ id: j.id, name: j.name, img: j.img || 'icons/svg/house.svg', archivistId: j.getFlag(CONFIG.MODULE_ID, 'archivistId') || '' }));

    // Load selected world data if a world is already selected
    const selectedWorldId = settingsManager.getSelectedWorldId();
    console.log('Dialog render - selectedWorldId:', selectedWorldId);
    console.log('Dialog render - existing selectedWorldData:', this.selectedWorldData);

    if (selectedWorldId && !this.selectedWorldData) {
      console.log('Loading world data on dialog render...');
      this._loadSelectedWorldData(selectedWorldId).then(() => {
        console.log('World data loading completed, re-rendering...');
        // Re-render to show the loaded data
        if (this.selectedWorldData) {
          this.render(false);
        }
      });
    }

    // Attach event listeners directly to elements
    html.querySelector('.sync-worlds-btn')?.addEventListener('click', this._onSyncWorlds.bind(this));
    html.querySelector('#world-select')?.addEventListener('change', this._onWorldSelectChange.bind(this));
    html.querySelector('.save-selection-btn')?.addEventListener('click', this._onSaveWorldSelection.bind(this));
    html.querySelector('.sync-title-btn')?.addEventListener('click', this._onSyncTitle.bind(this));

    // New sync buttons with debug logging
    const syncToBtn = html.querySelector('.sync-to-archivist-btn');
    const syncFromBtn = html.querySelector('.sync-from-archivist-btn');
    // Ask Chat button removed

    if (syncToBtn) {
      console.log('Found sync-to-archivist-btn, attaching listener');
      syncToBtn.addEventListener('click', this._onSyncToArchivist.bind(this));
    } else {
      console.log('sync-to-archivist-btn not found in DOM');
    }

    if (syncFromBtn) {
      console.log('Found sync-from-archivist-btn, attaching listener');
      syncFromBtn.addEventListener('click', this._onSyncFromArchivist.bind(this));
    } else {
      console.log('sync-from-archivist-btn not found in DOM');
    }

    // no-op

    html.querySelector('.push-characters-btn')?.addEventListener('click', this._onSyncCharacters.bind(this));
    html.querySelector('.pull-characters-btn')?.addEventListener('click', this._onPullCharacters.bind(this));

    // Deterministic sync button
    html.querySelector('.deterministic-sync-btn')?.addEventListener('click', this._onDeterministicSync.bind(this));

    // Wizard load/save/test
    html.querySelector('.wizard-load-config')?.addEventListener('click', this._onWizardLoad.bind(this));
    html.querySelector('.wizard-save-config')?.addEventListener('click', this._onWizardSave.bind(this));
    html.querySelector('.wizard-test-paths')?.addEventListener('click', this._onWizardTest.bind(this));

    // Per-item actions (event delegation for dynamically updated lists)
    if (!html.dataset.rowHandlersBound) {
      html.addEventListener('click', async (e) => {
        // Only handle row-level buttons for individual item sync
        const rowActorPush = e.target.closest?.('.row-actor-push');
        const rowActorPull = e.target.closest?.('.row-actor-pull');
        const rowItemPush = e.target.closest?.('.row-item-push');
        const rowItemPull = e.target.closest?.('.row-item-pull');
        const rowFactionPush = e.target.closest?.('.row-faction-push');
        const rowFactionPull = e.target.closest?.('.row-faction-pull');
        const rowLocationPush = e.target.closest?.('.row-location-push');
        const rowLocationPull = e.target.closest?.('.row-location-pull');
        const rowRecapPush = e.target.closest?.('.row-recap-push');
        const rowRecapPull = e.target.closest?.('.row-recap-pull');

        // Stop event propagation to prevent triggering header buttons
        if (rowActorPush) { e.stopPropagation(); return this._pushSingleActor(rowActorPush.dataset.actorId); }
        if (rowActorPull) { e.stopPropagation(); return this._pullSingleCharacterByArchivistId(rowActorPull.dataset.archivistId); }
        if (rowItemPush) { e.stopPropagation(); return this._pushSingleItem(rowItemPush.dataset.itemId); }
        if (rowItemPull) { e.stopPropagation(); return this._pullSingleItemByArchivistId(rowItemPull.dataset.archivistId); }
        if (rowFactionPush) { e.stopPropagation(); return this._pushSingleFactionPage(rowFactionPush.dataset.pageId); }
        if (rowFactionPull) { e.stopPropagation(); return this._pullSingleFactionByArchivistId(rowFactionPull.dataset.archivistId); }
        if (rowLocationPush) { e.stopPropagation(); return this._pushSingleLocationPage(rowLocationPush.dataset.pageId); }
        if (rowLocationPull) { e.stopPropagation(); return this._pullSingleLocationByArchivistId(rowLocationPull.dataset.archivistId); }
        if (rowRecapPush) { e.stopPropagation(); return this._pushSingleRecapPage(rowRecapPush.dataset.pageId); }
        if (rowRecapPull) { e.stopPropagation(); return this._pullSingleRecap(rowRecapPull.dataset.sessionId); }
      });
      html.dataset.rowHandlersBound = 'true';
    }

    html.querySelector('.push-factions-btn')?.addEventListener('click', this._onPushFactions.bind(this));
    html.querySelector('.pull-factions-btn')?.addEventListener('click', this._onPullFactions.bind(this));

    html.querySelector('.push-locations-btn')?.addEventListener('click', this._onPushLocations.bind(this));
    html.querySelector('.pull-locations-btn')?.addEventListener('click', this._onPullLocations.bind(this));

    // (Map button removed)

    // World Options & Config actions
    html.querySelector('.run-setup-wizard-btn')?.addEventListener('click', this._onOpenWorldSetup.bind(this));
    html.querySelector('.validate-api-key-btn')?.addEventListener('click', this._onValidateApiKey.bind(this));
    html.querySelector('.cfg-load')?.addEventListener('click', this._onLoadConfig.bind(this));
    html.querySelector('.cfg-save')?.addEventListener('click', this._onSaveConfig.bind(this));

    // System preset dropdown with validation
    const presetSelect = html.querySelector('.cfg-system-preset');
    if (presetSelect && !presetSelect.dataset.bound) {
      // initialize previous value
      presetSelect.dataset.prev = presetSelect.value || '';
      presetSelect.addEventListener('change', (e) => {
        const selectedKey = e.target.value;
        const manualMappingSection = html.querySelector('.manual-mapping-section');

        if (!selectedKey) {
          // Custom: show manual mapping
          if (manualMappingSection) manualMappingSection.style.display = 'block';
          presetSelect.dataset.prev = '';
          return;
        }

        try {
          this._validatePresetOrThrow(selectedKey);
          this._applySystemPreset(selectedKey);
          if (manualMappingSection) manualMappingSection.style.display = 'none';
          presetSelect.dataset.prev = selectedKey;
        } catch (err) {
          ui.notifications.error(String(err?.message || 'Preset unavailable for this system.'));
          // revert to previous value
          e.target.value = presetSelect.dataset.prev || '';
        }
      });
      presetSelect.dataset.bound = 'true';
    }

    // On load, set manual mapping visibility based on current preset selection
    setTimeout(() => {
      const manualMappingSection = html.querySelector('.manual-mapping-section');
      if (presetSelect && manualMappingSection) {
        manualMappingSection.style.display = presetSelect.value === '' ? 'block' : 'none';
      }
    }, 100);

    // Items tab actions
    html.querySelector('.push-items-btn')?.addEventListener('click', this._onPushItems.bind(this));
    html.querySelector('.pull-items-btn')?.addEventListener('click', this._onPullItems.bind(this));

    // Recaps tab actions
    html.querySelector('.push-recaps-btn')?.addEventListener('click', this._onPushRecaps.bind(this));
    html.querySelector('.pull-recaps-btn')?.addEventListener('click', this._onPullRecaps.bind(this));

    // remove importer delegated change handler
    if (!html.dataset.changeHandlersBound) {
      html.addEventListener('change', async (e) => {
        // no-op for importer
        return;
      });
      html.dataset.changeHandlersBound = 'true';
    }

    // Importer kind tab switching and initial state
    const applyKindFilter = (kind) => {
      const buckets = html.querySelectorAll('.preview-bucket');
      buckets.forEach(b => {
        const bk = b.dataset.kind;
        b.style.display = (kind === 'All' || kind === bk) ? '' : 'none';
      });
      html.querySelectorAll('.importer-kind-tab').forEach(x => {
        if ((x.dataset.kind || '') === kind) x.classList.add('active'); else x.classList.remove('active');
      });
    };
    html.querySelectorAll('.importer-kind-tab')?.forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const kind = ev.currentTarget?.dataset?.kind || 'All';
        this.importerActiveKind = kind;
        applyKindFilter(kind);
      });
    });
    // Apply initial filter on render
    applyKindFilter(this.importerActiveKind || 'All');

    // Preload rows for current active tab
    const active = this.activeTab || 'world';
    // Only attempt once per tab; do not re-trigger on re-render
    if (!this._tabLoaded?.[active]) this._loadRowsForTab(active).catch(err => console.warn('Failed to load rows for tab', active, err));
  }

  /**
   * Push one actor by id to Archivist (create/update decided by flag)
   */
  async _pushSingleActor(actorId) {
    try {
      const actor = game.actors.get(actorId);
      if (!actor) return ui.notifications.warn('Actor not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const payload = Utils.toApiCharacterPayload(actor, worldId);
      const existingId = Utils.getActorArchivistId(actor);
      this.syncInProgress = true; this.render();
      if (existingId) await archivistApi.updateCharacter(apiKey, existingId, payload);
      else {
        const created = await archivistApi.createCharacter(apiKey, payload);
        if (created.success && created.data?.id) await Utils.setActorArchivistId(actor, created.data.id);
      }
      ui.notifications.info(`Synced ${actor.name}`);
    } catch (e) {
      console.error(e); ui.notifications.error('Failed to sync actor');
    } finally { this.syncInProgress = false; this.render(); }
  }

  /**
   * Pull a single Character by Archivist ID and upsert into Foundry
   */
  async _pullSingleCharacterByArchivistId(archivistId) {
    try {
      this.syncInProgress = true; this.render();
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listCharacters(apiKey, worldId);
      const c = (Array.isArray(list?.data) ? list.data : []).find(x => String(x.id) === String(archivistId));
      if (!c) return ui.notifications.warn('Character not found in Archivist');
      const existing = (game.actors?.contents ?? game.actors ?? []).find(a => String(a.getFlag(CONFIG.MODULE_ID, 'archivistId')) === String(archivistId));
      if (existing) {
        // Update existing description/name minimally
        const name = c.character_name || c.name || existing.name;
        const html = Utils.markdownToStoredHtml(String(c.description || ''));
        await existing.update({ name, 'system.details.biography.value': html });
        ui.notifications.info(`Updated character: ${name}`);
      } else {
        // Create new actor (default to character)
        const actorData = {
          name: c.character_name || c.name || 'Character',
          type: 'character',
          img: c.image || null
        };
        const html = Utils.markdownToStoredHtml(String(c.description || ''));
        foundry.utils.setProperty(actorData, settingsManager.getImportConfig()?.actorMappings?.pc?.descriptionPath || 'system.details.biography.value', html);
        const actor = await Actor.create(actorData, { render: false });
        try { await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', c.id); } catch (_) { }
        ui.notifications.info(`Imported character: ${actor.name}`);
      }
      // Refresh rows
      this._tabLoaded.characters = false; await this._loadCharacterRows();
    } catch (e) { console.error(e); ui.notifications.error('Failed to pull character'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  async _pushSingleFaction(journalId) {
    try {
      const j = game.journal.get(journalId);
      if (!j) return ui.notifications.warn('Journal not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const payload = Utils.toApiFactionPayload(j, worldId);
      const meta = Utils.getJournalArchivistMeta(j);
      this.syncInProgress = true; this.render();
      if (meta.id) await archivistApi.updateFaction(apiKey, meta.id, payload);
      else {
        const created = await archivistApi.createFaction(apiKey, payload);
        if (created.success && created.data?.id) await Utils.setJournalArchivistMeta(j, created.data.id, 'faction');
      }
      ui.notifications.info(`Synced ${j.name}`);
    } catch (e) {
      console.error(e); ui.notifications.error('Failed to sync faction');
    } finally { this.syncInProgress = false; this.render(); }
  }

  /**
   * Pull a single Faction by Archivist ID and upsert the page in container
   */
  async _pullSingleFactionByArchivistId(archivistId) {
    try {
      this.syncInProgress = true; this.render();
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listFactions(apiKey, worldId);
      const f = (Array.isArray(list?.data) ? list.data : []).find(x => String(x.id) === String(archivistId));
      if (!f) return ui.notifications.warn('Faction not found in Archivist');
      const container = await Utils.ensureRootJournalContainer('Factions');
      const html = String(f.description || '').trim();
      await Utils.upsertContainerTextPage(container, {
        name: f.name || 'Faction',
        html,
        imageUrl: typeof f.image === 'string' && f.image.trim().length ? f.image.trim() : null,
        flags: { archivistId: f.id, archivistType: 'faction', archivistWorldId: worldId }
      });
      ui.notifications.info(`Imported faction: ${f.name || 'Faction'}`);
      this._tabLoaded.factions = false; await this._loadFactionRows();
    } catch (e) { console.error(e); ui.notifications.error('Failed to pull faction'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  async _pushSingleLocation(journalId) {
    try {
      const j = game.journal.get(journalId);
      if (!j) return ui.notifications.warn('Journal not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const payload = Utils.toApiLocationPayload(j, worldId);
      const meta = Utils.getJournalArchivistMeta(j);
      this.syncInProgress = true; this.render();
      if (meta.id) await archivistApi.updateLocation(apiKey, meta.id, payload);
      else {
        const created = await archivistApi.createLocation(apiKey, payload);
        if (created.success && created.data?.id) await Utils.setJournalArchivistMeta(j, created.data.id, 'location');
      }
      ui.notifications.info(`Synced ${j.name}`);
    } catch (e) {
      console.error(e); ui.notifications.error('Failed to sync location');
    } finally { this.syncInProgress = false; this.render(); }
  }

  /**
   * Pull a single Location by Archivist ID and upsert the page in container
   */
  async _pullSingleLocationByArchivistId(archivistId) {
    try {
      this.syncInProgress = true; this.render();
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listLocations(apiKey, worldId);
      const l = (Array.isArray(list?.data) ? list.data : []).find(x => String(x.id) === String(archivistId));
      if (!l) return ui.notifications.warn('Location not found in Archivist');
      const container = await Utils.ensureRootJournalContainer('Locations');
      const html = String(l.description || '').trim();
      await Utils.upsertContainerTextPage(container, {
        name: l.name || 'Location',
        html,
        imageUrl: typeof l.image === 'string' && l.image.trim().length ? l.image.trim() : null,
        flags: { archivistId: l.id, archivistType: 'location', archivistWorldId: worldId }
      });
      ui.notifications.info(`Imported location: ${l.name || 'Location'}`);
      this._tabLoaded.locations = false; await this._loadLocationRows();
    } catch (e) { console.error(e); ui.notifications.error('Failed to pull location'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  /**
   * Pull a single Item by Archivist ID and create/update Foundry Item
   */
  async _pullSingleItemByArchivistId(archivistId) {
    try {
      this.syncInProgress = true; this.render();
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listItems(apiKey, worldId);
      const it = (Array.isArray(list?.data) ? list.data : []).find(x => String(x.id) === String(archivistId));
      if (!it) return ui.notifications.warn('Item not found in Archivist');
      // Try find existing by flag
      const existing = (game.items?.contents ?? game.items ?? []).find(i => String(i.getFlag(CONFIG.MODULE_ID, 'archivistId')) === String(archivistId));
      const cfg = settingsManager.getImportConfig();
      const folderId = cfg?.destinations?.item || null;
      const resolveItemType = (src) => {
        try {
          const raw = String(src?.type ?? src?.item_type ?? src?.category ?? '').trim().toLowerCase();
          const candidates = ['weapon', 'equipment', 'consumable', 'spell', 'feat', 'tool', 'loot', 'backpack'];
          if (candidates.includes(raw)) return raw;
          if (/weapon/.test(raw)) return 'weapon';
          if (/armor|equipment/.test(raw)) return 'equipment';
          if (/consum/.test(raw)) return 'consumable';
          if (/spell/.test(raw)) return 'spell';
          if (/feat|ability/.test(raw)) return 'feat';
          if (/tool/.test(raw)) return 'tool';
          if (/pack|bag|backpack/.test(raw)) return 'backpack';
          return 'loot';
        } catch (_) { return 'loot'; }
      };
      const safeType = resolveItemType(it);
      const apiImage = typeof it.image === 'string' ? it.image.trim() : '';
      const safeImage = apiImage && /^https?:\/\//i.test(apiImage) ? apiImage : undefined;
      const itemData = {
        name: it.name || 'Item',
        type: safeType,
        // Do not overwrite with null/empty; only set when a valid URL is provided
        ...(safeImage ? { img: safeImage } : {}),
        folder: folderId || null
      };
      // Description path resolution: prefer explicit itemMappings, then legacy mapping.item.descPath, then system default
      const descMd = typeof it.description === 'string' ? it.description : '';
      const descPath = cfg?.itemMappings?.descriptionPath || cfg?.mapping?.item?.descPath || settingsManager._defaultDescriptionPath(game.system?.id || 'generic', 'pc');
      if (descMd && descPath) {
        const html = Utils.markdownToStoredHtml(descMd);
        foundry.utils.setProperty(itemData, descPath, html);
      }
      if (existing) {
        await existing.update(itemData);
        ui.notifications.info(`Updated item: ${existing.name}`);
      } else {
        const created = await Item.create(itemData, { render: false });
        try { await created.setFlag(CONFIG.MODULE_ID, 'archivistId', it.id); } catch (_) { }
        ui.notifications.info(`Imported item: ${created.name}`);
      }
      this._tabLoaded.items = false; await this._loadItemRows();
    } catch (e) { console.error(e); ui.notifications.error('Failed to pull item'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  /**
   * Initialize tab functionality
   * @param {HTMLElement} html - The rendered HTML
   */
  _initializeTabs(html) {
    // Restore previously active tab (default to 'world')
    const desired = this.activeTab || 'world';
    const tabEl = html.querySelector(`.tabs .item[data-tab="${desired}"]`) || html.querySelector('.tabs .item[data-tab="world"]');
    const contentEl = html.querySelector(`.tab[data-tab="${desired}"]`) || html.querySelector('.tab[data-tab="world"]');
    if (tabEl) tabEl.classList.add('active');
    if (contentEl) contentEl.classList.add('active');

    // Tab click handlers
    html.querySelectorAll('.tabs .item').forEach(tab => {
      tab.addEventListener('click', (event) => {
        const tabName = event.currentTarget.dataset.tab;
        this.activeTab = tabName;
        this._activateTab(html, tabName);
        if (!this._tabLoaded?.[tabName]) this._loadRowsForTab(tabName).catch(err => console.warn('Failed to load rows for tab', tabName, err));
      });
    });
  }

  /**
   * Activate a specific tab
   * @param {HTMLElement} html - The rendered HTML
   * @param {string} tabName - Name of the tab to activate
   */
  _activateTab(html, tabName) {
    // Remove active class from all tabs and content
    html.querySelectorAll('.tabs .item').forEach(tab => tab.classList.remove('active'));
    html.querySelectorAll('.tab').forEach(content => content.classList.remove('active'));

    // Add active class to selected tab and content
    const selectedTab = html.querySelector(`.tabs .item[data-tab="${tabName}"]`);
    const selectedContent = html.querySelector(`.tab[data-tab="${tabName}"]`);

    if (selectedTab) selectedTab.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');
  }

  async _loadRowsForTab(tabName) {
    if (!settingsManager.isWorldSelected()) return;
    // Prevent duplicate loads and loops
    if (this._tabLoaded?.[tabName]) return;
    if (this._loadingTabs?.has(tabName)) return;
    this._loadingTabs.add(tabName);
    if (tabName === 'characters') return this._loadCharacterRows();
    if (tabName === 'factions') return this._loadFactionRows();
    if (tabName === 'locations') return this._loadLocationRows();
    if (tabName === 'items') return this._loadItemRows();
    if (tabName === 'recaps') return this._loadRecapRows();
  }

  async _loadCharacterRows() {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listCharacters(apiKey, worldId);
      const apiChars = Array.isArray(list?.data) ? list.data : [];
      const actors = (game.actors?.contents ?? game.actors ?? []).filter(a => a.type === 'character' || a.type === 'npc');
      const foundryByArchivistId = new Map();
      for (const a of actors) {
        const id = a.getFlag(CONFIG.MODULE_ID, 'archivistId');
        if (id) foundryByArchivistId.set(String(id), a);
      }
      const rows = [];
      for (const c of apiChars) {
        const a = foundryByArchivistId.get(String(c.id));
        if (a) rows.push({ type: 'character', name: a.name, img: a.img || 'icons/svg/mystery-man.svg', linked: true, actorId: a.id, archivistId: c.id, canPush: true, canPull: true });
      }
      for (const a of actors) {
        const id = a.getFlag(CONFIG.MODULE_ID, 'archivistId');
        if (!id) rows.push({ type: 'character', name: a.name, img: a.img || 'icons/svg/mystery-man.svg', linked: false, actorId: a.id, archivistId: '', canPush: true, canPull: false });
      }
      const linkedIds = new Set(rows.filter(r => r.linked).map(r => String(r.archivistId)));
      for (const c of apiChars) {
        if (!linkedIds.has(String(c.id))) {
          const name = c.character_name || c.name || 'Character';
          const imageUrl = (typeof c.image === 'string' && c.image.trim().length) ? c.image.trim() : null;
          rows.push({ type: 'character', name, img: imageUrl || 'icons/svg/mystery-man.svg', linked: false, actorId: '', archivistId: c.id, canPush: false, canPull: true });
        }
      }
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      this.charactersRows = rows;
      this._tabLoaded.characters = true;
      // Minimize rerenders: update only this tab content
      this.render(false);
    } catch (e) { console.warn('Failed loading character rows', e); }
    finally { this._loadingTabs.delete('characters'); }
  }

  _getContainerPagesByName(name) {
    try {
      const journals = game.journal?.contents || [];
      const container = journals.find(x => x.name === name && !x.folder);
      return container?.pages?.contents || [];
    } catch (_) { return []; }
  }

  async _loadFactionRows() {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listFactions(apiKey, worldId);
      const apiItems = Array.isArray(list?.data) ? list.data : [];
      const pages = this._getContainerPagesByName('Factions');
      const foundryByArchivistId = new Map();
      const orphans = [];
      for (const p of pages) {
        const meta = Utils.getPageArchivistMeta(p);
        if (meta?.id) foundryByArchivistId.set(String(meta.id), p); else orphans.push(p);
      }
      const rows = [];
      for (const f of apiItems) {
        const p = foundryByArchivistId.get(String(f.id));
        if (p) rows.push({ type: 'faction', name: p.name, img: p?.parent?.img || 'icons/svg/book.svg', linked: true, pageId: p.id, archivistId: f.id, canPush: true, canPull: true });
      }
      for (const p of orphans) rows.push({ type: 'faction', name: p.name, img: p?.parent?.img || 'icons/svg/book.svg', linked: false, pageId: p.id, archivistId: '', canPush: true, canPull: false });
      const linkedIds = new Set(rows.filter(r => r.linked).map(r => String(r.archivistId)));
      for (const f of apiItems) {
        if (!linkedIds.has(String(f.id))) {
          const imageUrl = (typeof f.image === 'string' && f.image.trim().length) ? f.image.trim() : (typeof f.cover_image === 'string' && f.cover_image.trim().length) ? f.cover_image.trim() : (typeof f.thumbnail === 'string' && f.thumbnail.trim().length) ? f.thumbnail.trim() : null;
          rows.push({ type: 'faction', name: f.name || 'Faction', img: imageUrl || 'icons/svg/book.svg', linked: false, pageId: '', archivistId: f.id, canPush: false, canPull: true });
        }
      }
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      this.factionsRows = rows;
      this._tabLoaded.factions = true;
      this.render(false);
    } catch (e) { console.warn('Failed loading faction rows', e); }
    finally { this._loadingTabs.delete('factions'); }
  }

  async _loadLocationRows() {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listLocations(apiKey, worldId);
      const apiItems = Array.isArray(list?.data) ? list.data : [];
      const pages = this._getContainerPagesByName('Locations');
      const foundryByArchivistId = new Map();
      const orphans = [];
      for (const p of pages) {
        const meta = Utils.getPageArchivistMeta(p);
        if (meta?.id) foundryByArchivistId.set(String(meta.id), p); else orphans.push(p);
      }
      const rows = [];
      for (const l of apiItems) {
        const p = foundryByArchivistId.get(String(l.id));
        if (p) rows.push({ type: 'location', name: p.name, img: p?.parent?.img || 'icons/svg/house.svg', linked: true, pageId: p.id, archivistId: l.id, canPush: true, canPull: true });
      }
      for (const p of orphans) rows.push({ type: 'location', name: p.name, img: p?.parent?.img || 'icons/svg/house.svg', linked: false, pageId: p.id, archivistId: '', canPush: true, canPull: false });
      const linkedIds = new Set(rows.filter(r => r.linked).map(r => String(r.archivistId)));
      for (const l of apiItems) {
        if (!linkedIds.has(String(l.id))) {
          const imageUrl = (typeof l.image === 'string' && l.image.trim().length) ? l.image.trim() : (typeof l.cover_image === 'string' && l.cover_image.trim().length) ? l.cover_image.trim() : (typeof l.thumbnail === 'string' && l.thumbnail.trim().length) ? l.thumbnail.trim() : null;
          rows.push({ type: 'location', name: l.name || 'Location', img: imageUrl || 'icons/svg/house.svg', linked: false, pageId: '', archivistId: l.id, canPush: false, canPull: true });
        }
      }
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      this.locationsRows = rows;
      this._tabLoaded.locations = true;
      this.render(false);
    } catch (e) { console.warn('Failed loading location rows', e); }
    finally { this._loadingTabs.delete('locations'); }
  }

  async _loadItemRows() {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listItems(apiKey, worldId);
      const apiItems = Array.isArray(list?.data) ? list.data : [];
      const items = (game.items?.contents ?? game.items ?? []);
      const foundryByArchivistId = new Map();
      const orphans = [];
      for (const it of items) {
        const id = it.getFlag(CONFIG.MODULE_ID, 'archivistId');
        if (id) foundryByArchivistId.set(String(id), it); else orphans.push(it);
      }
      const rows = [];
      for (const it of apiItems) {
        const f = foundryByArchivistId.get(String(it.id));
        if (f) rows.push({ type: 'item', name: f.name, img: f.img || 'icons/svg/item-bag.svg', linked: true, itemId: f.id, archivistId: it.id, canPush: true, canPull: true });
      }
      for (const f of orphans) rows.push({ type: 'item', name: f.name, img: f.img || 'icons/svg/item-bag.svg', linked: false, itemId: f.id, archivistId: '', canPush: true, canPull: false });
      const linkedIds = new Set(rows.filter(r => r.linked).map(r => String(r.archivistId)));
      for (const it of apiItems) {
        if (!linkedIds.has(String(it.id))) {
          const imageUrl = (typeof it.image === 'string' && it.image.trim().length) ? it.image.trim() : (typeof it.thumbnail === 'string' && it.thumbnail.trim().length) ? it.thumbnail.trim() : null;
          rows.push({ type: 'item', name: it.name || 'Item', img: imageUrl || 'icons/svg/item-bag.svg', linked: false, itemId: '', archivistId: it.id, canPush: false, canPull: true });
        }
      }
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      this.itemsRows = rows;
      this._tabLoaded.items = true;
      this.render(false);
    } catch (e) { console.warn('Failed loading item rows', e); }
    finally { this._loadingTabs.delete('items'); }
  }

  async _loadRecapRows() {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listSessions(apiKey, worldId);
      const sessions = (Array.isArray(list?.data) ? list.data : []).filter(s => !!s.session_date);
      sessions.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
      const pages = this._getContainerPagesByName('Recaps');
      const foundryByArchivistId = new Map();
      const orphans = [];
      for (const p of pages) {
        const meta = Utils.getPageArchivistMeta(p);
        if (meta?.id) foundryByArchivistId.set(String(meta.id), p); else orphans.push(p);
      }
      const rows = [];
      for (const s of sessions) {
        const p = foundryByArchivistId.get(String(s.id));
        if (p) rows.push({ type: 'recap', name: p.name, img: p?.parent?.img || '', linked: true, pageId: p.id, archivistId: s.id, canPush: true, canPull: true, sessionId: s.id });
      }
      for (const p of orphans) rows.push({ type: 'recap', name: p.name, img: p?.parent?.img || '', linked: false, pageId: p.id, archivistId: '', canPush: false, canPull: false });
      const linkedIds = new Set(rows.filter(r => r.linked).map(r => String(r.archivistId)));
      for (const s of sessions) {
        if (!linkedIds.has(String(s.id))) rows.push({ type: 'recap', name: s.title || 'Session', img: '', linked: false, pageId: '', archivistId: s.id, canPush: false, canPull: true, sessionId: s.id });
      }
      this.recapsRows = rows;
      this._tabLoaded.recaps = true;
      this.render(false);
    } catch (e) { console.warn('Failed loading recap rows', e); }
    finally { this._loadingTabs.delete('recaps'); }
  }

  _flattenEntityPaths(obj, prefix = '$', depth = 0) {
    const entries = [];
    if (depth > 3) return entries;
    if (obj == null) return entries;
    if (Array.isArray(obj)) {
      // Surface array as joined string where possible
      const str = obj.map(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? v : '').filter(Boolean).join(', ');
      if (str) entries.push({ path: prefix, value: str });
      return entries;
    }
    if (typeof obj !== 'object') {
      entries.push({ path: prefix, value: obj });
      return entries;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = `${prefix}.${k}`;
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        entries.push({ path: p, value: v });
      } else if (Array.isArray(v)) {
        const sub = this._flattenEntityPaths(v, p, depth + 1);
        entries.push(...sub);
      } else if (typeof v === 'object') {
        const sub = this._flattenEntityPaths(v, p, depth + 1);
        entries.push(...sub);
      }
    }
    return entries;
  }

  _buildPreviewData(sample) {
    const groups = { Actor: [], Journal: [], Scene: [], Item: [] };
    const optionsByUuid = {};
    const corrections = importerService.getCorrections();
    for (const r of sample) {
      const e = r.entity; const p = r.proposal || { targetType: 'Note', payload: {} };
      const uuid = e.sourcePath;
      const include = r.include !== false;
      // Field rows
      const fields = Object.entries(p.payload || {}).map(([key, value]) => ({ key, value: this._normalizeFieldValue(value) }));
      // Build options list per field using flattened entity
      const flattened = this._flattenEntityPaths(e, '$');
      const defaultOptions = flattened.slice(0, 24).map(({ path, value }) => ({ path, label: `${path} — ${String(value).slice(0, 40)}` }));
      const fieldOverrides = corrections?.byUuid?.[uuid]?.fieldPaths || {};
      const fieldRows = fields.map(f => {
        const selectedPath = fieldOverrides[f.key] || '';
        const options = [{ path: '', label: '(auto)' }, ...defaultOptions].map(o => ({ ...o, selected: o.path === selectedPath }));
        return { key: f.key, value: f.value, options };
      });
      // Derive UI type: split Character into PC/NPC when labels reveal it or correction exists
      let uiType = p.targetType || 'Note';
      const corrected = corrections?.byUuid?.[uuid];
      const labelSet = new Set((p.labels || []).map(l => String(l).toUpperCase()));
      const charType = (corrected?.characterType || (labelSet.has('PC') ? 'PC' : (labelSet.has('NPC') ? 'NPC' : '')));
      if (p.targetType === 'Character') uiType = charType ? `Character:${charType}` : 'Character:PC';
      const row = {
        uuid,
        name: e.name,
        subtype: e.subtype,
        kind: e.kind,
        include,
        targetType: p.targetType,
        uiType,
        // Clamp percent to [0,100]
        score: Math.max(0, Math.min(100, Math.round((Number(p.score || 0)) * 100))),
        fields: fieldRows
      };
      if (!groups[e.kind]) groups[e.kind] = [];
      groups[e.kind].push(row);
      optionsByUuid[uuid] = defaultOptions;
    }
    return { groups, optionsByUuid };
  }

  async _refreshImporterPreview() {
    const sampleSize = Math.max(1, this.importerPreview?.length || 30);
    const data = (this.importerViewMode === 'all') ? importerService.all() : importerService.sample(sampleSize);
    this.importerPreview = data;
    const built = this._buildPreviewData(data);
    this.importerGroups = built.groups;
    this.importerOptions = built.optionsByUuid;
    this.render();
  }

  async _onImporterSample(event) {
    event?.preventDefault?.();
    try {
      if (!settingsManager.isWorldSelected()) {
        ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
        return;
      }
      this.syncInProgress = true; this.render();
      this.importerViewMode = 'sample';
      const data = importerService.sample(30);
      this.importerPreview = data;
      const built = this._buildPreviewData(data);
      this.importerGroups = built.groups;
      this.importerOptions = built.optionsByUuid;
      this.importerSampleJson = '';
      this.render();
      ui.notifications.info('Data loaded');
    } catch (e) {
      console.error(e); ui.notifications.error(Utils.formatError(e));
    } finally {
      this.syncInProgress = false; this.render();
    }
  }

  async _onImporterRun(event) {
    event?.preventDefault?.();
    try {
      if (!settingsManager.isWorldSelected()) {
        ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
        return;
      }
      // Confirmation: importer will create new records and ignores existing IDs
      const confirmed = await Dialog.confirm({
        title: 'Create New Records in Archivist?',
        content: '<p>This importer will CREATE NEW records in Archivist and ignores any Archivist IDs found on Actors/Journals/Scenes. This may create duplicates if your world has been synced before.</p><p>If you want to update existing records instead, cancel and use the Sync tabs (Characters/Factions/Locations).</p>',
        yes: () => true,
        no: () => false
      });
      if (!confirmed) return;
      const root = this.element;
      const aEl = root.querySelector('.import-threshold-a');
      const bEl = root.querySelector('.import-threshold-b');
      const a = Number(aEl?.value ?? this.thresholdA);
      const b = Number(bEl?.value ?? this.thresholdB);
      this.thresholdA = isFinite(a) ? a : this.thresholdA;
      this.thresholdB = isFinite(b) ? b : this.thresholdB;
      this.syncInProgress = true; this.render();
      // Wire progress updates to UI
      const el = this.element;
      const bar = el.querySelector('.import-progress-bar');
      const text = el.querySelector('.import-progress-text');
      const updateUi = (p) => {
        if (!bar || !text || !p) return;
        const total = Math.max(1, Number(p.total || 0));
        const completed = Number(p.completed || 0);
        const percent = Math.round((completed / total) * 100);
        bar.max = 100; bar.value = isFinite(percent) ? percent : 0;
        text.textContent = `${completed} / ${total}  —  ${percent}%  (auto:${p.autoImported}|q:${p.queued}|drop:${p.dropped}|err:${p.errors})`;
      };
      const result = await importerService.runImport({
        thresholdA: this.thresholdA,
        thresholdB: this.thresholdB,
        onProgress: updateUi
      });
      updateUi({ ...result, completed: result.total });
      ui.notifications.info(`Import complete: ${result.autoImported} auto, ${result.queued} queued, ${result.dropped} dropped, ${result.errors} errors.`);
    } catch (e) {
      console.error(e); ui.notifications.error(Utils.formatError(e));
    } finally {
      this.syncInProgress = false; this.render();
    }
  }

  async _onMappingLoad(event) {
    event?.preventDefault?.();
    try {
      const area = this.element.querySelector('.mapping-override-json');
      if (!area) return;
      const val = area.value;
      // Validate JSON before saving
      JSON.parse(val);
      await settingsManager.setMappingOverride(val);
      ui.notifications.info('Mapping loaded');
    } catch (e) {
      ui.notifications.error('Invalid JSON');
    }
  }

  async _onMappingSave(event) {
    event?.preventDefault?.();
    try {
      const val = settingsManager.getMappingOverride() || '{}';
      const blob = new Blob([val], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `archivist-mapping-${game.world.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.notifications.info('Mapping saved to file');
    } catch (e) {
      ui.notifications.error('Failed to save mapping');
    }
  }

  /**
   * Handle open world setup button click
   * @param {Event} event - Click event
   */
  async _onOpenWorldSetup(event) {
    event?.preventDefault?.();

    try {
      const setupDialog = new WorldSetupDialog();
      await setupDialog.render(true);

      // Close the current sync options dialog to avoid confusion
      await this.close();

    } catch (error) {
      console.error('Error opening world setup dialog:', error);
      ui.notifications.error('Failed to open world setup dialog');
    }
  }

  async _onCreateWorld(event) {
    event?.preventDefault?.();
    try {
      if (!settingsManager.isApiConfigured()) {
        ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.apiNotConfigured'));
        return;
      }
      const title = game.world.title;
      const description = game.world.description || '';
      this.syncInProgress = true; this.render();
      const res = await archivistApi.createCampaign(settingsManager.getApiKey(), { title, description });
      if (!res.success) throw new Error(res.message || 'Create failed');
      // Prefer selecting using returned id immediately
      const createdId = res?.data?.id;
      const createdName = res?.data?.name || res?.data?.title || title || 'World';
      if (createdId) {
        await settingsManager.setSelectedWorld(createdId, createdName);
        await this._loadSelectedWorldData(createdId);
      }
      // Refresh worlds list for UI dropdown
      const worlds = await archivistApi.fetchCampaignsList(settingsManager.getApiKey());
      if (worlds.success) this.worlds = worlds.data || [];
      ui.notifications.info('Archivist campaign created');
      this.render();
    } catch (e) {
      console.error(e); ui.notifications.error(Utils.formatError(e));
    } finally {
      this.syncInProgress = false; this.render();
    }
  }

  /**
   * Handle sync worlds button click
   * @param {Event} event - Click event
   */
  async _onSyncWorlds(event) {
    event.preventDefault();

    if (!settingsManager.isApiConfigured()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.apiNotConfigured'));
      return;
    }

    this.isLoading = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const response = await archivistApi.fetchCampaignsList(apiKey);

      if (response.success) {
        this.worlds = response.data || [];
        console.log('Worlds loaded:', this.worlds);
        // Validate currently selected world still exists
        const selectedId = settingsManager.getSelectedWorldId();
        if (selectedId && !this.worlds.find(w => w.id === selectedId)) {
          await settingsManager.setSelectedWorld('', '');
          this.selectedWorldData = null;
        }
        if ((this.worlds?.length || 0) === 0) {
          await settingsManager.setSelectedWorld('', '');
          this.selectedWorldData = null;
          ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.noWorldsFound'));
        } else {
          ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldsLoaded'));
        }
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.fetchFailed'));
      }
    } catch (error) {
      console.error('Error fetching worlds:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.fetchFailed'));
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Handle world selection change
   * @param {Event} event - Change event
   */
  _onWorldSelectChange(event) {
    const worldId = event.target.value;
    const saveButton = event.target.closest('.tab').querySelector('.save-selection-btn');

    if (worldId && saveButton) {
      saveButton.disabled = false;
    } else if (saveButton) {
      saveButton.disabled = true;
    }
  }

  /**
   * Handle save world selection button click
   * @param {Event} event - Click event
   */
  async _onSaveWorldSelection(event) {
    event.preventDefault();

    const worldSelect = event.target.closest('.tab').querySelector('#world-select');
    const worldId = worldSelect.value;

    if (!worldId) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorld'));
      return;
    }

    const selectedWorld = this.worlds.find(w => w.id === worldId);
    if (!selectedWorld) {
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.worldNotFound'));
      return;
    }

    try {
      const displayName = selectedWorld?.name || selectedWorld?.title || 'World';
      await settingsManager.setSelectedWorld(worldId, displayName);

      // Load detailed data for the selected world
      await this._loadSelectedWorldData(worldId);

      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldSaved'));
      settingsManager.refreshSettingsUi();
      this.render();
    } catch (error) {
      console.error('Error saving world selection:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.saveFailed'));
    }
  }

  /**
   * Load detailed data for the selected world
   * @param {string} worldId - The world ID to load data for
   */
  async _loadSelectedWorldData(worldId) {
    console.log('_loadSelectedWorldData called with worldId:', worldId);
    console.log('isApiConfigured:', settingsManager.isApiConfigured());

    if (!worldId || !settingsManager.isApiConfigured()) {
      console.log('Skipping world data load: missing worldId or API not configured');
      this.selectedWorldData = null;
      return;
    }

    console.log('Loading world data for ID:', worldId);
    try {
      const apiKey = settingsManager.getApiKey();
      console.log('Using API key:', apiKey ? '***' + apiKey.slice(-4) : 'none');

      const response = await archivistApi.fetchCampaignDetails(apiKey, worldId);
      console.log('API response:', response);

      if (response.success) {
        this.selectedWorldData = response.data;
        console.log('Selected world data loaded successfully:', this.selectedWorldData);
        Utils.log('Selected world data loaded:', this.selectedWorldData);
      } else {
        console.warn('Failed to load world details:', response.message);
        this.selectedWorldData = null;
      }
    } catch (error) {
      console.error('Error loading world details:', error);
      this.selectedWorldData = null;
    }
  }

  /**
   * Handle sync title button click
   * @param {Event} event - Click event
   */
  async _onSyncTitle(event) {
    event.preventDefault();

    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const titleData = {
        title: game.world.title,
        description: game.world.description || ''
      };

      const response = await archivistApi.syncCampaignTitle(apiKey, worldId, titleData);

      if (response.success) {
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.titleSynced'));
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
      }
    } catch (error) {
      console.error('Error syncing title:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle sync to Archivist button click (Foundry -> Archivist)
   * @param {Event} event - Click event
   */
  async _onSyncToArchivist(event) {
    event.preventDefault();

    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    console.log('Sync to Archivist button clicked!');

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const titleData = {
        title: game.world.title,
        description: game.world.description || ''
      };

      console.log('Syncing to Archivist:', titleData);

      // TODO: Replace with actual API endpoint when provided
      const response = await archivistApi.syncCampaignTitle(apiKey, worldId, titleData);

      if (response.success) {
        ui.notifications.info('World data synced to Archivist successfully');
        // Reload the world data to show updated information
        await this._loadSelectedWorldData(worldId);
        this.render();
      } else {
        ui.notifications.error(response.message || game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
      }
    } catch (error) {
      console.error('Error syncing to Archivist:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle sync from Archivist button click (Archivist -> Foundry)
   * @param {Event} event - Click event
   */
  async _onSyncFromArchivist(event) {
    event.preventDefault();

    if (!settingsManager.isWorldSelected() || !this.selectedWorldData) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    console.log('Sync from Archivist button clicked!');

    // Show confirmation dialog before overwriting Foundry data
    const confirmed = await Dialog.confirm({
      title: 'Confirm Sync from Archivist',
      content: '<p>This will overwrite the current Foundry world title and description with data from Archivist. Are you sure?</p>',
      yes: () => true,
      no: () => false
    });

    if (!confirmed) {
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      // TODO: Replace with actual API endpoint when provided
      // For now, we'll simulate updating the world data
      console.log('Would sync from Archivist:', this.selectedWorldData);
      ui.notifications.info('Sync from Archivist functionality will be implemented with API endpoints');

      // This would be the structure when API is ready:
      // const apiKey = settingsManager.getApiKey();
      // const worldId = settingsManager.getSelectedWorldId();
      // const response = await archivistApi.syncFromArchivist(apiKey, worldId);

    } catch (error) {
      console.error('Error syncing from Archivist:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Handle map character button click
   * @param {Event} event - Click event
   */
  async _onMapCharacter(event) {
    event.preventDefault();

    const actorId = event.target.closest('.map-character-btn').dataset.actorId;
    const actor = game.actors.get(actorId);

    if (!actor) {
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.actorNotFound'));
      return;
    }

    // TODO: Implement character mapping dialog
    ui.notifications.info(`Mapping character: ${actor.name}`);
  }

  /**
   * Handle sync characters button click
   * @param {Event} event - Click event
   */
  async _onSyncCharacters(event) {
    event.preventDefault();

    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const actors = game.actors.filter(a => a.type === 'character' || a.type === 'npc');
      if (!actors?.length) {
        console.warn('[Archivist Sync] No Foundry actors (character/npc) found to sync.');
        ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.noActorsToSync') || 'No characters or NPCs found in this world to sync.');
        this.syncInProgress = false;
        this.render();
        return;
      }
      let createdCount = 0;
      let updatedCount = 0;
      for (const actor of actors) {
        const payload = Utils.toApiCharacterPayload(actor, worldId);
        const existingId = Utils.getActorArchivistId(actor);
        if (existingId) {
          await archivistApi.updateCharacter(apiKey, existingId, payload);
          updatedCount++;
        } else {
          const created = await archivistApi.createCharacter(apiKey, payload);
          if (created.success && created.data?.id) {
            await Utils.setActorArchivistId(actor, created.data.id);
            createdCount++;
          }
        }
      }
      ui.notifications.info(
        (game.i18n.localize('ARCHIVIST_SYNC.messages.charactersSynced') || 'Characters synchronized successfully')
        + ` (${createdCount} created, ${updatedCount} updated)`
      );
    } catch (error) {
      console.error('Error syncing characters:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Pull characters from Archivist -> Foundry
   */
  async _onPullCharacters(event) {
    event.preventDefault();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.render();

    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listCharacters(apiKey, worldId);
      console.debug('[Archivist Sync] listCharacters raw response:', list);
      if (!list.success) throw new Error(list.message || 'Failed to list characters');

      // Coerce API response into an array regardless of shape
      const apiItems =
        Array.isArray(list.data) ? list.data :
          Array.isArray(list?.data?.data) ? list.data.data :
            Array.isArray(list?.characters) ? list.characters :
              Array.isArray(list?.results) ? list.results : [];

      // Debug: log first API character and resolved description so we can verify payload
      if (apiItems.length) {
        const f = apiItems[0];
        const firstDescription = (f.description ?? f.combined_description ?? f.new_description ?? f.old_description ?? '').toString();
        console.debug('[Archivist Sync] First API character object:', f);
        console.debug('[Archivist Sync] First API character description (resolved):', firstDescription);
      }

      if (!apiItems.length) {
        ui.notifications.info('No characters found in Archivist for this world (check approval filters and world ID).');
      }

      console.log(`Archivist characters to pull: ${apiItems.length}`);

      const existing = new Map();
      const actorCollection = (game.actors?.contents ?? game.actors ?? []);
      for (const a of actorCollection) {
        const id = a.getFlag(CONFIG.MODULE_ID, 'archivistId');
        if (id) existing.set(id, a);
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const c of apiItems) {
        const name = c.character_name || c.name || 'Character';
        const type = (c.type === 'PC') ? 'character' : 'npc';
        // Prefer combined/new/old descriptions if present
        const bio =
          (c.description ?? c.combined_description ?? c.new_description ?? c.old_description ?? '').toString();
        // Remote portrait image URL if provided
        const imageUrl = (typeof c.image === 'string' && c.image.trim().length) ? c.image.trim() : null;
        const existingActor = existing.get(c.id);
        if (existingActor) {
          try {
            const updateDataBase = { name };
            if (imageUrl) updateDataBase.img = imageUrl;
            await existingActor.update(updateDataBase);
            if (imageUrl) {
              try {
                await existingActor.update({ "prototypeToken.texture.src": imageUrl });
              } catch (et) {
                // Ignore token texture failure; portrait already set
              }
            }
            if (bio) { await writeBestBiography(existingActor, Utils.markdownToStoredHtml(bio)); }
            updatedCount++;
          } catch (e) {
            console.warn('Failed to update actor name', e);
          }
        } else {
          let created;
          try {
            const createData = { name, type };
            if (imageUrl) createData.img = imageUrl;
            created = await Actor.create(createData);
          } catch (e) {
            // Fallback to npc if the system doesn't have "character"
            const createData = { name, type: 'npc' };
            if (imageUrl) createData.img = imageUrl;
            created = await Actor.create(createData);
          }
          if (created) {
            createdCount++;
            await Utils.setActorArchivistId(created, c.id);
            if (imageUrl) {
              try {
                await created.update({ "prototypeToken.texture.src": imageUrl });
              } catch (ct) {
                // ignore
              }
            }
            if (bio) { await writeBestBiography(created, Utils.markdownToStoredHtml(bio)); }
          }
        }
      }

      ui.notifications.info(
        game.i18n.localize('ARCHIVIST_SYNC.messages.charactersPulled') + ` (${createdCount} created, ${updatedCount} updated)`
      );
    } catch (error) {
      console.error('Error pulling characters:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onPushFactions(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const res = await importerService.pushFiltered({ kinds: ['Journal'], targetType: 'Faction', folderMatch: 'faction|org|guild' });
      ui.notifications.info((game.i18n.localize('ARCHIVIST_SYNC.messages.factionsSynced')) + ` (${res.count})`);
    } catch (error) {
      console.error('Error pushing factions:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onPullFactions(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listFactions(apiKey, worldId);
      // Coerce API response into an array regardless of envelope shape
      const apiItems =
        Array.isArray(list.data) ? list.data :
          Array.isArray(list?.data?.data) ? list.data.data :
            Array.isArray(list?.results) ? list.results : [];
      if (!list.success) throw new Error(list.message || 'Failed to list factions');
      console.debug('[Archivist Sync] listFactions resolved items:', apiItems.length);
      // Ensure single container JournalEntry at root
      const container = await Utils.ensureRootJournalContainer('Factions');

      // Sort API items alphabetically by name
      apiItems.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

      for (const f of apiItems) {
        const name = f.name || 'Faction';
        const description = (f.description ?? f.combined_description ?? f.new_description ?? f.old_description ?? '').toString();
        const imageUrl = (typeof f.image === 'string' && f.image.trim().length)
          ? f.image.trim()
          : (typeof f.cover_image === 'string' && f.cover_image.trim().length)
            ? f.cover_image.trim()
            : (typeof f.thumbnail === 'string' && f.thumbnail.trim().length)
              ? f.thumbnail.trim()
              : null;
        await Utils.upsertContainerTextPage(container, {
          name,
          html: description,
          imageUrl,
          flags: { archivistId: f.id, archivistType: 'faction', archivistWorldId: worldId }
        });
      }
      // Apply alphabetical ordering by page name
      await Utils.sortContainerPages(container, (a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.factionsPulled'));
    } catch (error) {
      console.error('Error pulling factions:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onPushLocations(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const res = await importerService.pushFiltered({ kinds: ['Journal', 'Scene'], targetType: 'Location', folderMatch: 'location|place|region' });
      ui.notifications.info((game.i18n.localize('ARCHIVIST_SYNC.messages.locationsSynced')) + ` (${res.count})`);
    } catch (error) {
      console.error('Error pushing locations:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onPullLocations(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listLocations(apiKey, worldId);
      // Coerce API response into an array regardless of envelope shape
      const apiItems =
        Array.isArray(list.data) ? list.data :
          Array.isArray(list?.data?.data) ? list.data.data :
            Array.isArray(list?.results) ? list.results : [];
      if (!list.success) throw new Error(list.message || 'Failed to list locations');
      console.debug('[Archivist Sync] listLocations resolved items:', apiItems.length);
      // Ensure single container JournalEntry at root
      const container = await Utils.ensureRootJournalContainer('Locations');

      // Sort API items alphabetically by name
      apiItems.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

      for (const l of apiItems) {
        const name = l.name || 'Location';
        const description = (l.description ?? l.combined_description ?? l.new_description ?? l.old_description ?? '').toString();
        const imageUrl = (typeof l.image === 'string' && l.image.trim().length)
          ? l.image.trim()
          : (typeof l.cover_image === 'string' && l.cover_image.trim().length)
            ? l.cover_image.trim()
            : (typeof l.thumbnail === 'string' && l.thumbnail.trim().length)
              ? l.thumbnail.trim()
              : null;
        await Utils.upsertContainerTextPage(container, {
          name,
          html: description,
          imageUrl,
          flags: { archivistId: l.id, archivistType: 'location', archivistWorldId: worldId }
        });
      }
      // Apply alphabetical ordering by page name
      await Utils.sortContainerPages(container, (a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.locationsPulled'));
    } catch (error) {
      console.error('Error pulling locations:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onDeterministicSync(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }

    this.syncInProgress = true;
    this.resetSyncProgress();
    this.updateSyncProgress({ phase: 'processing' });

    try {
      const res = await importerService.pushDeterministic(this);

      // Final progress update
      this.updateSyncProgress({
        phase: 'complete',
        currentType: '',
        currentEntity: 'Sync complete!'
      });

      // Enhanced notification with success/failure breakdown
      if (res.failed === 0) {
        ui.notifications.info(`Successfully synced all ${res.count} entities using deterministic config`);
      } else if (res.count > 0) {
        ui.notifications.warn(`Synced ${res.count} entities, but ${res.failed} failed. Check console for details.`);
        console.log(`${CONFIG.MODULE_TITLE} | Sync Summary:`, {
          succeeded: res.count,
          failed: res.failed,
          total: res.total,
          failedEntities: res.failedEntities
        });
      } else {
        ui.notifications.error(`Sync failed: all ${res.failed} entities failed to sync. Check console for details.`);
        console.error(`${CONFIG.MODULE_TITLE} | All entities failed to sync:`, res.failedEntities);
      }
    } catch (e) {
      console.error(`${CONFIG.MODULE_TITLE} | Deterministic sync exception:`, e);
      ui.notifications.error(`Deterministic sync failed: ${e.message || 'Unknown error'}`);
      this.updateSyncProgress({ phase: 'idle' });
    } finally {
      this.syncInProgress = false;
      // Don't reset progress here - let user see final results
      this.render();
    }
  }

  _fillWizardFields(root, cfg) {
    // Set description path dropdowns
    const pcDescSelect = root.querySelector('.wizard-pc-desc');
    if (pcDescSelect) pcDescSelect.value = cfg?.actorMappings?.pc?.descriptionPath || '';

    const npcDescSelect = root.querySelector('.wizard-npc-desc');
    if (npcDescSelect) npcDescSelect.value = cfg?.actorMappings?.npc?.descriptionPath || '';

    // Set folder checkboxes for PCs
    const pcFolders = cfg?.includeRules?.filters?.actors?.includeFolders?.pcs || [];
    root.querySelectorAll('.wizard-pc-folder-checkbox').forEach(checkbox => {
      checkbox.checked = pcFolders.includes(checkbox.value);
    });

    // Set folder checkboxes for NPCs
    const npcFolders = cfg?.includeRules?.filters?.actors?.includeFolders?.npcs || [];
    root.querySelectorAll('.wizard-npc-folder-checkbox').forEach(checkbox => {
      checkbox.checked = npcFolders.includes(checkbox.value);
    });

    // Set items dropdown
    const itemsSelect = root.querySelector('.wizard-items-owned');
    if (itemsSelect) itemsSelect.value = cfg?.includeRules?.filters?.items?.includeActorOwnedFrom || 'pc';

    // Set item folder checkboxes
    const itemFolders = cfg?.includeRules?.filters?.items?.includeWorldItemFolders || [];
    root.querySelectorAll('.wizard-item-folder-checkbox').forEach(checkbox => {
      checkbox.checked = itemFolders.includes(checkbox.value);
    });

    // Set faction folder checkboxes
    const factionFolders = cfg?.includeRules?.filters?.factions?.journalFolders || [];
    root.querySelectorAll('.wizard-faction-folder-checkbox').forEach(checkbox => {
      checkbox.checked = factionFolders.includes(checkbox.value);
    });
  }

  _readWizardFields(root, cfg) {
    const next = duplicate(cfg || {});
    next.actorMappings = next.actorMappings || { pc: {}, npc: {} };
    next.includeRules = next.includeRules || { filters: { actors: { includeFolders: {} }, items: {}, factions: {} }, sources: {} };

    // Read description paths from dropdowns
    const pcDescPath = root.querySelector('.wizard-pc-desc')?.value?.trim() || '';
    const npcDescPath = root.querySelector('.wizard-npc-desc')?.value?.trim() || '';
    next.actorMappings.pc.descriptionPath = pcDescPath || next.actorMappings.pc.descriptionPath;
    next.actorMappings.npc.descriptionPath = npcDescPath || next.actorMappings.npc.descriptionPath;

    // Read folder selections from checkboxes
    const pcFolders = Array.from(root.querySelectorAll('.wizard-pc-folder-checkbox:checked'))
      .map(cb => cb.value).filter(Boolean);
    const npcFolders = Array.from(root.querySelectorAll('.wizard-npc-folder-checkbox:checked'))
      .map(cb => cb.value).filter(Boolean);

    next.includeRules.filters.actors.includeFolders.pcs = pcFolders;
    next.includeRules.filters.actors.includeFolders.npcs = npcFolders;

    // Read items dropdown
    const owned = root.querySelector('.wizard-items-owned')?.value?.trim() || 'pc';
    next.includeRules.filters.items.includeActorOwnedFrom = owned;

    // Read item folders from checkboxes
    const itemFolders = Array.from(root.querySelectorAll('.wizard-item-folder-checkbox:checked'))
      .map(cb => cb.value).filter(Boolean);
    next.includeRules.filters.items.includeWorldItemFolders = itemFolders;

    // Read faction folders from checkboxes
    const factionFolders = Array.from(root.querySelectorAll('.wizard-faction-folder-checkbox:checked'))
      .map(cb => cb.value).filter(Boolean);
    next.includeRules.filters.factions.journalFolders = factionFolders;

    return next;
  }

  async _onWizardLoad(event) {
    event?.preventDefault?.();
    const cfg = settingsManager.getImportConfig();
    this._fillWizardFields(this.element, cfg);
    ui.notifications.info('Loaded mapping config');
  }

  async _onWizardSave(event) {
    event?.preventDefault?.();
    const current = settingsManager.getImportConfig();
    const next = this._readWizardFields(this.element, current);
    await settingsManager.setImportConfig(next);
    ui.notifications.info('Saved mapping config');
  }

  async _onWizardTest(event) {
    event?.preventDefault?.();
    const cfg = this._readWizardFields(this.element, settingsManager.getImportConfig());
    // Simple test: read the first PC actor's description using configured path and show preview
    const firstPc = (game.actors?.contents ?? game.actors ?? []).find(a => a.type === 'character');
    if (!firstPc) return ui.notifications.warn('No PC actors found to test');
    const path = cfg?.actorMappings?.pc?.descriptionPath;
    const value = path ? path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), firstPc) : undefined;
    const preview = typeof value === 'string' ? value.slice(0, 200) : JSON.stringify(value)?.slice(0, 200);
    ui.notifications.info(`PC description preview: ${preview || '(empty)'}`);
  }

  async _onValidateApiKey(event) {
    event?.preventDefault?.();
    try {
      const root = this.element[0] || document;
      const input = root.querySelector('#api-key-input');
      const newKey = input?.value?.trim();
      if (!newKey) {
        ui.notifications.warn('Enter an API key to validate.');
        return;
      }
      const currentWorldId = settingsManager.getSelectedWorldId();
      if (!currentWorldId) {
        ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
        return;
      }
      const res = await archivistApi.fetchCampaignDetails(newKey, currentWorldId);
      const errEl = root.querySelector('.api-key-error');
      if (res?.success) {
        await settingsManager.setSetting('apiKey', newKey);
        errEl && (errEl.style.display = 'none');
        ui.notifications.info('API key validated and saved.');
        this.render();
      } else {
        // 404 means selected campaign not found under this key
        errEl && (errEl.style.display = 'block');
        if (errEl) errEl.textContent = 'Campaign not found for this key. Enter a different key or run setup again.';
        ui.notifications.error('Campaign not found. Enter a different key or run setup again.');
      }
    } catch (e) {
      console.error('API key validation failed:', e);
      ui.notifications.error('Validation failed. Check key and try again.');
    }
  }

  _fillConfigForm(root, cfg) {
    try {
      // PC mappings
      root.querySelector('.cfg-pc-name')?.setAttribute('value', cfg?.actorMappings?.pc?.namePath || '');
      root.querySelector('.cfg-pc-img')?.setAttribute('value', cfg?.actorMappings?.pc?.imagePath || '');
      root.querySelector('.cfg-pc-desc')?.setAttribute('value', cfg?.actorMappings?.pc?.descriptionPath || '');

      // NPC mappings
      root.querySelector('.cfg-npc-name')?.setAttribute('value', cfg?.actorMappings?.npc?.namePath || '');
      root.querySelector('.cfg-npc-img')?.setAttribute('value', cfg?.actorMappings?.npc?.imagePath || '');
      root.querySelector('.cfg-npc-desc')?.setAttribute('value', cfg?.actorMappings?.npc?.descriptionPath || '');

      // Item mappings
      root.querySelector('.cfg-item-name')?.setAttribute('value', cfg?.itemMappings?.namePath || '');
      root.querySelector('.cfg-item-img')?.setAttribute('value', cfg?.itemMappings?.imagePath || '');
      root.querySelector('.cfg-item-desc')?.setAttribute('value', cfg?.itemMappings?.descriptionPath || '');

      // Destinations
      root.querySelector('.cfg-dest-pc')?.setAttribute('value', cfg?.destinations?.pc || '');
      root.querySelector('.cfg-dest-npc')?.setAttribute('value', cfg?.destinations?.npc || '');
      root.querySelector('.cfg-dest-item')?.setAttribute('value', cfg?.destinations?.item || '');
    } catch (_) { }
  }

  async _onLoadConfig(event) {
    event?.preventDefault?.();
    const root = this.element[0] || document;
    const cfg = settingsManager.getImportConfig();
    this._ensureConfigDestinations(cfg);
    this._fillConfigForm(root, cfg);
    ui.notifications.info('Loaded current configuration.');
  }

  /**
   * Get system presets for common game systems
   */
  _getSystemPresets() {
    return {
      dnd5e: {
        name: "D&D 5e",
        actorMappings: {
          pc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.details.biography.value"
          },
          npc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.details.biography.public"
          }
        },
        itemMappings: {
          namePath: "name",
          imagePath: "img",
          descriptionPath: "system.description.value"
        }
      },
      pf2e: {
        name: "Pathfinder 2e",
        actorMappings: {
          pc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.details.biography.value"
          },
          npc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.details.publicNotes"
          }
        },
        itemMappings: {
          namePath: "name",
          imagePath: "img",
          descriptionPath: "system.description.value"
        }
      },
      coc7: {
        name: "Call of Cthulhu 7e",
        actorMappings: {
          pc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.biography.personal.description"
          },
          npc: {
            namePath: "name",
            imagePath: "img",
            descriptionPath: "system.biography.personal.description"
          }
        },
        itemMappings: {
          namePath: "name",
          imagePath: "img",
          descriptionPath: "system.description.value"
        }
      }
    };
  }

  /**
   * Validate preset paths against discovered properties. Throws if invalid.
   */
  _validatePresetOrThrow(presetKey) {
    const presets = this._getSystemPresets();
    const preset = presets[presetKey];
    if (!preset) throw new Error('Unknown preset');

    const actorProps = new Set((this._getActorStringProperties() || []).map(p => p.path));
    const itemProps = new Set((this._getItemStringProperties() || []).map(p => p.path));

    const testPaths = [
      preset.actorMappings?.pc?.namePath,
      preset.actorMappings?.pc?.imagePath,
      preset.actorMappings?.pc?.descriptionPath,
      preset.actorMappings?.npc?.namePath,
      preset.actorMappings?.npc?.imagePath,
      preset.actorMappings?.npc?.descriptionPath,
      preset.itemMappings?.namePath,
      preset.itemMappings?.imagePath,
      preset.itemMappings?.descriptionPath
    ].filter(Boolean);

    const exists = (p) => {
      if (!p) return false;
      if (p === 'name' || p === 'img') return true;
      return actorProps.has(p) || itemProps.has(p);
    };

    const missing = testPaths.filter(p => !exists(p));
    if (missing.length) {
      throw new Error(`Preset unavailable for this system. Missing properties: ${missing.join(', ')}`);
    }
  }

  /**
   * Apply a system preset to the configuration form
   */
  _applySystemPreset(presetKey) {
    const presets = this._getSystemPresets();
    const preset = presets[presetKey];

    if (!preset) return;

    const root = this.element[0] || document;

    // Apply PC mappings
    if (preset.actorMappings.pc) {
      const pcNameSelect = root.querySelector('.cfg-pc-name');
      const pcImgSelect = root.querySelector('.cfg-pc-img');
      const pcDescSelect = root.querySelector('.cfg-pc-desc');

      if (pcNameSelect) pcNameSelect.value = preset.actorMappings.pc.namePath || '';
      if (pcImgSelect) pcImgSelect.value = preset.actorMappings.pc.imagePath || '';
      if (pcDescSelect) pcDescSelect.value = preset.actorMappings.pc.descriptionPath || '';
    }

    // Apply NPC mappings
    if (preset.actorMappings.npc) {
      const npcNameSelect = root.querySelector('.cfg-npc-name');
      const npcImgSelect = root.querySelector('.cfg-npc-img');
      const npcDescSelect = root.querySelector('.cfg-npc-desc');

      if (npcNameSelect) npcNameSelect.value = preset.actorMappings.npc.namePath || '';
      if (npcImgSelect) npcImgSelect.value = preset.actorMappings.npc.imagePath || '';
      if (npcDescSelect) npcDescSelect.value = preset.actorMappings.npc.descriptionPath || '';
    }

    // Apply Item mappings
    if (preset.itemMappings) {
      const itemNameSelect = root.querySelector('.cfg-item-name');
      const itemImgSelect = root.querySelector('.cfg-item-img');
      const itemDescSelect = root.querySelector('.cfg-item-desc');

      if (itemNameSelect) itemNameSelect.value = preset.itemMappings.namePath || '';
      if (itemImgSelect) itemImgSelect.value = preset.itemMappings.imagePath || '';
      if (itemDescSelect) itemDescSelect.value = preset.itemMappings.descriptionPath || '';
    }

    // Destinations are not part of presets - users configure these separately

    ui.notifications.info(`Applied ${preset.name} preset configuration. Manual mapping fields are now hidden. Select "Custom Configuration" to show them.`);
  }

  /**
   * Generate and download a sample configuration file
   */
  async _onDownloadSampleConfig(event) {
    event?.preventDefault?.();

    // Generate sample configuration with schema and examples
    const sampleConfig = {
      "_schema_version": "1.0",
      "_description": "Archivist Sync Configuration File - Edit the paths below to match your game system's data structure",
      "_instructions": {
        "actorMappings": "Configure how PC and NPC data is mapped from Foundry actors",
        "itemMappings": "Configure how Item data is mapped from Foundry items",
        "destinations": "Configure where different entity types are synced to in Archivist"
      },
      "actorMappings": {
        "pc": {
          "namePath": "name",
          "imagePath": "img",
          "descriptionPath": "system.details.biography.value",
          "_examples": {
            "namePath": "name (actor name field)",
            "imagePath": "img (actor image field)",
            "descriptionPath": "system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)"
          }
        },
        "npc": {
          "namePath": "name",
          "imagePath": "img",
          "descriptionPath": "system.details.biography.value",
          "_examples": {
            "namePath": "name (actor name field)",
            "imagePath": "img (actor image field)",
            "descriptionPath": "system.details.biography.value (D&D 5e), system.biography (PF2e), system.description (other systems)"
          }
        }
      },
      "itemMappings": {
        "namePath": "name",
        "imagePath": "img",
        "descriptionPath": "system.description.value",
        "_examples": {
          "namePath": "name (item name field)",
          "imagePath": "img (item image field)",
          "descriptionPath": "system.description.value (D&D 5e), system.description (PF2e), system.description.value (other systems)"
        }
      },
      "destinations": {
        "pc": "pc",
        "npc": "npc",
        "item": "item",
        "location": "location",
        "faction": "faction",
        "_options": {
          "pc": ["pc", "npc"],
          "npc": ["npc", "pc"],
          "item": ["item", "note"],
          "location": ["location", "note"],
          "faction": ["faction", "note"]
        }
      }
    };

    // Open the sample config in a new tab
    window.open('https://raw.githubusercontent.com/camrun91/archivist-sync/main/archivist-sync-sample-config.json', '_blank');

    ui.notifications.info('Sample configuration opened in new tab.');
  }

  _ensureConfigDestinations(cfg) {
    cfg.destinations = cfg.destinations || { pc: '', npc: '', item: '' };
    cfg.actorMappings = cfg.actorMappings || { pc: {}, npc: {} };
    cfg.itemMappings = cfg.itemMappings || {};
  }

  async _onSaveConfig(event) {
    event?.preventDefault?.();
    const root = this.element[0] || document;
    const cfg = settingsManager.getImportConfig();
    this._ensureConfigDestinations(cfg);
    const val = (sel) => root.querySelector(sel)?.value?.trim() || '';

    // PC mappings
    cfg.actorMappings.pc.namePath = val('.cfg-pc-name');
    cfg.actorMappings.pc.imagePath = val('.cfg-pc-img');
    cfg.actorMappings.pc.descriptionPath = val('.cfg-pc-desc');

    // NPC mappings
    cfg.actorMappings.npc.namePath = val('.cfg-npc-name');
    cfg.actorMappings.npc.imagePath = val('.cfg-npc-img');
    cfg.actorMappings.npc.descriptionPath = val('.cfg-npc-desc');

    // Item mappings
    if (!cfg.itemMappings) cfg.itemMappings = {};
    cfg.itemMappings.namePath = val('.cfg-item-name');
    cfg.itemMappings.imagePath = val('.cfg-item-img');
    cfg.itemMappings.descriptionPath = val('.cfg-item-desc');

    // Destinations
    cfg.destinations.pc = val('.cfg-dest-pc');
    cfg.destinations.npc = val('.cfg-dest-npc');
    cfg.destinations.item = val('.cfg-dest-item');

    await settingsManager.setImportConfig(cfg);
    ui.notifications.info('Configuration saved.');
  }

  async _onPullItems(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listItems(apiKey, worldId);
      const apiItems = Array.isArray(list?.data) ? list.data : Array.isArray(list?.data?.data) ? list.data.data : [];
      // TODO: Implement write-back for items to Foundry (create/update)
      ui.notifications.info(`Fetched ${apiItems.length} items from Archivist.`);
    } catch (e) {
      console.error('Error pulling items:', e);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _onPushItems(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.warnings.selectWorldFirst'));
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const res = await importerService.pushFiltered({ kinds: ['Item'], targetType: 'Item' });
      ui.notifications.info(`Items synced: ${res.count}`);
    } catch (e) {
      console.error('Error pushing items:', e);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  async _pushSingleItem(itemId) {
    try {
      const item = game.items.get(itemId);
      if (!item) return ui.notifications.warn('Item not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const name = item.name;
      const rawImg = String(item?.img || '').trim();
      const image = rawImg.startsWith('https://') ? rawImg : undefined;
      const desc = String(item?.system?.description?.value || item?.system?.description || '');
      const payload = { name, description: toMarkdownIfHtml(desc), ...(image ? { image } : {}), campaign_id: worldId };
      const existingId = item.getFlag(CONFIG.MODULE_ID, 'archivistId');
      this.syncInProgress = true; this.render();
      if (existingId) await archivistApi.updateItem(apiKey, existingId, payload);
      else {
        const created = await archivistApi.createItem(apiKey, payload);
        if (created?.success && created?.data?.id) {
          await item.setFlag(CONFIG.MODULE_ID, 'archivistId', created.data.id);
          await item.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId);
        }
      }
      ui.notifications.info(`Synced item: ${name}`);
    } catch (e) {
      console.error(e); ui.notifications.error('Failed to sync item');
    } finally { this.syncInProgress = false; this.render(); }
  }

  async _pushSingleFactionPage(pageId) {
    try {
      let found = null;
      for (const j of (game.journal?.contents || [])) {
        const p = (j.pages?.contents || []).find(x => x.id === pageId);
        if (p) { found = p; break; }
      }
      const p = found;
      if (!p) return ui.notifications.warn('Page not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const meta = Utils.getPageArchivistMeta(p);
      const name = p.name;
      const html = Utils.extractPageHtml(p);
      const payload = { name, description: toMarkdownIfHtml(html), campaign_id: worldId };
      this.syncInProgress = true; this.render();
      if (meta?.id) await archivistApi.updateFaction(apiKey, meta.id, payload);
      else {
        const created = await archivistApi.createFaction(apiKey, payload);
        if (created?.success && created?.data?.id) await Utils.setPageArchivistMeta(p, created.data.id, 'faction', worldId);
      }
      ui.notifications.info(`Synced faction: ${name}`);
    } catch (e) { console.error(e); ui.notifications.error('Failed to sync faction page'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  async _pushSingleLocationPage(pageId) {
    try {
      let found = null;
      for (const j of (game.journal?.contents || [])) {
        const p = (j.pages?.contents || []).find(x => x.id === pageId);
        if (p) { found = p; break; }
      }
      const p = found;
      if (!p) return ui.notifications.warn('Page not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const meta = Utils.getPageArchivistMeta(p);
      const name = p.name;
      const html = Utils.extractPageHtml(p);
      const payload = { name, description: toMarkdownIfHtml(html), campaign_id: worldId };
      this.syncInProgress = true; this.render();
      if (meta?.id) await archivistApi.updateLocation(apiKey, meta.id, payload);
      else {
        const created = await archivistApi.createLocation(apiKey, payload);
        if (created?.success && created?.data?.id) await Utils.setPageArchivistMeta(p, created.data.id, 'location', worldId);
      }
      ui.notifications.info(`Synced location: ${name}`);
    } catch (e) { console.error(e); ui.notifications.error('Failed to sync location page'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  async _pushSingleRecapPage(pageId) {
    try {
      let found = null;
      for (const j of (game.journal?.contents || [])) {
        const p = (j.pages?.contents || []).find(x => x.id === pageId);
        if (p) { found = p; break; }
      }
      const p = found;
      if (!p) return ui.notifications.warn('Page not found');
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const meta = Utils.getPageArchivistMeta(p);
      if (!meta?.id) return ui.notifications.warn('Only linked recaps can be pushed.');
      const title = p.name;
      const summaryHtml = Utils.extractPageHtml(p);
      const payload = { title, summary: toMarkdownIfHtml(summaryHtml) };
      this.syncInProgress = true; this.render();
      const res = await archivistApi.updateSession(apiKey, meta.id, payload);
      if (!res?.success) throw new Error(res?.message || 'Failed');
      ui.notifications.info(`Recap updated: ${title}`);
    } catch (e) { console.error(e); ui.notifications.error('Failed to push recap'); }
    finally { this.syncInProgress = false; this.render(); }
  }

  async _pullSingleRecap(sessionId) {
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listSessions(apiKey, worldId);
      const s = (Array.isArray(list?.data) ? list.data : []).find(x => String(x.id) === String(sessionId));
      if (!s) return ui.notifications.warn('Session not found');
      const container = await Utils.ensureRootJournalContainer('Recaps');
      const page = await Utils.upsertContainerTextPage(container, {
        name: s.title || 'Session',
        html: String(s.summary || ''),
        imageUrl: null,
        flags: { archivistId: s.id, archivistType: 'recap', archivistWorldId: worldId }
      });
      try { await page.setFlag(CONFIG.MODULE_ID, 'sessionDate', String(s.session_date)); } catch (_) { }
      ui.notifications.info('Recap pulled');
    } catch (e) { console.error(e); ui.notifications.error('Failed to pull recap'); }
  }

  /**
   * Pull all recaps/sessions from Archivist
   */
  async _onPullRecaps(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn('Please select a world first');
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const list = await archivistApi.listSessions(apiKey, worldId);
      const sessions = Array.isArray(list?.data) ? list.data : [];
      const container = await Utils.ensureRootJournalContainer('Recaps');
      let count = 0;
      for (const s of sessions) {
        await Utils.upsertContainerTextPage(container, {
          name: s.title || 'Session',
          html: String(s.summary || ''),
          imageUrl: null,
          flags: { archivistId: s.id, archivistType: 'recap', archivistWorldId: worldId }
        });
        count++;
      }
      ui.notifications.info(`Pulled ${count} recap(s) from Archivist`);
      this._tabLoaded.recaps = false;
      await this._loadRecapRows();
    } catch (e) {
      console.error('Error pulling recaps:', e);
      ui.notifications.error('Failed to pull recaps');
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

  /**
   * Push all linked recaps to Archivist
   */
  async _onPushRecaps(event) {
    event?.preventDefault?.();
    if (!settingsManager.isWorldSelected()) {
      ui.notifications.warn('Please select a world first');
      return;
    }
    this.syncInProgress = true;
    this.render();
    try {
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const pages = this._getContainerPagesByName('Recaps');
      let count = 0;
      for (const p of pages) {
        const meta = Utils.getPageArchivistMeta(p);
        if (!meta?.id) continue; // Only push linked recaps
        const title = p.name;
        const summaryHtml = Utils.extractPageHtml(p);
        const payload = { title, summary: toMarkdownIfHtml(summaryHtml) };
        try {
          await archivistApi.updateSession(apiKey, meta.id, payload);
          count++;
        } catch (e) {
          console.warn(`Failed to push recap ${title}:`, e);
        }
      }
      ui.notifications.info(`Pushed ${count} recap(s) to Archivist`);
      this._tabLoaded.recaps = false;
      await this._loadRecapRows();
    } catch (e) {
      console.error('Error pushing recaps:', e);
      ui.notifications.error('Failed to push recaps');
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

}