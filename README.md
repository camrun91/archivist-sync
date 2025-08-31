# Archivist Sync

A simple Foundry Virtual Tabletop module for connecting to the Archivist API and selecting worlds for synchronization.

## Features

- **API Key Authentication**: Securely store your Archivist API key in module settings
- **World Discovery**: Sync with the Archivist API to fetch available worlds
- **World Selection**: Choose and persistently save which world to sync with
- **Simple Interface**: Easy-to-use dialog for world management
- **Real-time Status**: Visual indicators showing API connection status
- **Persistent Settings**: Selected world is saved and remembered across sessions
- **GM Only Access**: Restricted to Game Master users for security
- **Foundry VTT v13 Compatible**: Built specifically for Foundry VTT version 13

## Installation

### Manual Installation

1. Download the module files
2. Extract them to your Foundry VTT modules directory: `Data/modules/archivist-sync/`
3. Restart Foundry VTT
4. Enable the module in your world's module settings

### Automatic Installation

1. In Foundry VTT, go to the "Add-on Modules" tab
2. Click "Install Module"
3. Paste the manifest URL: `https://github.com/yourusername/archivist-sync/releases/latest/download/module.json`
4. Click "Install"

## Usage

### Initial Setup

1. Navigate to **Game Settings > Module Settings > Archivist Sync**
2. Configure the following settings:
   - **API Key**: Enter your authentication key for the world data service
   - **API Endpoint**: Set the URL for your world data API (e.g., `https://api.example.com/world-data`)

### Fetching World Data

1. Go to **Game Settings > Module Settings**
2. Click on **"Fetch World Data"** button in the Archivist Sync section
3. In the dialog that opens:
   - Check the API status indicator
   - Click **"Fetch World Data"** to retrieve data from your configured endpoint
   - View the JSON response in the formatted display area

### API Request Format

The module sends a POST request to your configured endpoint with the following data:

```json
{
  "worldId": "your-foundry-world-id",
  "worldTitle": "Your World Name",
  "timestamp": "2024-08-31T12:00:00.000Z"
}
```

The request includes an `Authorization: Bearer {your-api-key}` header.

## Development

### File Structure

```
archivist-sync/
├── module.json              # Module manifest
├── README.md               # This documentation
├── scripts/
│   └── archivist-sync.js   # Main module code
├── styles/
│   └── archivist-sync.css  # Module styles
└── lang/
    └── en.json            # English localization
```

### Extending the Module

Key areas for customization:

1. **API Request Format**: Modify the `fetchWorldData()` function to change what data is sent
2. **Response Handling**: Update the response processing in the dialog
3. **Authentication**: Modify headers or authentication method as needed
4. **UI Elements**: Customize the dialog template and styling

### API Integration

The module is designed to work with RESTful APIs that:
- Accept POST requests
- Use Bearer token authentication
- Return JSON responses
- Handle CORS if accessing from a browser context

## Compatibility

- **Foundry VTT**: Version 12+ (verified for v13)
- **Systems**: Compatible with all game systems
- **Modules**: No known conflicts
- **Browsers**: Modern browsers with fetch API support

## Security Considerations

- API keys are stored in Foundry's world settings (encrypted)
- Only Game Masters can access the module functionality
- HTTPS endpoints are recommended for API communication
- Consider implementing rate limiting on your API endpoint

## Troubleshooting

### Common Issues

1. **"Not Configured" Status**: Ensure both API key and endpoint are set in module settings
2. **Fetch Failed**: Check console for detailed error messages
3. **CORS Errors**: Your API endpoint may need to allow requests from your Foundry domain
4. **Authentication Errors**: Verify your API key is correct and active

### Debug Information

The module logs detailed information to the browser console. Enable developer tools to view:
- API request details
- Response data
- Error messages

## Changelog

### Version 1.0.0
- Initial release
- Basic API key and endpoint configuration
- Simple world data fetching interface
- Status indicators and error handling
- JSON response viewer

## License

This project is licensed under the MIT License.

## Support

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/yourusername/archivist-sync/issues)
- **Documentation**: Check this README and the module settings help text

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

---

**Note**: Remember to update the URLs in `module.json` to point to your actual repository and releases!