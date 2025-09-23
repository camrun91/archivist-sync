import { CONFIG } from './config.js';
import { archivistApi } from '../services/archivist-api.js';

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
    const payload = { ...mapped.payload, worldId };
    let existingId = srcDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivistId');
    const existingWorld = srcDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivistWorldId');
    // Only allow PUT when both id and matching world are present
    if (!existingWorld || (existingWorld && existingWorld !== worldId)) {
        // Bound to another world; ignore and create
        existingId = null;
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
    // Notes and other types are not yet directly upserted
    return { success: true, data: null };
}


