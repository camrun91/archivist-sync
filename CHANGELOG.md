# Changelog

All notable changes to the Archivist Sync module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2025-10-21

### Added
- New "Chat Visibility" setting where users can toggle the chat tab to have everyone, only the GM, or no one see the Archivist Chat tab.

## [1.3.1] - 2025-10-20

### Changed
- Standardized class names

### Removed
- Send to Player button

## [1.3.0] - 2025-10-20

### Added
- Projection/Ingestion for Actor/Item descriptions with improved heuristics to determine the most likely property paths
- Setting to toggle real-time syncing on/off
- Setting to toggle projection on/off

### Changed
- "Run World Setup Again" now completely clears Archivist journal directories

### Fixed
- UI re-render bug fixes

### Notes
- Projection/Ingest has been tested for dnd 5e and pf2e but not for other systems yet.

## [1.2.2] - 2025-10-16

## Fixed
- Merged CSS files
- World setup tabs no longer auto switch when selecting a checkbox

## [1.2.0] - 2025-10-16

## Added
- New release workflow
- completley new UI
- Built to be system agnostic

## [1.2.0] - 2025-10-15

### Added
- 

### Changed
- 

### Fixed
- 

## [1.0.1] - 2025-10-17

### Added
- Initial release of Archivist Sync module
- Basic data synchronization functionality
- Manual export feature for game archives
- Scene control tools for GM access
- Configurable sync intervals (60-3600 seconds)
- Automatic monitoring of actor and item creation
- English localization support
- Foundry VTT v13 compatibility
- Module settings panel integration
- Console logging for debugging and monitoring
- Responsive UI design
- Custom CSS styling for module elements

### Features
- **Data Sync**: Automatic and manual synchronization of game data
- **Archive Export**: Download game state as JSON file
- **GM Tools**: Scene control integration for easy access
- **Settings**: Configurable sync behavior and intervals
- **Monitoring**: Real-time logging of sync operations
- **Localization**: Support for multiple languages (English included)

### Technical Details
- Compatible with Foundry VTT v12+ (verified for v13)
- Uses ES modules for modern JavaScript support
- Implements Foundry VTT hooks for seamless integration
- Responsive design for various screen sizes
- No external dependencies required

---

## Template for Future Releases

### [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Now removed features

### Fixed
- Any bug fixes

### Security
- In case of vulnerabilities
