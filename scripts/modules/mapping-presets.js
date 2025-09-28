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
                description: ['$.metadata.system.details.biography.value', '$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images'
            },
            labels: ['PC'],
            confidenceBoost: 0.2
        },
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', in: ['npc', 'monster'] },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                description: ['$.metadata.system.details.biography.value', '$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images'
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
            fields: { title: '$.name', description: '$.body', imageUrl: '$.images' }
        },
        {
            if: { kind: ImporterKinds.Item },
            mapTo: 'Item',
            fields: {
                name: '$.name',
                description: ['$.metadata.system.description.value', '$.metadata.system.description', '$.body'],
                imageUrl: '$.images'
            }
        },
        {
            if: { kind: ImporterKinds.Scene },
            mapTo: 'Location',
            fields: {
                title: '$.name',
                description: ['$.body'],
                imageUrl: ['$.metadata.background.src', '$.images', '$.metadata.img'],
                mapMeta: '$.metadata'
            }
        },
        { fallback: true, mapTo: 'Note', fields: { title: '$.name', content: '$.body' } }
    ]
};

/** dnd5e-specific tweaks */
const dnd5e = {
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
                description: ['$.metadata.system.details.biography.value', '$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images'
            },
            labels: ['PC'],
            confidenceBoost: 0.25
        },
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', in: ['npc', 'monster', 'vehicle'] },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                description: ['$.metadata.system.details.biography.value', '$.metadata.system.details.biography', '$.body'],
                portraitUrl: '$.images'
            },
            labels: ['NPC']
        },
        {
            if: { kind: ImporterKinds.Item },
            mapTo: 'Item',
            fields: {
                name: '$.name',
                description: ['$.metadata.system.description.value', '$.metadata.system.description', '$.body'],
                imageUrl: '$.images'
            }
        },
        {
            if: { kind: ImporterKinds.Scene },
            mapTo: 'Location',
            fields: {
                title: '$.name',
                description: ['$.body'],
                imageUrl: ['$.metadata.background.src', '$.images', '$.metadata.img'],
                mapMeta: '$.metadata'
            }
        },
        {
            if: {
                kind: ImporterKinds.Journal, anyOf: [
                    { path: 'folderName', matches: '(?i)factions|organizations|guilds' },
                    { path: 'tags', hasAny: ['faction', 'organization', 'guild'] }
                ]
            },
            mapTo: 'Faction',
            fields: { title: '$.name', description: '$.body', imageUrl: '$.images' }
        },
        { fallback: true, mapTo: 'Note', fields: { title: '$.name', content: '$.body' } }
    ]
};

/** pf2e-specific tweaks */
const pf2e = {
    version: 1,
    rules: [
        // PF2e hazard actors should not become Character; map them to Note by default
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', eq: 'hazard' },
            mapTo: 'Note',
            fields: { title: '$.name', content: ['$.metadata.system.details.publicNotes', '$.metadata.system.details.privateNotes', '$.body'] },
            labels: ['Hazard']
        },
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', in: ['character'] },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                // PF2e commonly uses publicNotes; privateNotes can be GM-only
                description: ['$.metadata.system.details.publicNotes', '$.metadata.system.details.privateNotes', '$.body'],
                portraitUrl: '$.images'
            },
            labels: ['PC'],
            confidenceBoost: 0.25
        },
        {
            if: { kind: ImporterKinds.Actor, path: 'metadata.type', in: ['npc', 'familiar'] },
            mapTo: 'Character',
            fields: {
                title: '$.name',
                description: ['$.metadata.system.details.publicNotes', '$.metadata.system.details.privateNotes', '$.body'],
                portraitUrl: '$.images'
            },
            labels: ['NPC']
        },
        {
            if: { kind: ImporterKinds.Item },
            mapTo: 'Item',
            fields: {
                name: '$.name',
                description: ['$.metadata.system.description.value', '$.metadata.system.description', '$.body'],
                imageUrl: '$.images'
            }
        },
        {
            if: { kind: ImporterKinds.Scene },
            mapTo: 'Location',
            fields: {
                title: '$.name',
                description: ['$.body'],
                imageUrl: ['$.metadata.background.src', '$.images', '$.metadata.img'],
                mapMeta: '$.metadata'
            }
        },
        {
            if: {
                kind: ImporterKinds.Journal, anyOf: [
                    { path: 'folderName', matches: '(?i)factions|organizations|guilds' },
                    { path: 'tags', hasAny: ['faction', 'organization', 'guild'] }
                ]
            },
            mapTo: 'Faction',
            fields: { title: '$.name', description: '$.body', imageUrl: '$.images' }
        },
        { fallback: true, mapTo: 'Note', fields: { title: '$.name', content: '$.body' } }
    ]
};

/**
 * Return a preset id and data by foundry system id
 */
export function getPresetForSystemId(systemId) {
    const id = String(systemId || '').toLowerCase();
    if (id === 'dnd5e') return { presetId: 'dnd5e', preset: dnd5e };
    if (id === 'pf2e') return { presetId: 'pf2e', preset: pf2e };
    return { presetId: id || 'generic', preset: generic };
}

export const MappingPresets = { generic, dnd5e, pf2e };


