/**
 * Field mapping utilities - deterministic mapping using configured paths from world setup.
 * Uses saved configuration from settingsManager to write/read fields.
 */

import { settingsManager } from './settings-manager.js';

/**
 * Write an HTML biography string to an Actor using the configured description path.
 * Falls back to common defaults only if no configuration exists.
 * @param {Actor} actor
 * @param {string} htmlString
 * @returns {Promise<{ok:boolean, path?:string}>}
 */
export async function writeBestBiography(actor, htmlString) {
    if (!actor) return { ok: false };

    const actorType = actor?.type === 'npc' ? 'npc' : 'pc';
    const cfg = settingsManager.getImportConfig?.();
    const configuredPath = cfg?.actorMappings?.[actorType]?.descriptionPath;

    // If no configured path, use system-specific defaults
    const systemId = game.system?.id || 'generic';
    const defaultPath = settingsManager._defaultDescriptionPath?.(systemId, actorType) || 'system.details.biography.value';

    const path = configuredPath || defaultPath;

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

        // Verify the write was successful
        const afterPath = foundry.utils.getProperty(actor, path);
        if (typeof afterPath === "string" && afterPath === safe) {
            return { ok: true, path };
        }

        // For biography paths, also check both .value and .public
        if (/^system\.details\.biography(\.|$)/.test(path)) {
            const afterValue = foundry.utils.getProperty(actor, "system.details.biography.value");
            const afterPublic = foundry.utils.getProperty(actor, "system.details.biography.public");
            if ((typeof afterValue === "string" && afterValue === safe) ||
                (typeof afterPublic === "string" && afterPublic === safe)) {
                return { ok: true, path };
            }
        }

        return { ok: false };
    } catch (e) {
        console.error(`Failed to write biography to ${path}:`, e);
        return { ok: false };
    }
}

/**
 * Read the biography string from an Actor using the configured description path.
 * @param {Actor} actor
 * @returns {string}
 */
export function readBestBiography(actor) {
    if (!actor) return "";

    const actorType = actor?.type === 'npc' ? 'npc' : 'pc';
    const cfg = settingsManager.getImportConfig?.();
    const configuredPath = cfg?.actorMappings?.[actorType]?.descriptionPath;

    // If no configured path, use system-specific defaults
    const systemId = game.system?.id || 'generic';
    const defaultPath = settingsManager._defaultDescriptionPath?.(systemId, actorType) || 'system.details.biography.value';

    const path = configuredPath || defaultPath;

    const val = foundry.utils.getProperty(actor, path);
    if (typeof val === "string" && val.trim().length) return val;

    // For biography paths, also try .value and .public
    if (/^system\.details\.biography(\.|$)/.test(path)) {
        const valueField = foundry.utils.getProperty(actor, "system.details.biography.value");
        if (typeof valueField === "string" && valueField.trim().length) return valueField;

        const publicField = foundry.utils.getProperty(actor, "system.details.biography.public");
        if (typeof publicField === "string" && publicField.trim().length) return publicField;
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
        if (!target) target = pages.find((p) => typeof p?.text?.content === "string" || typeof p?.text?.markdown === "string");
        if (target) {
            // Accept either Markdown or HTML input; keep format as Markdown for consistent rendering
            await target.update({ text: { content: safe, markdown: safe, format: 2 } });
            return;
        }
        await journal.createEmbeddedDocuments("JournalEntryPage", [
            { name: "Description", type: "text", text: { content: safe, markdown: safe, format: 2 } }
        ]);
        return;
    }
    await journal.update({ content: safe });
}
