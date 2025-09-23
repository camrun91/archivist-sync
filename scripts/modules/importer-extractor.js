import { ImporterKinds } from './importer-types.js';

function collectTagsFromText(text) {
    const tags = new Set();
    const re = /#([\p{L}\p{N}_-]{2,})/gu;
    let m; const s = String(text || '');
    while ((m = re.exec(s))) tags.add(m[1].toLowerCase());
    return Array.from(tags);
}

function collectLinks(text) {
    const links = []; const s = String(text || '');
    const uuidRe = /@UUID\[([^\]]+)\]/g; let m1;
    while ((m1 = uuidRe.exec(s))) links.push({ type: 'uuid', value: m1[1] });
    const journalRe = /@JournalEntry\[(.*?)\]/g; let m2;
    while ((m2 = journalRe.exec(s))) links.push({ type: 'journal', value: m2[1] });
    return links;
}

function flattenStats(system) {
    const stats = {};
    try {
        const hp = system?.attributes?.hp?.value ?? system?.attributes?.hp;
        const ac = system?.attributes?.ac?.value ?? system?.attributes?.ac ?? system?.attributes?.armorClass;
        const level = system?.details?.level ?? system?.details?.cr ?? system?.details?.challenge;
        const alignment = system?.details?.alignment; const race = system?.details?.race; const clazz = system?.details?.class;
        if (hp != null) stats.hp = Number(hp) || hp;
        if (ac != null) stats.ac = Number(ac) || ac;
        if (level != null) stats.level = Number(level) || level;
        if (alignment) stats.alignment = String(alignment);
        if (race) stats.race = String(race);
        if (clazz) stats.class = String(clazz);
    } catch (_) { }
    return stats;
}

/**
 * Extract GenericEntity array from current Foundry world
 * @param {number=} sampleLimit Optional cap for sampling
 * @returns {import('./importer-types').GenericEntity[]}
 */
export function extractGenericEntities(sampleLimit) {
    const out = [];

    // Actors → GenericEntity
    const actors = (game.actors?.contents ?? game.actors ?? []);
    for (const a of actors) {
        const bio = a?.system?.details?.biography?.value || a?.system?.details?.biography?.public || a?.system?.description || '';
        const tags = new Set();
        (a?.folder?.name ? [a.folder.name] : []).forEach(n => tags.add(String(n).toLowerCase()));
        collectTagsFromText(bio).forEach(t => tags.add(t));
        out.push({
            kind: ImporterKinds.Actor,
            subtype: a.type,
            name: a.name,
            blurb: '',
            body: String(bio || ''),
            stats: flattenStats(a.system),
            tags: Array.from(tags),
            links: collectLinks(bio),
            images: [a.img, a?.prototypeToken?.texture?.src].filter(Boolean),
            sourcePath: a.uuid,
            folderName: a?.folder?.name || '',
            metadata: { type: a.type, system: a.system }
        });
    }

    // Journals → GenericEntity
    const journals = (game.journal?.contents ?? game.journal ?? []);
    for (const j of journals) {
        const pages = j.pages?.contents ?? j.pages ?? [];
        const textPage = pages.find(p => p.type === 'text');
        const content = textPage?.text?.content || j.content || '';
        const tags = new Set();
        (j?.folder?.name ? [j.folder.name] : []).forEach(n => tags.add(String(n).toLowerCase()));
        collectTagsFromText(content).forEach(t => tags.add(t));
        out.push({
            kind: ImporterKinds.Journal,
            subtype: 'journal',
            name: j.name,
            blurb: '',
            body: String(content || ''),
            stats: {},
            tags: Array.from(tags),
            links: collectLinks(content),
            images: [j.img].filter(Boolean),
            sourcePath: j.uuid,
            folderName: j?.folder?.name || '',
            metadata: { pages: pages?.length ?? 0 }
        });
    }

    // Scenes → GenericEntity
    const scenes = (game.scenes?.contents ?? game.scenes ?? []);
    for (const s of scenes) {
        const notes = s?.notes ?? [];
        const pinsText = (Array.isArray(notes) ? notes : []).map(n => String(n?.text || '')).join('\n');
        const tags = new Set();
        (s?.folder?.name ? [s.folder.name] : []).forEach(n => tags.add(String(n).toLowerCase()));
        collectTagsFromText(pinsText).forEach(t => tags.add(t));
        const bg = (s?.background?.src) || s?.background || s?.img || s?.thumb || '';
        out.push({
            kind: ImporterKinds.Scene,
            subtype: 'scene',
            name: s.name,
            blurb: '',
            body: pinsText,
            stats: {},
            tags: Array.from(tags),
            links: collectLinks(pinsText),
            images: [bg, s?.thumb].filter(Boolean),
            sourcePath: s.uuid,
            folderName: s?.folder?.name || '',
            metadata: { width: s.width, height: s.height, bg: s?.background }
        });
    }

    if (sampleLimit && Number.isFinite(sampleLimit) && sampleLimit > 0) {
        return out.slice(0, sampleLimit);
    }
    return out;
}


