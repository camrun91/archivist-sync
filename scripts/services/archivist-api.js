import { CONFIG } from '../modules/config.js';

/**
 * Service class for handling all Archivist API interactions
 */
export class ArchivistApiService {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    /** @type {number} */
    this._lastWriteAtMs = 0;
    /** @type {number} */
    this._requestCount = 0;
    /** @type {number} */
    this._batchStartTime = 0;
  }

  /**
   * Internal fetch helper
   * @param {string} apiKey
   * @param {string} path - path starting with '/'
   * @param {RequestInit} options
   * @returns {Promise<any>}
   */
  async _request(apiKey, path, options = {}) {
    const headers = this._createHeaders(apiKey, options);
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;
    const maxRetries = 10;

    // Simple client-side throttle for write-heavy operations
    const method = String(options?.method || 'GET').toUpperCase();
    const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    if (isWrite) {
      const now = Date.now();

      // Initialize batch tracking if needed
      if (this._batchStartTime === 0) {
        this._batchStartTime = now;
        this._requestCount = 0;
      }

      // Progressive throttling - more aggressive throttling as we make more requests
      const batchElapsedMs = now - this._batchStartTime;
      const requestsPerSecond = this._requestCount / (batchElapsedMs / 1000);

      let minSpacingMs = 250; // Base spacing
      if (requestsPerSecond > 3) {
        minSpacingMs = 500; // Slow down if we're going too fast
      }
      if (requestsPerSecond > 2) {
        minSpacingMs = 350; // Moderate slowdown
      }

      const waitMs = Math.max(0, (this._lastWriteAtMs + minSpacingMs) - now);
      if (waitMs > 0) {
        await new Promise(r => setTimeout(r, waitMs));
      }

      this._lastWriteAtMs = Date.now();
      this._requestCount++;

      // Reset batch tracking every 30 seconds
      if (batchElapsedMs > 30000) {
        this._batchStartTime = Date.now();
        this._requestCount = 0;
      }
    }

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url, { ...options, headers });

        // Handle successful responses (non-429)
        if (response.status !== 429) {
          return this._handleResponse(response);
        }

        // 429 handling with exponential backoff and jitter; respect Retry-After
        attempt += 1;

        if (attempt > maxRetries) {
          console.error(`${CONFIG.MODULE_TITLE} | Max retries (${maxRetries}) exceeded for ${method} ${path}`);
          throw new Error(`API request failed: 429 rate limited after ${maxRetries} retries`);
        }

        // Calculate retry delay
        const ra = response.headers.get('Retry-After');
        let retryMs = 0;
        if (ra) {
          const n = Number(ra);
          // If small value, assume seconds; if large, assume milliseconds
          if (isFinite(n)) {
            retryMs = n < 100 ? Math.max(1000, n * 1000) : n;
          }
        }

        // Exponential backoff: start at 1s, max 30s
        const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 500); // 0-500ms jitter
        const delay = Math.max(retryMs || 0, baseDelay + jitter);

        console.warn(`${CONFIG.MODULE_TITLE} | Rate limited (429) on ${method} ${path}, attempt ${attempt}/${maxRetries}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));

      } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          // Network error - retry with exponential backoff
          attempt += 1;
          if (attempt > maxRetries) {
            console.error(`${CONFIG.MODULE_TITLE} | Network error after ${maxRetries} retries for ${method} ${path}:`, error);
            throw new Error(`Network error after ${maxRetries} retries: ${error.message}`);
          }

          const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
          console.warn(`${CONFIG.MODULE_TITLE} | Network error on ${method} ${path}, attempt ${attempt}/${maxRetries}, retrying in ${delay}ms:`, error.message);
          await new Promise(r => setTimeout(r, delay));
        } else {
          // Other errors should not be retried
          throw error;
        }
      }
    }
  }

  /**
   * Create headers for API requests
   * @param {string} apiKey - The API key for authentication
   * @returns {object} Headers object
   */
  _createHeaders(apiKey, options = {}) {
    const h = {
      'Accept': 'application/json',
      'x-api-key': apiKey
    };
    // Only set Content-Type when we actually send a body (avoids preflight on simple GETs)
    const method = String(options?.method || '').toUpperCase();
    const hasBody = !!options?.body || method === 'POST' || method === 'PUT' || method === 'PATCH';
    if (hasBody) h['Content-Type'] = 'application/json';
    return h;
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
   * Fetch campaigns list from the Archivist API
   * @param {string} apiKey - The API key for authentication
   * @returns {Promise<object>} Object with success flag and data array
   */
  async fetchCampaignsList(apiKey) {
    try {
      const data = await this._request(apiKey, `/campaigns`, { method: 'GET' });

      // Handle different possible response formats
      let campaigns = [];
      if (Array.isArray(data)) {
        campaigns = data;
      } else if (data.campaigns && Array.isArray(data.campaigns)) {
        campaigns = data.campaigns;
      } else if (data.data && Array.isArray(data.data)) {
        campaigns = data.data;
      } else {
        throw new Error('Unexpected API response format');
      }

      return {
        success: true,
        data: campaigns
      };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to fetch campaigns:`, error);
      return {
        success: false,
        message: error.message || 'Failed to fetch campaigns from API'
      };
    }
  }

  /**
   * Create a new campaign in Archivist
   * @param {string} apiKey
   * @param {{title:string, description?:string}} payload
   */
  async createCampaign(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/campaigns`, {
        method: 'POST',
        body: JSON.stringify({ title: payload.title, description: payload.description || '' })
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to create campaign:`, error);
      return { success: false, message: error.message || 'Failed to create campaign' };
    }
  }

  /**
   * Fetch detailed information for a specific campaign
   * @param {string} apiKey - The API key for authentication
   * @param {string} campaignId - The campaign ID to fetch details for
   * @returns {Promise<object>} Object with success flag and campaign data
   */
  async fetchCampaignDetails(apiKey, campaignId) {
    console.log('fetchCampaignDetails called with:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'none', campaignId });
    try {
      const data = await this._request(apiKey, `/campaigns/${encodeURIComponent(campaignId)}`, { method: 'GET' });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to fetch campaign details:`, error);
      return {
        success: false,
        message: error.message || 'Failed to fetch campaign details from API'
      };
    }
  }

  /**
   * Sync campaign title to Archivist API
   * @param {string} apiKey - The API key for authentication
   * @param {string} campaignId - The campaign ID to sync to
   * @param {object} titleData - Object containing title and description
   * @returns {Promise<object>} Object with success flag and response data
   */
  async syncCampaignTitle(apiKey, campaignId, titleData) {
    try {
      const requestData = { title: titleData.title, description: titleData.description || '' };
      const data = await this._request(apiKey, `/campaigns/${encodeURIComponent(campaignId)}`, {
        method: 'PATCH',
        body: JSON.stringify(requestData)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to sync campaign title:`, error);
      return {
        success: false,
        message: error.message || 'Failed to sync campaign title'
      };
    }
  }

  /**
   * List all characters for a campaign (auto-paginate)
   * @param {string} apiKey
   * @param {string} campaignId
   * @returns {Promise<{success:boolean,data:Array}>>}
   */
  async listCharacters(apiKey, campaignId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/characters?campaign_id=${encodeURIComponent(campaignId)}&page=${page}&size=${size}`, { method: 'GET' });
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
      const isRateLimited = error.message?.includes('429') || error.message?.includes('rate limited');
      const isNetworkError = error.message?.includes('Network error') || error.message?.includes('Failed to fetch');

      console.error(`${CONFIG.MODULE_TITLE} | Failed to create character:`, {
        error: error.message,
        payload: payload?.character_name || 'unknown',
        isRateLimited,
        isNetworkError
      });

      return {
        success: false,
        message: error.message || 'Failed to create character',
        retryable: isRateLimited || isNetworkError
      };
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
   * List all factions for a campaign
   */
  async listFactions(apiKey, campaignId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/factions?campaign_id=${encodeURIComponent(campaignId)}&page=${page}&size=${size}`, { method: 'GET' });
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
      const isRateLimited = error.message?.includes('429') || error.message?.includes('rate limited');
      const isNetworkError = error.message?.includes('Network error') || error.message?.includes('Failed to fetch');

      console.error(`${CONFIG.MODULE_TITLE} | Failed to create faction:`, {
        error: error.message,
        payload: payload?.name || 'unknown',
        isRateLimited,
        isNetworkError
      });

      return {
        success: false,
        message: error.message || 'Failed to create faction',
        retryable: isRateLimited || isNetworkError
      };
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
  async listLocations(apiKey, campaignId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/locations?campaign_id=${encodeURIComponent(campaignId)}&page=${page}&size=${size}`, { method: 'GET' });
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

  /**
   * List all game sessions for a campaign
   */
  async listSessions(apiKey, campaignId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/sessions?campaign_id=${encodeURIComponent(campaignId)}&page=${page}&size=${size}`, { method: 'GET' });
        const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        all.push(...items);
        const totalPages = typeof data.pages === 'number' ? data.pages : (items.length < size ? page : page + 1);
        if (page >= totalPages || items.length < size) break;
        page += 1;
      }
      return { success: true, data: all };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to list sessions:`, error);
      return { success: false, message: error.message || 'Failed to list sessions' };
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
      const isRateLimited = error.message?.includes('429') || error.message?.includes('rate limited');
      const isNetworkError = error.message?.includes('Network error') || error.message?.includes('Failed to fetch');

      console.error(`${CONFIG.MODULE_TITLE} | Failed to create location:`, {
        error: error.message,
        payload: payload?.name || 'unknown',
        isRateLimited,
        isNetworkError
      });

      return {
        success: false,
        message: error.message || 'Failed to create location',
        retryable: isRateLimited || isNetworkError
      };
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
   * List all items for a campaign
   */
  async listItems(apiKey, campaignId) {
    try {
      let page = 1;
      const size = 100;
      const all = [];
      while (true) {
        const data = await this._request(apiKey, `/items?campaign_id=${encodeURIComponent(campaignId)}&page=${page}&size=${size}`, { method: 'GET' });
        const items = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        all.push(...items);
        const totalPages = typeof data.pages === 'number' ? data.pages : (items.length < size ? page : page + 1);
        if (page >= totalPages || items.length < size) break;
        page += 1;
      }
      return { success: true, data: all };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to list items:`, error);
      return { success: false, message: error.message || 'Failed to list items' };
    }
  }

  /**
   * Create an item
   */
  async createItem(apiKey, payload) {
    try {
      const data = await this._request(apiKey, `/items`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      const isRateLimited = error.message?.includes('429') || error.message?.includes('rate limited');
      const isNetworkError = error.message?.includes('Network error') || error.message?.includes('Failed to fetch');

      console.error(`${CONFIG.MODULE_TITLE} | Failed to create item:`, {
        error: error.message,
        payload: payload?.name || 'unknown',
        isRateLimited,
        isNetworkError
      });

      return {
        success: false,
        message: error.message || 'Failed to create item',
        retryable: isRateLimited || isNetworkError
      };
    }
  }

  /**
   * Update an item
   */
  async updateItem(apiKey, itemId, payload) {
    try {
      const data = await this._request(apiKey, `/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return { success: true, data };
    } catch (error) {
      console.error(`${CONFIG.MODULE_TITLE} | Failed to update item:`, error);
      return { success: false, message: error.message || 'Failed to update item' };
    }
  }

  /**
   * Ask (RAG chat) — non-streaming
   * @param {string} apiKey
   * @param {string} campaignId
   * @param {Array<{role:'user'|'assistant',content:string}>} messages
   * @returns {Promise<{success:boolean, answer?:string, monthlyTokensRemaining?:number, hourlyTokensRemaining?:number, message?:string}>}
   */
  async ask(apiKey, campaignId, messages) {
    try {
      const url = `${this._rootBase()}/ask`;
      const headers = { ...this._createHeaders(apiKey, { method: 'POST', body: '1' }) };
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaign_id: campaignId, messages })
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
   * @param {string} campaignId
   * @param {Array<{role:'user'|'assistant',content:string}>} messages
   * @param {(chunk:string)=>void} onChunk
   * @param {(final:{text:string, monthlyTokensRemaining?:number, hourlyTokensRemaining?:number})=>void} onDone
   * @param {AbortSignal} [signal]
   */
  async askStream(apiKey, campaignId, messages, onChunk, onDone, signal) {
    const url = `${this._rootBase()}/ask`;
    const headers = { ...this._createHeaders(apiKey, { method: 'POST', body: '1' }) };
    // Accept any stream; some servers send text/plain for streaming
    headers['Accept'] = '*/*';
    const body = JSON.stringify({ campaign_id: campaignId, messages, stream: true });
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
      await this.fetchCampaignsList(apiKey);
      return true;
    } catch (error) {
      console.warn(`${CONFIG.MODULE_TITLE} | API connection test failed:`, error);
      return false;
    }
  }
}

// Create singleton instance
export const archivistApi = new ArchivistApiService();