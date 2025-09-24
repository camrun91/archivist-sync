import { CONFIG } from '../modules/config.js';

/**
 * Service class for handling all Archivist API interactions
 */
export class ArchivistApiService {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    /** @type {number} */
    this._lastWriteAtMs = 0;
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
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;
    // Simple client-side throttle for write-heavy operations
    const method = String(options?.method || 'GET').toUpperCase();
    const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
    if (isWrite) {
      const now = Date.now();
      const minSpacingMs = 900; // ~1 write/sec to further reduce 429s
      const waitMs = Math.max(0, (this._lastWriteAtMs + minSpacingMs) - now);
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    }
    while (true) {
      const response = await fetch(url, { ...options, headers });
      if (response.status !== 429) return this._handleResponse(response);
      // 429 handling with exponential backoff and jitter; respect Retry-After
      attempt += 1;
      if (attempt > 8) throw new Error(`API request failed: 429 rate limited`);
      const ra = response.headers.get('Retry-After');
      let retryMs = 0;
      if (ra) {
        const n = Number(ra);
        // If small value, assume seconds; if large, assume milliseconds
        if (isFinite(n)) retryMs = n < 100 ? Math.max(1000, n * 1000) : n;
      }
      const base = Math.min(15000, 500 * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.max(retryMs || 0, base + jitter);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  /**
   * Create headers for API requests
   * @param {string} apiKey - The API key for authentication
   * @returns {object} Headers object
   */
  _createHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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
      let detail = '';
      try {
        const data = await response.clone().json();
        detail = data?.detail || data?.message || '';
      } catch (_) {
        try { detail = await response.clone().text(); } catch (_) { /* ignore */ }
      }
      const suffix = detail ? ` — ${String(detail).slice(0, 300)}` : '';
      throw new Error(`API request failed: ${response.status} ${response.statusText}${suffix}`);
    }
    return await response.json();
  }

  /**
   * Derive root API base (without version path like /v1) for non-versioned endpoints
   * @returns {string}
   */
  _rootBase() {
    // Strip trailing /v1 or /v1/ from API_BASE_URL
    return this.baseUrl.replace(/\/?v1\/?$/, '');
  }

  /**
   * Fetch worlds list from the Archivist API
   * @param {string} apiKey - The API key for authentication
   * @returns {Promise<object>} Object with success flag and data array
   */
  async fetchWorldsList(apiKey) {
    try {
      const data = await this._request(apiKey, `/worlds`, { method: 'GET' });

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
   * Create a new world in Archivist
   * @param {string} apiKey
   * @param {{title:string, description?:string}} payload
   */
  async createWorld(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/worlds`, {
        method: 'POST',
        body: JSON.stringify({ title: payload.title, description: payload.description || '' })
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create world:`, error);
      return { success: false, message: error.message || 'Failed to create world' };
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
      const data = await this._request(apiKey, `/worlds/${encodeURIComponent(worldId)}`, { method: 'GET' });
      return { success: true, data };
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
      const requestData = { title: titleData.title, description: titleData.description || '' };
      const data = await this._request(apiKey, `/worlds/${encodeURIComponent(worldId)}`, {
        method: 'PATCH',
        body: JSON.stringify(requestData)
      });
      return { success: true, data };
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
        method: 'PATCH',
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
        method: 'PATCH',
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
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to update location:`, error);
      return { success: false, message: error.message || 'Failed to update location' };
    }
  }

  /**
   * Ask (RAG chat) — non-streaming
   * @param {string} apiKey
   * @param {string} worldId
   * @param {Array<{role:'user'|'assistant',content:string}>} messages
   * @returns {Promise<{success:boolean, answer?:string, monthlyTokensRemaining?:number, hourlyTokensRemaining?:number, message?:string}>}
   */
  async ask(apiKey, worldId, messages) {
    try {
      const url = `${this._rootBase()}/ask`;
      const headers = { ...this._createHeaders(apiKey) };
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ worldId, messages })
      });
      const data = await this._handleResponse(r);
      return {
        success: true,
        answer: data?.answer ?? '',
        monthlyTokensRemaining: data?.monthlyTokensRemaining,
        hourlyTokensRemaining: data?.hourlyTokensRemaining
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | /ask failed:`, error);
      return { success: false, message: error.message || 'Ask failed' };
    }
  }

  /**
   * Ask (RAG chat) — streaming
   * @param {string} apiKey
   * @param {string} worldId
   * @param {Array<{role:'user'|'assistant',content:string}>} messages
   * @param {(chunk:string)=>void} onChunk
   * @param {(final:{text:string, monthlyTokensRemaining?:number, hourlyTokensRemaining?:number})=>void} onDone
   * @param {AbortSignal} [signal]
   */
  async askStream(apiKey, worldId, messages, onChunk, onDone, signal) {
    const url = `${this._rootBase()}/ask`;
    const headers = { ...this._createHeaders(apiKey) };
    // Accept any stream; some servers send text/plain for streaming
    headers['Accept'] = '*/*';
    const body = JSON.stringify({ worldId, messages, stream: true });
    const resp = await fetch(url, { method: 'POST', headers, body, signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Ask stream failed: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`);
    }
    const monthly = Number(resp.headers.get('X-Monthly-Remaining-Tokens') || '') || undefined;
    const hourly = Number(resp.headers.get('X-Hourly-Remaining-Tokens') || '') || undefined;
    const reader = resp.body?.getReader?.();
    if (!reader) {
      // Fallback: try parse as JSON answer
      try {
        const data = await resp.clone().json();
        const answer = data?.answer || '';
        if (answer) onChunk?.(answer);
        onDone?.({ text: answer, monthlyTokensRemaining: monthly, hourlyTokensRemaining: hourly });
        return;
      } catch (_) {
        const text = await resp.text();
        if (text) onChunk?.(text);
        onDone?.({ text, monthlyTokensRemaining: monthly, hourlyTokensRemaining: hourly });
        return;
      }
    }
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        fullText += chunk;
        onChunk?.(chunk);
      }
    }
    onDone?.({ text: fullText, monthlyTokensRemaining: monthly, hourlyTokensRemaining: hourly });
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