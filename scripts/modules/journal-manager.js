import { CONFIG } from './config.js';
import { Utils } from './utils.js';

/**
 * Centralized helpers for creating and managing Archivist journals and folders.
 * Uses Utils helpers for low-level operations; adds type-aware folder routing.
 */
export class JournalManager {
    constructor() {
        this.folderNames = {
            pc: 'Archivist - PCs',
            npc: 'Archivist - NPCs',
            item: 'Archivist - Items',
            location: 'Archivist - Locations',
            faction: 'Archivist - Factions',
            recap: 'Recaps',
            entry: null,
        };
    }

    async ensureDefaultFolders() {
        const values = new Set(Object.values(this.folderNames).filter(Boolean));
        const created = {};
        for (const name of values) {
            try { created[name] = await Utils.ensureJournalFolder(name); } catch (_) { created[name] = null; }
        }
        return created;
    }

    /** Create a journal by sheetType and initialize flags */
    async create({ name, sheetType, archivistId, worldId, text = '' }) {
        const folderName = this.folderNames[sheetType] || null;
        return await Utils.createArchivistJournal({ name, sheetType, archivistId, worldId, folderName, text });
    }

    /** Find JournalEntry by Archivist ID */
    findByArchivistId(id) {
        try {
            const journals = game.journal?.contents || [];
            return journals.find(j => (j.getFlag(CONFIG.MODULE_ID, 'archivist') || {}).archivistId === id) || null;
        } catch (_) {
            return null;
        }
    }

    /** Return first text page for a journal; create one if not present. */
    async ensureTextPage(journal) {
        const pages = journal?.pages?.contents || [];
        const textPage = pages.find(p => p.type === 'text');
        if (textPage) return textPage;
        await Utils.ensureJournalTextPage(journal, '');
        return (journal.pages?.contents || []).find(p => p.type === 'text') || null;
    }
}

export const journalManager = new JournalManager();


