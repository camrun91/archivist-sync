# Architecture Documentation

## System Overview

The Archivist Sync module is a Foundry VTT integration that provides bidirectional synchronization between Foundry VTT worlds and the Archivist API service. The architecture follows a modular, service-oriented design pattern optimized for Foundry VTT's ecosystem.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Foundry VTT Environment"
        FVTT[Foundry VTT Core]
        WORLD[Foundry World Data]
        SETTINGS[Foundry Settings System]
        HOOKS[Foundry Hooks System]
    end
    
    subgraph "Archivist Sync Module"
        MAIN[archivist-sync.js<br/>Main Orchestrator]
        CONFIG[config.js<br/>Configuration]
        SETMGR[settings-manager.js<br/>Settings Management]
        UTILS[utils.js<br/>Utilities]
        
        subgraph "Services Layer"
            API[archivist-api.js<br/>API Service]
        end
        
        subgraph "UI Layer"
            DIALOG[sync-options-dialog.js<br/>Main Dialog]
            TEMPLATE[sync-options-dialog.hbs<br/>Template]
            STYLES[archivist-sync.css<br/>Styling]
        end
        
        subgraph "Localization"
            LANG[en.json<br/>Localization]
        end
    end
    
    subgraph "External Services"
        ARCHIVIST[Archivist API<br/>Railway.app]
    end
    
    FVTT --> MAIN
    MAIN --> CONFIG
    MAIN --> SETMGR
    MAIN --> UTILS
    MAIN --> API
    MAIN --> DIALOG
    
    SETMGR --> SETTINGS
    DIALOG --> TEMPLATE
    DIALOG --> STYLES
    DIALOG --> LANG
    
    API --> ARCHIVIST
    SETMGR --> WORLD
    
    HOOKS --> MAIN
```

## Component Architecture

### 1. Main Orchestrator (`archivist-sync.js`)

**Responsibility**: Module lifecycle management and component coordination

**Key Functions**:
- Module initialization via Foundry hooks
- Global component registration
- Debug interface setup
- Component export for external access

**Dependencies**:
- All module components
- Foundry VTT hooks system

**Exports**:
```javascript
export {
  CONFIG,           // Configuration constants
  settingsManager,  // Settings management
  archivistApi,     // API service
  Utils,           // Utility functions
  SyncOptionsDialog // Main dialog
}
```

### 2. Configuration Layer (`config.js`)

**Responsibility**: Centralized configuration management

**Structure**:
```javascript
export const CONFIG = {
  MODULE_ID: 'archivist-sync',
  MODULE_TITLE: 'Archivist Sync',
  API_BASE_URL: 'https://archivist-api-production.up.railway.app/v1'
};

export const SETTINGS = {
  // Foundry settings definitions
  API_KEY: { /* ... */ },
  SELECTED_WORLD_ID: { /* ... */ },
  SELECTED_WORLD_NAME: { /* ... */ }
};

export const MENU_CONFIG = {
  // Menu item configurations
};

export const DIALOG_CONFIG = {
  // Dialog configurations
};

export const TABS = {
  // Tab identifiers
};
```

**Design Patterns**:
- Constants as configuration
- Structured settings definitions
- Separation of concerns

### 3. Settings Management (`settings-manager.js`)

**Responsibility**: Foundry VTT settings integration and persistence

**Key Features**:
- Settings registration with Foundry
- Encrypted storage for sensitive data
- Menu item registration
- GM-only access control

**Security Model**:
- World-scoped settings
- Encrypted API key storage
- Permission-based access control

**API**:
```javascript
class SettingsManager {
  registerSettings()     // Register all settings with Foundry
  getSetting(key)        // Retrieve setting value
  setSetting(key, value) // Set setting value
  registerMenu()         // Register menu items
}
```

### 4. API Service (`archivist-api.js`)

**Responsibility**: External API communication and data synchronization

**Architecture**:
```javascript
class ArchivistApi {
  // Core API methods
  async fetchWorlds()           // Fetch available worlds
  async fetchWorldData(worldId) // Fetch specific world data
  async syncWorldData(data)     // Sync world data
  
  // Utility methods
  getApiStatus()               // Check API connectivity
  validateApiKey()             // Validate API key
  handleApiError(error)        // Error handling
}
```

**Communication Flow**:
1. Authentication via Bearer token
2. Request/response handling
3. Error management and user feedback
4. Status reporting

**Error Handling**:
- Network timeout handling
- HTTP status code interpretation
- User-friendly error messages
- Retry logic for transient failures

### 5. User Interface Layer

#### Main Dialog (`sync-options-dialog.js`)

**Responsibility**: Primary user interface for module interaction

**Architecture**:
```javascript
class SyncOptionsDialog extends Application {
  // Lifecycle methods
  static get defaultOptions()  // Dialog configuration
  getData()                    // Template data preparation
  activateListeners()          // Event handling
  
  // Tab management
  _onTabChange(event)          // Tab switching
  _renderTab(tabName)          // Tab rendering
  
  // API integration
  _onSyncWorlds()              // World synchronization
  _onSaveSelection()           // Save world selection
  _onSyncTitle()               // Title synchronization
  _onSyncCharacters()          // Character synchronization
}
```

**UI Structure**:
- Tabbed interface (World, Title, Characters)
- Real-time status indicators
- Form controls and validation
- Progress indicators

#### Template System (`sync-options-dialog.hbs`)

**Responsibility**: HTML structure and data binding

**Features**:
- Handlebars templating
- Conditional rendering
- Data binding
- Accessibility support

### 6. Utility Layer (`utils.js`)

**Responsibility**: Common functionality and helper functions

**Key Functions**:
```javascript
class Utils {
  // Logging
  static log(message, ...args)     // Consistent logging
  static warn(message, ...args)    // Warning messages
  static error(message, ...args)   // Error messages
  
  // Data validation
  static validateApiKey(key)       // API key validation
  static validateWorldData(data)   // World data validation
  
  // Foundry integration
  static getCurrentWorld()         // Get current Foundry world
  static getActorsByType(type)     // Get actors by type
  static formatTimestamp(date)     // Date formatting
}
```

## Data Flow Architecture

### 1. Module Initialization Flow

```mermaid
sequenceDiagram
    participant FVTT as Foundry VTT
    participant MAIN as Main Module
    participant SETMGR as Settings Manager
    participant API as API Service
    participant DEBUG as Debug Interface
    
    FVTT->>MAIN: Hooks.once('ready')
    MAIN->>SETMGR: registerSettings()
    SETMGR->>FVTT: Register settings & menu
    MAIN->>DEBUG: initializeDebugInterface()
    DEBUG->>MAIN: Expose components globally
    MAIN->>API: Initialize API service
```

### 2. World Synchronization Flow

```mermaid
sequenceDiagram
    participant USER as User
    participant DIALOG as Sync Dialog
    participant API as API Service
    participant ARCHIVIST as Archivist API
    participant SETTINGS as Settings Manager
    
    USER->>DIALOG: Click "Sync Worlds"
    DIALOG->>API: fetchWorlds()
    API->>ARCHIVIST: GET /worlds
    ARCHIVIST->>API: Return world list
    API->>DIALOG: Return world data
    DIALOG->>USER: Display world options
    
    USER->>DIALOG: Select world
    DIALOG->>SETTINGS: setSetting('selectedWorldId')
    SETTINGS->>DIALOG: Confirm save
    DIALOG->>USER: Show success message
```

### 3. Data Synchronization Flow

```mermaid
sequenceDiagram
    participant USER as User
    participant DIALOG as Sync Dialog
    participant API as API Service
    participant ARCHIVIST as Archivist API
    participant FVTT as Foundry VTT
    
    USER->>DIALOG: Click "Sync Title"
    DIALOG->>FVTT: Get current world data
    FVTT->>DIALOG: Return world info
    DIALOG->>API: syncWorldData(data)
    API->>ARCHIVIST: POST /worlds/{id}/sync
    ARCHIVIST->>API: Return sync result
    API->>DIALOG: Return success/error
    DIALOG->>USER: Show result message
```

## Security Architecture

### 1. Authentication Flow

```mermaid
graph LR
    USER[User Input] --> VALIDATE[Input Validation]
    VALIDATE --> ENCRYPT[Encrypted Storage]
    ENCRYPT --> API[API Request]
    API --> BEARER[Bearer Token]
    BEARER --> EXTERNAL[External API]
```

### 2. Permission Model

- **GM-Only Access**: All module functionality restricted to Game Masters
- **World-Scoped Settings**: Settings isolated per Foundry world
- **Encrypted Storage**: API keys stored with Foundry's encryption
- **Input Validation**: All user inputs validated and sanitized

### 3. API Security

- **HTTPS Only**: All API communication over secure connections
- **Bearer Token Authentication**: Standard OAuth2-style authentication
- **Request Validation**: All API requests validated before sending
- **Error Handling**: Secure error messages without sensitive data exposure

## Error Handling Architecture

### 1. Error Classification

```javascript
// Error types and handling strategies
const ERROR_TYPES = {
  NETWORK: 'Network connectivity issues',
  AUTHENTICATION: 'API key or authentication problems',
  VALIDATION: 'Input validation failures',
  API: 'External API errors',
  FOUNDRY: 'Foundry VTT integration errors'
};
```

### 2. Error Handling Flow

```mermaid
graph TD
    ERROR[Error Occurs] --> CLASSIFY[Classify Error Type]
    CLASSIFY --> LOG[Log Error Details]
    LOG --> USER[Show User Message]
    USER --> RECOVER[Recovery Action]
    RECOVER --> RETRY{Retry Possible?}
    RETRY -->|Yes| RETRY_ACTION[Retry Operation]
    RETRY -->|No| FAIL[Fail Gracefully]
    RETRY_ACTION --> SUCCESS{Success?}
    SUCCESS -->|Yes| COMPLETE[Complete Operation]
    SUCCESS -->|No| FAIL
```

## Performance Considerations

### 1. Lazy Loading
- Components loaded only when needed
- API calls made on-demand
- Dialog rendering optimized for performance

### 2. Caching Strategy
- World data cached during session
- API status cached with TTL
- Settings cached in memory

### 3. Memory Management
- Proper cleanup of event listeners
- Dialog disposal when closed
- Minimal global state

## Extension Points

### 1. Adding New API Endpoints
- Extend `ArchivistApi` class
- Add new methods following existing patterns
- Update error handling and validation

### 2. Adding New UI Components
- Create new dialog classes extending `Application`
- Add corresponding Handlebars templates
- Register with main module

### 3. Adding New Settings
- Define in `config.js` SETTINGS object
- Register in `settings-manager.js`
- Add localization strings

### 4. Adding New Features
- Follow modular architecture patterns
- Maintain separation of concerns
- Update configuration and documentation

## Testing Architecture

### 1. Unit Testing
- Individual component testing
- Mock Foundry VTT environment
- API service testing with mock responses

### 2. Integration Testing
- Full module integration
- API communication testing
- UI interaction testing

### 3. End-to-End Testing
- Complete user workflows
- Foundry VTT environment testing
- Real API integration testing

This architecture provides a solid foundation for the Archivist Sync module while maintaining flexibility for future enhancements and extensions.