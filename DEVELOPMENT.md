# Development Guide

## Getting Started

### Prerequisites

- **Foundry VTT**: Version 13.341 or higher
- **Node.js**: Version 16+ (for development tools)
- **Git**: For version control
- **Code Editor**: VS Code recommended with Foundry VTT extensions

### Development Environment Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/archivist-sync.git
   cd archivist-sync
   ```

2. **Install Development Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Foundry VTT Development Environment**
   - Install Foundry VTT locally
   - Create a development world for testing
   - Enable developer mode in Foundry VTT

4. **Link Module for Development**
   ```bash
   # Create symlink to Foundry modules directory
   ln -s $(pwd) /path/to/foundry/Data/modules/archivist-sync
   ```

## Project Structure

```
archivist-sync/
├── .gitignore                 # Git ignore rules
├── .vscode/                   # VS Code configuration
├── module.json               # Module manifest
├── package.json              # Node.js dependencies
├── scripts/                  # JavaScript source code
│   ├── archivist-sync.js    # Main entry point
│   ├── modules/             # Core module components
│   ├── services/            # External service integrations
│   └── dialogs/             # User interface components
├── styles/                  # CSS styling
├── templates/               # Handlebars templates
├── lang/                    # Localization files
├── docs/                    # Documentation
└── tests/                   # Test files
```

## Development Workflow

### 1. Making Changes

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Follow the established code patterns
   - Update relevant documentation
   - Add localization strings if needed

3. **Test Your Changes**
   - Test in Foundry VTT development environment
   - Verify all functionality works as expected
   - Check for console errors

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

### 2. Code Style Guidelines

#### JavaScript/ES6
- Use ES6 modules (import/export)
- Follow camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_CASE for constants
- Add JSDoc comments for public methods

```javascript
/**
 * Fetches world data from the Archivist API
 * @param {string} worldId - The world ID to fetch
 * @returns {Promise<Object>} The world data
 */
async fetchWorldData(worldId) {
  // Implementation
}
```

#### CSS
- Use BEM methodology for class naming
- Follow the existing naming conventions
- Use CSS custom properties for theming
- Keep styles modular and organized

```css
.archivist-sync-dialog {
  /* Base styles */
}

.archivist-sync-dialog__header {
  /* Header styles */
}

.archivist-sync-dialog__content {
  /* Content styles */
}
```

#### Handlebars Templates
- Use semantic HTML
- Include accessibility attributes
- Follow the existing template structure
- Use localization keys for all text

```handlebars
<div class="archivist-sync-dialog__header">
  <h2>{{localize "ARCHIVIST_SYNC.Dialog.Title"}}</h2>
</div>
```

### 3. Adding New Features

#### Step 1: Plan the Feature
- Define the feature requirements
- Identify affected components
- Plan the user interface
- Consider API changes needed

#### Step 2: Update Configuration
```javascript
// In config.js
export const NEW_FEATURE_CONFIG = {
  ENABLED: true,
  DEFAULT_VALUE: 'default',
  // ... other config
};
```

#### Step 3: Add Settings (if needed)
```javascript
// In config.js SETTINGS object
NEW_SETTING: {
  key: 'newSetting',
  name: 'ARCHIVIST_SYNC.Settings.NewSetting.Name',
  hint: 'ARCHIVIST_SYNC.Settings.NewSetting.Hint',
  scope: 'world',
  config: true,
  type: String,
  default: ''
}
```

#### Step 4: Implement Core Logic
- Add methods to appropriate service classes
- Follow existing error handling patterns
- Add proper logging

#### Step 5: Update User Interface
- Add UI elements to dialogs
- Update templates as needed
- Add event handlers

#### Step 6: Add Localization
```json
// In lang/en.json
"NewSetting": {
  "Name": "New Setting",
  "Hint": "Description of the new setting"
}
```

#### Step 7: Test and Document
- Test the feature thoroughly
- Update documentation
- Add changelog entry

### 4. Debugging

#### Console Debugging
The module provides a global debug interface:

```javascript
// Access in browser console
window.ARCHIVIST_SYNC.CONFIG
window.ARCHIVIST_SYNC.settingsManager
window.ARCHIVIST_SYNC.archivistApi
window.ARCHIVIST_SYNC.Utils
window.ARCHIVIST_SYNC.SyncOptionsDialog
```

#### Common Debugging Techniques

1. **Check Module Initialization**
   ```javascript
   // In console
   window.ARCHIVIST_SYNC.Utils.log("Debug message");
   ```

2. **Test API Connectivity**
   ```javascript
   // In console
   window.ARCHIVIST_SYNC.archivistApi.getApiStatus();
   ```

3. **Inspect Settings**
   ```javascript
   // In console
   window.ARCHIVIST_SYNC.settingsManager.getSetting('apiKey');
   ```

4. **Test Dialog Functionality**
   ```javascript
   // In console
   new window.ARCHIVIST_SYNC.SyncOptionsDialog().render(true);
   ```

#### Browser Developer Tools
- Use Network tab to monitor API calls
- Check Console for error messages
- Use Elements tab to inspect UI
- Use Application tab to check Foundry settings

### 5. Testing

#### Manual Testing Checklist

- [ ] Module loads without errors
- [ ] Settings can be configured
- [ ] API connectivity works
- [ ] World synchronization functions
- [ ] Error handling works properly
- [ ] UI is responsive and accessible
- [ ] Localization displays correctly

#### Testing Different Scenarios

1. **Fresh Installation**
   - Install module in clean Foundry VTT
   - Test initial configuration
   - Verify default settings

2. **API Connectivity Issues**
   - Test with invalid API key
   - Test with network disconnected
   - Test with invalid endpoint URL

3. **Different Foundry Versions**
   - Test with minimum supported version
   - Test with latest version
   - Test with different game systems

#### Automated Testing (Future)

```javascript
// Example test structure
describe('ArchivistApi', () => {
  it('should fetch worlds successfully', async () => {
    // Test implementation
  });
  
  it('should handle API errors gracefully', async () => {
    // Test implementation
  });
});
```

### 6. Performance Optimization

#### Code Optimization
- Use lazy loading for heavy components
- Implement proper cleanup in dialogs
- Minimize global state
- Use efficient data structures

#### API Optimization
- Implement request caching
- Use appropriate timeouts
- Handle rate limiting
- Optimize payload sizes

#### UI Optimization
- Use efficient DOM manipulation
- Implement virtual scrolling for large lists
- Optimize CSS selectors
- Minimize reflows and repaints

### 7. Security Considerations

#### Input Validation
```javascript
// Always validate user inputs
static validateApiKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid API key format');
  }
  return key.trim();
}
```

#### API Security
- Never log sensitive data
- Use HTTPS for all API calls
- Implement proper error handling
- Validate all API responses

#### Foundry Integration
- Respect Foundry's permission system
- Use encrypted storage for sensitive data
- Follow Foundry's security guidelines

### 8. Documentation

#### Code Documentation
- Add JSDoc comments for all public methods
- Document complex algorithms
- Include usage examples
- Document configuration options

#### User Documentation
- Update README.md for user-facing changes
- Add screenshots for UI changes
- Document new features
- Update troubleshooting guide

#### API Documentation
- Document new API endpoints
- Provide example requests/responses
- Document error codes
- Include authentication requirements

### 9. Release Process

#### Version Bumping
```bash
# Update version in module.json
# Update CHANGELOG.md
# Create git tag
git tag -a v1.1.0 -m "Release version 1.1.0"
git push origin v1.1.0
```

#### Pre-Release Testing
- Test in multiple Foundry VTT versions
- Test with different game systems
- Verify all features work
- Check documentation accuracy

#### Release Notes
- Document new features
- List bug fixes
- Note breaking changes
- Include upgrade instructions

### 10. Contributing Guidelines

#### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit pull request

#### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No console errors
- [ ] Security considerations addressed
- [ ] Performance impact considered

#### Issue Reporting
- Use the issue template
- Provide reproduction steps
- Include Foundry VTT version
- Attach relevant logs
- Describe expected vs actual behavior

## Development Tools

### Recommended VS Code Extensions
- Foundry VTT Development Tools
- ES6 String HTML
- Handlebars
- GitLens
- Prettier
- ESLint

### Useful Commands
```bash
# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Development Scripts
```json
{
  "scripts": {
    "dev": "foundry-vtt-dev",
    "test": "jest",
    "build": "webpack",
    "lint": "eslint scripts/",
    "format": "prettier --write scripts/"
  }
}
```

This development guide provides a comprehensive foundation for contributing to the Archivist Sync module while maintaining code quality and consistency.