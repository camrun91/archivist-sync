/**
 * Field mapping utilities to probe Foundry documents for the best schema fields.
 * Deterministic heuristics; no AI required.
 */

/**
 * Try to write an HTML biography string to the best-matching field on an Actor.
 * Probes common and discovered string paths under actor.system and verifies write-back.
 * @param {Actor} actor
 * @param {string} htmlString
 * @returns {Promise<{ok:boolean, path?:string, pathTried?:string[]}>}
 */
export async function writeBestBiography(actor, htmlString) {
    const candidates = [
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
            foundry.utils.setProperty(data, path, String(htmlString ?? ""));
            await actor.update(data);
            const after = foundry.utils.getProperty(actor, path);
            if (typeof after === "string" && after === String(htmlString ?? "")) return { ok: true, path };
        } catch (_) {
            // try next candidate
        }
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
        (/descr/i.test(p) ? 500 : 0) +
        (/summary/i.test(p) ? 120 : 0) +
        (/notes/i.test(p) ? 100 : 0) -
        p.split(".").length;

    const unique = [...new Set([...candidates, ...discovered])].sort((a, b) => score(b) - score(a));
    for (const path of unique) {
        const val = foundry.utils.getProperty(actor, path);
        if (typeof val === "string" && val.trim().length) return val;
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


