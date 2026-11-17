import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => Base } },
};
globalThis.Hooks = { on: () => {} };
const { WorldSetupDialog } = await import('../scripts/dialogs/world-setup-dialog.js');
const { SyncDialog } = await import('../scripts/dialogs/sync-dialog.js');
const { Utils } = await import('../scripts/modules/utils.js');
const { settingsManager } = await import('../scripts/modules/settings-manager.js');
const { ReconcileService } = await import('../scripts/modules/reconcile/reconcile-service.js');
const { archivistApi } = await import('../scripts/services/archivist-api.js');
const { journalManager } = await import('../scripts/modules/journal-manager.js');

test('character subtypes normalize to one sheet type and label', () => {
  assert.equal(Utils.characterSheetType('Creature'), 'creature');
  assert.equal(Utils.characterSheetType('creature'), 'creature');
  assert.equal(Utils.characterSheetType('NPC'), 'npc');
  assert.equal(Utils.characterSheetType(''), 'pc');
  assert.equal(Utils.characterKindLabel('CREATURE'), 'Creature');
  assert.equal(Utils.characterKindLabel('npc'), 'NPC');
  assert.equal(Utils.characterKindLabel(undefined), 'PC');
});

test('World Setup keeps Creature and NPC matching separate', () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const creature = { id: 'creature-1', character_name: 'Owlbear', type: 'Creature' };
  const npc = { id: 'npc-1', character_name: 'Owlbear', type: 'NPC' };
  const actor = (id, typeFlag = '') => ({
    id, name: 'Owlbear', type: 'npc',
    getFlag: (_module, key) => key === 'archivistType' ? typeFlag : null,
  });
  const unflagged = build.call({}, { archivist: { characters: [creature] }, foundry: { actors: [actor('a1')] } });
  assert.equal(unflagged.characters.archivist[0].match, null);
  const flagged = build.call({}, { archivist: { characters: [creature, npc] }, foundry: { actors: [actor('a1', 'Creature'), actor('a2')] } });
  assert.equal(flagged.characters.archivist.find((c) => c.type === 'CREATURE').match, 'a1');
  assert.equal(flagged.characters.archivist.find((c) => c.type === 'NPC').match, 'a2');
});

test('World Setup retains linked PC Actors reclassified as Creatures', () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const actor = {
    id: 'a1', name: 'Owlbear', type: 'character',
    getFlag: (_module, key) => key === 'archivistId' ? 'creature-1' : key === 'archivistType' ? 'Creature' : null,
  };
  const result = build.call({}, {
    archivist: { characters: [{ id: 'creature-1', character_name: 'Owlbear', type: 'Creature' }] },
    foundry: { actors: [actor] },
  });
  assert.equal(result.characters.archivist[0].match, 'a1');
  assert.equal(result.characters.foundry[0].match, 'creature-1');
});

test('World Setup preserves explicit NPC classification on native character Actors', async () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const actor = {
    id: 'a1', name: 'Aria', type: 'character',
    getFlag: (_module, key) => key === 'archivistType' ? 'NPC' : null,
  };
  const model = build.call({}, { archivist: { characters: [{ id: 'npc-1', character_name: 'Aria', type: 'NPC' }] }, foundry: { actors: [actor] } });
  assert.equal(model.characters.archivist[0].match, 'a1');
  const dialog = {
    setupData: { reconcile: { characters: { archivist: [], foundry: [
      { ...model.characters.foundry[0], match: null, selected: true },
    ] } } },
    archivistCandidates: {},
    _prepareCreateFoundryChoices: async () => {},
    render: async () => {},
  };
  await WorldSetupDialog.prototype._onConfirmSelections.call(dialog);
  assert.equal(dialog.syncPlan.createInArchivist[0].kind, 'NPC');
  assert.equal(dialog.syncPlan.counts.create.npc, 1);
});

test('World Setup matches system-specific Actor types by name', () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const actor = (id, name, typeFlag = '') => ({
    id, name, type: 'hero',
    getFlag: (_module, key) => key === 'archivistType' ? typeFlag : null,
  });
  const result = build.call({}, {
    archivist: { characters: [
      { id: 'pc-1', character_name: 'Aria', type: 'PC' },
      { id: 'creature-1', character_name: 'Owlbear', type: 'Creature' },
    ] },
    foundry: { actors: [actor('a1', 'Aria'), actor('a2', 'Owlbear', 'Creature')] },
  });
  assert.equal(result.characters.archivist.find((c) => c.id === 'pc-1').match, 'a1');
  assert.equal(result.characters.archivist.find((c) => c.id === 'creature-1').match, 'a2');
});

test('World Setup exports explicitly classified Creatures and offers custom NPC types', async () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const adversary = { id: 'a1', name: 'Owlbear', type: 'adversary', getFlag: () => null };
  const model = build.call({}, { archivist: { characters: [] }, foundry: { actors: [adversary] } });
  assert.equal(model.characters.foundry[0].canChooseCreature, true);

  const dialog = {
    setupData: { reconcile: { characters: { archivist: [], foundry: [
      { id: 'a2', name: 'Ancient Owlbear', type: 'character', archivistType: 'Creature', selected: true, match: null },
    ] } } },
    archivistCandidates: {},
    _prepareCreateFoundryChoices: async () => {},
    render: async () => {},
  };
  await WorldSetupDialog.prototype._onConfirmSelections.call(dialog);
  assert.equal(dialog.syncPlan.createInArchivist[0].kind, 'CREATURE');
  assert.equal(dialog.syncPlan.counts.create.creature, 1);
  assert.equal(dialog.syncPlan.counts.create.pc, 0);
});

test('sync reclassifies an existing NPC sheet and its linked Actor as Creature', async () => {
  const updates = [];
  let flags = { sheetType: 'npc', archivistId: 'c1', foundryRefs: { actors: ['a1'] } };
  const journal = {
    getFlag: () => structuredClone(flags),
    update: async (data) => updates.push(data),
    setFlag: async (_module, _key, data) => { flags = structuredClone(data); },
  };
  const actorFlags = [];
  const actor = { setFlag: async (...args) => actorFlags.push(args) };
  const previousGame = globalThis.game;
  const previousDestinations = settingsManager.getJournalDestinations;
  const previousEnsureFolder = Utils.ensureJournalFolder;
  const previousLeadImage = Utils.ensureJournalLeadImage;
  globalThis.game = { journal: { get: () => journal }, actors: { get: () => actor } };
  settingsManager.getJournalDestinations = () => ({ creature: 'creature-folder' });
  Utils.ensureJournalFolder = async () => { throw new Error('unexpected folder creation'); };
  Utils.ensureJournalLeadImage = async () => {};
  try {
    await SyncDialog.prototype._applyDiff.call({}, {
      journalId: 'j1', changes: {
        sheetType: { from: 'npc', to: 'creature' },
        image: { from: '', to: 'https://example.com/owlbear.png' },
        links: { add: [{ id: 'item-1', type: 'Item' }], remove: [] },
      },
    });
    assert.equal(flags.sheetType, 'creature');
    assert.equal(flags.image, 'https://example.com/owlbear.png');
    assert.deepEqual(flags.archivistRefs.items, ['item-1']);
    assert.equal(updates[0]['flags.core.sheetClass'], 'archivist-sync.CreaturePageSheetV2');
    assert.equal(updates[0].folder, 'creature-folder');
    assert.deepEqual(actorFlags[0], ['archivist-sync', 'archivistType', 'Creature']);
  } finally {
    globalThis.game = previousGame;
    settingsManager.getJournalDestinations = previousDestinations;
    Utils.ensureJournalFolder = previousEnsureFolder;
    Utils.ensureJournalLeadImage = previousLeadImage;
  }
});


test('reconciliation honors character_type when aligning a Creature sheet', async () => {
  const originalKey = settingsManager.getApiKey;
  const originalWorld = settingsManager.getSelectedWorldId;
  const originalFolders = journalManager.ensureDefaultFolders;
  const originalFolderNames = journalManager.folderNames;
  const originalEnsureFolder = Utils.ensureJournalFolder;
  const originalGame = globalThis.game;
  const methods = ['listCharacters', 'listItems', 'listLocations', 'listFactions', 'listSessions', 'listLinks', 'listQuests', 'listJournals'];
  const originals = Object.fromEntries(methods.map((method) => [method, archivistApi[method]]));
  let flags = { archivistId: 'c1', sheetType: 'pc', foundryRefs: { actors: ['a1'] } };
  const updates = [];
  const actorFlags = [];
  const journal = {
    id: 'j1', name: 'Owlbear', folder: { id: 'old-folder' }, img: '',
    getFlag: () => structuredClone(flags),
    setFlag: async (_module, _key, value) => { flags = structuredClone(value); },
    update: async (value) => { updates.push(value); },
  };
  globalThis.game = {
    journal: { contents: [journal] },
    actors: { get: () => ({ setFlag: async (...args) => actorFlags.push(args) }) },
  };
  settingsManager.getApiKey = () => 'key';
  settingsManager.getSelectedWorldId = () => 'world-1';
  journalManager.ensureDefaultFolders = async () => {};
  journalManager.folderNames = { ...originalFolderNames, creature: 'Creatures' };
  Utils.ensureJournalFolder = async () => 'creature-folder';
  for (const method of methods) archivistApi[method] = async () => ({ success: true, data: method === 'listCharacters' ? [{ id: 'c1', character_name: 'Owlbear', character_type: 'Creature' }] : [] });
  try {
    const service = new ReconcileService();
    service._ensureRecapsContainer = async () => ({ pages: { contents: [] } });
    service._organizeFolders = async () => {};
    assert.equal(await service.runFull(), true);
    assert.equal(flags.sheetType, 'creature');
    assert.equal(updates[0]['flags.core.sheetClass'], 'archivist-sync.CreaturePageSheetV2');
    assert.deepEqual(actorFlags[0], ['archivist-sync', 'archivistType', 'Creature']);
  } finally {
    settingsManager.getApiKey = originalKey;
    settingsManager.getSelectedWorldId = originalWorld;
    journalManager.ensureDefaultFolders = originalFolders;
    journalManager.folderNames = originalFolderNames;
    Utils.ensureJournalFolder = originalEnsureFolder;
    globalThis.game = originalGame;
    for (const method of methods) archivistApi[method] = originals[method];
  }
});


test('replacing a linked Actor clears only the previous matching identity', async () => {
  const values = { archivistId: 'creature-1', archivistType: 'Creature' };
  const removed = [];
  const actor = {
    getFlag: (_module, key) => values[key],
    unsetFlag: async (_module, key) => { removed.push(key); delete values[key]; },
  };
  assert.equal(await Utils.clearActorArchivistLink(actor, 'other-creature'), false);
  assert.deepEqual(removed, []);
  assert.equal(await Utils.clearActorArchivistLink(actor, 'creature-1'), true);
  assert.deepEqual(removed, ['archivistId', 'archivistType']);
});

test('World Setup ignores a stale archivistId when name matching', () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const actor = {
    id: 'a1', name: 'Aria', type: 'npc',
    getFlag: (_module, key) => key === 'archivistId' ? 'deleted-record' : null,
  };
  const result = build.call({}, {
    archivist: { characters: [{ id: 'npc-1', character_name: 'Aria', type: 'NPC' }] },
    foundry: { actors: [actor] },
  });
  assert.equal(result.characters.archivist[0].match, 'a1');
  assert.equal(result.characters.archivist[0].typeLabel, 'NPC');
});

test('World Setup preselects PC for a flagged non-character Actor', () => {
  const build = WorldSetupDialog.prototype._buildReconciliationModel;
  const hero = {
    id: 'a1', name: 'Aria', type: 'hero',
    getFlag: (_module, key) => key === 'archivistType' ? 'PC' : null,
  };
  const model = build.call({}, { archivist: { characters: [] }, foundry: { actors: [hero] } });
  assert.equal(model.characters.foundry[0].canChooseCreature, true);
  assert.equal(model.characters.foundry[0].archivistType, 'PC');
});

test('reconciliation leaves legacy character sheets as PCs', async () => {
  const originalKey = settingsManager.getApiKey;
  const originalWorld = settingsManager.getSelectedWorldId;
  const originalFolders = journalManager.ensureDefaultFolders;
  const originalGame = globalThis.game;
  const methods = ['listCharacters', 'listItems', 'listLocations', 'listFactions', 'listSessions', 'listLinks', 'listQuests', 'listJournals'];
  const originals = Object.fromEntries(methods.map((method) => [method, archivistApi[method]]));
  const flags = { archivistId: 'c1', sheetType: 'character', foundryRefs: { actors: [] } };
  const updates = [];
  const journal = {
    id: 'j1', name: 'Aria', folder: { id: 'old-folder' }, img: '',
    getFlag: () => structuredClone(flags),
    setFlag: async () => { throw new Error('unexpected reclassification'); },
    update: async (value) => { updates.push(value); },
  };
  globalThis.game = { journal: { contents: [journal] }, actors: { get: () => null } };
  settingsManager.getApiKey = () => 'key';
  settingsManager.getSelectedWorldId = () => 'world-1';
  journalManager.ensureDefaultFolders = async () => {};
  for (const method of methods) archivistApi[method] = async () => ({ success: true, data: method === 'listCharacters' ? [{ id: 'c1', character_name: 'Aria', type: 'PC' }] : [] });
  try {
    const service = new ReconcileService();
    service._ensureRecapsContainer = async () => ({ pages: { contents: [] } });
    service._organizeFolders = async () => {};
    assert.equal(await service.runFull(), true);
    assert.equal(updates.some((u) => 'flags.core.sheetClass' in u), false);
  } finally {
    settingsManager.getApiKey = originalKey;
    settingsManager.getSelectedWorldId = originalWorld;
    journalManager.ensureDefaultFolders = originalFolders;
    globalThis.game = originalGame;
    for (const method of methods) archivistApi[method] = originals[method];
  }
});
