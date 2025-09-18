import { CONFIG } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { Utils } from '../modules/utils.js';

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
      width: 980,
      height: 760
    },
    classes: ['archivist-sync-dialog'],
    actions: {
      syncWorlds: this._onSyncWorlds,
      saveWorldSelection: this._onSaveWorldSelection,
      worldSelectChange: this._onWorldSelectChange,
      syncTitle: this._onSyncTitle,
      syncToArchivist: this._onSyncToArchivist,
      syncFromArchivist: this._onSyncFromArchivist,
      mapCharacter: this._onMapCharacter,
      syncCharacters: this._onSyncCharacters,
      pullCharacters: this._onPullCharacters,
      pushFactions: this._onPushFactions,
      pullFactions: this._onPullFactions,
      pushLocations: this._onPushLocations,
      pullLocations: this._onPullLocations
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
    const apiKey = settingsManager.getApiKey();
    const selectedWorldId = settingsManager.getSelectedWorldId();
    const selectedWorldName = settingsManager.getSelectedWorldName();
    const isApiConfigured = settingsManager.isApiConfigured();
    const isWorldSelected = settingsManager.isWorldSelected();

    return {
      isApiConfigured,
      isWorldSelected,
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
      foundryWorldTitle: game.world.title,
      foundryWorldDescription: game.world.description || ''
    };
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

    // Load factions and locations from journals
    const factionJournals = Utils.getFactionJournals();
    const locationJournals = Utils.getLocationJournals();
    this.factionJournals = factionJournals.map(j => ({ id: j.id, name: j.name }));
    this.locationJournals = locationJournals.map(j => ({ id: j.id, name: j.name }));

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

    html.querySelector('.sync-characters-btn')?.addEventListener('click', this._onSyncCharacters.bind(this));
    html.querySelector('.pull-characters-btn')?.addEventListener('click', this._onPullCharacters.bind(this));

    html.querySelector('.push-factions-btn')?.addEventListener('click', this._onPushFactions.bind(this));
    html.querySelector('.pull-factions-btn')?.addEventListener('click', this._onPullFactions.bind(this));

    html.querySelector('.push-locations-btn')?.addEventListener('click', this._onPushLocations.bind(this));
    html.querySelector('.pull-locations-btn')?.addEventListener('click', this._onPullLocations.bind(this));

    // Attach event listeners to dynamically generated character map buttons
    html.querySelectorAll('.map-character-btn').forEach(btn => {
      btn.addEventListener('click', this._onMapCharacter.bind(this));
    });
  }

  /**
   * Initialize tab functionality
   * @param {HTMLElement} html - The rendered HTML
   */
  _initializeTabs(html) {
    // Activate the first tab by default
    const firstTab = html.querySelector('.tabs .item[data-tab="world"]');
    const firstContent = html.querySelector('.tab[data-tab="world"]');

    if (firstTab) firstTab.classList.add('active');
    if (firstContent) firstContent.classList.add('active');

    // Tab click handlers
    html.querySelectorAll('.tabs .item').forEach(tab => {
      tab.addEventListener('click', (event) => {
        const tabName = event.currentTarget.dataset.tab;
        this._activateTab(html, tabName);
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
      const response = await archivistApi.fetchWorldsList(apiKey);

      if (response.success) {
        this.worlds = response.data || [];
        console.log('Worlds loaded:', this.worlds);
        ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.worldsLoaded'));
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
      await settingsManager.setSelectedWorld(worldId, selectedWorld.name);

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

      const response = await archivistApi.fetchWorldDetails(apiKey, worldId);
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

      const response = await archivistApi.syncWorldTitle(apiKey, worldId, titleData);

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
      const response = await archivistApi.syncWorldTitle(apiKey, worldId, titleData);

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
        const firstDescription = (f.description ?? f.combinedDescription ?? f.newDescription ?? f.oldDescription ?? '').toString();
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
        const name = c.characterName || c.name || 'Character';
        const type = (c.type === 'PC') ? 'character' : 'npc';
        // Prefer combined/new/old descriptions if present
        const bio =
          (c.description ?? c.combinedDescription ?? c.newDescription ?? c.oldDescription ?? '').toString();
        const existingActor = existing.get(c.id);
        if (existingActor) {
          try {
            await existingActor.update({ name });
            // Try to set biography on common dnd5e schemas
            if (bio) {
              const updateData = {};
              // dnd5e v5.1+ uses public/value fields
              foundry.utils.setProperty(updateData, "system.details.biography.public", bio);
              foundry.utils.setProperty(updateData, "system.details.biography.value", bio);
              try { await existingActor.update(updateData); }
              catch (e1) {
                try { await existingActor.update({ "system.details.biography": bio }); }
                catch (e2) {
                  try { await existingActor.update({ "system.biography": bio }); }
                  catch (e3) { /* swallow */ }
                }
              }
            }
            updatedCount++;
          } catch (e) {
            console.warn('Failed to update actor name', e);
          }
        } else {
          let created;
          try {
            created = await Actor.create({ name, type });
          } catch (e) {
            // Fallback to npc if the system doesn't have "character"
            created = await Actor.create({ name, type: 'npc' });
          }
          if (created) {
            createdCount++;
            await Utils.setActorArchivistId(created, c.id);
            // Best-effort biography import for common systems (e.g., dnd5e)
            if (bio) {
              const updateData = {};
              // dnd5e v5.1+ uses public/value fields
              foundry.utils.setProperty(updateData, "system.details.biography.public", bio);
              foundry.utils.setProperty(updateData, "system.details.biography.value", bio);
              try { await created.update(updateData); }
              catch (e1) {
                try { await created.update({ "system.details.biography": bio }); }
                catch (e2) {
                  try { await created.update({ "system.biography": bio }); }
                  catch (e3) { /* ignore */ }
                }
              }
            }
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
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const journals = Utils.getFactionJournals();
      for (const j of journals) {
        const meta = Utils.getJournalArchivistMeta(j);
        const payload = Utils.toApiFactionPayload(j, worldId);
        if (meta.id) {
          await archivistApi.updateFaction(apiKey, meta.id, payload);
        } else {
          const created = await archivistApi.createFaction(apiKey, payload);
          if (created.success && created.data?.id) {
            await Utils.setJournalArchivistMeta(j, created.data.id, 'faction');
          }
        }
      }
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.factionsSynced'));
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
      const folderId = await Utils.ensureJournalFolder('Factions');

      const existing = new Map();
      for (const j of (game.journal?.contents ?? game.journal ?? [])) {
        const id = j.getFlag(CONFIG.MODULE_ID, 'archivistId');
        const type = j.getFlag(CONFIG.MODULE_ID, 'archivistType');
        if (id && type === 'faction') existing.set(id, j);
      }

      for (const f of apiItems) {
        const name = f.name || 'Faction';
        const description = (f.description ?? f.combinedDescription ?? f.newDescription ?? f.oldDescription ?? '').toString();
        const journal = existing.get(f.id);
        if (journal) {
          await journal.update({ name, folder: folderId });
          await Utils.ensureJournalTextPage(journal, description);
        } else {
          const created = await JournalEntry.create({ name, folder: folderId });
          if (created) {
            await Utils.ensureJournalTextPage(created, description);
            await Utils.setJournalArchivistMeta(created, f.id, 'faction');
          }
        }
      }
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
      const apiKey = settingsManager.getApiKey();
      const worldId = settingsManager.getSelectedWorldId();
      const journals = Utils.getLocationJournals();
      for (const j of journals) {
        const meta = Utils.getJournalArchivistMeta(j);
        const payload = Utils.toApiLocationPayload(j, worldId);
        if (meta.id) {
          await archivistApi.updateLocation(apiKey, meta.id, payload);
        } else {
          const created = await archivistApi.createLocation(apiKey, payload);
          if (created.success && created.data?.id) {
            await Utils.setJournalArchivistMeta(j, created.data.id, 'location');
          }
        }
      }
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.locationsSynced'));
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
      const folderId = await Utils.ensureJournalFolder('Locations');

      const existing = new Map();
      for (const j of (game.journal?.contents ?? game.journal ?? [])) {
        const id = j.getFlag(CONFIG.MODULE_ID, 'archivistId');
        const type = j.getFlag(CONFIG.MODULE_ID, 'archivistType');
        if (id && type === 'location') existing.set(id, j);
      }

      for (const l of apiItems) {
        const name = l.name || 'Location';
        const description = (l.description ?? l.combinedDescription ?? l.newDescription ?? l.oldDescription ?? '').toString();
        const journal = existing.get(l.id);
        if (journal) {
          await journal.update({ name, folder: folderId });
          await Utils.ensureJournalTextPage(journal, description);
        } else {
          const created = await JournalEntry.create({ name, folder: folderId });
          if (created) {
            await Utils.ensureJournalTextPage(created, description);
            await Utils.setJournalArchivistMeta(created, l.id, 'location');
          }
        }
      }
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.messages.locationsPulled'));
    } catch (error) {
      console.error('Error pulling locations:', error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.errors.syncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }

}