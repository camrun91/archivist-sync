# API Integration Documentation

## Overview

The Archivist Sync module integrates with the Archivist API service to provide bidirectional synchronization between Foundry VTT worlds and external world data. This document provides comprehensive information for developers working with the API integration.

## API Service Architecture

### Base Configuration
- **Base URL**: `https://archivist-api-production.up.railway.app/v1`
- **Authentication**: Bearer Token (API Key)
- **Content Type**: `application/json`
- **Protocol**: HTTPS only

### Service Class Structure

```javascript
class ArchivistApi {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    this.apiKey = null;
  }
  
  // Core API methods
  async fetchWorlds()           // GET /worlds
  async fetchWorldData(worldId) // GET /worlds/{id}
  async syncWorldData(data)     // POST /worlds/{id}/sync
  
  // Utility methods
  getApiStatus()               // Check connectivity
  validateApiKey()             // Validate API key
  handleApiError(error)        // Error handling
}
```

## API Endpoints

### 1. Fetch Available Worlds

**Endpoint**: `GET /worlds`

**Purpose**: Retrieve list of available worlds from Archivist API

**Headers**:
```
Authorization: Bearer {api_key}
Content-Type: application/json
```

**Response Format**:
```json
{
  "success": true,
  "worlds": [
    {
      "id": "world-123",
      "name": "The Fellowship Campaign",
      "description": "A Lord of the Rings campaign",
      "lastSync": "2024-08-31T12:00:00.000Z",
      "playerCount": 4,
      "status": "active"
    }
  ],
  "total": 1
}
```

**Error Responses**:
```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "message": "The provided API key is not valid"
}
```

### 2. Fetch World Data

**Endpoint**: `GET /worlds/{worldId}`

**Purpose**: Retrieve detailed data for a specific world

**Parameters**:
- `worldId` (string): The unique identifier for the world

**Headers**:
```
Authorization: Bearer {api_key}
Content-Type: application/json
```

**Response Format**:
```json
{
  "success": true,
  "worldData": {
    "id": "world-123",
    "name": "The Fellowship Campaign",
    "description": "A Lord of the Rings campaign",
    "lastSync": "2024-08-31T12:00:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "playerCount": 4,
    "sessionCount": 15,
    "totalPlayTime": "45h 30m",
    "characters": [
      {
        "id": "char-456",
        "name": "Aragorn",
        "level": 8,
        "class": "Ranger",
        "player": "John Doe",
        "status": "active"
      }
    ],
    "campaigns": {
      "current": "The Fellowship",
      "chapter": "Mines of Moria",
      "progress": 65
    }
  }
}
```

### 3. Sync World Data

**Endpoint**: `POST /worlds/{worldId}/sync`

**Purpose**: Synchronize world data between Foundry VTT and Archivist

**Parameters**:
- `worldId` (string): The unique identifier for the world

**Headers**:
```
Authorization: Bearer {api_key}
Content-Type: application/json
```

**Request Body**:
```json
{
  "worldId": "foundry-world-unique-id",
  "worldTitle": "My Awesome Campaign",
  "timestamp": "2024-08-31T12:00:00.000Z",
  "syncType": "title|characters|full",
  "data": {
    "title": "Updated Campaign Title",
    "description": "Updated description",
    "characters": [
      {
        "name": "Character Name",
        "level": 5,
        "class": "Fighter"
      }
    ]
  }
}
```

**Response Format**:
```json
{
  "success": true,
  "syncResult": {
    "worldId": "world-123",
    "lastSync": "2024-08-31T12:05:00.000Z",
    "syncType": "title",
    "changesApplied": 1,
    "message": "World title synchronized successfully"
  }
}
```

## Authentication

### API Key Management

The module stores API keys securely using Foundry VTT's encrypted settings system:

```javascript
// Setting definition
API_KEY: {
  key: 'apiKey',
  name: 'ARCHIVIST_SYNC.Settings.ApiKey.Name',
  hint: 'ARCHIVIST_SYNC.Settings.ApiKey.Hint',
  scope: 'world',
  config: true,
  type: String,
  default: ''
}
```

### Authentication Flow

1. **Key Storage**: API key stored in Foundry's encrypted settings
2. **Key Retrieval**: Retrieved when making API calls
3. **Header Generation**: Added to Authorization header as Bearer token
4. **Validation**: API key validated before each request

```javascript
// Authentication implementation
getAuthHeaders() {
  const apiKey = this.getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured');
  }
  
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}
```

## Error Handling

### Error Classification

```javascript
const ERROR_TYPES = {
  NETWORK: {
    code: 'NETWORK_ERROR',
    message: 'Network connectivity issue',
    retryable: true
  },
  AUTHENTICATION: {
    code: 'AUTH_ERROR',
    message: 'Authentication failed',
    retryable: false
  },
  VALIDATION: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    retryable: false
  },
  API: {
    code: 'API_ERROR',
    message: 'API server error',
    retryable: true
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    retryable: false
  }
};
```

### Error Handling Implementation

```javascript
async handleApiError(error) {
  let errorType = ERROR_TYPES.API;
  
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    errorType = ERROR_TYPES.NETWORK;
  } else if (error.status === 401) {
    errorType = ERROR_TYPES.AUTHENTICATION;
  } else if (error.status === 404) {
    errorType = ERROR_TYPES.NOT_FOUND;
  } else if (error.status >= 400 && error.status < 500) {
    errorType = ERROR_TYPES.VALIDATION;
  }
  
  // Log error for debugging
  Utils.error(`API Error: ${errorType.message}`, error);
  
  // Return user-friendly error
  return {
    success: false,
    error: errorType.message,
    code: errorType.code,
    retryable: errorType.retryable
  };
}
```

### Retry Logic

```javascript
async makeApiCall(endpoint, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      const errorInfo = await this.handleApiError(error);
      
      if (!errorInfo.retryable || attempt === retries) {
        throw errorInfo;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

## Data Synchronization

### Sync Types

1. **Title Sync**: Synchronize world title and description
2. **Character Sync**: Synchronize character data
3. **Full Sync**: Complete world data synchronization

### Sync Implementation

```javascript
async syncWorldData(worldId, syncType, data) {
  const endpoint = `${this.baseUrl}/worlds/${worldId}/sync`;
  
  const requestBody = {
    worldId: game.world.id,
    worldTitle: game.world.title,
    timestamp: new Date().toISOString(),
    syncType: syncType,
    data: data
  };
  
  const options = {
    method: 'POST',
    headers: this.getAuthHeaders(),
    body: JSON.stringify(requestBody)
  };
  
  return await this.makeApiCall(endpoint, options);
}
```

### Data Validation

```javascript
validateWorldData(data) {
  const required = ['worldId', 'worldTitle', 'timestamp'];
  
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate timestamp format
  if (!Date.parse(data.timestamp)) {
    throw new Error('Invalid timestamp format');
  }
  
  return true;
}
```

## Status Monitoring

### API Status Check

```javascript
async getApiStatus() {
  try {
    const endpoint = `${this.baseUrl}/health`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });
    
    return {
      connected: response.ok,
      status: response.status,
      message: response.ok ? 'Connected' : 'Connection failed'
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      message: 'Connection failed'
    };
  }
}
```

### Real-time Status Updates

```javascript
// Update status in UI
async updateApiStatus() {
  const status = await this.getApiStatus();
  
  // Update UI elements
  const statusElement = document.querySelector('.api-status');
  if (statusElement) {
    statusElement.textContent = status.message;
    statusElement.className = `api-status ${status.connected ? 'connected' : 'error'}`;
  }
  
  return status;
}
```

## Testing API Integration

### Mock API for Testing

```javascript
// Mock API responses for testing
const mockApiResponses = {
  worlds: {
    success: true,
    worlds: [
      {
        id: 'test-world-1',
        name: 'Test Campaign',
        description: 'A test campaign',
        lastSync: new Date().toISOString(),
        playerCount: 2,
        status: 'active'
      }
    ],
    total: 1
  },
  
  worldData: {
    success: true,
    worldData: {
      id: 'test-world-1',
      name: 'Test Campaign',
      description: 'A test campaign',
      lastSync: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      playerCount: 2,
      sessionCount: 5,
      totalPlayTime: '10h 30m',
      characters: [],
      campaigns: {
        current: 'Test Campaign',
        chapter: 'Chapter 1',
        progress: 25
      }
    }
  }
};
```

### API Testing Tools

```bash
# Test API connectivity
curl -X GET https://archivist-api-production.up.railway.app/v1/health \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test world fetching
curl -X GET https://archivist-api-production.up.railway.app/v1/worlds \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"

# Test world sync
curl -X POST https://archivist-api-production.up.railway.app/v1/worlds/test-world-1/sync \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "worldId": "foundry-test-world",
    "worldTitle": "Test Campaign",
    "timestamp": "2024-08-31T12:00:00.000Z",
    "syncType": "title",
    "data": {
      "title": "Updated Test Campaign"
    }
  }'
```

## Security Considerations

### API Key Security
- Keys stored in Foundry's encrypted settings
- Never logged or exposed in client-side code
- Validated before each API call
- Can be rotated without code changes

### Request Security
- All requests use HTTPS
- Input validation on all data
- Proper error handling without data exposure
- Rate limiting consideration

### Data Privacy
- Only necessary data sent to API
- No sensitive Foundry data exposed
- User consent for data synchronization
- GDPR compliance considerations

## Performance Optimization

### Caching Strategy
```javascript
class ApiCache {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
}
```

### Request Optimization
- Batch multiple requests when possible
- Use appropriate timeouts
- Implement request deduplication
- Optimize payload sizes

## Future Enhancements

### Planned API Features
- Real-time synchronization via WebSockets
- Bulk data operations
- Advanced filtering and search
- Data export/import functionality

### Integration Improvements
- Offline mode support
- Conflict resolution
- Data versioning
- Advanced error recovery

This API integration documentation provides comprehensive guidance for working with the Archivist API service within the Foundry VTT module ecosystem.