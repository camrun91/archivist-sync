# Changelog

All notable changes to the Archivist Sync module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Enhanced Biography Field Processing**: Auto-discovery and concatenation of biography-related fields
- **Biography Field Auto-Matching**: Intelligent detection of biographical information across multiple actor fields
- **HTML to Markdown Conversion**: Automatic conversion of concatenated biography HTML to clean markdown
- **Field Priority Sorting**: Smart ordering of biography fields by importance and relevance
- **Visibility Awareness**: Respect for Foundry's field visibility settings during processing
- **New Functions**: 
  - `discoverBiographyFields()` - Auto-discover biography fields in actor data
  - `concatenateBiographyFields()` - Concatenate fields into structured HTML
  - `processBiographyFields()` - Complete processing pipeline with markdown conversion
  - `writeBestBiographyEnhanced()` - Enhanced biography writing with auto-processing
- **Comprehensive Documentation**: Added usage examples and API documentation for new features
- **Backward Compatibility**: All new features work alongside existing biography functions

### Enhanced
- **Field Mapper Module**: Significantly expanded with biography field intelligence
- **Documentation**: Added detailed examples and usage patterns in API_EXAMPLE.md
- **Field Discovery**: Supports 20+ biography-related field types including appearance, backstory, allies, enemies, beliefs, etc.

### Technical Details
- Maintains full backward compatibility with existing `writeBestBiography()` function
- Integrates with existing HTML to markdown conversion utilities
- Uses semantic field matching for intelligent biography field detection
- Supports nested object scanning for complex actor data structures

## [1.0.0] - 2024-08-31

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