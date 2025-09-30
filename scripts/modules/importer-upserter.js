import { CONFIG } from './config.js';
import { archivistApi } from '../services/archivist-api.js';
import { toMarkdownIfHtml, unwrapToPlainText } from './importer-normalizer.js';

function resolveCharacterType(srcDoc, labels) {
    const labelSet = new Set((labels || []).map(l => String(l).toUpperCase()));
    if (labelSet.has('PC')) return 'PC';
    if (labelSet.has('NPC')) return 'NPC';
    const t = String(srcDoc?.type || '').toLowerCase();
    return t === 'character' ? 'PC' : 'NPC';
}

function coalesce(...values) {
    for (const v of values) {
        const s = unwrapToPlainText(v);
        if (s && s.trim().length) return s;
    }
    return undefined;
}

function normalizeText(value) {
    const s = unwrapToPlainText(value);
    return toMarkdownIfHtml(s);
}

function buildApiPayload(worldId, srcDoc, mapped) {
    const p = mapped?.payload || {};
    if (mapped?.targetType === 'Character') {
        const characterName = coalesce(p.character_name, p.title, p.name, srcDoc?.name, 'Character');
        const description = normalizeText(coalesce(p.description, ''));
        const image = coalesce(p.portraitUrl, p.imageUrl, p.image);
        const type = resolveCharacterType(srcDoc, mapped?.labels);
        const payload = { character_name: characterName, description, type, campaign_id: worldId };
        if (image && /^https:\/\//i.test(String(image))) payload.image = image;
        return payload;
    }
    if (mapped?.targetType === 'Faction') {
        const name = coalesce(p.name, p.title, srcDoc?.name, 'Faction');
        const description = normalizeText(coalesce(p.description, ''));
        const image = coalesce(p.imageUrl, p.image);
        const payload = { name, description, campaign_id: worldId };
        if (image && /^https:\/\//i.test(String(image))) payload.image = image;
        return payload;
    }
    if (mapped?.targetType === 'Location') {
        const name = coalesce(p.name, p.title, srcDoc?.name, 'Location');
        const description = normalizeText(coalesce(p.description, ''));
        const image = coalesce(p.imageUrl, p.image);
        const payload = { name, description, campaign_id: worldId };
        if (image && /^https:\/\//i.test(String(image))) payload.image = image;
        return payload;
    }
    if (mapped?.targetType === 'Item') {
        const name = coalesce(p.name, p.title, srcDoc?.name, 'Item');
        const description = normalizeText(coalesce(p.description, ''));
        const image = coalesce(p.imageUrl, p.image);
        const payload = { name, description, campaign_id: worldId };
        if (image && /^https:\/\//i.test(String(image))) payload.image = image;
        return payload;
    }
    // Default passthrough for unsupported types
    return { ...p, campaign_id: worldId };
}

function setFlagForSource(doc, id, type, fingerprint, worldId) {
    const f = [];
    if (id) f.push(doc.setFlag(CONFIG.MODULE_ID, 'archivistId', id));
    if (type) f.push(doc.setFlag(CONFIG.MODULE_ID, 'archivistType', type));
    if (worldId) f.push(doc.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId));
    if (fingerprint) f.push(doc.setFlag(CONFIG.MODULE_ID, 'archivistFingerprint', fingerprint));
    return Promise.allSettled(f);
}

export async function upsertMappedEntity(apiKey, worldId, srcDoc, mapped) {
    const type = mapped.targetType;
    const payload = buildApiPayload(worldId, srcDoc, mapped);
    // For importer force-create path, ignore any existing IDs
    const forceCreate = !!mapped?.forceCreate;
    let existingId = forceCreate ? null : srcDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivistId');
    const existingWorld = forceCreate ? null : srcDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivistWorldId');
    if (!forceCreate) {
        // Only allow update when both id and matching world are present
        if (!existingWorld || (existingWorld && existingWorld !== worldId)) {
            existingId = null;
        }
    }
    if (type === 'Character') {
        if (existingId) {
            try {
                return await archivistApi.updateCharacter(apiKey, existingId, payload);
            } catch (e) {
                // Fallback to create on permission/ownership errors
                const created = await archivistApi.createCharacter(apiKey, payload);
                if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'character', undefined, worldId);
                return created;
            }
        }
        const created = await archivistApi.createCharacter(apiKey, payload);
        if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'character', undefined, worldId);
        return created;
    }
    if (type === 'Faction') {
        if (existingId) {
            try {
                return await archivistApi.updateFaction(apiKey, existingId, payload);
            } catch (e) {
                const created = await archivistApi.createFaction(apiKey, payload);
                if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'faction', undefined, worldId);
                return created;
            }
        }
        const created = await archivistApi.createFaction(apiKey, payload);
        if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'faction', undefined, worldId);
        return created;
    }
    if (type === 'Location') {
        if (existingId) {
            try {
                return await archivistApi.updateLocation(apiKey, existingId, payload);
            } catch (e) {
                const created = await archivistApi.createLocation(apiKey, payload);
                if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'location', undefined, worldId);
                return created;
            }
        }
        const created = await archivistApi.createLocation(apiKey, payload);
        if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'location', undefined, worldId);
        return created;
    }
    if (type === 'Item') {
        if (existingId) {
            try {
                return await archivistApi.updateItem(apiKey, existingId, payload);
            } catch (e) {
                const created = await archivistApi.createItem(apiKey, payload);
                if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'item', undefined, worldId);
                return created;
            }
        }
        const created = await archivistApi.createItem(apiKey, payload);
        if (created.success && created.data?.id) await setFlagForSource(srcDoc, created.data.id, 'item', undefined, worldId);
        return created;
    }
    // Notes and other types are not yet directly upserted
    return { success: true, data: null };
}


