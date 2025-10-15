// In-memory indexer for Archivist links and sheet flags
import { CONFIG } from '../config.js';
import { archivistApi } from '../../services/archivist-api.js';
import { settingsManager } from '../settings-manager.js';

export class LinkIndexer {
    constructor() {
        this._built = false;
        this.byJournalId = new Map();
        this.byArchivistId = new Map();
        this.childrenByLocationId = new Map();
        this.associatesByLocationId = new Map();
        this.ancestorsByLocationId = new Map();
        // Directional map: from Archivist entity id -> buckets of to_ids
        this.outboundByFromId = new Map();
    }

    /** Build index from current world flags (fast) */
    buildFromWorld() {
        this.byJournalId.clear();
        this.byArchivistId.clear();
        this.childrenByLocationId.clear();
        this.associatesByLocationId.clear();
        this.ancestorsByLocationId.clear();
        this.outboundByFromId.clear();
        const journals = game.journal?.contents || [];
        const parentOf = new Map();
        for (const j of journals) {
            const flags = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            if (!flags) continue;
            this.byJournalId.set(j.id, flags);
            if (flags.archivistId) this.byArchivistId.set(flags.archivistId, { journalId: j.id, flags });
            if (flags.sheetType === 'location') {
                // parentLocationId may be either an Archivist ID or a JournalEntry id
                const parentKey = flags.parentLocationId || null;
                const selfKey = flags.archivistId || j.id;
                if (parentKey) {
                    const arr = this.childrenByLocationId.get(parentKey) || [];
                    arr.push(selfKey);
                    this.childrenByLocationId.set(parentKey, arr);
                    parentOf.set(selfKey, parentKey);
                }
                const assoc = (flags.archivistRefs?.locationsAssociative || []);
                if (assoc.length) this.associatesByLocationId.set(selfKey, assoc.slice());
            }

            // Populate outbound map, preferring directional archivistOutbound when present
            try {
                const fromId = flags.archivistId || j.id;
                if (!fromId) continue;
                const refs = flags.archivistOutbound || flags.archivistRefs || {};
                const cur = this.outboundByFromId.get(fromId) || { characters: [], items: [], factions: [], locationsAssociative: [], entries: [] };
                const addAll = (bucket, arr) => {
                    if (!Array.isArray(arr)) return;
                    const existing = new Set(cur[bucket] || []);
                    for (const toId of arr) {
                        const sid = String(toId);
                        if (!existing.has(sid)) existing.add(sid);
                    }
                    cur[bucket] = Array.from(existing);
                };
                addAll('characters', refs.characters);
                addAll('items', refs.items);
                addAll('factions', refs.factions);
                addAll('locationsAssociative', refs.locationsAssociative);
                addAll('entries', refs.entries);
                this.outboundByFromId.set(fromId, cur);
            } catch (_) { }
        }

        // Build ancestor chains for locations
        const computeAncestors = id => {
            const chain = [];
            const seen = new Set();
            let cur = parentOf.get(id);
            while (cur && !seen.has(cur)) {
                chain.unshift(cur);
                seen.add(cur);
                cur = parentOf.get(cur) || null;
            }
            return chain;
        };
        for (const id of new Set([...parentOf.keys(), ...parentOf.values()])) {
            if (!id) continue;
            this.ancestorsByLocationId.set(id, computeAncestors(id));
        }
        this._built = true;
    }

    /** Full rebuild by fetching Links from Archivist API and hydrating flags */
    async buildFromArchivistAPI() {
        const apiKey = settingsManager.getApiKey?.();
        const worldId = settingsManager.getSelectedWorldId?.();
        if (!apiKey || !worldId) {
            this.buildFromWorld();
            return;
        }
        try {
            const resp = await archivistApi.listLinks(apiKey, worldId);
            if (!resp?.success) {
                console.warn('[Archivist Sync] LinkIndexer: listLinks failed; falling back to world scan');
                this.buildFromWorld();
                return;
            }
            // Reset maps and rebuild directional index from API response
            this.byJournalId.clear();
            this.byArchivistId.clear();
            this.childrenByLocationId.clear();
            this.associatesByLocationId.clear();
            this.ancestorsByLocationId.clear();
            this.outboundByFromId.clear();

            const bucketForType = (type) => {
                const t = String(type || '').toLowerCase();
                if (t === 'character') return 'characters';
                if (t === 'item') return 'items';
                if (t === 'location') return 'locationsAssociative';
                if (t === 'faction') return 'factions';
                if (t === 'entry' || t === 'journal' || t === 'journalentry') return 'entries';
                return null;
            };

            const addOutbound = (fromId, bucket, toId) => {
                if (!fromId || !bucket || !toId) return;
                const cur = this.outboundByFromId.get(fromId) || { characters: [], items: [], factions: [], locationsAssociative: [], entries: [] };
                const arr = cur[bucket] || [];
                if (!arr.includes(toId)) arr.push(toId);
                cur[bucket] = arr;
                this.outboundByFromId.set(fromId, cur);
            };

            for (const link of (resp.data || [])) {
                const fromId = link?.from_id || link?.fromId;
                const fromType = link?.from_type || link?.fromType;
                const toId = link?.to_id || link?.toId;
                const toType = link?.to_type || link?.toType;
                const bucket = bucketForType(toType);
                addOutbound(fromId, bucket, toId);
            }
            this._built = true;
        } catch (e) {
            console.warn('[Archivist Sync] LinkIndexer: buildFromArchivistAPI error', e);
            this.buildFromWorld();
        }
    }
}

export const linkIndexer = new LinkIndexer();


