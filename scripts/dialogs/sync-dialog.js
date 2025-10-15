import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';
import { CONFIG } from '../modules/config.js';
import { Utils } from '../modules/utils.js';

/**
 * SyncDialog — Two‑phase reconciliation wizard
 * Phase 1: Diffs for linked sheets (text, image, links, deletions)
 * Phase 2: Unlinked Archivist docs with import options (and optional core Actor/Item/Scene creation)
 */
export class SyncDialog extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    constructor(options = {}) {
        super(options);
        this.isLoading = false;
        this.step = 1; // 1: Diffs, 2: Imports
        this.model = {
            diffs: [], // { type, id, name, journalId, changes: { name?, description?, image?, links? }, deleted?:boolean, selected:boolean }
            imports: [], // { type, id, name, image, description, selected:boolean, createCore:{actor?:boolean,item?:boolean,scene?:boolean} }
            stats: { diffs: 0, imports: 0 },
        };
    }

    static DEFAULT_OPTIONS = {
        id: 'archivist-sync-dialog',
        window: { title: 'Sync with Archivist', icon: 'fas fa-arrows-rotate', resizable: true },
        position: { width: 900, height: 700 },
        classes: ['archivist-sync-dialog', 'sync-dialog'],
        actions: {
            changeStep: SyncDialog.prototype._onChangeStep,
            selectAll: SyncDialog.prototype._onSelectAll,
            selectNone: SyncDialog.prototype._onSelectNone,
            toggleRow: SyncDialog.prototype._onToggleRow,
            toggleCore: SyncDialog.prototype._onToggleCreateCore,
            applySelected: SyncDialog.prototype._onApplySelected,
            refresh: SyncDialog.prototype._onRefresh,
        },
    };

    static PARTS = {
        form: { template: 'modules/archivist-sync/templates/sync-dialog.hbs' },
    };

    async _prepareContext() {
        // If not initialized, show loading and trigger background fetch
        if (!this._initialized) {
            // Trigger data load in background (don't await here)
            this._loadModel().then(() => {
                this._initialized = true;
                this.render({ force: true });
            });
            // Return loading state immediately
            return {
                isLoading: true,
                step: this.step,
                isStep1: this.step === 1,
                isStep2: this.step === 2,
                diffs: [],
                imports: [],
                stats: { diffs: 0, imports: 0 },
                isGM: game.user?.isGM,
            };
        }
        const ctx = {
            isLoading: this.isLoading,
            step: this.step,
            isStep1: this.step === 1,
            isStep2: this.step === 2,
            diffs: this.model.diffs,
            imports: this.model.imports,
            stats: this.model.stats,
            isGM: game.user?.isGM,
        };
        return ctx;
    }

    async _onChangeStep(event) {
        event.preventDefault();
        const btn = event?.target?.closest?.('[data-step]');
        if (!btn) return;
        this.step = Number(btn.dataset.step) || 1;
        await this.render();
    }

    async _onSelectAll(event) {
        event.preventDefault();
        const scope = event?.target?.closest?.('[data-scope]')?.dataset?.scope;
        if (!scope) return;
        if (scope === 'diffs') this.model.diffs.forEach(d => d.selected = true);
        if (scope === 'imports') this.model.imports.forEach(i => i.selected = true);
        await this.render();
    }

    async _onSelectNone(event) {
        event.preventDefault();
        const scope = event?.target?.closest?.('[data-scope]')?.dataset?.scope;
        if (!scope) return;
        if (scope === 'diffs') this.model.diffs.forEach(d => d.selected = false);
        if (scope === 'imports') this.model.imports.forEach(i => i.selected = false);
        await this.render();
    }

    async _onToggleRow(event) {
        const li = event?.target?.closest?.('li[data-id]');
        if (!li) return;
        const kind = li?.dataset?.kind;
        const id = String(li?.dataset?.id || '');
        if (kind === 'diff') {
            const row = this.model.diffs.find(x => String(x.id) === id);
            if (row) row.selected = !row.selected;
        } else if (kind === 'import') {
            const row = this.model.imports.find(x => String(x.id) === id);
            if (row) row.selected = !row.selected;
        }
        await this.render();
    }

    async _onToggleCreateCore(event) {
        const li = event?.target?.closest?.('li[data-id]');
        if (!li) return;
        const id = String(li.dataset.id || '');
        const field = event?.target?.dataset?.field;
        if (!field) return;
        const row = this.model.imports.find(x => String(x.id) === id);
        if (!row) return;
        // Only enable valid combos
        if (field === 'actor' && row.type !== 'Character') return;
        if (field === 'item' && row.type !== 'Item') return;
        if (field === 'scene' && row.type !== 'Location') return;
        row.createCore = row.createCore || { actor: false, item: false, scene: false };
        row.createCore[field] = !row.createCore[field];
        await this.render();
    }

    async _onRefresh(event) {
        event?.preventDefault?.();
        // Set loading state to show the spinner
        this.isLoading = true;
        await this.render();
        try {
            await this._loadModel(true);
        } finally {
            // Loading state will be set to false by _loadModel
            await this.render();
        }
    }

    async _onApplySelected(event) {
        event.preventDefault();
        const apiKey = settingsManager.getApiKey?.();
        const campaignId = settingsManager.getSelectedWorldId?.();
        if (!apiKey || !campaignId) {
            ui.notifications?.warn?.('Archivist world not configured.');
            return;
        }
        const selectedDiffs = this.model.diffs.filter(d => d.selected);
        const selectedImports = this.model.imports.filter(i => i.selected);

        // Suppress real-time sync during apply to prevent duplicate POSTs to Archivist
        try { settingsManager.suppressRealtimeSync?.(); } catch (_) { }
        console.log('[SyncDialog] Real-time sync suppressed during apply');

        try {
            // Apply diffs
            for (const d of selectedDiffs) {
                try { await this._applyDiff(d); } catch (e) { console.warn('[SyncDialog] applyDiff failed', e); }
            }

            // Apply imports
            for (const i of selectedImports) {
                try { await this._applyImport(i, campaignId, apiKey); } catch (e) { console.warn('[SyncDialog] applyImport failed', e); }
            }

            ui.notifications?.info?.('Archivist sync applied.');
            await this._loadModel(true);
            await this.render();
        } finally {
            // Resume real-time sync after apply
            try { settingsManager.resumeRealtimeSync?.(); } catch (_) { }
            console.log('[SyncDialog] Real-time sync resumed');
        }
    }

    // Build model: diffs and imports
    async _loadModel(force = false) {
        if (this.isLoading && !force) return;
        this.isLoading = true;
        try {
            const apiKey = settingsManager.getApiKey?.();
            const campaignId = settingsManager.getSelectedWorldId?.();
            if (!apiKey || !campaignId) {
                this.model = { diffs: [], imports: [], stats: { diffs: 0, imports: 0 } };
                return;
            }

            const [chars, items, locs, facs, sessions, links] = await Promise.all([
                archivistApi.listCharacters(apiKey, campaignId),
                archivistApi.listItems(apiKey, campaignId),
                archivistApi.listLocations(apiKey, campaignId),
                archivistApi.listFactions(apiKey, campaignId),
                archivistApi.listSessions(apiKey, campaignId),
                archivistApi.listLinks(apiKey, campaignId),
            ]);
            const A = {
                characters: (chars?.success ? chars.data : []) || [],
                items: (items?.success ? items.data : []) || [],
                locations: (locs?.success ? locs.data : []) || [],
                factions: (facs?.success ? facs.data : []) || [],
                sessions: (sessions?.success ? sessions.data : []) || [],
                links: (links?.success ? links.data : []) || [],
            };
            console.log('[SyncDialog] Fetched Archivist data:', {
                characters: A.characters.length,
                items: A.items.length,
                locations: A.locations.length,
                factions: A.factions.length,
                sessions: A.sessions.length,
                links: A.links.length,
            });
            const byId = {
                Character: new Map(A.characters.map(c => [String(c.id), c])),
                Item: new Map(A.items.map(i => [String(i.id), i])),
                Location: new Map(A.locations.map(l => [String(l.id), l])),
                Faction: new Map(A.factions.map(f => [String(f.id), f])),
                Session: new Map(A.sessions.map(s => [String(s.id), s])),
            };

            // Compute outgoing links (from_id => [{ id: to_id, type: to_type }])
            const outgoing = new Map();
            for (const L of A.links) {
                const from = String(L.from_id);
                const to = String(L.to_id);
                const ttype = String(L.to_type || '').trim();
                if (!outgoing.has(from)) outgoing.set(from, []);
                outgoing.get(from).push({ id: to, type: ttype });
            }

            // Phase 1: Diffs for linked journals
            const diffs = [];
            const jAll = game.journal?.contents || [];
            for (const j of jAll) {
                const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                const archId = f.archivistId ? String(f.archivistId) : null;
                const st = String(f.sheetType || '').toLowerCase();
                if (!archId) continue;
                const type = st === 'pc' || st === 'npc' || st === 'character' ? 'Character'
                    : st === 'item' ? 'Item'
                        : st === 'location' ? 'Location'
                            : st === 'faction' ? 'Faction'
                                : null;
                if (!type) continue;
                const arch = byId[type].get(archId) || null;
                if (!arch) {
                    diffs.push({ type, id: archId, name: j.name, journalId: j.id, deleted: true, selected: true, changes: {} });
                    continue;
                }
                const changes = {};
                // Name/title mapping per type
                const archName = type === 'Character' ? (arch.character_name || arch.name)
                    : arch.name || arch.title || '';
                if (String(j.name || '').trim() !== String(archName || '').trim()) {
                    changes.name = { from: j.name, to: archName };
                }
                // Description mapping: compare normalized plain text (Foundry HTML vs Archivist Markdown)
                try {
                    const textPage = (j?.pages?.contents || []).find(p => p.type === 'text') || null;
                    const stored = Utils.extractPageHtml(textPage) || '';
                    const foundryPlain = Utils.toMarkdownIfHtml(stored).trim();
                    const archMd = String((arch.description ?? arch.summary) || '').trim();
                    const archHtml = Utils.markdownToStoredHtml(archMd);
                    const archivistPlain = Utils.toMarkdownIfHtml(archHtml).trim();
                    if (archivistPlain && foundryPlain !== archivistPlain) {
                        changes.description = { from: stored, to: archMd };
                    }
                } catch (_) { /* ignore */ }
                // Image diff: compare against custom sheet's flag image, not journal.img
                const archImg = String(arch.image || '').trim();
                if (archImg) {
                    const jFlags = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                    const flagImg = String(jFlags.image || '').trim();
                    if (flagImg !== archImg) changes.image = { from: flagImg, to: archImg };
                }
                // Links diff: only outgoing links (from_id == this sheet's archivistId), ignore alias
                try {
                    const wantList = outgoing.get(archId) || [];
                    const wantIds = new Set(wantList.map(x => String(x.id)));
                    // Additions: API wants a link that isn't in our local refs (any bucket)
                    const localRefs = new Set();
                    const refs = (f.archivistRefs || {});
                    Object.values(refs).forEach(arr => { if (Array.isArray(arr)) for (const x of arr) localRefs.add(String(x)); });
                    const toAdd = wantList.filter(x => !localRefs.has(String(x.id)));

                    // Removals: only consider links that this sheet believes are outbound
                    const outbound = f.archivistOutbound || {};
                    const haveOutbound = new Set();
                    Object.values(outbound).forEach(arr => { if (Array.isArray(arr)) for (const x of arr) haveOutbound.add(String(x)); });
                    const toRemove = haveOutbound.size > 0 ? [...haveOutbound].filter(x => !wantIds.has(String(x))) : [];

                    if (toAdd.length || toRemove.length) changes.links = { add: toAdd, remove: toRemove };
                } catch (_) { /* ignore */ }
                if (Object.keys(changes).length > 0) {
                    diffs.push({ type, id: archId, name: archName || j.name, journalId: j.id, changes, selected: true });
                }
            }

            // Phase 2: Imports — Archivist docs without linked journals
            // Build a definitive set of linked Archivist IDs by scanning live world documents
            const linkedIds = new Set();
            const foundryJournalMap = new Map(); // archivistId => journal name (for debugging)
            for (const j of jAll) {
                // Primary: journal-level archivist flags
                const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                if (f.archivistId) {
                    linkedIds.add(String(f.archivistId));
                    foundryJournalMap.set(String(f.archivistId), j.name);
                }
                // Secondary: page-level flags (e.g., Recaps container pages)
                try {
                    const pages = j.pages?.contents || [];
                    for (const p of pages) {
                        const pid = p?.getFlag?.(CONFIG.MODULE_ID, 'archivistId');
                        if (pid) {
                            linkedIds.add(String(pid));
                            foundryJournalMap.set(String(pid), `${j.name} > ${p.name}`);
                        }
                    }
                } catch (_) { /* ignore */ }
            }
            console.log('[SyncDialog] Linked Archivist IDs found in Foundry:', {
                count: linkedIds.size,
                ids: Array.from(linkedIds).slice(0, 10),
                sample: Array.from(foundryJournalMap.entries()).slice(0, 5),
            });

            const imports = [];
            const skipped = []; // for logging
            const pushImport = (type, row) => {
                const id = String(row.id);
                if (linkedIds.has(id)) {
                    skipped.push({ type, id, name: row.character_name || row.name || row.title || 'Untitled' });
                    return;
                }
                imports.push({ type, id, name: row.character_name || row.name || row.title || 'Untitled', description: row.description || row.summary || '', image: row.image || '', selected: false, createCore: { actor: false, item: false, scene: false } });
            };
            for (const c of A.characters) pushImport('Character', c);
            for (const it of A.items) pushImport('Item', it);
            for (const l of A.locations) pushImport('Location', l);
            for (const f of A.factions) pushImport('Faction', f);

            console.log('[SyncDialog] Import candidates:', {
                imports: imports.length,
                skipped: skipped.length,
                importSample: imports.slice(0, 5).map(x => ({ type: x.type, id: x.id, name: x.name })),
                skippedSample: skipped.slice(0, 5),
            });

            this.model = { diffs, imports, stats: { diffs: diffs.length, imports: imports.length } };
        } finally {
            this.isLoading = false;
        }
    }

    async _applyDiff(d) {
        const j = game.journal?.get?.(d.journalId);
        if (!j) return;
        const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
        if (d.deleted) {
            await j.delete();
            return;
        }
        const changes = d.changes || {};
        if (changes.name) {
            await j.update({ name: changes.name.to });
        }
        if (changes.description) {
            await Utils.ensureJournalTextPage(j, String(changes.description.to || ''));
        }
        if (changes.image) {
            await Utils.ensureJournalLeadImage(j, String(changes.image.to || ''));
            // Also store on hub flag for sheet previews
            try { await j.setFlag('archivist-hub', 'image', String(changes.image.to || '')); } catch (_) { }
        }
        if (changes.links) {
            const buckets = {
                character: 'characters',
                item: 'items',
                location: 'locationsAssociative',
                faction: 'factions',
                entry: 'entries',
                journal: 'entries',
                journalentry: 'entries',
            };
            const next = { ...(f || {}) };
            next.archivistRefs = next.archivistRefs || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
            // Add
            for (const add of (changes.links.add || [])) {
                const bucket = buckets[String(add.type || '').toLowerCase()] || 'entries';
                const arr = Array.isArray(next.archivistRefs[bucket]) ? next.archivistRefs[bucket] : [];
                const sid = String(add.id);
                if (!arr.includes(sid)) arr.push(sid);
                next.archivistRefs[bucket] = arr;
            }
            // Remove only from outbound buckets; leave inbound/associative intact
            const removeIds = new Set((changes.links.remove || []).map(x => String(x)));
            const outboundKeys = ['characters', 'items', 'factions', 'locationsAssociative', 'entries'];
            for (const key of outboundKeys) {
                const arr = Array.isArray(next.archivistRefs[key]) ? next.archivistRefs[key] : [];
                next.archivistRefs[key] = arr.filter(x => !removeIds.has(String(x)));
            }
            await j.setFlag(CONFIG.MODULE_ID, 'archivist', next);
        }
    }

    async _applyImport(row, campaignId, apiKey) {
        const sheetType = row.type === 'Character' ? 'pc' // default to PC; users can switch later
            : row.type === 'Item' ? 'item'
                : row.type === 'Location' ? 'location'
                    : row.type === 'Faction' ? 'faction'
                        : null;
        if (!sheetType) return;
        const journal = await Utils.createCustomJournalForImport({
            name: row.name,
            html: String(row.description || ''),
            imageUrl: String(row.image || ''),
            sheetType,
            archivistId: row.id,
            worldId: campaignId,
        });
        if (!journal) return;
        // Optionally create core docs
        try {
            const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
            if (row.createCore?.actor && (sheetType === 'pc' || sheetType === 'npc')) {
                const actor = await Actor.create({ name: row.name, type: sheetType === 'pc' ? 'character' : 'npc' }, { render: false });
                if (actor?.id) flags.foundryRefs.actors = [actor.id];
            }
            if (row.createCore?.item && sheetType === 'item') {
                const itm = await Item.create({ name: row.name, type: 'loot' }, { render: false });
                if (itm?.id) flags.foundryRefs.items = [itm.id];
            }
            if (row.createCore?.scene && sheetType === 'location') {
                const sc = await Scene.create({ name: row.name }, { render: false });
                if (sc?.id) flags.foundryRefs.scenes = [sc.id];
            }
            await journal.setFlag(CONFIG.MODULE_ID, 'archivist', flags);

            // After creation, hydrate outgoing links from Archivist (from_id == row.id)
            try {
                if (apiKey && campaignId && row.id) {
                    const resp = await archivistApi.listLinksByFromId(apiKey, campaignId, String(row.id));
                    if (resp?.success) {
                        const keyForType = t => {
                            const s = String(t || '').toLowerCase();
                            if (s === 'character') return 'characters';
                            if (s === 'item') return 'items';
                            if (s === 'location') return 'locationsAssociative';
                            if (s === 'faction') return 'factions';
                            if (s === 'entry' || s === 'journal' || s === 'journalentry') return 'entries';
                            return 'entries';
                        };
                        const f2 = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                        f2.archivistRefs = f2.archivistRefs || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
                        f2.archivistOutbound = f2.archivistOutbound || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
                        for (const L of (resp.data || [])) {
                            const bucket = keyForType(L.to_type);
                            const id = String(L.to_id);
                            const arr = Array.isArray(f2.archivistRefs[bucket]) ? f2.archivistRefs[bucket] : [];
                            if (!arr.includes(id)) arr.push(id);
                            f2.archivistRefs[bucket] = arr;
                            const outArr = Array.isArray(f2.archivistOutbound[bucket]) ? f2.archivistOutbound[bucket] : [];
                            if (!outArr.includes(id)) outArr.push(id);
                            f2.archivistOutbound[bucket] = outArr;
                        }
                        await journal.setFlag(CONFIG.MODULE_ID, 'archivist', f2);
                    }
                }
            } catch (_) { }
        } catch (_) { }
    }
}

export const ArchivistSyncDialog = SyncDialog;


