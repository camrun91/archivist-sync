import { settingsManager } from '../modules/settings-manager.js';
import { extractGenericEntities } from '../modules/importer-extractor.js';
import { mapEntityToArchivist } from '../modules/importer-mapper.js';
import { computeEntityFingerprint } from '../modules/importer-fingerprint.js';
import { upsertMappedEntity } from '../modules/importer-upserter.js';
import { getPresetForSystemId } from '../modules/mapping-presets.js';

function applyCorrections(entity, proposed, corrections) {
    const key = `${entity.kind}|${entity.subtype || ''}|${(entity.folderName || '').toLowerCase()}`;
    const fixed = corrections?.byKey?.[key];
    if (!fixed) return proposed;
    // Override only the target type; payload left as-is for simplicity
    return { ...proposed, targetType: fixed.targetType, score: Math.max(proposed.score, 0.8) };
}

export class ImporterService {
    detectPreset() {
        const systemId = game.system?.id || 'generic';
        const { presetId, preset } = getPresetForSystemId(systemId);
        return { systemId, presetId, preset };
    }

    getCorrections() {
        try { return JSON.parse(settingsManager.getMappingOverride() || '{}') || {}; } catch (_) { return {}; }
    }

    async saveCorrections(corrections) {
        await settingsManager.setMappingOverride(JSON.stringify(corrections || {}));
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
            return { entity: e, proposal: corrected };
        });
    }

    /**
     * Run an import pass across all entities with thresholds
     */
    async runImport({ thresholdA = 0.75, thresholdB = 0.4 } = {}) {
        const apiKey = settingsManager.getApiKey();
        const worldId = settingsManager.getSelectedWorldId();
        if (!apiKey || !worldId) throw new Error('API key or world selection missing');
        const corrections = this.getCorrections();
        const entities = extractGenericEntities();
        const summary = { total: entities.length, autoImported: 0, queued: 0, dropped: 0, errors: 0 };
        for (const e of entities) {
            try {
                const proposed = mapEntityToArchivist(e);
                const corrected = applyCorrections(e, proposed, corrections);
                const score = Number(corrected.score || 0);
                if (score >= thresholdA) {
                    const srcDoc = await fromUuid(e.sourcePath);
                    await upsertMappedEntity(apiKey, worldId, srcDoc, corrected);
                    const fp = await computeEntityFingerprint(e);
                    try { await srcDoc?.setFlag?.(settingsManager.moduleId, 'archivistFingerprint', fp); } catch (_) { }
                    summary.autoImported += 1;
                } else if (score >= thresholdB) {
                    summary.queued += 1;
                } else {
                    summary.dropped += 1;
                }
            } catch (_) {
                summary.errors += 1;
            }
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
            await upsertMappedEntity(apiKey, worldId, srcDoc, corrected);
            createdOrUpdated += 1;
        }
        return { success: true, count: createdOrUpdated };
    }
}

export const importerService = new ImporterService();


