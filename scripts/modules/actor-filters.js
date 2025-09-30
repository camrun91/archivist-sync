/**
 * Actor filtering utilities based on world-scoped import configuration
 */

function getPlayerUserIds() {
    try {
        return (game.users || []).filter(u => !u.isGM).map(u => u.id);
    } catch (_) { return []; }
}

function hasPlayerOwner(actor, playerUserIds) {
    try {
        const ownership = actor?.ownership || {};
        const levels = foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS || CONST.DOCUMENT_OWNERSHIP_LEVELS;
        const minLevel = levels?.LIMITED ?? 2;
        return playerUserIds.some(uid => (ownership?.[uid] ?? 0) >= minLevel);
    } catch (_) { return false; }
}

function getPlacedActorIds() {
    const ids = new Set();
    try {
        for (const scene of (game.scenes || [])) {
            for (const t of (scene.tokens || [])) {
                const aId = t?.actorId || t?.actor?.id;
                if (aId) ids.add(aId);
            }
        }
    } catch (_) { /* no-op */ }
    return ids;
}

function isInSelectedFolder(actor, folderNames) {
    const list = Array.isArray(folderNames) ? folderNames : [];
    if (!list.length) return true; // no gating → include
    const fname = actor?.folder?.name || '';
    return list.includes(fname);
}

/**
 * Compute PC/NPC candidates from world actors using deterministic filters.
 * @param {any} config Import configuration from settingsManager.getImportConfig()
 * @returns {{ pcs: Actor[], npcs: Actor[] }}
 */
export function getActorCandidates(config) {
    const allActors = (game.actors?.contents ?? game.actors ?? []);
    const playerUserIds = getPlayerUserIds();
    const placedActorIds = getPlacedActorIds();

    const actorFilters = config?.includeRules?.filters?.actors || {};
    const includeFolders = actorFilters?.includeFolders || {};
    const pcFolders = Array.isArray(includeFolders?.pcs) ? includeFolders.pcs : [];
    const npcFolders = Array.isArray(includeFolders?.npcs) ? includeFolders.npcs : [];
    const mustHavePlayerOwner = !!actorFilters?.mustHavePlayerOwner;
    const npcRequirePlacedToken = actorFilters?.npcRequirePlacedToken !== false; // default true

    const pcs = [];
    const npcs = [];

    for (const a of allActors) {
        const type = String(a?.type || '').toLowerCase();
        if (type === 'character') {
            if (!isInSelectedFolder(a, pcFolders)) continue;
            if (mustHavePlayerOwner && !hasPlayerOwner(a, playerUserIds)) continue;
            pcs.push(a);
            continue;
        }
        if (type === 'npc' || type === 'monster') {
            if (!isInSelectedFolder(a, npcFolders)) continue;
            if (npcRequirePlacedToken && !placedActorIds.has(a.id)) continue;
            npcs.push(a);
            continue;
        }
    }

    return { pcs, npcs };
}


