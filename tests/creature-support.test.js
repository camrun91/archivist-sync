import assert from 'node:assert/strict';
import test from 'node:test';

import { ArchivistApiService } from '../scripts/services/archivist-api.js';

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

test('Creature API uses the Character endpoint and preserves its subtype', async () => {
  const api = new ArchivistApiService();
  const calls = [];
  api._request = async (_key, path, options) => {
    calls.push([path, options]);
    if (path.startsWith('/characters?')) return { data: [{ id: 'c1', type: 'Creature' }], pages: 1 };
    return { id: 'c1', type: 'Creature' };
  };
  const listed = await api.listCreatures('key', 'world-1');
  const created = await api.createCreature('key', { character_name: 'Owlbear', campaign_id: 'world-1' });
  assert.equal(listed.data[0].type, 'Creature');
  assert.equal(created.success, true);
  assert.match(calls[0][0], /character_type=Creature/);
  assert.equal(JSON.parse(calls[1][1].body).type, 'Creature');
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
