/**
 * Field mapping utilities to probe Foundry documents for the best schema fields.
 * Deterministic heuristics first; optional semantic fallback when enabled.
 */

import { suggestBestStringPath, discoverStringPaths } from './semantic-mapper.js';

/**
 * Try to write an HTML biography string to the best-matching field on an Actor.
 * Probes common and discovered string paths under actor.system and verifies write-back.
 * @param {Actor} actor
 * @param {string} htmlString
 * @returns {Promise<{ok:boolean, path?:string, pathTried?:string[]}>}
 */
export async function writeBestBiography(actor, htmlString) {
    // Base candidates; we'll reorder early preferences by actor type below
    let candidates = [
        "system.details.biography.public",
        "system.details.biography.value",
        "system.details.biography",
        "system.biography",
        "system.description.value",
        "system.description",
        "system.notes",
        "system.summary",
        "system.details.description",
        "system.traits.biography"
    ];

    // Prefer value for PCs; public is fine for many NPC sheets
    if (actor?.type === "character") {
        candidates = [
            "system.details.biography.value",
            "system.details.biography.public",
            ...candidates.filter(p => !p.startsWith("system.details.biography"))
        ];
    }

    // Auto-discover more candidates by scanning actor.system
    const discovered = [];
    const scan = (obj, path = []) => {
        for (const [k, v] of Object.entries(obj ?? {})) {
            const next = [...path, k];
            if (typeof v === "string") {
                const p = "system." + next.join(".");
                if (/(bio|descr|summary|notes)/i.test(p)) discovered.push(p);
            } else if (v && typeof v === "object" && next.length < 6) {
                scan(v, next);
            }
        }
    };
    scan(actor.system);

    // Score function: prefer bio > descr > summary > notes, prefer shorter paths
    const score = (p) =>
        (/(^|\.)(biography|bio)(\.|$)/i.test(p) ? 1000 : 0) +
        (/descr/i.test(p) ? 500 : 0) +
        (/summary/i.test(p) ? 120 : 0) +
        (/notes/i.test(p) ? 100 : 0) -
        p.split(".").length;

    const unique = [...new Set([...candidates, ...discovered])].sort((a, b) => score(b) - score(a));

    for (const path of unique) {
        try {
            const data = {};
            const safe = String(htmlString ?? "");
            // Special handling for dnd5e biography object: mirror to both value and public
            if (/^system\.details\.biography(\.|$)/.test(path)) {
                foundry.utils.setProperty(data, "system.details.biography.public", safe);
                foundry.utils.setProperty(data, "system.details.biography.value", safe);
            } else {
                foundry.utils.setProperty(data, path, safe);
            }
            await actor.update(data);
            // Verify using the more PC-visible field first
            const afterPrimary = foundry.utils.getProperty(actor, "system.details.biography.value");
            const afterAlt = foundry.utils.getProperty(actor, "system.details.biography.public");
            const afterPath = foundry.utils.getProperty(actor, path);
            if (
                (typeof afterPrimary === "string" && afterPrimary === safe) ||
                (typeof afterAlt === "string" && afterAlt === safe) ||
                (typeof afterPath === "string" && afterPath === safe)
            ) {
                return { ok: true, path };
            }
        } catch (_) {
            // try next candidate
        }
    }
    // Semantic fallback (opt-in via semantic mapping toggle only)
    try {
        if (game.settings.get('archivist-sync', 'semanticMappingEnabled')) {
            const discoveredCands = discoverStringPaths(actor.system, /(bio|descr|summary|notes)/i);
            const all = [...new Set([...unique, ...discoveredCands.map(c => c.path)])];
            const candidateObjs = all.map(p => ({ path: p }));
            // Expanded concept set including synonyms and common sheet phrasing
            const concepts = ["biography", "backstory", "description", "notes", "history", "public notes", "profile"];
            const best = await suggestBestStringPath(candidateObjs, concepts);
            if (best && typeof best.path === 'string') {
                const data = {};
                const safe = String(htmlString ?? "");
                if (/^system\.details\.biography(\.|$)/.test(best.path)) {
                    foundry.utils.setProperty(data, "system.details.biography.public", safe);
                    foundry.utils.setProperty(data, "system.details.biography.value", safe);
                } else {
                    foundry.utils.setProperty(data, best.path, safe);
                }
                await actor.update(data);
                const afterPrimary = foundry.utils.getProperty(actor, "system.details.biography.value");
                const afterAlt = foundry.utils.getProperty(actor, "system.details.biography.public");
                const afterPath = foundry.utils.getProperty(actor, best.path);
                if (
                    (typeof afterPrimary === "string" && afterPrimary === safe) ||
                    (typeof afterAlt === "string" && afterAlt === safe) ||
                    (typeof afterPath === "string" && afterPath === safe)
                ) {
                    return { ok: true, path: best.path };
                }
            }
        }
    } catch (_) {
        // ignore semantic fallback failures
    }
    return { ok: false, pathTried: unique };
}

/**
 * Read the best biography-like string from an Actor using the same heuristics.
 * @param {Actor} actor
 * @returns {string}
 */
export function readBestBiography(actor) {
    const candidates = [
        // Prefer .value (PC sheet) over .public
        "system.details.biography.value",
        "system.details.biography.public",
        "system.details.biography",
        "system.biography",
        "system.description.value",
        "system.description",
        "system.notes",
        "system.summary",
        "system.details.description",
        "system.traits.biography"
    ];

    const discovered = [];
    const scan = (obj, path = []) => {
        for (const [k, v] of Object.entries(obj ?? {})) {
            const next = [...path, k];
            if (typeof v === "string") {
                const p = "system." + next.join(".");
                if (/(bio|descr|summary|notes)/i.test(p)) discovered.push(p);
            } else if (v && typeof v === "object" && next.length < 6) {
                scan(v, next);
            }
        }
    };
    scan(actor.system);

    const score = (p) =>
        (/(^|\.)(biography|bio)(\.|$)/i.test(p) ? 1000 : 0) +
        (/\.value$/i.test(p) ? 50 : 0) +
        (/descr/i.test(p) ? 500 : 0) +
        (/summary/i.test(p) ? 120 : 0) +
        (/notes/i.test(p) ? 100 : 0) -
        p.split(".").length;

    const unique = [...new Set([...candidates, ...discovered])].sort((a, b) => score(b) - score(a));
    for (const path of unique) {
        const val = foundry.utils.getProperty(actor, path);
        if (typeof val === "string" && val.trim().length) return val;
    }
    // Semantic fallback (opt-in via semantic mapping toggle only)
    try {
        if (game.settings.get('archivist-sync', 'semanticMappingEnabled')) {
            const discoveredCands = discoverStringPaths(actor.system, /(bio|descr|summary|notes)/i);
            const all = [...new Set([...unique, ...discoveredCands.map(c => c.path)])];
            const candidateObjs = all.map(p => ({ path: p }));
            const concepts = ["biography", "backstory", "description", "notes", "history", "public notes", "profile"];
            return (async () => {
                const best = await suggestBestStringPath(candidateObjs, concepts);
                if (best?.path) {
                    const v = foundry.utils.getProperty(actor, best.path);
                    if (typeof v === 'string') return v;
                }
                return "";
            })();
        }
    } catch (_) {
        // ignore
    }
    return "";
}

/**
 * Try to write a description to a JournalEntry in the most compatible way.
 * Prefers updating an existing text page; otherwise creates one. Falls back to legacy content.
 * @param {JournalEntry} journal
 * @param {string} htmlString
 */
export async function writeBestJournalDescription(journal, htmlString) {
    const safe = String(htmlString ?? "");
    const pagesCollection = journal.pages;
    if (pagesCollection) {
        const pages = pagesCollection.contents ?? (Array.isArray(pagesCollection) ? pagesCollection : []);
        let target = pages.find((p) => p.type === "text");
        if (!target) target = pages.find((p) => typeof p?.text?.content === "string");
        if (target) {
            await target.update({ text: { content: safe, format: 1 } });
            return;
        }
        await journal.createEmbeddedDocuments("JournalEntryPage", [
            { name: "Description", type: "text", text: { content: safe, format: 1 } }
        ]);
        return;
    }
    await journal.update({ content: safe });
}


