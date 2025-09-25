/**
 * Field mapping utilities to probe Foundry documents for the best schema fields.
 * Deterministic heuristics first; optional semantic fallback when enabled.
 * 
 * NEW: Enhanced biography field support with auto-matching and concatenation:
 * 
 * Example usage:
 * ```javascript
 * // Auto-discover and concatenate all biography fields from an actor
 * const result = processBiographyFields(actor, {
 *     includeFieldLabels: true,    // Add field names as headers
 *     preserveVisibility: true,    // Respect visibility settings
 *     convertToMarkdown: true      // Convert final HTML to markdown
 * });
 * 
 * console.log(result.html);        // Concatenated HTML with all biography fields
 * console.log(result.markdown);    // Markdown version
 * console.log(result.fields);      // Array of discovered fields
 * 
 * // Enhanced writing with auto-processing
 * await writeBestBiographyEnhanced(actor, {
 *     includeFieldLabels: false,
 *     preserveVisibility: true,
 *     convertToMarkdown: true
 * });
 * ```
 * 
 * The system automatically discovers fields like:
 * - appearance, backstory, allies, enemies, beliefs
 * - catchphrases, dislikes, likes, organizations
 * - anathema, edicts, attitude, birthplace, etc.
 */

import { suggestBestStringPath, discoverStringPaths } from './semantic-mapper.js';
import { htmlToMarkdown } from './importer-normalizer.js';

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
            const concepts = ["biography", "backstory", "description", "notes"];
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
            const concepts = ["biography", "backstory", "description", "notes"];
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

/**
 * Discover all biography-related fields in an actor's system data.
 * Looks for fields that contain biographical information like appearance, backstory, etc.
 * @param {Actor} actor
 * @returns {Array<{path: string, value: string, field: string}>}
 */
export function discoverBiographyFields(actor) {
    const biographyFields = [];
    const biographyKeywords = [
        'biography', 'bio', 'backstory', 'appearance', 'description', 'notes', 'summary',
        'allies', 'enemies', 'beliefs', 'catchphrases', 'dislikes', 'likes', 'organizations',
        'anathema', 'edicts', 'attitude', 'birthplace', 'campaignnotes', 'personality',
        'traits', 'background', 'history', 'origin', 'motivation', 'goals', 'fears',
        'secrets', 'relationships', 'family', 'mentor', 'rival', 'companion'
    ];

    const scan = (obj, path = []) => {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = [...path, key];
            const pathString = currentPath.join('.');
            
            // Check if this field matches biography keywords
            const isBiographyField = biographyKeywords.some(keyword => 
                key.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (typeof value === 'string' && value.trim() && isBiographyField) {
                biographyFields.push({
                    path: 'system.' + pathString,
                    value: value.trim(),
                    field: key
                });
            } else if (value && typeof value === 'object' && currentPath.length < 6) {
                // Recursively scan nested objects
                scan(value, currentPath);
            }
        }
    };

    scan(actor.system);
    return biographyFields;
}

/**
 * Concatenate all discovered biography fields into a single HTML string.
 * @param {Array<{path: string, value: string, field: string}>} biographyFields
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeFieldLabels - Whether to include field names as headers
 * @param {boolean} options.preserveVisibility - Whether to respect visibility settings
 * @param {Actor} options.actor - Actor reference for visibility checks
 * @returns {string} Concatenated HTML string
 */
export function concatenateBiographyFields(biographyFields, options = {}) {
    const { includeFieldLabels = true, preserveVisibility = true, actor = null } = options;
    const htmlParts = [];

    // Sort fields by priority/importance
    const fieldPriority = {
        'biography': 1000, 'bio': 1000, 'backstory': 900, 'appearance': 800,
        'description': 700, 'personality': 600, 'traits': 500, 'background': 400,
        'history': 300, 'notes': 200, 'summary': 100
    };

    const sortedFields = biographyFields.sort((a, b) => {
        const aPriority = fieldPriority[a.field.toLowerCase()] || 0;
        const bPriority = fieldPriority[b.field.toLowerCase()] || 0;
        return bPriority - aPriority;
    });

    for (const field of sortedFields) {
        // Check visibility if actor is provided and preserveVisibility is true
        if (preserveVisibility && actor) {
            const visibilityPath = field.path.replace(/\.(value|public)$/, '.visibility');
            const visibility = foundry.utils.getProperty(actor, visibilityPath);
            if (visibility && typeof visibility === 'object') {
                const fieldName = field.field.toLowerCase();
                if (visibility[fieldName] === false) {
                    continue; // Skip hidden fields
                }
            }
        }

        const fieldValue = field.value.trim();
        if (!fieldValue) continue;

        // Clean up the field name for display
        const displayName = field.field
            .replace(/([A-Z])/g, ' $1') // Add spaces before capitals
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .replace(/_(.)/g, (_, char) => ' ' + char.toUpperCase()); // Handle underscores

        if (includeFieldLabels) {
            htmlParts.push(`<h4>${displayName}</h4>`);
        }
        
        // Wrap content in paragraph if it's not already HTML
        if (!fieldValue.includes('<') && !fieldValue.includes('>')) {
            htmlParts.push(`<p>${fieldValue}</p>`);
        } else {
            htmlParts.push(fieldValue);
        }
    }

    return htmlParts.join('\n\n');
}

/**
 * Auto-match and concatenate biography fields from an actor, then process as markdown.
 * This is the main function that combines discovery, concatenation, and markdown conversion.
 * @param {Actor} actor
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeFieldLabels - Whether to include field names as headers
 * @param {boolean} options.preserveVisibility - Whether to respect visibility settings
 * @param {boolean} options.convertToMarkdown - Whether to convert final HTML to markdown
 * @returns {{html: string, markdown: string, fields: Array}} Result object with HTML, markdown, and field info
 */
export function processBiographyFields(actor, options = {}) {
    const { 
        includeFieldLabels = true, 
        preserveVisibility = true, 
        convertToMarkdown = true 
    } = options;

    // Discover all biography fields
    const biographyFields = discoverBiographyFields(actor);
    
    if (biographyFields.length === 0) {
        return { html: '', markdown: '', fields: [] };
    }

    // Concatenate into HTML
    const html = concatenateBiographyFields(biographyFields, {
        includeFieldLabels,
        preserveVisibility,
        actor
    });

    // Convert to markdown if requested
    const markdown = convertToMarkdown ? htmlToMarkdown(html) : '';

    return {
        html,
        markdown,
        fields: biographyFields
    };
}

/**
 * Enhanced version of writeBestBiography that can concatenate multiple biography fields.
 * @param {Actor} actor
 * @param {string|Object} input - HTML string or options object for auto-processing
 * @param {Object} options - Configuration options
 * @returns {Promise<{ok: boolean, path?: string, pathTried?: string[], processed?: Object}>}
 */
export async function writeBestBiographyEnhanced(actor, input, options = {}) {
    // If input is a string, use the original function
    if (typeof input === 'string') {
        return await writeBestBiography(actor, input);
    }

    // If input is an options object, process biography fields automatically
    const processed = processBiographyFields(actor, input);
    
    if (!processed.html) {
        return { ok: false, pathTried: [], processed };
    }

    // Write the concatenated HTML using the original function
    const result = await writeBestBiography(actor, processed.html);
    
    return {
        ...result,
        processed
    };
}


