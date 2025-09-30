/**
 * Deterministic mapping from Foundry docs to Archivist shapes using config.
 */

function coalesce(...values) {
    for (const v of values) if (v != null && String(v).trim().length) return v;
    return undefined;
}

function readPath(obj, path) {
    if (!path) return undefined;
    const p = String(path).split('.');
    return p.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function mapActorToArchivist(actor, config, type) {
    const mapCfg = (type === 'pc') ? config?.actorMappings?.pc : config?.actorMappings?.npc;
    const descriptionPath = mapCfg?.descriptionPath;
    const portraitPath = mapCfg?.portraitPath || 'img';
    const description = coalesce(readPath(actor, descriptionPath), '');
    const image = coalesce(readPath(actor, portraitPath), actor?.img, actor?.imgSrc);
    const labels = [type === 'pc' ? 'PC' : 'NPC'];
    return { targetType: 'Character', payload: { title: actor?.name, description, portraitUrl: image }, labels, score: 1 };
}

export function mapItemToArchivist(item) {
    const description = item?.system?.description?.value || item?.system?.description || '';
    const image = item?.img;
    return { targetType: 'Item', payload: { name: item?.name, description, imageUrl: image }, labels: [], score: 1 };
}

export function mapJournalToFaction(journal) {
    const name = journal?.name;
    const pages = journal.pages?.contents ?? journal.pages ?? [];
    const texts = [];
    for (const p of pages) {
        const t = p?.text?.content || p?.text || '';
        if (t) texts.push(String(t));
    }
    const description = texts.join('\n\n');
    const image = undefined;
    return { targetType: 'Faction', payload: { name, description, imageUrl: image }, labels: [], score: 1 };
}


