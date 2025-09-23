/**
 * Importer types and small helpers
 */

/**
 * @typedef {Object} GenericEntity
 * @property {('Actor'|'Journal'|'Scene'|'Item'|'Playlist'|'RollTable'|'Card'|'Macro'|'Folder'|'ChatMessage')} kind
 * @property {string=} subtype
 * @property {string} name
 * @property {string=} blurb
 * @property {string=} body
 * @property {Record<string, string|number|boolean>=} stats
 * @property {string[]=} tags
 * @property {Array<{type:string, value:string}>=} links
 * @property {string[]=} images
 * @property {string} sourcePath  // Foundry UUID
 * @property {Record<string, any>=} metadata
 * @property {number=} confidence
 * @property {string=} folderName
 */

/**
 * @typedef {Object} MappingRule
 * @property {Object=} if
 * @property {boolean=} fallback
 * @property {string} mapTo
 * @property {Object<string, any>=} fields
 * @property {string[]=} labels
 * @property {number=} confidenceBoost
 */

/**
 * @typedef {Object} MappingPreset
 * @property {number} version
 * @property {MappingRule[]} rules
 */

export const ImporterKinds = Object.freeze({
    Actor: 'Actor',
    Journal: 'Journal',
    Scene: 'Scene',
    Item: 'Item',
    Playlist: 'Playlist',
    RollTable: 'RollTable',
    Card: 'Card',
    Macro: 'Macro',
    Folder: 'Folder',
    ChatMessage: 'ChatMessage'
});


