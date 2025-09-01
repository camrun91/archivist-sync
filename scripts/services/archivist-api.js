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
   * @returns {Promise<Array>} Array of world objects
   * @throws {Error} If the request fails or response format is unexpected
   */
  async fetchWorldsList(apiKey) {
    const headers = this._createHeaders(apiKey);
    
    const response = await fetch(`${this.baseUrl}/worlds`, {
      method: 'GET',
      headers: headers
    });
    
    const data = await this._handleResponse(response);
    
    // Handle different possible response formats
    if (Array.isArray(data)) {
      return data;
    } else if (data.worlds && Array.isArray(data.worlds)) {
      return data.worlds;
    } else if (data.data && Array.isArray(data.data)) {
      return data.data;
    } else {
      throw new Error('Unexpected API response format');
    }
  }

  /**
   * Sync world title to Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to sync to
   * @param {string} title - The world title
   * @param {string} description - The world description
   * @returns {Promise<object>} API response
   * @throws {Error} If the request fails
   */
  async syncWorldTitle(apiKey, worldId, title, description) {
    const headers = this._createHeaders(apiKey);
    
    const requestData = {
      title: title,
      description: description || ''
    };
    
    const response = await fetch(`${this.baseUrl}/worlds/${worldId}/title`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(requestData)
    });
    
    return await this._handleResponse(response);
  }

  /**
   * Sync characters to Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to sync to
   * @param {Array} characterData - Array of character objects
   * @returns {Promise<object>} API response
   * @throws {Error} If the request fails
   */
  async syncCharacters(apiKey, worldId, characterData) {
    const headers = this._createHeaders(apiKey);
    
    const requestData = {
      characters: characterData
    };
    
    const response = await fetch(`${this.baseUrl}/worlds/${worldId}/characters`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestData)
    });
    
    return await this._handleResponse(response);
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