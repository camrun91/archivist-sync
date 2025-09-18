import { CONFIG } from '../modules/config.js';

/**
 * Service class for handling all Archivist API interactions
 */
export class ArchivistApiService {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
  }

  /**
   * Internal fetch helper
   * @param {string} apiKey
   * @param {string} path - path starting with '/'
   * @param {RequestInit} options
   * @returns {Promise<any>}
   */
  async _request(apiKey, path, options = {}) {
    const headers = this._createHeaders(apiKey);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });
    return this._handleResponse(response);
  }

  /**
   * Create headers for API requests
   * @param {string} apiKey - The API key for authentication
   * @returns {object} Headers object
   */
  _createHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    };
  }

  /**
   * Handle API response and check for errors
   * @param {Response} response - Fetch response object
   * @returns {Promise<object>} Parsed JSON response
   * @throws {Error} If response is not ok
   */
  async _handleResponse(response) {
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Fetch worlds list from the Archivist API
   * @param {string} apiKey - The API key for authentication
   * @returns {Promise<object>} Object with success flag and data array
   */
  async fetchWorldsList(apiKey) {
    try {
      const headers = this._createHeaders(apiKey);

      const response = await fetch(`${this.baseUrl}/worlds`, {
        method: 'GET',
        headers: headers
      });

      const data = await this._handleResponse(response);

      // Handle different possible response formats
      let worlds = [];
      if (Array.isArray(data)) {
        worlds = data;
      } else if (data.worlds && Array.isArray(data.worlds)) {
        worlds = data.worlds;
      } else if (data.data && Array.isArray(data.data)) {
        worlds = data.data;
      } else {
        throw new Error('Unexpected API response format');
      }

      return {
        success: true,
        data: worlds
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to fetch worlds:`, error);
      return {
        success: false,
        message: error.message || 'Failed to fetch worlds from API'
      };
    }
  }

  /**
   * Fetch detailed information for a specific world
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to fetch details for
   * @returns {Promise<object>} Object with success flag and world data
   */
  async fetchWorldDetails(apiKey, worldId) {
    console.log('fetchWorldDetails called with:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'none', worldId });

    try {
      const headers = this._createHeaders(apiKey);
      const url = `${this.baseUrl}/worlds/${worldId}`;
      console.log('Fetching world details from URL:', url);
      console.log('Request headers:', headers);

      const response = await fetch(url, {
        method: 'GET',
        headers: headers
      });

      console.log('Fetch response status:', response.status, response.statusText);
      console.log('Fetch response ok:', response.ok);

      const data = await this._handleResponse(response);
      console.log('Parsed response data:', data);

      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to fetch world details:`, error);
      return {
        success: false,
        message: error.message || 'Failed to fetch world details from API'
      };
    }
  }

  /**
   * Sync world title to Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to sync to
   * @param {object} titleData - Object containing title and description
   * @returns {Promise<object>} Object with success flag and response data
   */
  async syncWorldTitle(apiKey, worldId, titleData) {
    try {
      const headers = this._createHeaders(apiKey);

      const requestData = {
        title: titleData.title,
        description: titleData.description || ''
      };

      const response = await fetch(`${this.baseUrl}/worlds/${worldId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(requestData)
      });

      const data = await this._handleResponse(response);

      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to sync title:`, error);
      return {
        success: false,
        message: error.message || 'Failed to sync world title'
      };
    }
  }

  /**
   * List all characters for a world (auto-paginate)
   * @param {string} apiKey
   * @param {string} worldId
   * @returns {Promise<{success:boolean,data:Array}>>}
   */
  async listCharacters(apiKey, worldId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/characters?world_id=${encodeURIComponent(worldId)}&page=${page}&size=${size}`, { method: 'GET' });
        const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        all.push(...items);
        const totalPages = typeof data.pages === 'number' ? data.pages : (items.length < size ? page : page + 1);
        if (page >= totalPages || items.length < size) break;
        page += 1;
      }
      return { success: true, data: all };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to list characters:`, error);
      return { success: false, message: error.message || 'Failed to list characters' };
    }
  }

  /**
   * Create a character
   * @param {string} apiKey
   * @param {object} payload
   */
  async createCharacter(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/characters`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create character:`, error);
      return { success: false, message: error.message || 'Failed to create character' };
    }
  }

  /**
   * Update a character
   * @param {string} apiKey
   * @param {string} characterId
   * @param {object} payload
   */
  async updateCharacter(apiKey, characterId, payload) {
    try {
      const data = await this._request(apiKey, `/characters/${encodeURIComponent(characterId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to update character:`, error);
      return { success: false, message: error.message || 'Failed to update character' };
    }
  }

  /**
   * List all factions for a world
   */
  async listFactions(apiKey, worldId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/factions?world_id=${encodeURIComponent(worldId)}&page=${page}&size=${size}`, { method: 'GET' });
        const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        all.push(...items);
        const totalPages = typeof data.pages === 'number' ? data.pages : (items.length < size ? page : page + 1);
        if (page >= totalPages || items.length < size) break;
        page += 1;
      }
      return { success: true, data: all };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to list factions:`, error);
      return { success: false, message: error.message || 'Failed to list factions' };
    }
  }

  async createFaction(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/factions`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create faction:`, error);
      return { success: false, message: error.message || 'Failed to create faction' };
    }
  }

  async updateFaction(apiKey, factionId, payload) {
    try {
      const data = await this._request(apiKey, `/factions/${encodeURIComponent(factionId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to update faction:`, error);
      return { success: false, message: error.message || 'Failed to update faction' };
    }
  }

  /**
   * List all locations for a world
   */
  async listLocations(apiKey, worldId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/locations?world_id=${encodeURIComponent(worldId)}&page=${page}&size=${size}`, { method: 'GET' });
        const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        all.push(...items);
        const totalPages = typeof data.pages === 'number' ? data.pages : (items.length < size ? page : page + 1);
        if (page >= totalPages || items.length < size) break;
        page += 1;
      }
      return { success: true, data: all };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to list locations:`, error);
      return { success: false, message: error.message || 'Failed to list locations' };
    }
  }

  async createLocation(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/locations`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create location:`, error);
      return { success: false, message: error.message || 'Failed to create location' };
    }
  }

  async updateLocation(apiKey, locationId, payload) {
    try {
      const data = await this._request(apiKey, `/locations/${encodeURIComponent(locationId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to update location:`, error);
      return { success: false, message: error.message || 'Failed to update location' };
    }
  }

  /**
   * Test API connectivity
   * @param {string} apiKey - The API key for authentication
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection(apiKey) {
    try {
      await this.fetchWorldsList(apiKey);
      return true;
    } catch (error) {
      console.warn(`${CONFIG.MODULE_TITLE} | API connection test failed:`, error);
      return false;
    }
  }
}

// Create singleton instance
export const archivistApi = new ArchivistApiService();