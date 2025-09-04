# AI Agent Handoff Documentation

## Repository Overview

This is a **Foundry VTT Module** called "Archivist Sync" that enables synchronization between Foundry VTT worlds and an external Archivist API service. The module provides a user interface for Game Masters to manage world data, character mapping, and API integration.

### Key Facts
- **Type**: Foundry VTT Module (JavaScript/ES6)
- **Target Platform**: Foundry VTT v13+
- **Architecture**: Modular ES6 with service-oriented design
- **Main Purpose**: API integration for world data synchronization
- **Target Users**: Game Masters only (security restriction)

## Codebase Architecture

### File Structure
```
archivist-sync/
├── module.json                    # Module manifest and metadata
├── README.md                      # User documentation
├── AI_HANDOFF.md                  # This file - AI agent documentation
├── API_EXAMPLE.md                 # API integration examples
├── CHANGELOG.md                   # Version history
├── scripts/
│   ├── archivist-sync.js         # Main module entry point
│   ├── modules/                   # Core module components
│   │   ├── config.js             # Configuration constants
│   │   ├── settings-manager.js   # Foundry settings management
│   │   └── utils.js              # Utility functions
│   ├── services/                  # External service integrations
│   │   └── archivist-api.js      # API communication service
│   └── dialogs/                   # User interface components
│       └── sync-options-dialog.js # Main dialog implementation
├── styles/
│   └── archivist-sync.css        # Module styling
├── templates/
│   └── sync-options-dialog.hbs   # Handlebars template
└── lang/
    └── en.json                    # Localization strings
```

### Core Components

#### 1. Main Entry Point (`scripts/archivist-sync.js`)
- **Purpose**: Module initialization and global coordination
- **Key Functions**: 
  - `Hooks.once('ready')` - Module startup
  - `initializeDebugInterface()` - Debug console access
- **Exports**: All major components for external access

#### 2. Configuration (`scripts/modules/config.js`)
- **Purpose**: Centralized configuration management
- **Key Exports**:
  - `CONFIG` - Module constants (ID, title, API URL)
  - `SETTINGS` - Foundry settings definitions
  - `MENU_CONFIG` - Menu item configurations
  - `DIALOG_CONFIG` - Dialog configurations
  - `TABS` - Tab identifiers

#### 3. Settings Manager (`scripts/modules/settings-manager.js`)
- **Purpose**: Foundry VTT settings integration
- **Key Features**:
  - API key storage (encrypted)
  - World selection persistence
  - Menu registration
- **Security**: World-scoped settings, GM-only access

#### 4. API Service (`scripts/services/archivist-api.js`)
- **Purpose**: External API communication
- **Key Features**:
  - Bearer token authentication
  - World data fetching
  - Error handling and status reporting
- **API Endpoint**: `https://archivist-api-production.up.railway.app/v1`

#### 5. Sync Dialog (`scripts/dialogs/sync-options-dialog.js`)
- **Purpose**: Main user interface
- **Key Features**:
  - Tabbed interface (World, Title, Characters)
  - Real-time API status
  - World selection and mapping
  - Character synchronization

#### 6. Utilities (`scripts/modules/utils.js`)
- **Purpose**: Common helper functions
- **Key Features**:
  - Logging system
  - Data validation
  - Foundry VTT integration helpers

## Development Patterns

### ES6 Module System
- All files use ES6 import/export syntax
- Main entry point imports all components
- Components are exported for potential external use

### Foundry VTT Integration
- Uses Foundry's `Hooks` system for lifecycle management
- Integrates with Foundry's settings system
- Follows Foundry's dialog and template patterns
- Uses Handlebars for templating

### Error Handling
- Comprehensive error handling in API service
- User-friendly error messages via localization
- Console logging for debugging

### Security Model
- GM-only access restrictions
- Encrypted API key storage
- Bearer token authentication
- Input validation and sanitization

## Key Development Areas

### When Adding Features
1. **Configuration**: Add constants to `config.js`
2. **Settings**: Define new settings in `settings-manager.js`
3. **API Integration**: Extend `archivist-api.js` for new endpoints
4. **UI Components**: Add dialogs in `dialogs/` directory
5. **Localization**: Add strings to `lang/en.json`
6. **Styling**: Update `styles/archivist-sync.css`

### When Debugging
- Use `window.ARCHIVIST_SYNC` for console access
- Check browser console for detailed logs
- Verify API endpoint connectivity
- Validate Foundry VTT version compatibility

### When Testing
- Test with different Foundry VTT versions (v13+)
- Verify GM-only access restrictions
- Test API key validation
- Validate world data synchronization

## Common Tasks for AI Agents

### Adding New API Endpoints
1. Update `archivist-api.js` with new methods
2. Add corresponding UI in dialog components
3. Update localization strings
4. Add error handling and validation

### Creating New Dialogs
1. Create new dialog class extending Foundry's `Application`
2. Add Handlebars template in `templates/`
3. Register dialog in main module
4. Add menu items in `settings-manager.js`

### Modifying Settings
1. Define new settings in `config.js` SETTINGS object
2. Register settings in `settings-manager.js`
3. Add localization strings
4. Update UI to use new settings

### Adding New Features
1. Plan feature architecture
2. Update configuration constants
3. Implement core logic
4. Create/update UI components
5. Add localization
6. Update documentation

## Important Considerations

### Foundry VTT Compatibility
- Target Foundry VTT v13+ (minimum 13.341)
- Use Foundry's built-in systems and patterns
- Follow Foundry's security model

### API Integration
- Always use HTTPS endpoints
- Implement proper error handling
- Validate all API responses
- Handle network timeouts gracefully

### User Experience
- Provide clear status indicators
- Use consistent terminology
- Implement proper loading states
- Show meaningful error messages

### Security
- Never expose API keys in client-side code
- Validate all user inputs
- Use Foundry's permission system
- Implement proper authentication

## Debugging Information

### Console Access
```javascript
// Access module components in browser console
window.ARCHIVIST_SYNC.CONFIG
window.ARCHIVIST_SYNC.settingsManager
window.ARCHIVIST_SYNC.archivistApi
window.ARCHIVIST_SYNC.Utils
window.ARCHIVIST_SYNC.SyncOptionsDialog
```

### Common Issues
1. **API Connection**: Check endpoint URL and API key
2. **Permissions**: Verify GM-only access
3. **Foundry Version**: Ensure v13+ compatibility
4. **CORS**: API endpoint must allow browser requests

### Logging
- All major operations are logged to console
- Use `Utils.log()` for consistent logging
- Check browser console for detailed error information

## Next Steps for AI Agents

When working on this codebase:

1. **Read the existing code** to understand current patterns
2. **Check the configuration** in `config.js` for available options
3. **Review the API service** to understand external integrations
4. **Examine the dialog system** for UI patterns
5. **Use the debug interface** for testing and development
6. **Follow the established patterns** for consistency
7. **Update documentation** when making changes

This module is well-structured and follows Foundry VTT best practices. The modular architecture makes it easy to extend and maintain.