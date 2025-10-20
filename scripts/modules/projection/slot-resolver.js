import { AdapterRegistry } from './adapter-registry.js';
import { mergeArchivistSection, stripHtml } from './merge.js';
import { CONFIG } from '../config.js';

function defaultHeuristics(doc) {
    return [
        { path: 'system.description.value', weight: 90, html: true },
        { path: 'system.details.description', weight: 85, html: true },
        { path: 'flags.core.summary', weight: 70, html: true },
    ];
}

// Sidecar journals removed: projection now only targets best-matched fields

/**
 * @param {ClientDocument} doc
 * @returns {Promise<{kind:'field', path:string, html:boolean} | {kind:'journal', entry: JournalEntry}>}
 */
export async function pickDescriptionSlot(doc) {
    try {
        const docType = doc?.documentName;
        const systemId = String(game?.system?.id || '').toLowerCase();
        const actorType = docType === 'Actor' ? String(doc?.type || '') : undefined;
        console.log('[Projection] pickDescriptionSlot for', { docType, name: doc?.name, systemId, actorType });

        // Dynamic front-of-queue candidates when we can infer subtype
        /** @type {{ path: string, weight: number, html?: boolean }[]} */
        let dynamic = [];
        if (systemId === 'pf2e' && docType === 'Actor') {
            if (actorType === 'npc') {
                dynamic = [
                    { path: 'system.details.publicNotes', weight: 125, html: true },
                ];
            } else if (actorType === 'character') {
                dynamic = [
                    { path: 'system.details.biography.backstory', weight: 125, html: true },
                ];
            }
        }

        const reg = AdapterRegistry.getCandidates(docType) || [];
        const candidates = (dynamic.length ? [...dynamic, ...reg] : reg.length ? reg : defaultHeuristics(doc));
        if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
            console.warn('[Projection] No candidates; using default heuristics only');
        }
        const viable = candidates
            .map(c => ({ ...c, val: foundry.utils.getProperty(doc, c.path), has: foundry.utils.hasProperty(doc, c.path) }))
            // Only consider paths that exist on the document; prevents writing to non-schema fields (e.g., PF2e NPC backstory)
            .filter(c => c.has && (typeof c.val === 'string' || c.val == null));
        if (viable.length) {
            const best = viable
                .map(c => {
                    const s = String(c.val ?? '');
                    const html = !!c.html || /<\/?[a-z][\s\S]*>/i.test(s);
                    const score = (c.weight || 0) + (s.length ? 15 : 0) + (html ? 10 : 0);
                    return { path: c.path, html, score };
                })
                .sort((a, b) => b.score - a.score)[0];
            if (best) {
                console.log('[Projection] Selected slot', best);
                return { kind: 'field', path: best.path, html: best.html };
            }
        }
        // No viable slot found
        console.warn('[Projection] No viable slot found');
        return { kind: 'none' };
    } catch (e) {
        console.warn('[Projection] pickDescriptionSlot error:', e);
        return { kind: 'none' };
    }
}

/**
 * Project Archivist HTML into the selected slot. Adds loop-guard flag.
 * @param {ClientDocument} doc
 * @param {string} archivistHtml
 */
export async function projectDescription(doc, archivistHtml) {
    const slot = await pickDescriptionSlot(doc);
    const ts = Date.now();
    const op = (foundry.utils?.randomID?.() || Math.random().toString(36).slice(2));
    if (slot.kind !== 'field') return { target: 'none' };
    const current = String(foundry.utils.getProperty(doc, slot.path) ?? '');
    const next = slot.html ? mergeArchivistSection(current, String(archivistHtml ?? '')) : stripHtml(archivistHtml);
    const update = { [slot.path]: next, [`flags.${CONFIG.MODULE_ID}.op`]: op, [`flags.${CONFIG.MODULE_ID}.lastProjectionAt`]: ts };
    console.log('[Projection] Updating doc field with Archivist content', { path: slot.path, html: slot.html, length: String(next).length });
    await doc.update(update, { render: false });
    return { target: 'field', path: slot.path };
}

export const SlotResolver = { pickDescriptionSlot, projectDescription };


