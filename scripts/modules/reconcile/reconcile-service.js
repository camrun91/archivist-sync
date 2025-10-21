import { settingsManager } from '../settings-manager.js';
import { archivistApi } from '../../services/archivist-api.js';
import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';
import { journalManager } from '../journal-manager.js';

/**
 * ReconcileService performs a one-shot alignment of Foundry sheets with Archivist data.
 * - Creates missing sheets for Characters/Items/Locations/Factions/Sessions(Recaps)
 * - Updates titles/descriptions when Archivist changed
 * - Reconciles Location.parent_id into sheet flags.parentLocationId
 * - Aligns link flags from Archivist Links table
 */
export class ReconcileService {
    async runFull() {
        const apiKey = settingsManager.getApiKey?.();
        const campaignId = settingsManager.getSelectedWorldId?.();
        if (!apiKey || !campaignId) throw new Error('Archivist not configured');

        // Fetch entities in parallel
        const [chars, items, locs, facs, sessions, links] = await Promise.all([
            archivistApi.listCharacters(apiKey, campaignId),
            archivistApi.listItems(apiKey, campaignId),
            archivistApi.listLocations(apiKey, campaignId),
            archivistApi.listFactions(apiKey, campaignId),
            archivistApi.listSessions(apiKey, campaignId),
            archivistApi.listLinks(apiKey, campaignId),
        ]);

        const characters = chars.success ? chars.data || [] : [];
        const itemsData = items.success ? items.data || [] : [];
        const locations = locs.success ? locs.data || [] : [];
        const factions = facs.success ? facs.data || [] : [];
        const sessionsData = sessions.success ? sessions.data || [] : [];
        const linksData = links.success ? links.data || [] : [];

        // Ensure default folders, index existing journals by archivistId
        try { await journalManager.ensureDefaultFolders(); } catch (_) { }
        const journals = game.journal?.contents || [];
        const byArchId = new Map();
        for (const j of journals) {
            const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            if (f.archivistId) byArchId.set(f.archivistId, j);
        }

        // Upsert helper for a sheet journal
        const ensureSheet = async (entity, sheetType) => {
            const id = entity.id;
            let j = byArchId.get(id);
            if (!j) {
                j = await journalManager.create({ name: entity.name || entity.title || sheetType, sheetType, archivistId: id, worldId: campaignId, text: '' });
                // If Archivist entity has an image, mirror it to the journal
                try {
                    const raw = String(entity?.image || '').trim();
                    if (raw) {
                        try { await j.update({ img: raw }, { render: false }); } catch (_) { }
                    }
                } catch (_) { }
                if (sheetType === 'location' && entity.parent_id) {
                    const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                    f.parentLocationId = entity.parent_id;
                    await j.setFlag(CONFIG.MODULE_ID, 'archivist', f);
                }
                byArchId.set(id, j);
            } else {
                // Existing journal: backfill or update image from Archivist if missing/different
                try {
                    const raw = String(entity?.image || '').trim();
                    if (raw && String(j.img || '').trim() !== raw) {
                        try { await j.update({ img: raw }, { render: false }); } catch (_) { }
                    }
                } catch (_) { }
            }
            // Title/description updates
            const desiredName = entity.name || entity.title || j.name;
            if (desiredName && desiredName !== j.name) await j.update({ name: desiredName });
            // For brevity we do not overwrite page body here to avoid clobbering GM edits.
            return j;
        };

        // Ensure sheets
        for (const c of characters) await ensureSheet(c, 'character');
        for (const it of itemsData) await ensureSheet(it, 'item');
        for (const l of locations) await ensureSheet(l, 'location');
        for (const f of factions) await ensureSheet(f, 'faction');

        // Recaps: ensure a single Recaps container exists with pages ordered by session_date
        try {
            const container = await this._ensureRecapsContainer();
            const pages = container.pages?.contents || [];
            const bySessionId = new Map(pages.map(p => [p.getFlag(CONFIG.MODULE_ID, 'archivistId'), p]));
            for (const s of sessionsData) {
                const title = s.title || 'Session';
                const html = String(s.summary || '').trim();
                const sessionDate = s.session_date || null;
                if (bySessionId.has(s.id)) {
                    const p = bySessionId.get(s.id);
                    if (p?.name !== title) await p.update({ name: title });
                    // Update sessionDate flag if changed
                    const currentDate = p.getFlag(CONFIG.MODULE_ID, 'sessionDate');
                    if (sessionDate && sessionDate !== currentDate) {
                        await p.setFlag(CONFIG.MODULE_ID, 'sessionDate', sessionDate);
                    }
                } else {
                    await container.createEmbeddedDocuments('JournalEntryPage', [
                        { name: title, type: 'text', text: { content: html, markdown: html, format: 2 } },
                    ]);
                    const last = (container.pages?.contents || []).at(-1);
                    if (last) {
                        await last.setFlag(CONFIG.MODULE_ID, 'archivistId', s.id);
                        if (sessionDate) await last.setFlag(CONFIG.MODULE_ID, 'sessionDate', sessionDate);
                    }
                }
            }
        } catch (_) { }

        // Reconcile Location parent ids
        for (const l of locations) {
            const j = byArchId.get(l.id);
            if (!j) continue;
            const flags = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            const remote = l.parent_id || null;
            if ((flags.parentLocationId || null) !== (remote || null)) {
                const next = { ...flags, parentLocationId: remote || null };
                await j.setFlag(CONFIG.MODULE_ID, 'archivist', next);
            }
        }

        // Align link flags using Links table
        const keyMap = { Character: 'characters', Item: 'items', Location: 'locationsAssociative', Faction: 'factions' };
        const ensureRef = async (journal, bucket, otherId) => {
            const f = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            f.archivistRefs = f.archivistRefs || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
            const arr = Array.isArray(f.archivistRefs[bucket]) ? f.archivistRefs[bucket] : [];
            if (!arr.includes(otherId)) {
                arr.push(otherId);
                f.archivistRefs[bucket] = arr;
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', f);
            }
        };
        // Maintain directional outbound on the 'from' journal as well
        const ensureOutbound = async (journal, bucket, otherId) => {
            const f = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            f.archivistOutbound = f.archivistOutbound || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
            const arr = Array.isArray(f.archivistOutbound[bucket]) ? f.archivistOutbound[bucket] : [];
            if (!arr.includes(otherId)) {
                arr.push(otherId);
                f.archivistOutbound[bucket] = arr;
                await journal.setFlag(CONFIG.MODULE_ID, 'archivist', f);
            }
        };
        for (const L of linksData) {
            const from = byArchId.get(L.from_id);
            const to = byArchId.get(L.to_id);
            if (!from || !to) continue;
            const bucketTo = keyMap[L.to_type] || null;
            const bucketFrom = keyMap[L.from_type] || null;
            if (bucketTo) {
                await ensureRef(from, bucketTo, L.to_id);
                await ensureOutbound(from, bucketTo, L.to_id);
            }
            if (bucketFrom) {
                await ensureRef(to, bucketFrom, L.from_id);
            }
        }

        // Done
        // Always organize folders by sheet type into organized folders
        try { await this._organizeFolders(); } catch (_) { }
        return true;
    }

    async _ensureRecapsContainer() {
        const name = 'Recaps';
        const journals = game.journal?.contents || [];
        let j = journals.find(x => x.name === name && !x.folder);
        if (j) return j;
        j = await JournalEntry.create({ name, folder: null, pages: [] }, { render: false });
        return j;
    }

    async _organizeFolders() {
        try {
            const nameFor = st => {
                if (st === 'character') return 'Characters';
                if (st === 'item') return 'Items';
                if (st === 'location') return 'Locations';
                if (st === 'faction') return 'Factions';
                if (st === 'recap') return 'Recaps';
                return null;
            };
            const cache = new Map();
            const ensureFolder = async (label) => {
                if (!label) return null;
                if (cache.has(label)) return cache.get(label);
                const organized = {
                    'Characters': 'Archivist - PCs',
                    'Items': 'Archivist - Items',
                    'Locations': 'Archivist - Locations',
                    'Factions': 'Archivist - Factions',
                };
                const target = organized[label] || label;
                const id = await Utils.ensureJournalFolder(target);
                cache.set(label, id);
                return id;
            };
            const updates = [];
            for (const j of game.journal?.contents || []) {
                const flags = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                const st = String(flags.sheetType || '');
                const label = nameFor(st);
                if (!label) continue;
                // Keep Recaps container at root
                if (st === 'recap') continue;
                const folderId = await ensureFolder(label);
                if (folderId && j.folder?.id !== folderId) {
                    updates.push(j.update({ folder: folderId }, { render: false }));
                }
            }
            if (updates.length) await Promise.allSettled(updates);
        } catch (e) {
            console.warn('[Archivist Sync] organizeFolders failed', e);
        }
    }
}

export const reconcileService = new ReconcileService();


