import { ImporterKinds } from './importer-types.js';

/** @type {Record<string, any>} */
const generic = {
    version: 1,
    rules: [
        {
            if: {
                kind: ImporterKinds.Actor, anyOf: [
                    { path: 'metadata.type', eq: 'character' },
                    { path: 'metadata.type', eq: 'pc' }
                ]
            },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                description: ['$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images[0]'
            },
            labels: ['PC'],
            confidenceBoost: 0.2
        },
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', in: ['npc', 'monster'] },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                description: ['$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images[0]'
            },
            labels: ['NPC']
        },
        {
            if: {
                kind: ImporterKinds.Journal, anyOf: [
                    { path: 'folderName', matches: '(?i)factions|organizations|guilds' },
                    { path: 'tags', hasAny: ['faction', 'organization', 'guild'] }
                ]
            },
            mapTo: 'Faction',
            fields: { title: '$.name', description: '$.body', imageUrl: '$.images[0]' }
        },
        {
            if: { kind: ImporterKinds.Scene },
            mapTo: 'Location',
            fields: {
                title: '$.name',
                description: ['$.body'],
                imageUrl: '$.images[0]',
                mapMeta: '$.metadata'
            }
        },
        { fallback: true, mapTo: 'Note', fields: { title: '$.name', content: '$.body' } }
    ]
};

/**
 * Return a preset id and data by foundry system id
 */
export function getPresetForSystemId(systemId) {
    const id = String(systemId || '').toLowerCase();
    // For now, reuse generic for all systems; future: 'dnd5e', 'pf2e'
    return { presetId: id || 'generic', preset: generic };
}

export const MappingPresets = { generic };


