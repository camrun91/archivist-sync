/**
 * Content fingerprint utilities (idempotence)
 */

async function sha256HexFromString(input) {
    try {
        const enc = new TextEncoder();
        const data = enc.encode(input);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        // Fallback non-cryptographic hash
        let h = 2166136261;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
        }
        return (h >>> 0).toString(16);
    }
}

/**
 * Compute a stable fingerprint for a normalized GenericEntity
 * @param {import('./importer-types.js').GenericEntity} entity
 */
export async function computeEntityFingerprint(entity) {
    const normalized = {
        kind: entity.kind,
        subtype: entity.subtype || '',
        name: entity.name || '',
        blurb: entity.blurb || '',
        body: entity.body || '',
        stats: entity.stats || {},
        tags: Array.isArray(entity.tags) ? [...entity.tags].sort() : [],
        images: Array.isArray(entity.images) ? entity.images : [],
        metadata: sanitizeMeta(entity.metadata)
    };
    const json = JSON.stringify(normalized);
    return await sha256HexFromString(json);
}

function sanitizeMeta(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const shallow = { ...obj };
    // Drop noisy keys
    delete shallow._id; delete shallow._rev; delete shallow.updatedAt; delete shallow.createdAt;
    return shallow;
}


