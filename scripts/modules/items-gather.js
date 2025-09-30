/**
 * Gather "used" items deterministically according to config.
 */

function collectActorOwnedItems(actors, includeNPCs) {
    const docs = new Set();
    for (const a of actors) {
        const isPC = String(a?.type || '').toLowerCase() === 'character';
        const isNPC = String(a?.type || '').toLowerCase() === 'npc';
        if (!isPC && !(includeNPCs && isNPC)) continue;
        for (const it of (a.items?.contents ?? a.items ?? [])) {
            const qty = Number(it?.system?.quantity ?? 0);
            const equipped = !!it?.system?.equipped;
            const attuned = !!it?.system?.attuned;
            const type = String(it?.type || '').toLowerCase();
            const inUse = qty > 0 || equipped || attuned || type === 'spell' || type === 'feat';
            if (!inUse) continue;
            docs.add(it);
        }
    }
    return Array.from(docs);
}

function collectWorldItemsByFolders(folderNames) {
    const out = [];
    const include = new Set(Array.isArray(folderNames) ? folderNames : []);
    if (!include.size) return out;
    for (const item of (game.items?.contents ?? game.items ?? [])) {
        const fname = item?.folder?.name;
        if (!fname || include.has(fname)) out.push(item);
    }
    return out;
}

function collectUUIDsFromJournalsAndChat() {
    const uuids = new Set();
    const uuidRegex = /@UUID\[[^\]]+\]/g;
    try {
        for (const j of (game.journal?.contents ?? game.journal ?? [])) {
            for (const p of (j.pages?.contents ?? j.pages ?? [])) {
                const text = String(p?.text?.content || p?.text || '');
                for (const m of text.matchAll(uuidRegex)) uuids.add(m[0].slice(6, -1));
            }
        }
    } catch (_) { /* no-op */ }
    try {
        for (const c of (game.messages?.contents ?? game.messages ?? [])) {
            const html = String(c?.content || '');
            for (const m of html.matchAll(uuidRegex)) uuids.add(m[0].slice(6, -1));
        }
    } catch (_) { /* no-op */ }
    return Array.from(uuids);
}

async function* iterUsedCompendiumDocs(uuids) {
    for (const uuid of uuids) {
        try {
            const doc = await fromUuid(uuid);
            if (doc) yield doc;
        } catch (_) { /* ignore */ }
    }
}

/**
 * Resolve used items per config.
 * @param {any} config Import configuration
 */
export async function gatherUsedItems(config, actorPool) {
    const items = new Set();
    const itemsConfig = config?.includeRules?.filters?.items || {};
    const includeActorOwnedFrom = String(itemsConfig?.includeActorOwnedFrom || 'pc');
    const includeNPC = includeActorOwnedFrom === 'pc+npc';

    // 1) Actor-owned
    const actorOwned = collectActorOwnedItems(actorPool, includeNPC);
    for (const it of actorOwned) items.add(it);

    // 2) World items by folder
    const worldFolders = itemsConfig?.includeWorldItemFolders || [];
    for (const it of collectWorldItemsByFolders(worldFolders)) items.add(it);

    // 3) Referenced compendium docs via sourceId or @UUID links
    const referencedUUIDs = new Set();
    for (const it of actorOwned) {
        try {
            const src = it.getFlag?.('core', 'sourceId');
            if (src && String(src).includes('Compendium.')) referencedUUIDs.add(src);
        } catch (_) { /* no-op */ }
    }
    for (const u of collectUUIDsFromJournalsAndChat()) if (String(u).includes('Compendium.')) referencedUUIDs.add(u);

    for await (const doc of iterUsedCompendiumDocs(referencedUUIDs)) items.add(doc);

    return Array.from(items);
}


