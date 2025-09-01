import { CONFIG } from '../modules/config.js';

/**
 * Service class for handling all Archivist API interactions
 */
export class ArchivistApiService {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
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
      
      const response = await fetch(`${this.baseUrl}/worlds/${worldId}/title`, {
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
   * Sync characters to Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to sync to
   * @param {Array} characterData - Array of character objects
   * @returns {Promise<object>} Object with success flag and response data
   */
  async syncCharacters(apiKey, worldId, characterData) {
    try {
      const headers = this._createHeaders(apiKey);
      
      const requestData = {
        characters: characterData
      };
      
      const response = await fetch(`${this.baseUrl}/worlds/${worldId}/characters`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestData)
      });
      
      const data = await this._handleResponse(response);
      
      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to sync characters:`, error);
      return {
        success: false,
        message: error.message || 'Failed to sync characters'
      };
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