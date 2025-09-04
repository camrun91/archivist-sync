# Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide helps users and developers diagnose and resolve common issues with the Archivist Sync module. It covers installation problems, configuration issues, API connectivity problems, and more.

## Quick Diagnostic Checklist

### Before Starting Troubleshooting

1. **Check Foundry VTT Version**
   - Ensure Foundry VTT v13.341 or higher
   - Verify module compatibility

2. **Verify Module Installation**
   - Module appears in module list
   - No console errors on startup
   - Module can be enabled/disabled

3. **Check Browser Compatibility**
   - Modern browser with ES6 support
   - JavaScript enabled
   - Developer tools available

4. **Verify Network Connectivity**
   - Internet connection active
   - No firewall blocking API calls
   - HTTPS endpoints accessible

## Common Issues and Solutions

### 1. Module Installation Issues

#### Issue: Module Not Appearing in Module List

**Symptoms**:
- Module doesn't show in Foundry VTT module list
- No error messages visible

**Possible Causes**:
- Incorrect installation path
- Invalid `module.json` file
- Foundry VTT version incompatibility

**Solutions**:

1. **Verify Installation Path**:
   ```
   Foundry VTT Data Directory/
   └── modules/
       └── archivist-sync/
           ├── module.json
           ├── scripts/
           ├── styles/
           └── templates/
   ```

2. **Check module.json Validity**:
   ```bash
   # Validate JSON syntax
   cat module.json | python -m json.tool
   ```

3. **Verify Foundry VTT Version**:
   ```javascript
   // In browser console
   console.log('Foundry VTT Version:', game.version);
   console.log('Required Version:', '13.341');
   ```

4. **Check File Permissions**:
   ```bash
   # Ensure proper file permissions
   chmod -R 755 /path/to/foundry/Data/modules/archivist-sync/
   ```

#### Issue: Module Fails to Load

**Symptoms**:
- Console errors on module load
- Foundry VTT crashes or freezes
- Module appears but doesn't function

**Debugging Steps**:

1. **Check Browser Console**:
   ```javascript
   // Look for error messages
   // Common errors:
   // - SyntaxError: Unexpected token
   // - ReferenceError: CONFIG is not defined
   // - TypeError: Cannot read property
   ```

2. **Verify File Structure**:
   ```bash
   # Check all required files exist
   ls -la scripts/archivist-sync.js
   ls -la scripts/modules/config.js
   ls -la scripts/services/archivist-api.js
   ```

3. **Test Module Components**:
   ```javascript
   // In browser console after module loads
   console.log('Module loaded:', !!window.ARCHIVIST_SYNC);
   console.log('Components:', Object.keys(window.ARCHIVIST_SYNC));
   ```

### 2. Configuration Issues

#### Issue: API Key Not Working

**Symptoms**:
- "Not Configured" status in module
- Authentication errors
- API calls failing

**Solutions**:

1. **Verify API Key Format**:
   ```javascript
   // Check API key in console
   const apiKey = window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey');
   console.log('API Key length:', apiKey?.length);
   console.log('API Key format valid:', /^[a-zA-Z0-9_-]+$/.test(apiKey));
   ```

2. **Test API Key Manually**:
   ```bash
   # Test API key with curl
   curl -X GET https://archivist-api-production.up.railway.app/v1/health \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

3. **Check API Key Storage**:
   ```javascript
   // Verify API key is stored correctly
   const settings = game.settings.get('archivist-sync', 'apiKey');
   console.log('Stored API key:', settings ? 'Present' : 'Missing');
   ```

#### Issue: Settings Not Saving

**Symptoms**:
- Settings revert after saving
- Configuration changes don't persist
- Module resets to defaults

**Solutions**:

1. **Check Foundry VTT Permissions**:
   - Ensure you're logged in as Game Master
   - Verify world settings are writable

2. **Verify Settings Scope**:
   ```javascript
   // Check if settings are world-scoped
   const setting = game.settings.get('archivist-sync', 'apiKey');
   console.log('Setting scope:', game.settings.get('archivist-sync', 'apiKey'));
   ```

3. **Clear Settings Cache**:
   ```javascript
   // Clear and reset settings
   game.settings.set('archivist-sync', 'apiKey', '');
   game.settings.set('archivist-sync', 'selectedWorldId', '');
   ```

### 3. API Connectivity Issues

#### Issue: "Network Error" or "Failed to Fetch"

**Symptoms**:
- API calls fail with network errors
- "Connection failed" status
- Timeout errors

**Solutions**:

1. **Test Network Connectivity**:
   ```bash
   # Test basic connectivity
   ping archivist-api-production.up.railway.app
   
   # Test HTTPS connectivity
   curl -I https://archivist-api-production.up.railway.app/v1/health
   ```

2. **Check CORS Settings**:
   ```javascript
   // Test CORS in browser console
   fetch('https://archivist-api-production.up.railway.app/v1/health')
     .then(response => console.log('CORS test:', response.status))
     .catch(error => console.log('CORS error:', error));
   ```

3. **Verify Firewall/Proxy Settings**:
   - Check if corporate firewall blocks API calls
   - Verify proxy settings if applicable
   - Test from different network

4. **Test API Endpoint**:
   ```javascript
   // Test API endpoint directly
   const api = window.ARCHIVIST_SYNC.archivistApi;
   api.getApiStatus().then(status => {
     console.log('API Status:', status);
   });
   ```

#### Issue: "401 Unauthorized" Errors

**Symptoms**:
- Authentication failures
- "Invalid API key" messages
- API calls rejected

**Solutions**:

1. **Verify API Key**:
   ```javascript
   // Check API key validity
   const apiKey = window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey');
   if (!apiKey) {
     console.error('API key not configured');
   } else {
     console.log('API key configured:', apiKey.substring(0, 8) + '...');
   }
   ```

2. **Test API Key with Different Endpoint**:
   ```bash
   # Test with health endpoint
   curl -X GET https://archivist-api-production.up.railway.app/v1/health \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

3. **Check API Key Format**:
   - Ensure no extra spaces or characters
   - Verify key hasn't expired
   - Check if key needs to be regenerated

#### Issue: "404 Not Found" Errors

**Symptoms**:
- API endpoints not found
- World data not found
- Resource not available

**Solutions**:

1. **Verify API Endpoint URL**:
   ```javascript
   // Check API base URL
   console.log('API Base URL:', window.ARCHIVIST_SYNC.CONFIG.API_BASE_URL);
   ```

2. **Test API Endpoints**:
   ```bash
   # Test health endpoint
   curl https://archivist-api-production.up.railway.app/v1/health
   
   # Test worlds endpoint
   curl https://archivist-api-production.up.railway.app/v1/worlds \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

3. **Check World ID**:
   ```javascript
   // Verify world ID is correct
   const worldId = window.ARCHIVIST_SYNC.settingsManager.getSetting('selectedWorldId');
   console.log('Selected World ID:', worldId);
   ```

### 4. User Interface Issues

#### Issue: Dialog Won't Open

**Symptoms**:
- Sync Options dialog doesn't appear
- Menu item not responding
- UI elements not working

**Solutions**:

1. **Check Console Errors**:
   ```javascript
   // Look for JavaScript errors
   // Common errors:
   // - TypeError: Cannot read property
   // - ReferenceError: function not defined
   ```

2. **Test Dialog Creation**:
   ```javascript
   // Test dialog creation manually
   const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
   dialog.render(true);
   ```

3. **Verify Template Files**:
   ```bash
   # Check template file exists
   ls -la templates/sync-options-dialog.hbs
   ```

4. **Check CSS Loading**:
   ```javascript
   // Verify CSS is loaded
   const stylesheet = document.querySelector('link[href*="archivist-sync.css"]');
   console.log('CSS loaded:', !!stylesheet);
   ```

#### Issue: Dialog Styling Problems

**Symptoms**:
- Dialog appears but looks broken
- CSS not loading properly
- Styling conflicts

**Solutions**:

1. **Check CSS File**:
   ```bash
   # Verify CSS file exists and is readable
   ls -la styles/archivist-sync.css
   ```

2. **Inspect CSS Loading**:
   ```javascript
   // Check if CSS is loaded
   const stylesheet = document.querySelector('link[href*="archivist-sync.css"]');
   if (stylesheet) {
     console.log('CSS href:', stylesheet.href);
     console.log('CSS loaded:', stylesheet.sheet);
   }
   ```

3. **Check CSS Conflicts**:
   ```javascript
   // Inspect dialog element
   const dialog = document.querySelector('.archivist-sync-dialog');
   if (dialog) {
     const styles = window.getComputedStyle(dialog);
     console.log('Dialog styles:', styles);
   }
   ```

### 5. Data Synchronization Issues

#### Issue: Data Not Syncing

**Symptoms**:
- Sync operations fail
- Data not updating
- Changes not persisting

**Solutions**:

1. **Check API Response**:
   ```javascript
   // Test API response
   const api = window.ARCHIVIST_SYNC.archivistApi;
   api.fetchWorlds().then(response => {
     console.log('API Response:', response);
   }).catch(error => {
     console.log('API Error:', error);
   });
   ```

2. **Verify Data Format**:
   ```javascript
   // Check data being sent
   const worldData = {
     worldId: game.world.id,
     worldTitle: game.world.title,
     timestamp: new Date().toISOString()
   };
   console.log('Data to sync:', worldData);
   ```

3. **Test Individual Sync Operations**:
   ```javascript
   // Test title sync
   const dialog = new window.ARCHIVIST_SYNC.SyncOptionsDialog();
   dialog._onSyncTitle().then(result => {
     console.log('Title sync result:', result);
   });
   ```

#### Issue: Inconsistent Data

**Symptoms**:
- Data shows differently in different places
- Sync conflicts
- Data corruption

**Solutions**:

1. **Clear Cache**:
   ```javascript
   // Clear module cache
   delete window.ARCHIVIST_SYNC._cache;
   ```

2. **Refresh Data**:
   ```javascript
   // Force data refresh
   const api = window.ARCHIVIST_SYNC.archivistApi;
   api.fetchWorlds().then(() => {
     console.log('Data refreshed');
   });
   ```

3. **Verify Data Validation**:
   ```javascript
   // Check data validation
   const utils = window.ARCHIVIST_SYNC.Utils;
   const isValid = utils.validateWorldData(worldData);
   console.log('Data valid:', isValid);
   ```

## Advanced Troubleshooting

### 1. Browser-Specific Issues

#### Chrome/Chromium Issues

**Common Problems**:
- CORS policy errors
- Memory leaks
- Extension conflicts

**Solutions**:
```javascript
// Disable CORS for testing (Chrome only)
// Launch Chrome with: --disable-web-security --user-data-dir=/tmp/chrome_dev

// Check for extension conflicts
// Disable all extensions and test
```

#### Firefox Issues

**Common Problems**:
- CSP (Content Security Policy) errors
- Performance issues
- Add-on conflicts

**Solutions**:
```javascript
// Check CSP errors in console
// Look for: Content Security Policy directive

// Test in private browsing mode
// Disable all add-ons and test
```

#### Safari Issues

**Common Problems**:
- ES6 compatibility
- CORS issues
- Performance problems

**Solutions**:
```javascript
// Check ES6 support
console.log('ES6 support:', typeof Symbol !== 'undefined');

// Test in different Safari versions
// Use Safari Technology Preview for testing
```

### 2. Performance Issues

#### Issue: Slow Module Loading

**Symptoms**:
- Module takes long time to load
- Foundry VTT freezes during load
- Memory usage high

**Solutions**:

1. **Profile Module Loading**:
   ```javascript
   // Measure loading time
   const startTime = performance.now();
   // ... module loading code ...
   const endTime = performance.now();
   console.log(`Loading time: ${endTime - startTime}ms`);
   ```

2. **Check Memory Usage**:
   ```javascript
   // Monitor memory usage
   if (performance.memory) {
     console.log('Memory usage:', performance.memory.usedJSHeapSize);
   }
   ```

3. **Optimize Code**:
   - Remove unused imports
   - Minimize global variables
   - Use lazy loading

#### Issue: High Memory Usage

**Symptoms**:
- Browser becomes slow
- Memory usage increases over time
- Potential memory leaks

**Solutions**:

1. **Check for Memory Leaks**:
   ```javascript
   // Monitor memory over time
   setInterval(() => {
     if (performance.memory) {
       console.log('Memory:', performance.memory.usedJSHeapSize);
     }
   }, 5000);
   ```

2. **Clean Up Resources**:
   ```javascript
   // Ensure proper cleanup
   dialog.close();
   dialog = null;
   ```

3. **Use Weak References**:
   ```javascript
   // Use WeakMap for temporary data
   const tempData = new WeakMap();
   ```

### 3. Debugging Tools

#### Browser Developer Tools

**Console Commands**:
```javascript
// Module status
window.ARCHIVIST_SYNC.Utils.log('Module status check');

// API status
window.ARCHIVIST_SYNC.archivistApi.getApiStatus();

// Settings check
console.log('Settings:', {
  apiKey: window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey'),
  worldId: window.ARCHIVIST_SYNC.settingsManager.getSetting('selectedWorldId')
});

// Test dialog
new window.ARCHIVIST_SYNC.SyncOptionsDialog().render(true);
```

**Network Tab**:
- Monitor API calls
- Check request/response headers
- Verify data payloads

**Elements Tab**:
- Inspect dialog structure
- Check CSS classes
- Verify event handlers

#### Foundry VTT Debug Tools

**Console Commands**:
```javascript
// Foundry VTT version
console.log('Foundry VTT:', game.version);

// World information
console.log('World:', {
  id: game.world.id,
  title: game.world.title,
  system: game.system.id
});

// Module information
console.log('Modules:', game.modules.get('archivist-sync'));
```

## Getting Help

### 1. Self-Help Resources

**Documentation**:
- README.md - User guide
- API_EXAMPLE.md - API integration examples
- DEVELOPMENT.md - Development guide

**Debug Information**:
```javascript
// Generate debug report
const debugInfo = {
  foundryVersion: game.version,
  moduleVersion: game.modules.get('archivist-sync')?.version,
  browser: navigator.userAgent,
  settings: {
    apiKey: window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey') ? 'Configured' : 'Not configured',
    worldId: window.ARCHIVIST_SYNC.settingsManager.getSetting('selectedWorldId')
  },
  errors: []
};

console.log('Debug Info:', debugInfo);
```

### 2. Community Support

**GitHub Issues**:
- Report bugs and request features
- Search existing issues
- Provide detailed information

**Issue Template**:
```markdown
## Bug Report

### Description
Brief description of the issue

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Environment
- Foundry VTT Version: 
- Module Version: 
- Browser: 
- Operating System: 

### Debug Information
```javascript
// Paste debug info here
```

### Screenshots
If applicable, add screenshots
```

### 3. Professional Support

**For Complex Issues**:
- Contact module developer
- Provide detailed logs
- Include reproduction steps
- Share debug information

**Log Collection**:
```javascript
// Collect comprehensive logs
const logs = {
  console: console.logs,
  errors: console.errors,
  warnings: console.warnings,
  network: performance.getEntriesByType('navigation')
};

console.log('Collected Logs:', logs);
```

This troubleshooting guide provides comprehensive solutions for common issues and helps users and developers resolve problems efficiently.