import { CONFIG } from './config.js';
import { readBestBiography } from './field-mapper.js';

/**
 * Utility functions for Archivist Sync Module
 */
export class Utils {

  /**
   * Log messages with module prefix
   * @param {string} message - The message to log
   * @param {string} level - Log level (log, warn, error)
   */
  static log(message,) {
    console.log(`${CONFIG.MODULE_TITLE} | ${message}`);
  }

  /**
   * Show notification to user
   * @param {string} message - The message to show
   * @param {string} type - Notification type (info, warn, error)
   */
  static notify(message, type = 'info') {
    ui.notifications[type](message);
  }

  /**
   * Get localized string
   * @param {string} key - The localization key
   * @param {object} data - Data for string interpolation
   * @returns {string} Localized string
   */
  static localize(key, data = {}) {
    return game.i18n.format(key, data);
  }

  /**
   * Get current Foundry world information
   * @returns {object} World information object
   */
  static getFoundryWorldInfo() {
    return {
      id: game.world.id,
      title: game.world.title,
      description: game.world.description || 'No description'
    };
  }

  /**
   * Get character actors from the current world
   * @returns {Array} Array of character and NPC actors
   */
  static getCharacterActors() {
    return game.actors.contents.filter(actor =>
      actor.type === 'character' || actor.type === 'npc'
    );
  }

  /**
   * Get journal entries that likely represent Factions (by folder name or flag)
   * @returns {Array<JournalEntry>}
   */
  static getFactionJournals() {
    const entries = game.journal?.contents || [];
    const factionFolder = this._findFolderByNameInsensitive('Factions');
    return entries.filter(j => {
      const flagged = j.getFlag(CONFIG.MODULE_ID, 'archivistType') === 'faction';
      const inFolder = factionFolder && j.folder?.id === factionFolder.id;
      return flagged || inFolder;
    });
  }

  /**
   * Get journal entries that likely represent Locations (by folder name or flag)
   * @returns {Array<JournalEntry>}
   */
  static getLocationJournals() {
    const entries = game.journal?.contents || [];
    const locationFolder = this._findFolderByNameInsensitive('Locations');
    return entries.filter(j => {
      const flagged = j.getFlag(CONFIG.MODULE_ID, 'archivistType') === 'location';
      const inFolder = locationFolder && j.folder?.id === locationFolder.id;
      return flagged || inFolder;
    });
  }

  /**
   * Find a folder by name (case-insensitive)
   * @param {string} name
   * @returns {Folder | undefined}
   */
  static _findFolderByNameInsensitive(name) {
    const folders = game.folders?.contents || [];
    return folders.find(f => f.type === 'JournalEntry' && f.name.toLowerCase() === String(name).toLowerCase());
  }

  /**
   * Transform actor data for API synchronization
   * @param {Array} actors - Array of Foundry actor objects
   * @returns {Array} Array of transformed character data
   */
  static transformActorsForSync(actors) {
    return actors.map(actor => ({
      foundryId: actor.id,
      name: actor.name,
      type: actor.type,
      description: actor.system?.details?.biography?.value || '',
      level: actor.system?.details?.level || 1,
      race: actor.system?.details?.race || '',
      class: actor.system?.details?.class || ''
    }));
  }

  /**
   * Build Archivist Character payload from a Foundry Actor
   * @param {Actor} actor
   * @param {string} worldId
   */
  static toApiCharacterPayload(actor, worldId) {
    const isPC = actor.type === 'character';
    return {
      character_name: actor.name,
      player_name: actor?.system?.details?.player || '',
      description: readBestBiography(actor) || '',
      type: isPC ? 'PC' : 'NPC',
      campaign_id: worldId
    };
  }

  /**
   * Build Archivist Faction payload from a JournalEntry
   * @param {JournalEntry} journal
   * @param {string} worldId
   */
  static toApiFactionPayload(journal, worldId) {
    const raw = String(journal?.img || '').trim();
    const image = raw.startsWith('https://') ? raw : undefined;
    return {
      name: journal.name,
      description: this._extractJournalText(journal),
      ...(image ? { image } : {}),
      campaign_id: worldId
    };
  }

  /**
   * Build Archivist Location payload from a JournalEntry
   * @param {JournalEntry} journal
   * @param {string} worldId
   */
  static toApiLocationPayload(journal, worldId) {
    const raw = String(journal?.img || '').trim();
    const image = raw.startsWith('https://') ? raw : undefined;
    return {
      name: journal.name,
      description: this._extractJournalText(journal),
      ...(image ? { image } : {}),
      campaign_id: worldId
    };
  }

  /**
   * Extract text content from a JournalEntry (first text page)
   * @param {JournalEntry} journal
   * @returns {string}
   */
  static _extractJournalText(journal) {
    const pages = journal.pages?.contents || journal.pages || [];
    const textPage = pages.find(p => p.type === 'text');
    // Foundry v10+ stores text in page.text.content
    return textPage?.text?.content || journal.content || '';
  }

  /**
   * Ensure a journal has a single primary text page with provided content.
   * Works across Foundry versions (v10+ with pages collection).
   * @param {JournalEntry} journal
   * @param {string} content
   */
  static async ensureJournalTextPage(journal, content) {
    // v10+ API: JournalEntryPage documents under journal.pages
    const pagesCollection = journal.pages;
    const safeContent = String(content ?? '');

    if (pagesCollection) {
      const pages = pagesCollection.contents ?? (Array.isArray(pagesCollection) ? pagesCollection : []);
      let textPage = pages.find(p => p.type === 'text');
      if (textPage) {
        await textPage.update({ text: { content: safeContent, format: 1 } });
      } else {
        await journal.createEmbeddedDocuments('JournalEntryPage', [{
          name: 'Description',
          type: 'text',
          text: { content: safeContent, format: 1 }
        }]);
      }
      return;
    }
    // Fallback (older Foundry versions) — use JournalEntry content
    await journal.update({ content: safeContent });
  }

  /**
   * Ensure a journal displays a lead image. For v10+ we upsert an Image page; for legacy we inline an <img> tag.
   * Also updates the journal's thumbnail (img) to the provided URL.
   * @param {JournalEntry} journal
   * @param {string} imageUrl
   */
  static async ensureJournalLeadImage(journal, imageUrl) {
    try {
      const url = String(imageUrl || '').trim();
      if (!url) return;
      console.debug('[Archivist Sync] ensureJournalLeadImage()', { journalId: journal?.id, url });
      // Always set the journal thumbnail so it shows in lists
      try { await journal.update({ img: url }); } catch (e) { console.debug('[Archivist Sync] journal img update failed', e); }

      const pagesCollection = journal.pages;
      if (pagesCollection) {
        const pages = pagesCollection.contents ?? (Array.isArray(pagesCollection) ? pagesCollection : []);
        const textPage = pages.find(p => p.type === 'text');
        if (textPage) {
          const current = String(textPage?.text?.content ?? '');
          if (!current.includes(url)) {
            const safeUrl = url.replace(/"/g, '&quot;');
            const imgHtml = `<p><img src="${safeUrl}" style="max-width:100%"/></p>`;
            console.debug('[Archivist Sync] Prepending image HTML to journal text page');
            await textPage.update({ text: { content: imgHtml + current, format: 1 } });
          } else {
            console.debug('[Archivist Sync] Text page already contains image URL; skipping prepend');
          }
        } else {
          // Fall back to an image page if no text page exists
          let imagePage = pages.find(p => p.type === 'image');
          if (imagePage) {
            const update = imagePage?.image?.src !== undefined ? { image: { src: url } } : { src: url };
            console.debug('[Archivist Sync] Updating existing image page', { pageId: imagePage.id });
            await imagePage.update(update);
          } else {
            console.debug('[Archivist Sync] Creating image page for journal');
            await journal.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Cover', type: 'image', src: url, image: { src: url } }]);
          }
        }
        return;
      }
      // Legacy fallback: inline the image at the top of the content
      const safeUrl = url.replace(/"/g, '&quot;');
      const existing = String(journal.content || '');
      const imgHtml = `<p><img src="${safeUrl}" style="max-width:100%"/></p>`;
      console.debug('[Archivist Sync] Prepending inline image to legacy journal content');
      await journal.update({ content: imgHtml + existing });
    } catch (e) {
      console.warn('[Archivist Sync] Failed to set journal lead image:', e);
    }
  }

  /**
   * Flags helpers for mapping Archivist IDs
   */
  static getActorArchivistId(actor) {
    return actor.getFlag(CONFIG.MODULE_ID, 'archivistId');
  }

  static async setActorArchivistId(actor, id, worldId) {
    await actor.setFlag(CONFIG.MODULE_ID, 'archivistId', id);
    if (worldId) await actor.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId);
    return true;
  }

  static getJournalArchivistMeta(journal) {
    return {
      id: journal.getFlag(CONFIG.MODULE_ID, 'archivistId') || null,
      type: journal.getFlag(CONFIG.MODULE_ID, 'archivistType') || null,
      worldId: journal.getFlag(CONFIG.MODULE_ID, 'archivistWorldId') || null
    };
  }

  static async setJournalArchivistMeta(journal, id, type, worldId) {
    await journal.setFlag(CONFIG.MODULE_ID, 'archivistId', id);
    if (type) await journal.setFlag(CONFIG.MODULE_ID, 'archivistType', type);
    if (worldId) await journal.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId);
  }

  /**
   * Get Archivist metadata from a JournalEntryPage
   * @param {JournalEntryPage} page
   */
  static getPageArchivistMeta(page) {
    return {
      id: page?.getFlag?.(CONFIG.MODULE_ID, 'archivistId') || null,
      type: page?.getFlag?.(CONFIG.MODULE_ID, 'archivistType') || null,
      worldId: page?.getFlag?.(CONFIG.MODULE_ID, 'archivistWorldId') || null
    };
  }

  /**
   * Set Archivist metadata on a JournalEntryPage
   * @param {JournalEntryPage} page
   * @param {string} id
   * @param {string} type
   * @param {string} worldId
   */
  static async setPageArchivistMeta(page, id, type, worldId) {
    if (!page) return;
    if (id) await page.setFlag(CONFIG.MODULE_ID, 'archivistId', id);
    if (type) await page.setFlag(CONFIG.MODULE_ID, 'archivistType', type);
    if (worldId) await page.setFlag(CONFIG.MODULE_ID, 'archivistWorldId', worldId);
  }

  /**
   * Ensure a single root-level JournalEntry exists as a container
   * @param {string} name
   * @returns {Promise<JournalEntry>}
   */
  static async ensureRootJournalContainer(name) {
    const journals = game.journal?.contents || [];
    let j = journals.find(x => x.name === name && !x.folder);
    if (j) return j;
    j = await JournalEntry.create({ name, folder: null, pages: [] }, { render: false });
    return j;
  }

  /**
   * Create or update a text page within a container journal
   * Returns the page document. If creating multiple, call with items pre-sorted, as creation order defines index.
   * @param {JournalEntry} container
   * @param {object} opts { name, html, imageUrl, flags }
   */
  static async upsertContainerTextPage(container, { name, html, imageUrl, flags } = {}) {
    const pages = container.pages?.contents || [];
    // Prefer matching by Archivist ID if provided via flags
    let page = null;
    if (flags?.archivistId) {
      page = pages.find(p => this.getPageArchivistMeta(p).id === flags.archivistId);
    }
    if (!page) page = pages.find(p => p.name === name && p.type === 'text');
    const baseHtml = String(html || '');
    const finalHtml = imageUrl && !baseHtml.includes(String(imageUrl))
      ? `<p><img src="${String(imageUrl).replace(/"/g, '&quot;')}" style="max-width:100%"/></p>` + baseHtml
      : baseHtml;
    if (page) {
      await page.update({ name, type: 'text', text: { content: finalHtml, format: 1 } });
    } else {
      const created = await container.createEmbeddedDocuments('JournalEntryPage', [{ name, type: 'text', text: { content: finalHtml, format: 1 } }]);
      page = created?.[0] || null;
    }
    if (page && flags) {
      await this.setPageArchivistMeta(page, flags.archivistId, flags.archivistType, flags.archivistWorldId);
    }
    return page;
  }

  /**
   * Sort pages within a container using comparator over page docs
   * Applies increasing sort values to match comparator order.
   * @param {JournalEntry} container
   * @param {(a: JournalEntryPage, b: JournalEntryPage) => number} comparator
   */
  static async sortContainerPages(container, comparator) {
    const pages = (container.pages?.contents || []).slice().sort(comparator);
    let sort = 0;
    const updates = pages.map(p => ({ _id: p.id, sort: (sort += 100) }));
    if (updates.length) await container.updateEmbeddedDocuments('JournalEntryPage', updates);
  }

  /**
   * Extract HTML text content from a JournalEntryPage
   * @param {JournalEntryPage} page
   */
  static extractPageHtml(page) {
    if (!page) return '';
    if (page.type === 'text') return String(page?.text?.content || '');
    return '';
  }

  /**
   * Validate API key format
   * @param {string} apiKey - The API key to validate
   * @returns {boolean} True if API key appears valid
   */
  static validateApiKey(apiKey) {
    return apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0;
  }

  /**
   * Safely parse JSON response
   * @param {string} jsonString - JSON string to parse
   * @returns {object|null} Parsed object or null if parsing fails
   */
  static safeJsonParse(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      this.log(`Failed to parse JSON: ${error.message}`, 'warn');
      return null;
    }
  }

  /**
   * Debounce function to limit rapid successive calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @param {boolean} immediate - Whether to trigger on leading edge
   * @returns {Function} Debounced function
   */
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(this, args);
    };
  }

  /**
   * Check if user is a GM
   * @returns {boolean} True if current user is a GM
   */
  static isGM() {
    return game.user.isGM;
  }

  /**
   * Ensure a folder exists for JournalEntries by name; returns folder id or null
   * @param {string} name
   */
  static async ensureJournalFolder(name) {
    const existing = this._findFolderByNameInsensitive(name);
    if (existing) return existing.id;
    const created = await Folder.create({ name, type: 'JournalEntry' });
    return created?.id || null;
  }

  /**
   * Deep clone an object
   * @param {object} obj - Object to clone
   * @returns {object} Cloned object
   */
  static deepClone(obj) {
    return foundry.utils.deepClone(obj);
  }

  /**
   * Merge objects using Foundry's utility
   * @param {object} original - Original object
   * @param {object} other - Object to merge
   * @returns {object} Merged object
   */
  static mergeObject(original, other) {
    return foundry.utils.mergeObject(original, other);
  }

  /**
   * Generate a random ID
   * @param {number} length - Length of the ID
   * @returns {string} Random ID string
   */
  static generateId(length = 8) {
    return foundry.utils.randomID(length);
  }

  /**
   * Format error message for display
   * @param {Error|string} error - Error object or message
   * @returns {string} Formatted error message
   */
  static formatError(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Check if a string is empty or whitespace only
   * @param {string} str - String to check
   * @returns {boolean} True if string is empty or whitespace
   */
  static isEmpty(str) {
    return !str || str.trim().length === 0;
  }

  /**
   * Capitalize first letter of a string
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  static capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}