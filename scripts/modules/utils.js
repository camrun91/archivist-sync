import { CONFIG } from './config.js';

/**
 * Utility functions for Archivist Sync Module
 */
export class Utils {
  
  /**
   * Log messages with module prefix
   * @param {string} message - The message to log
   * @param {string} level - Log level (log, warn, error)
   */
  static log(message, level = 'log') {
    console[level](`${CONFIG.MODULE_TITLE} | ${message}`);
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