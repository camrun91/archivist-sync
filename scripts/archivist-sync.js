/**
 * Archivist Sync Module for Foundry VTT v13
 * 
 * A simple module for fetching and selecting worlds from the Archivist API.
 */

// Module namespace
const ARCHIVIST_SYNC = {
  MODULE_ID: 'archivist-sync',
  MODULE_TITLE: 'Archivist Sync',
  API_BASE_URL: 'https://archivist-api-production.up.railway.app/v1'
};

/**
 * Initialize the module when Foundry VTT is ready
 */
Hooks.once('ready', async function() {
  console.log(`${ARCHIVIST_SYNC.MODULE_TITLE} | Module initialized`);
  
  // Register module settings
  registerSettings();
  
  // Add menu button
  addMenuButton();
});

/**
 * Register module settings
 */
function registerSettings() {
  // API Key setting
  game.settings.register(ARCHIVIST_SYNC.MODULE_ID, 'apiKey', {
    name: game.i18n.localize('ARCHIVIST_SYNC.Settings.ApiKey.Name'),
    hint: game.i18n.localize('ARCHIVIST_SYNC.Settings.ApiKey.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: '',
    onChange: value => {
      console.log(`${ARCHIVIST_SYNC.MODULE_TITLE} | API Key updated`);
    }
  });

  // Selected World ID setting
  game.settings.register(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldId', {
    name: game.i18n.localize('ARCHIVIST_SYNC.Settings.SelectedWorld.Name'),
    hint: game.i18n.localize('ARCHIVIST_SYNC.Settings.SelectedWorld.Hint'),
    scope: 'world',
    config: false, // Hidden from config UI, managed through dialog
    type: String,
    default: ''
  });

  // Selected World Name setting (for display)
  game.settings.register(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldName', {
    name: game.i18n.localize('ARCHIVIST_SYNC.Settings.SelectedWorldName.Name'),
    hint: game.i18n.localize('ARCHIVIST_SYNC.Settings.SelectedWorldName.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: 'None selected',
    onChange: value => {
      console.log(`${ARCHIVIST_SYNC.MODULE_TITLE} | Selected world: ${value}`);
    }
  });
}

/**
 * Add menu button to settings sidebar
 */
function addMenuButton() {
  game.settings.registerMenu(ARCHIVIST_SYNC.MODULE_ID, 'syncOptionsMenu', {
    name: game.i18n.localize('ARCHIVIST_SYNC.Menu.SyncOptions.Name'),
    label: game.i18n.localize('ARCHIVIST_SYNC.Menu.SyncOptions.Label'),
    hint: game.i18n.localize('ARCHIVIST_SYNC.Menu.SyncOptions.Hint'),
    icon: 'fas fa-sync-alt',
    type: SyncOptionsDialog,
    restricted: true
  });
}

/**
 * Dialog for comprehensive sync options
 */
class SyncOptionsDialog extends FormApplication {
  constructor() {
    super();
    this.worlds = [];
    this.actors = [];
    this.isLoading = false;
    this.syncInProgress = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'archivist-sync-options',
      title: game.i18n.localize('ARCHIVIST_SYNC.Dialog.SyncOptions.Title'),
      width: 700,
      height: 600,
      resizable: true,
      classes: ['archivist-sync-dialog'],
      template: null,
      tabs: [{navSelector: ".tabs", contentSelector: ".content", initial: "world"}]
    });
  }

  getData() {
    const apiKey = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'apiKey');
    const selectedWorldId = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldId');
    const selectedWorldName = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldName');
    
    // Get current world info
    const foundryWorld = {
      id: game.world.id,
      title: game.world.title,
      description: game.world.description || 'No description'
    };
    
    // Get actors for character mapping
    this.actors = game.actors.contents.filter(actor => actor.type === 'character' || actor.type === 'npc');
    
    return {
      apiKey: apiKey,
      hasApiKey: apiKey && apiKey.length > 0,
      worlds: this.worlds,
      selectedWorldId: selectedWorldId,
      selectedWorldName: selectedWorldName,
      hasWorlds: this.worlds.length > 0,
      isLoading: this.isLoading,
      syncInProgress: this.syncInProgress,
      foundryWorld: foundryWorld,
      actors: this.actors,
      hasActors: this.actors.length > 0
    };
  }

  async _renderInner(data) {
    const templateString = `
    <div class="archivist-sync-options">
      <nav class="tabs" data-group="primary-tabs">
        <a class="item" data-tab="world">
          <i class="fas fa-globe"></i> {{localize "ARCHIVIST_SYNC.Tabs.World"}}
        </a>
        <a class="item" data-tab="title">
          <i class="fas fa-edit"></i> {{localize "ARCHIVIST_SYNC.Tabs.Title"}}
        </a>
        <a class="item" data-tab="characters">
          <i class="fas fa-users"></i> {{localize "ARCHIVIST_SYNC.Tabs.Characters"}}
        </a>
      </nav>
      
      <div class="content">
        <!-- World Selection Tab -->
        <div class="tab" data-tab="world">
          <div class="form-group">
            <label>{{localize "ARCHIVIST_SYNC.Dialog.ApiStatus"}}</label>
            <div class="api-status">
              {{#if hasApiKey}}
                <span class="status-indicator connected">{{localize "ARCHIVIST_SYNC.Dialog.Connected"}}</span>
              {{else}}
                <span class="status-indicator disconnected">{{localize "ARCHIVIST_SYNC.Dialog.NotConfigured"}}</span>
              {{/if}}
            </div>
          </div>

          {{#if hasApiKey}}
            <div class="form-group">
              <button type="button" id="sync-worlds" {{#if isLoading}}disabled{{/if}}>
                {{#if isLoading}}
                  <i class="fas fa-spinner fa-spin"></i> {{localize "ARCHIVIST_SYNC.Dialog.Loading"}}
                {{else}}
                  <i class="fas fa-sync"></i> {{localize "ARCHIVIST_SYNC.Dialog.SyncWorlds"}}
                {{/if}}
              </button>
            </div>

            {{#if hasWorlds}}
              <div class="form-group">
                <label for="world-selector">{{localize "ARCHIVIST_SYNC.Dialog.SelectWorld"}}</label>
                <select id="world-selector" class="world-selector">
                  <option value="">{{localize "ARCHIVIST_SYNC.Dialog.SelectWorldOption"}}</option>
                  {{#each worlds}}
                    <option value="{{this.id}}" title="{{this.title}}" {{#if (eq this.id ../selectedWorldId)}}selected{{/if}}>
                      {{this.title}}
                    </option>
                  {{/each}}
                </select>
              </div>
              
              <div class="form-group">
                <button type="button" id="save-world-selection" class="save-button">
                  <i class="fas fa-save"></i> {{localize "ARCHIVIST_SYNC.Dialog.SaveSelection"}}
                </button>
              </div>
            {{/if}}

            {{#if selectedWorldName}}
              <div class="form-group">
                <label>{{localize "ARCHIVIST_SYNC.Dialog.CurrentSelection"}}</label>
                <div class="current-selection">
                  <span class="selected-world">{{selectedWorldName}}</span>
                  {{#if selectedWorldId}}
                    <span class="selected-world-id">(ID: {{selectedWorldId}})</span>
                  {{/if}}
                </div>
              </div>
            {{/if}}
          {{else}}
            <div class="form-group">
              <p class="warning">{{localize "ARCHIVIST_SYNC.Dialog.ConfigureApi"}}</p>
            </div>
          {{/if}}
        </div>

        <!-- Title Sync Tab -->
        <div class="tab" data-tab="title">
          <div class="form-group">
            <label>{{localize "ARCHIVIST_SYNC.Dialog.FoundryWorld"}}</label>
            <div class="world-info">
              <div class="world-title">{{foundryWorld.title}}</div>
              <div class="world-description">{{foundryWorld.description}}</div>
            </div>
          </div>

          {{#if hasApiKey}}
            {{#if selectedWorldId}}
              <div class="form-group">
                <label>{{localize "ARCHIVIST_SYNC.Dialog.SyncTarget"}}</label>
                <div class="sync-target">
                  <i class="fas fa-arrow-right"></i>
                  <span>{{selectedWorldName}}</span>
                </div>
              </div>

              <div class="form-group">
                <button type="button" id="sync-title" {{#if syncInProgress}}disabled{{/if}}>
                  {{#if syncInProgress}}
                    <i class="fas fa-spinner fa-spin"></i> {{localize "ARCHIVIST_SYNC.Dialog.SyncingTitle"}}
                  {{else}}
                    <i class="fas fa-sync-alt"></i> {{localize "ARCHIVIST_SYNC.Dialog.SyncTitle"}}
                  {{/if}}
                </button>
              </div>
            {{else}}
              <p class="warning">{{localize "ARCHIVIST_SYNC.Dialog.SelectWorldFirst"}}</p>
            {{/if}}
          {{else}}
            <p class="warning">{{localize "ARCHIVIST_SYNC.Dialog.ConfigureApi"}}</p>
          {{/if}}
        </div>

        <!-- Character Mapping Tab -->
        <div class="tab" data-tab="characters">
          {{#if hasApiKey}}
            {{#if selectedWorldId}}
              <div class="form-group">
                <label>{{localize "ARCHIVIST_SYNC.Dialog.FoundryActors"}}</label>
                <p class="hint">{{localize "ARCHIVIST_SYNC.Dialog.CharacterMappingHint"}}</p>
              </div>

              {{#if hasActors}}
                <div class="actors-list">
                  {{#each actors}}
                    <div class="actor-item">
                      <div class="actor-info">
                        <span class="actor-name">{{this.name}}</span>
                        <span class="actor-type">({{this.type}})</span>
                      </div>
                      <div class="actor-actions">
                        <button type="button" class="map-character" data-actor-id="{{this.id}}">
                          <i class="fas fa-link"></i> {{localize "ARCHIVIST_SYNC.Dialog.MapCharacter"}}
                        </button>
                      </div>
                    </div>
                  {{/each}}
                </div>

                <div class="form-group">
                  <button type="button" id="sync-characters" {{#if syncInProgress}}disabled{{/if}}>
                    {{#if syncInProgress}}
                      <i class="fas fa-spinner fa-spin"></i> {{localize "ARCHIVIST_SYNC.Dialog.SyncingCharacters"}}
                    {{else}}
                      <i class="fas fa-users"></i> {{localize "ARCHIVIST_SYNC.Dialog.SyncCharacters"}}
                    {{/if}}
                  </button>
                </div>
              {{else}}
                <p class="info">{{localize "ARCHIVIST_SYNC.Dialog.NoActorsFound"}}</p>
              {{/if}}
            {{else}}
              <p class="warning">{{localize "ARCHIVIST_SYNC.Dialog.SelectWorldFirst"}}</p>
            {{/if}}
          {{else}}
            <p class="warning">{{localize "ARCHIVIST_SYNC.Dialog.ConfigureApi"}}</p>
          {{/if}}
        </div>
      </div>
    </div>
    `;
    
    // Compile the template with Handlebars
    const template = Handlebars.compile(templateString);
    return $(template(data));
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Initialize tabs - set first tab as active
    this._initializeTabs(html);
    
    // Original world selection listeners
    html.find('#sync-worlds').click(this._onSyncWorlds.bind(this));
    html.find('#save-world-selection').click(this._onSaveWorldSelection.bind(this));
    html.find('#world-selector').change(this._onWorldSelectChange.bind(this));
    
    // New sync functionality listeners
    html.find('#sync-title').click(this._onSyncTitle.bind(this));
    html.find('#sync-characters').click(this._onSyncCharacters.bind(this));
    html.find('.map-character').click(this._onMapCharacter.bind(this));
    
    // Tab navigation
    this._activateTabListeners(html);
  }
  
  _initializeTabs(html) {
    // Remove any existing active classes
    html.find('.tabs .item').removeClass('active');
    html.find('.tab').removeClass('active');
    
    // Set first tab as active
    html.find('.tabs .item[data-tab="world"]').addClass('active');
    html.find('.tab[data-tab="world"]').addClass('active');
  }
  
  _activateTabListeners(html) {
    html.find('.tabs a.item').click(event => {
      event.preventDefault();
      const tab = event.currentTarget.dataset.tab;
      this._onChangeTab(event, tab, html);
    });
  }
  
  _onChangeTab(event, tab, html) {
    // Remove active class from all tabs and content
    html.find('.tabs .item').removeClass('active');
    html.find('.tab').removeClass('active');
    
    // Add active class to clicked tab and corresponding content
    $(event.currentTarget).addClass('active');
    html.find(`[data-tab="${tab}"]`).addClass('active');
  }

  async _onSyncWorlds(event) {
    event.preventDefault();
    
    const apiKey = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'apiKey');
    
    if (!apiKey) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.Warnings.MissingApiKey'));
      return;
    }

    this.isLoading = true;
    this.render();
    
    try {
      const worlds = await fetchWorldsList(apiKey);
      this.worlds = worlds;
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.Info.WorldsLoaded'));
    } catch (error) {
      console.error(`${ARCHIVIST_SYNC.MODULE_TITLE} | Fetch worlds error:`, error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.Errors.FetchWorldsFailed'));
      this.worlds = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  _onWorldSelectChange(event) {
    const selectedWorldId = event.target.value;
    const selectedWorld = this.worlds.find(world => world.id === selectedWorldId);
    
    // Update the button state
    const saveButton = this.element.find('#save-world-selection');
    if (selectedWorldId && selectedWorld) {
      saveButton.prop('disabled', false);
    } else {
      saveButton.prop('disabled', true);
    }
  }

  async _onSaveWorldSelection(event) {
    event.preventDefault();
    
    const selectedWorldId = this.element.find('#world-selector').val();
    const selectedWorld = this.worlds.find(world => world.id === selectedWorldId);
    
    if (!selectedWorldId || !selectedWorld) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.Warnings.NoWorldSelected'));
      return;
    }
    
    try {
      await game.settings.set(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldId', selectedWorldId);
      await game.settings.set(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldName', selectedWorld.title);
      
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.Info.WorldSelectionSaved').replace('{worldName}', selectedWorld.title));
      
      // Refresh the settings menu to show updated selection
      if (ui.settings && ui.settings.rendered) {
        ui.settings.render();
      }
      
      this.render();
    } catch (error) {
      console.error(`${ARCHIVIST_SYNC.MODULE_TITLE} | Save world selection error:`, error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.Errors.SaveWorldFailed'));
    }
  }
  
  async _onSyncTitle(event) {
    event.preventDefault();
    
    const apiKey = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'apiKey');
    const selectedWorldId = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldId');
    
    if (!apiKey || !selectedWorldId) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.Warnings.MissingConfig'));
      return;
    }

    this.syncInProgress = true;
    this.render();
    
    try {
      await syncWorldTitle(apiKey, selectedWorldId, game.world.title, game.world.description);
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.Info.TitleSynced'));
    } catch (error) {
      console.error(`${ARCHIVIST_SYNC.MODULE_TITLE} | Title sync error:`, error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.Errors.TitleSyncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }
  
  async _onSyncCharacters(event) {
    event.preventDefault();
    
    const apiKey = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'apiKey');
    const selectedWorldId = game.settings.get(ARCHIVIST_SYNC.MODULE_ID, 'selectedWorldId');
    
    if (!apiKey || !selectedWorldId) {
      ui.notifications.warn(game.i18n.localize('ARCHIVIST_SYNC.Warnings.MissingConfig'));
      return;
    }

    this.syncInProgress = true;
    this.render();
    
    try {
      const characterData = this.actors.map(actor => ({
        foundryId: actor.id,
        name: actor.name,
        type: actor.type,
        description: actor.system?.details?.biography?.value || '',
        level: actor.system?.details?.level || 1,
        race: actor.system?.details?.race || '',
        class: actor.system?.details?.class || ''
      }));
      
      await syncCharacters(apiKey, selectedWorldId, characterData);
      ui.notifications.info(game.i18n.localize('ARCHIVIST_SYNC.Info.CharactersSynced'));
    } catch (error) {
      console.error(`${ARCHIVIST_SYNC.MODULE_TITLE} | Character sync error:`, error);
      ui.notifications.error(game.i18n.localize('ARCHIVIST_SYNC.Errors.CharacterSyncFailed'));
    } finally {
      this.syncInProgress = false;
      this.render();
    }
  }
  
  _onMapCharacter(event) {
    event.preventDefault();
    
    const actorId = event.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    
    if (actor) {
      // Future implementation: Open character mapping dialog
      ui.notifications.info(`Character mapping for ${actor.name} - Coming soon!`);
    }
  }
}

/**
 * Fetch worlds list from the Archivist API
 */
async function fetchWorldsList(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  };
  
  const response = await fetch(`${ARCHIVIST_SYNC.API_BASE_URL}/worlds`, {
    method: 'GET',
    headers: headers
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Handle different possible response formats
  if (Array.isArray(data)) {
    return data;
  } else if (data.worlds && Array.isArray(data.worlds)) {
    return data.worlds;
  } else if (data.data && Array.isArray(data.data)) {
    return data.data;
  } else {
    throw new Error('Unexpected API response format');
  }
}

/**
 * Sync world title to Archivist API
 */
async function syncWorldTitle(apiKey, worldId, title, description) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  };
  
  const requestData = {
    title: title,
    description: description || ''
  };
  
  const response = await fetch(`${ARCHIVIST_SYNC.API_BASE_URL}/worlds/${worldId}/title`, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(requestData)
  });
  
  if (!response.ok) {
    throw new Error(`Title sync failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Sync characters to Archivist API
 */
async function syncCharacters(apiKey, worldId, characterData) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  };
  
  const requestData = {
    characters: characterData
  };
  
  const response = await fetch(`${ARCHIVIST_SYNC.API_BASE_URL}/worlds/${worldId}/characters`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestData)
  });
  
  if (!response.ok) {
    throw new Error(`Character sync failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Make functions available globally for debugging
window.ARCHIVIST_SYNC = {
  ...ARCHIVIST_SYNC,
  fetchWorldsList,
  syncWorldTitle,
  syncCharacters,
  SyncOptionsDialog
};