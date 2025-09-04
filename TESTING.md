# Testing and Debugging Guide

## Overview

This guide provides comprehensive information for testing and debugging the Archivist Sync module. It covers manual testing procedures, debugging techniques, automated testing strategies, and troubleshooting common issues.

## Testing Environment Setup

### Prerequisites
- Foundry VTT v13.341 or higher
- Browser with developer tools
- Test API endpoint (or mock server)
- Clean test world in Foundry VTT

### Test Environment Configuration

1. **Create Test World**
   ```bash
   # In Foundry VTT
   - Create new world
   - Enable developer mode
   - Install Archivist Sync module
   ```

2. **Configure Test Settings**
   ```javascript
   // In browser console
   window.ARCHIVIST_SYNC.settingsManager.setSetting('apiKey', 'test-api-key');
   window.ARCHIVIST_SYNC.settingsManager.setSetting('selectedWorldId', 'test-world-123');
   ```

3. **Enable Debug Logging**
   ```javascript
   // In browser console
   window.ARCHIVIST_SYNC.Utils.log('Debug mode enabled');
   ```

## Manual Testing Procedures

### 1. Module Initialization Testing

**Test Case**: Verify module loads correctly

**Steps**:
1. Start Foundry VTT
2. Load test world
3. Check browser console for initialization messages
4. Verify module appears in module list

**Expected Results**:
- No console errors
- Module shows as enabled
- Debug interface available in console

**Test Script**:
```javascript
// Run in browser console
console.log('Module loaded:', !!window.ARCHIVIST_SYNC);
console.log('Components available:', Object.keys(window.ARCHIVIST_SYNC));
```

### 2. Settings Management Testing

**Test Case**: Verify settings can be configured and persisted

**Steps**:
1. Open module settings
2. Configure API key
3. Save settings
4. Reload world
5. Verify settings persist

**Expected Results**:
- Settings save without errors
- Settings persist after reload
- API key is encrypted in storage

**Test Script**:
```javascript
// Test settings functionality
const settingsManager = window.ARCHIVIST_SYNC.settingsManager;

// Test setting API key
settingsManager.setSetting('apiKey', 'test-key-123');
console.log('API Key set:', settingsManager.getSetting('apiKey'));

// Test setting world selection
settingsManager.setSetting('selectedWorldId', 'test-world-456');
console.log('World ID set:', settingsManager.getSetting('selectedWorldId'));
```

### 3. API Connectivity Testing

**Test Case**: Verify API connection and authentication

**Steps**:
1. Configure valid API key
2. Test API status check
3. Attempt to fetch worlds
4. Verify error handling for invalid key

**Expected Results**:
- Valid API key connects successfully
- Invalid API key shows appropriate error
- Network errors handled gracefully

**Test Script**:
```javascript
// Test API connectivity
const api = window.ARCHIVIST_SYNC.archivistApi;

// Test status check
api.getApiStatus().then(status => {
  console.log('API Status:', status);
});

// Test world fetching
api.fetchWorlds().then(worlds => {
  console.log('Worlds fetched:', worlds);
}).catch(error => {
  console.log('Fetch error:', error);
});
```

### 4. Dialog Functionality Testing

**Test Case**: Verify main dialog works correctly

**Steps**:
1. Open sync options dialog
2. Test tab navigation
3. Test world selection
4. Test sync operations
5. Verify error handling

**Expected Results**:
- Dialog opens without errors
- All tabs function correctly
- World selection works
- Sync operations complete successfully

**Test Script**:
```javascript
// Test dialog functionality
const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
dialog.render(true);

// Test tab switching
dialog._onTabChange({ currentTarget: { dataset: { tab: 'characters' } } });

// Test world selection
dialog._onWorldSelect({ target: { value: 'test-world-123' } });
```

### 5. Data Synchronization Testing

**Test Case**: Verify data sync between Foundry and API

**Steps**:
1. Select a world in dialog
2. Test title synchronization
3. Test character synchronization
4. Verify data consistency
5. Test error scenarios

**Expected Results**:
- Data syncs correctly
- Changes persist
- Error handling works
- UI updates appropriately

**Test Script**:
```javascript
// Test data synchronization
const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
dialog.render(true);

// Test title sync
dialog._onSyncTitle().then(result => {
  console.log('Title sync result:', result);
});

// Test character sync
dialog._onSyncCharacters().then(result => {
  console.log('Character sync result:', result);
});
```

## Debugging Techniques

### 1. Console Debugging

**Access Debug Interface**:
```javascript
// Global debug interface
window.ARCHIVIST_SYNC

// Individual components
window.ARCHIVIST_SYNC.CONFIG
window.ARCHIVIST_SYNC.settingsManager
window.ARCHIVIST_SYNC.archivistApi
window.ARCHIVIST_SYNC.Utils
window.ARCHIVIST_SYNC.SyncOptionsDialog
```

**Common Debug Commands**:
```javascript
// Check module status
window.ARCHIVIST_SYNC.Utils.log('Module status check');

// Inspect settings
console.log('Current settings:', {
  apiKey: window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey'),
  selectedWorld: window.ARCHIVIST_SYNC.settingsManager.getSetting('selectedWorldId')
});

// Test API connectivity
window.ARCHIVIST_SYNC.archivistApi.getApiStatus().then(console.log);

// Inspect current world data
console.log('Foundry world:', {
  id: game.world.id,
  title: game.world.title,
  system: game.system.id
});
```

### 2. Network Debugging

**Monitor API Calls**:
1. Open browser developer tools
2. Go to Network tab
3. Filter by XHR/Fetch
4. Perform module operations
5. Inspect requests and responses

**Common Network Issues**:
- CORS errors
- Authentication failures
- Timeout errors
- Invalid endpoints

**Debug Network Issues**:
```javascript
// Test API endpoint directly
fetch('https://archivist-api-production.up.railway.app/v1/health')
  .then(response => console.log('Direct API test:', response))
  .catch(error => console.log('Direct API error:', error));

// Test with authentication
fetch('https://archivist-api-production.up.railway.app/v1/worlds', {
  headers: {
    'Authorization': 'Bearer test-key',
    'Content-Type': 'application/json'
  }
})
  .then(response => console.log('Auth test:', response))
  .catch(error => console.log('Auth error:', error));
```

### 3. Error Debugging

**Common Error Types**:
```javascript
// Network errors
TypeError: Failed to fetch

// Authentication errors
401 Unauthorized

// Validation errors
400 Bad Request

// Not found errors
404 Not Found

// Server errors
500 Internal Server Error
```

**Error Debugging Steps**:
1. Check browser console for error messages
2. Inspect network requests for failed calls
3. Verify API key and endpoint configuration
4. Test API endpoint independently
5. Check Foundry VTT version compatibility

**Error Handling Test**:
```javascript
// Test error handling
const api = window.ARCHIVIST_SYNC.archivistApi;

// Test with invalid API key
api.apiKey = 'invalid-key';
api.fetchWorlds().catch(error => {
  console.log('Expected error:', error);
});

// Test with invalid endpoint
api.baseUrl = 'https://invalid-endpoint.com';
api.fetchWorlds().catch(error => {
  console.log('Network error:', error);
});
```

### 4. Performance Debugging

**Monitor Performance**:
1. Open browser developer tools
2. Go to Performance tab
3. Record module operations
4. Analyze performance metrics

**Common Performance Issues**:
- Slow API responses
- UI freezing during operations
- Memory leaks
- Excessive DOM manipulation

**Performance Testing**:
```javascript
// Test API response times
const startTime = performance.now();
window.ARCHIVIST_SYNC.archivistApi.fetchWorlds()
  .then(() => {
    const endTime = performance.now();
    console.log(`API call took ${endTime - startTime} milliseconds`);
  });

// Test dialog rendering performance
const dialogStart = performance.now();
const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
dialog.render(true);
const dialogEnd = performance.now();
console.log(`Dialog rendering took ${dialogEnd - dialogStart} milliseconds`);
```

## Automated Testing

### 1. Unit Testing Setup

**Test Framework**: Jest (recommended)

**Installation**:
```bash
npm install --save-dev jest @testing-library/jest-dom
```

**Test Configuration** (`jest.config.js`):
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/scripts/$1'
  },
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/**/*.test.js'
  ]
};
```

### 2. Unit Test Examples

**Settings Manager Tests**:
```javascript
// tests/settings-manager.test.js
import { SettingsManager } from '../scripts/modules/settings-manager.js';

describe('SettingsManager', () => {
  let settingsManager;

  beforeEach(() => {
    settingsManager = new SettingsManager();
  });

  test('should set and get settings', () => {
    settingsManager.setSetting('testKey', 'testValue');
    expect(settingsManager.getSetting('testKey')).toBe('testValue');
  });

  test('should handle invalid settings', () => {
    expect(() => {
      settingsManager.setSetting(null, 'value');
    }).toThrow('Invalid setting key');
  });
});
```

**API Service Tests**:
```javascript
// tests/archivist-api.test.js
import { ArchivistApi } from '../scripts/services/archivist-api.js';

describe('ArchivistApi', () => {
  let api;

  beforeEach(() => {
    api = new ArchivistApi();
  });

  test('should validate API key', () => {
    expect(api.validateApiKey('valid-key')).toBe(true);
    expect(api.validateApiKey('')).toBe(false);
    expect(api.validateApiKey(null)).toBe(false);
  });

  test('should handle API errors', async () => {
    const error = new Error('Network error');
    const result = await api.handleApiError(error);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### 3. Integration Testing

**Dialog Integration Tests**:
```javascript
// tests/sync-options-dialog.test.js
import { SyncOptionsDialog } from '../scripts/dialogs/sync-options-dialog.js';

describe('SyncOptionsDialog', () => {
  let dialog;

  beforeEach(() => {
    dialog = new SyncOptionsDialog();
  });

  test('should render without errors', () => {
    expect(() => {
      dialog.render(true);
    }).not.toThrow();
  });

  test('should handle tab switching', () => {
    dialog.render(true);
    
    const event = {
      currentTarget: {
        dataset: { tab: 'characters' }
      }
    };
    
    expect(() => {
      dialog._onTabChange(event);
    }).not.toThrow();
  });
});
```

### 4. Mock Testing

**Mock API Responses**:
```javascript
// tests/mocks/api-mock.js
export const mockApiResponses = {
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

**Mock Foundry VTT**:
```javascript
// tests/mocks/foundry-mock.js
global.game = {
  world: {
    id: 'test-foundry-world',
    title: 'Test Foundry World',
    system: { id: 'dnd5e' }
  },
  settings: {
    get: jest.fn(),
    set: jest.fn()
  }
};

global.Hooks = {
  once: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};
```

## Troubleshooting Common Issues

### 1. Module Not Loading

**Symptoms**:
- Module doesn't appear in module list
- Console errors on startup
- Foundry VTT crashes

**Debugging Steps**:
1. Check `module.json` syntax
2. Verify file paths in manifest
3. Check browser console for errors
4. Verify Foundry VTT version compatibility

**Solutions**:
```javascript
// Check module.json validity
const manifest = require('./module.json');
console.log('Manifest valid:', !!manifest.id);

// Check file existence
const fs = require('fs');
const files = manifest.esmodules;
files.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error(`Missing file: ${file}`);
  }
});
```

### 2. API Connection Issues

**Symptoms**:
- "Not Configured" status
- Network errors
- Authentication failures

**Debugging Steps**:
1. Verify API key configuration
2. Test API endpoint connectivity
3. Check CORS settings
4. Verify network connectivity

**Solutions**:
```javascript
// Test API connectivity
const testApiConnection = async () => {
  try {
    const response = await fetch('https://archivist-api-production.up.railway.app/v1/health');
    console.log('API Health Check:', response.status);
  } catch (error) {
    console.error('API Connection Error:', error);
  }
};

// Test with API key
const testWithApiKey = async (apiKey) => {
  try {
    const response = await fetch('https://archivist-api-production.up.railway.app/v1/worlds', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('API Key Test:', response.status);
  } catch (error) {
    console.error('API Key Error:', error);
  }
};
```

### 3. Dialog Issues

**Symptoms**:
- Dialog won't open
- UI elements not responding
- Styling issues

**Debugging Steps**:
1. Check template syntax
2. Verify CSS classes
3. Check event handlers
4. Inspect DOM elements

**Solutions**:
```javascript
// Test dialog rendering
const testDialog = () => {
  const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
  dialog.render(true);
  
  // Check if dialog element exists
  const dialogElement = document.querySelector('.archivist-sync-dialog');
  console.log('Dialog element:', !!dialogElement);
  
  // Check for CSS issues
  const styles = window.getComputedStyle(dialogElement);
  console.log('Dialog styles:', styles);
};
```

### 4. Data Synchronization Issues

**Symptoms**:
- Data not syncing
- Inconsistent data
- Sync failures

**Debugging Steps**:
1. Check API responses
2. Verify data validation
3. Check error handling
4. Test with different data sets

**Solutions**:
```javascript
// Test data synchronization
const testDataSync = async () => {
  const api = window.ARCHIVIST_SYNC.archivistApi;
  
  // Test world fetching
  const worlds = await api.fetchWorlds();
  console.log('Worlds fetched:', worlds);
  
  // Test world data fetching
  if (worlds.success && worlds.worlds.length > 0) {
    const worldData = await api.fetchWorldData(worlds.worlds[0].id);
    console.log('World data:', worldData);
  }
};
```

## Performance Testing

### 1. Load Testing

**Test API Performance**:
```javascript
// Test API response times
const testApiPerformance = async () => {
  const api = window.ARCHIVIST_SYNC.archivistApi;
  const iterations = 10;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await api.fetchWorlds();
    const end = performance.now();
    times.push(end - start);
  }
  
  const average = times.reduce((a, b) => a + b) / times.length;
  console.log(`Average API response time: ${average}ms`);
};
```

### 2. Memory Testing

**Monitor Memory Usage**:
```javascript
// Test for memory leaks
const testMemoryUsage = () => {
  const initialMemory = performance.memory?.usedJSHeapSize || 0;
  
  // Create and destroy multiple dialogs
  for (let i = 0; i < 100; i++) {
    const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
    dialog.render(true);
    dialog.close();
  }
  
  const finalMemory = performance.memory?.usedJSHeapSize || 0;
  console.log(`Memory usage change: ${finalMemory - initialMemory} bytes`);
};
```

## Test Automation

### 1. Continuous Integration

**GitHub Actions Workflow**:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
    
    - name: Install dependencies
      run: npm install
    
    - name: Run tests
      run: npm test
    
    - name: Run linting
      run: npm run lint
```

### 2. Test Scripts

**Package.json Scripts**:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "lint": "eslint scripts/",
    "lint:fix": "eslint scripts/ --fix"
  }
}
```

This comprehensive testing and debugging guide provides the tools and techniques needed to ensure the Archivist Sync module works reliably and efficiently.