import { settingsManager } from '../modules/settings-manager.js';
import { extractGenericEntities } from '../modules/importer-extractor.js';
import { mapEntityToArchivist } from '../modules/importer-mapper.js';
import { computeEntityFingerprint } from '../modules/importer-fingerprint.js';
import { upsertMappedEntity } from '../modules/importer-upserter.js';
import { getPresetForSystemId } from '../modules/mapping-presets.js';

function safeGet(obj, path) {
    try {
        const p = String(path || '').replace(/^\$\./, '').split('.');
        return p.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    } catch (_) { return undefined; }
}

function buildCorrectionKey(entity) {
    return `${entity.kind}|${entity.subtype || ''}|${(entity.folderName || '').toLowerCase()}`;
}

function applyCorrections(entity, proposed, corrections) {
    const byKey = corrections?.byKey || {};
    const byUuid = corrections?.byUuid || {};
    const key = buildCorrectionKey(entity);
    const uuidFix = byUuid?.[entity.sourcePath] || {};
    const keyFix = byKey?.[key] || {};

    let out = { ...proposed };

    // Target type overrides: per-UUID takes precedence over per-key
    if (keyFix?.targetType) out.targetType = keyFix.targetType;
    if (uuidFix?.targetType) out.targetType = uuidFix.targetType;

    // Field overrides: evaluate JSONPath-like references against the source entity
    const fieldPaths = { ...(keyFix?.fieldPaths || {}), ...(uuidFix?.fieldPaths || {}) };
    if (fieldPaths && Object.keys(fieldPaths).length) {
        const newPayload = { ...(out.payload || {}) };
        for (const [field, path] of Object.entries(fieldPaths)) {
            if (!path) continue;
            const value = safeGet(entity, path);
            if (value != null) newPayload[field] = value;
        }
        out.payload = newPayload;
    }

    return out;
}

export class ImporterService {
    detectPreset() {
        const systemId = game.system?.id || 'generic';
        const { presetId, preset } = getPresetForSystemId(systemId);
        return { systemId, presetId, preset };
    }

    getCorrections() {
        try {
            const raw = JSON.parse(settingsManager.getMappingOverride() || '{}') || {};
            // Normalize shape
            return { byKey: raw.byKey || {}, byUuid: raw.byUuid || {} };
        } catch (_) { return { byKey: {}, byUuid: {} }; }
    }

    async saveCorrections(corrections) {
        const normalized = corrections || {};
        await settingsManager.setMappingOverride(JSON.stringify({ byKey: normalized.byKey || {}, byUuid: normalized.byUuid || {} }));
        return true;
    }

    /**
     * Produce a small sample of proposed mappings for review
     */
    sample(sampleSize = 20) {
        const corrections = this.getCorrections();
        const entities = extractGenericEntities(sampleSize);
        return entities.map(e => {
            const proposed = mapEntityToArchivist(e);
            const corrected = applyCorrections(e, proposed, corrections);
            const include = corrections?.byUuid?.[e.sourcePath]?.include !== false; // default include
            return { entity: e, proposal: corrected, include };
        });
    }

    /**
     * Run an import pass across all entities with thresholds
     */
    async runImport({ thresholdA = 0.75, thresholdB = 0.4, onProgress } = {}) {
        const apiKey = settingsManager.getApiKey();
        const worldId = settingsManager.getSelectedWorldId();
        if (!apiKey || !worldId) throw new Error('API key or world selection missing');
        const corrections = this.getCorrections();
        const entities = extractGenericEntities();
        const summary = { total: entities.length, autoImported: 0, queued: 0, dropped: 0, errors: 0 };
        onProgress?.({ ...summary, completed: 0 });
        let completed = 0;
        for (const e of entities) {
            try {
                // Respect include/exclude selection
                const inc = corrections?.byUuid?.[e.sourcePath]?.include;
                if (inc === false) { summary.dropped += 1; completed += 1; onProgress?.({ ...summary, completed }); continue; }
                const proposed = mapEntityToArchivist(e);
                const corrected = applyCorrections(e, proposed, corrections);
                const score = Number(corrected.score || 0);
                if (score >= thresholdA) {
                    const srcDoc = await fromUuid(e.sourcePath);
                    // Force-create: ignore any existing Archivist IDs/flags during import
                    srcDoc?.unsetFlag?.(settingsManager.moduleId, 'archivistId');
                    srcDoc?.unsetFlag?.(settingsManager.moduleId, 'archivistWorldId');
                    const res = await upsertMappedEntity(apiKey, worldId, srcDoc, { ...corrected, forceCreate: true });
                    if (res && res.success) {
                        const fp = await computeEntityFingerprint(e);
                        try { await srcDoc?.setFlag?.(settingsManager.moduleId, 'archivistFingerprint', fp); } catch (_) { }
                        summary.autoImported += 1;
                    } else {
                        summary.errors += 1;
                    }
                } else if (score >= thresholdB) {
                    summary.queued += 1;
                } else {
                    summary.dropped += 1;
                }
            } catch (_) {
                summary.errors += 1;
            }
            completed += 1;
            onProgress?.({ ...summary, completed });
        }
        return summary;
    }

    /**
     * Push only certain categories using the same mapping pipeline
     */
    async pushFiltered(filter) {
        const apiKey = settingsManager.getApiKey();
        const worldId = settingsManager.getSelectedWorldId();
        if (!apiKey || !worldId) throw new Error('API key or world selection missing');
        const corrections = this.getCorrections();
        const all = extractGenericEntities();
        const kindSet = new Set(filter?.kinds || []);
        const entities = all.filter(e => kindSet.size ? kindSet.has(e.kind) : true);
        let createdOrUpdated = 0;
        for (const e of entities) {
            const proposed = mapEntityToArchivist(e);
            const corrected = applyCorrections(e, proposed, corrections);
            if (filter?.targetType && corrected.targetType !== filter.targetType) continue;
            if (filter?.folderMatch && e.folderName && !new RegExp(filter.folderMatch, 'i').test(e.folderName)) continue;
            const srcDoc = await fromUuid(e.sourcePath);
            try {
                const res = await upsertMappedEntity(apiKey, worldId, srcDoc, corrected);
                if (res && res.success) createdOrUpdated += 1;
            } catch (_) {
                // ignore failures here; count only successes
            }
        }
        return { success: true, count: createdOrUpdated };
    }
}

export const importerService = new ImporterService();


