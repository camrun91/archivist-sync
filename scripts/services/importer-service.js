import { settingsManager } from '../modules/settings-manager.js';
import { extractGenericEntities } from '../modules/importer-extractor.js';
import { mapEntityToArchivist } from '../modules/importer-mapper.js';
import { computeEntityFingerprint } from '../modules/importer-fingerprint.js';
import { upsertMappedEntity } from '../modules/importer-upserter.js';
import { unwrapToPlainText } from '../modules/importer-normalizer.js';
import { getPresetForSystemId } from '../modules/mapping-presets.js';
import { getActorCandidates } from '../modules/actor-filters.js';
import { gatherUsedItems } from '../modules/items-gather.js';
import { discoverFactions } from '../modules/factions-discover.js';
import { mapActorToArchivist, mapItemToArchivist, mapJournalToFaction } from '../modules/deterministic-mapper.js';

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
    // Character PC/NPC override from UI (stored as characterType)
    const charType = uuidFix?.characterType || keyFix?.characterType;
    if (out.targetType === 'Character' && charType) {
        const labels = new Set((out.labels || []).map(l => String(l).toUpperCase()));
        labels.delete('PC'); labels.delete('NPC');
        labels.add(String(charType).toUpperCase());
        out.labels = Array.from(labels);
    }

    // Field overrides: evaluate JSONPath-like references against the source entity
    const fieldPaths = { ...(keyFix?.fieldPaths || {}), ...(uuidFix?.fieldPaths || {}) };
    if (fieldPaths && Object.keys(fieldPaths).length) {
        const newPayload = { ...(out.payload || {}) };
        for (const [field, path] of Object.entries(fieldPaths)) {
            if (!path) continue;
            const value = safeGet(entity, path);
            const plain = unwrapToPlainText(value);
            if (plain != null && String(plain).trim().length) newPayload[field] = plain;
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
        // Balanced sampling per kind to avoid skew
        const corrections = this.getCorrections();
        const all = extractGenericEntities();
        const byKind = { Actor: [], Journal: [], Scene: [], Item: [] };
        for (const e of all) {
            if (byKind[e.kind]) byKind[e.kind].push(e);
        }
        const perKind = Math.max(1, Math.floor(sampleSize / 4));
        const picked = [];
        for (const k of Object.keys(byKind)) {
            const arr = byKind[k];
            if (arr.length <= perKind) picked.push(...arr);
            else picked.push(...arr.slice(0, perKind));
        }
        const entities = picked;
        return entities.map(e => {
            const proposed = mapEntityToArchivist(e);
            const corrected = applyCorrections(e, proposed, corrections);
            const include = corrections?.byUuid?.[e.sourcePath]?.include !== false; // default include
            return { entity: e, proposal: corrected, include };
        });
    }

    /**
     * Produce the full set of proposed mappings for review (no sampling)
     */
    all() {
        const corrections = this.getCorrections();
        // Legacy semantic importer path retained only when enabled
        if (!settingsManager.getSemanticMappingEnabled()) {
            ui.notifications?.warn?.('Semantic importer is disabled. Use the Mapping Wizard tab to run deterministic sync.');
            return { total: 0, autoImported: 0, queued: 0, dropped: 0, errors: 0 };
        }
        const entities = extractGenericEntities();
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
                // Defensive clamp: ensure score is within [0,1]
                const score = Math.max(0, Math.min(1, Number(corrected.score || 0)));
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
        const config = settingsManager.getImportConfig?.() || {};
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
            // Enforce destination folder constraints for Items and Actors when pushing filtered
            if (filter?.targetType === 'Item') {
                const include = Array.isArray(config?.includeRules?.filters?.items?.includeWorldItemFolders)
                    ? config.includeRules.filters.items.includeWorldItemFolders.filter(Boolean)
                    : [];
                const folder = srcDoc?.folder;
                if (include.length === 0) {
                    // Root-only: only include items with no folder
                    if (folder) continue;
                } else {
                    const fid = folder?.id || '';
                    const fname = folder?.name || '';
                    if (!(include.includes(fid) || include.includes(fname))) continue;
                }
            }
            try {
                const res = await upsertMappedEntity(apiKey, worldId, srcDoc, corrected);
                if (res && res.success) createdOrUpdated += 1;
            } catch (_) {
                // ignore failures here; count only successes
            }
        }
        return { success: true, count: createdOrUpdated };
    }

    /**
     * Config-driven push using deterministic mapping and explicit filters
     * @param {Object} progressCallback - Optional callback for progress updates
     */
    async pushDeterministic(progressCallback = null) {
        const apiKey = settingsManager.getApiKey();
        const worldId = settingsManager.getSelectedWorldId();
        if (!apiKey || !worldId) throw new Error('API key or world selection missing');

        const config = settingsManager.getImportConfig();
        const { pcs, npcs } = getActorCandidates(config);

        const safeProgress = (payload) => {
            if (!progressCallback) return;
            try { progressCallback.updateSyncProgress(payload); } catch (_) { /* ignore UI errors */ }
        };

        let count = 0;
        let failed = 0;
        const failedEntities = [];

        // Calculate total entities to process
        const enabledNpcs = config?.actorMappings?.npc?.enabled ? npcs : [];
        const actorPool = [...pcs, ...(config?.includeRules?.filters?.items?.includeActorOwnedFrom === 'pc+npc' ? enabledNpcs : [])];
        const usedItems = await gatherUsedItems(config, actorPool);
        const factions = discoverFactions(config);

        const pcCount = config?.actorMappings?.pc?.enabled !== false ? pcs.length : 0;
        const npcCount = config?.actorMappings?.npc?.enabled ? npcs.length : 0;
        const itemCount = usedItems.length;
        const factionCount = factions.length;
        const totalEntities = pcCount + npcCount + itemCount + factionCount;

        // Initialize progress
        safeProgress({
            total: totalEntities,
            processed: 0,
            succeeded: 0,
            failed: 0,
            phase: 'processing'
        });

        // Helper function to process entities with error tracking
        const processEntity = async (entity, mapper, type) => {
            const entityName = entity.name || 'Unknown';

            // Update progress to show current entity
            safeProgress({ currentType: type, currentEntity: entityName });

            try {
                const mapped = mapper(entity);
                const res = await upsertMappedEntity(apiKey, worldId, entity, mapped);

                if (res?.success) {
                    count += 1;

                    // Update progress
                    if (progressCallback) {
                        progressCallback.updateSyncProgress({
                            processed: count + failed,
                            succeeded: count
                        });
                    }

                    return true;
                } else {
                    console.warn(`${CONFIG.MODULE_TITLE} | Failed to sync ${type}: ${entityName} - ${res?.message || 'Unknown error'}`);

                    // Track failed entities for potential retry
                    failedEntities.push({
                        entity,
                        mapper,
                        type,
                        error: res?.message,
                        retryable: res?.retryable
                    });
                    failed += 1;

                    // Update progress
                    if (progressCallback) {
                        progressCallback.updateSyncProgress({
                            processed: count + failed,
                            failed: failed
                        });
                    }

                    return false;
                }
            } catch (error) {
                console.error(`${CONFIG.MODULE_TITLE} | Exception processing ${type}: ${entityName}`, error);
                failedEntities.push({
                    entity,
                    mapper,
                    type,
                    error: error.message,
                    retryable: false
                });
                failed += 1;

                // Update progress
                if (progressCallback) {
                    progressCallback.updateSyncProgress({
                        processed: count + failed,
                        failed: failed
                    });
                }

                return false;
            }
        };

        // Process PCs
        if (config?.actorMappings?.pc?.enabled !== false) {
            console.log(`${CONFIG.MODULE_TITLE} | Processing ${pcs.length} PC actors...`);
            for (let i = 0; i < pcs.length; i++) {
                await processEntity(pcs[i], (actor) => mapActorToArchivist(actor, config, 'pc'), 'PC');

                // Add small delay every 10 entities to prevent overwhelming the API
                if ((i + 1) % 10 === 0 && i < pcs.length - 1) {
                    console.log(`${CONFIG.MODULE_TITLE} | Processed ${i + 1}/${pcs.length} PCs, pausing briefly...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        // Process NPCs
        if (config?.actorMappings?.npc?.enabled) {
            console.log(`${CONFIG.MODULE_TITLE} | Processing ${npcs.length} NPC actors...`);
            for (let i = 0; i < npcs.length; i++) {
                await processEntity(npcs[i], (actor) => mapActorToArchivist(actor, config, 'npc'), 'NPC');

                // Add small delay every 10 entities to prevent overwhelming the API
                if ((i + 1) % 10 === 0 && i < npcs.length - 1) {
                    console.log(`${CONFIG.MODULE_TITLE} | Processed ${i + 1}/${npcs.length} NPCs, pausing briefly...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        // Process Items
        console.log(`${CONFIG.MODULE_TITLE} | Processing ${usedItems.length} items...`);
        for (let i = 0; i < usedItems.length; i++) {
            await processEntity(usedItems[i], (item) => mapItemToArchivist(item, config), 'Item');

            // Add small delay every 10 entities to prevent overwhelming the API
            if ((i + 1) % 10 === 0 && i < usedItems.length - 1) {
                console.log(`${CONFIG.MODULE_TITLE} | Processed ${i + 1}/${usedItems.length} items, pausing briefly...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Process Factions
        console.log(`${CONFIG.MODULE_TITLE} | Processing ${factions.length} factions...`);
        for (let i = 0; i < factions.length; i++) {
            await processEntity(factions[i].doc, mapJournalToFaction, 'Faction');

            // Add small delay every 10 entities to prevent overwhelming the API
            if ((i + 1) % 10 === 0 && i < factions.length - 1) {
                console.log(`${CONFIG.MODULE_TITLE} | Processed ${i + 1}/${factions.length} factions, pausing briefly...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Retry failed entities that are retryable (rate limits, network errors)
        const retryable = failedEntities.filter(f => f.retryable);
        if (retryable.length > 0) {
            console.log(`${CONFIG.MODULE_TITLE} | Retrying ${retryable.length} failed entities after brief delay...`);

            // Update progress to show retry phase
            if (progressCallback) {
                progressCallback.updateSyncProgress({
                    phase: 'retrying',
                    currentType: 'Retry',
                    currentEntity: `Retrying ${retryable.length} failed entities...`
                });
            }

            await new Promise(r => setTimeout(r, 5000)); // 5 second delay before retry

            for (const failedItem of retryable) {
                console.log(`${CONFIG.MODULE_TITLE} | Retrying ${failedItem.type}: ${failedItem.entity.name || 'Unknown'}`);
                const success = await processEntity(failedItem.entity, failedItem.mapper, failedItem.type + ' (retry)');
                if (success) {
                    // Remove from failed list since it succeeded on retry
                    const index = failedEntities.indexOf(failedItem);
                    if (index > -1) {
                        failedEntities.splice(index, 1);
                        failed -= 1;
                    }
                }
            }
        }

        // Report results
        const totalProcessed = count + failed;
        console.log(`${CONFIG.MODULE_TITLE} | Sync complete: ${count} succeeded, ${failed} failed out of ${totalProcessed} total`);

        if (failedEntities.length > 0) {
            console.warn(`${CONFIG.MODULE_TITLE} | Failed entities:`, failedEntities.map(f => `${f.type}: ${f.entity.name || 'Unknown'} (${f.error})`));
        }

        return {
            success: true,
            count,
            failed,
            total: totalProcessed,
            failedEntities: failedEntities.map(f => ({
                name: f.entity.name || 'Unknown',
                type: f.type,
                error: f.error
            }))
        };
    }
}

export const importerService = new ImporterService();


