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
   * Fetch existing characters from Archivist API by world ID
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to fetch characters from
   * @returns {Promise<object>} Object with success flag and characters data
   */
  async fetchWorldCharacters(apiKey, worldId) {
    try {
      const headers = this._createHeaders(apiKey);
      
      const response = await fetch(`${this.baseUrl}/characters?world_id=${worldId}&character_type=PC`, {
        method: 'GET',
        headers: headers
      });
      
      const data = await this._handleResponse(response);
      console.log("data is : ", data)
      // Handle different possible response formats
      let characters = [];
      if (Array.isArray(data)) {
        characters = data;
      } else if (data.characters && Array.isArray(data.characters)) {
        characters = data.characters;
      } else if (data.data && Array.isArray(data.data)) {
        characters = data.data;
      } else {
        // No characters exist yet - return empty array
        characters = [];
      }
      
      return {
        success: true,
        data: characters
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to fetch world characters:`, error);
      
      let errorMessage = 'Failed to fetch world characters';
      if (error.message.includes('CORS')) {
        errorMessage = 'CORS error: Please check API endpoint configuration';
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error: Please check your internet connection and API endpoint';
      } else {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        message: errorMessage,
        data: []
      };
    }
  }

  /**
   * Create a single character in Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} worldId - The world ID to create character in
   * @param {object} characterData - Character object to create
   * @returns {Promise<object>} Object with success flag and response data
   */
  async createCharacter(apiKey, worldId, characterData) {
    try {
      const headers = this._createHeaders(apiKey);
      
      const response = await fetch(`${this.baseUrl}/characters`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(characterData)
      });
      
      const data = await this._handleResponse(response);
      
      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create character:`, error);
      return {
        success: false,
        message: error.message || 'Failed to create character'
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