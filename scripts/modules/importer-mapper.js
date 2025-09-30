import { getPresetForSystemId } from './mapping-presets.js';
import { toMarkdownIfHtml, unwrapToPlainText } from './importer-normalizer.js';

function get(obj, path, defaultValue) {
    try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) ?? defaultValue; } catch (_) { return defaultValue; }
}

function evalJsonPath(expr, entity) {
    if (typeof expr !== 'string') return expr;
    if (expr.startsWith('$.')) {
        const p = expr.slice(2);
        return get(entity, p, undefined);
    }
    return expr;
}

function testCondition(entity, cond) {
    if (!cond) return true;
    if (cond.kind && entity.kind !== cond.kind) return false;
    if (cond.path && Object.prototype.hasOwnProperty.call(cond, 'eq')) {
        const v = get(entity, cond.path.replace(/^\$\./, ''), undefined);
        return v === cond.eq;
    }
    if (cond.path && Array.isArray(cond.in)) {
        const v = get(entity, cond.path.replace(/^\$\./, ''), undefined);
        return cond.in.includes(v);
    }
    if (cond.path && cond.matches) {
        const v = String(get(entity, cond.path.replace(/^\$\./, ''), ''));
        try { return new RegExp(cond.matches, 'i').test(v); } catch (_) { return false; }
    }
    if (Array.isArray(cond.anyOf)) return cond.anyOf.some(c => testCondition(entity, c));
    if (Array.isArray(cond.allOf)) return cond.allOf.every(c => testCondition(entity, c));
    return true;
}

function materializeFields(fields, entity) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) {
        const isImageKey = /(?:portrait|image)Url$/i.test(k);
        if (Array.isArray(v)) {
            for (const part of v) {
                const raw = evalJsonPath(part, entity);
                if (isImageKey) {
                    const url = findExternalUrl(raw);
                    if (url) { out[k] = url; break; }
                } else {
                    const val = unwrapToPlainText(raw);
                    if (val && val.trim().length) { out[k] = val; break; }
                }
            }
        } else {
            const raw = evalJsonPath(v, entity);
            out[k] = isImageKey ? findExternalUrl(raw) : unwrapToPlainText(raw);
        }
    }
    // Normalize content-ish fields to markdown when they appear HTML-like
    for (const key of Object.keys(out)) {
        if (/description|content|body|text/i.test(key)) {
            out[key] = toMarkdownIfHtml(out[key]);
        }
    }
    // Drop any empty or local-file image fields outright
    for (const key of Object.keys(out)) {
        if (/(?:portrait|image)Url$/i.test(key)) {
            const val = String(out[key] || '').trim();
            if (!/^https?:\/\//i.test(val)) delete out[key];
        }
    }
    return out;
}

function scoreHeuristics(entity, rule) {
    let s = 0;
    // Baseline confidence for any explicit rule match
    s += 0.55;
    // Images present increase confidence a bit
    if ((Array.isArray(entity.images) && entity.images.length) || (typeof entity.images === 'string' && entity.images.trim().length)) s += 0.05;
    // Tags presence
    if (Array.isArray(entity.tags) && entity.tags.length) s += 0.05;
    // Kind-target pairs
    if (entity.kind === 'Actor' && rule.mapTo === 'Character') {
        s += 0.25;
        if ((entity.subtype || '').toLowerCase() === 'character') s += 0.1;
        if ((entity.subtype || '').toLowerCase() === 'npc') s += 0.07;
        const bio = entity?.metadata?.system?.details?.biography;
        if (bio && (bio.value || bio.public)) s += 0.03;
        // If a level stat is present, likely a PC (or major NPC) → tiny boost
        if (Number.isFinite(entity?.stats?.level)) s += 0.03;
        // Prototype token disposition: hostile/neutral hints at NPC sheets
        const disp = entity?.metadata?.prototypeToken?.disposition;
        if (disp === -1 || disp === 0) s += 0.02;
    }
    if (entity.kind === 'Scene' && rule.mapTo === 'Location') {
        s += 0.25;
        const bg = entity?.metadata?.bg || entity?.images?.[0];
        if (bg) s += 0.05;
        if (Array.isArray(entity.links) && entity.links.length) s += 0.05;
        // Grid/meta signals: more notes/lights/walls → more likely a map-like Location
        const counts = entity?.metadata?.counts || {};
        if ((counts.notes || 0) > 0) s += 0.03;
        if ((counts.lights || 0) > 0) s += 0.02;
        if ((counts.walls || 0) > 0) s += 0.02;
    }
    if (entity.kind === 'Item' && rule.mapTo === 'Item') {
        s += 0.2;
        const hasDesc = !!(entity?.body);
        if (hasDesc) s += 0.05;
        if (Array.isArray(entity.images) && entity.images.length) s += 0.05;
    }
    if (entity.kind === 'Journal' && rule.mapTo === 'Faction') {
        s += 0.2;
        const name = (entity.name || '').toLowerCase();
        if (/(order|guild|house|clan|legion|company|collective|cult|syndicate|faction|organization|organisation)/i.test(name)) s += 0.15;
        const folder = (entity.folderName || '').toLowerCase();
        if (/(faction|organization|organisations|guild|order|house|clan)/i.test(folder)) s += 0.15;
        if ((entity.tags || []).some(t => /faction|organization|guild|order|house|clan/i.test(t))) s += 0.1;
        // Longer text and link-rich content slightly increases confidence
        const bodyLen = (String(entity.body || '').replace(/<[^>]*>/g, '').trim().length) || 0;
        if (bodyLen > 300) s += 0.03;
        if (Array.isArray(entity.links) && entity.links.length > 2) s += 0.02;
    }
    return Math.min(1, s);
}

/**
 * Map GenericEntity → Archivist shape proposal with confidence
 */
export function mapEntityToArchivist(entity, overridePreset) {
    const systemId = game.system?.id || 'generic';
    const { preset } = overridePreset || getPresetForSystemId(systemId);
    let best = null; let bestScore = -Infinity;
    for (const rule of preset.rules) {
        const matched = rule.fallback ? (best == null) : testCondition(entity, rule.if);
        if (!matched) continue;
        let score = 0;
        if (rule.confidenceBoost) score += Number(rule.confidenceBoost) || 0;
        score += scoreHeuristics(entity, rule);
        // Clamp per-rule score into [0,1] so boosts never exceed 100%
        score = Math.max(0, Math.min(1, score));
        const payload = materializeFields(rule.fields || {}, entity);
        if (!best || score > bestScore) { best = { targetType: rule.mapTo, payload, labels: rule.labels || [], score }; bestScore = score; }
    }
    if (!best) {
        best = { targetType: 'Note', payload: { title: entity.name, content: entity.body }, labels: [], score: 0.3 };
    }
    return best;
}


// --- Image helpers ---

function isExternalUrl(s) {
    const str = String(s || '').trim();
    return /^https?:\/\//i.test(str);
}

/**
 * Attempt to pull the first external URL from a variety of shapes
 * (string, array, objects with src/url/href)
 */
function findExternalUrl(value) {
    if (value == null) return '';
    if (typeof value === 'string') return isExternalUrl(value) ? value.trim() : '';
    if (Array.isArray(value)) {
        for (const v of value) {
            const u = findExternalUrl(v);
            if (u) return u;
        }
        return '';
    }
    if (typeof value === 'object') {
        const candidates = [value.src, value.url, value.href, value.path, value.link, value.texture?.src];
        for (const c of candidates) {
            const u = findExternalUrl(c);
            if (u) return u;
        }
    }
    try { return isExternalUrl(String(value)) ? String(value).trim() : ''; } catch (_) { return ''; }
}

