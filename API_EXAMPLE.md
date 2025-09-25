# API Integration Example

This document provides examples for integrating with the Archivist Sync module.

## Expected API Endpoint

Your API endpoint should accept POST requests and return JSON responses.

### Request Format

The module will send a POST request with the following structure:

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Body:**
```json
{
  \"worldId\": \"foundry-world-unique-id\",
  \"worldTitle\": \"My Awesome Campaign\",
  \"timestamp\": \"2024-08-31T12:00:00.000Z\"
}
```

### Response Format

Your API should return a JSON response. Here's an example:

```json
{
  \"success\": true,
  \"worldData\": {
    \"worldId\": \"foundry-world-unique-id\",
    \"lastSync\": \"2024-08-31T11:30:00.000Z\",
    \"playerCount\": 4,
    \"sessionCount\": 15,
    \"totalPlayTime\": \"45h 30m\",
    \"characters\": [
      {
        \"name\": \"Aragorn\",
        \"level\": 8,
        \"class\": \"Ranger\"
      },
      {
        \"name\": \"Legolas\",
        \"level\": 8,
        \"class\": \"Fighter\"
      }
    ],
    \"campaigns\": {
      \"current\": \"The Fellowship\",
      \"chapter\": \"Mines of Moria\",
      \"progress\": 65
    }
  },
  \"message\": \"World data retrieved successfully\"
}
```

## Example API Implementation

Here's a simple Node.js/Express example:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Middleware to verify API key
function verifyApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  
  const apiKey = authHeader.substring(7);
  // Verify your API key here
  if (apiKey !== 'your-secret-api-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// World data endpoint
app.post('/world-data', verifyApiKey, (req, res) => {
  const { worldId, worldTitle, timestamp } = req.body;
  
  // Here you would typically:
  // 1. Validate the request
  // 2. Fetch data from your database
  // 3. Process the world information
  
  const worldData = {
    success: true,
    worldData: {
      worldId: worldId,
      lastSync: new Date().toISOString(),
      // ... your world data
    },
    message: 'World data retrieved successfully'
  };
  
  res.json(worldData);
});

app.listen(3000, () => {
  console.log('API server running on port 3000');
});
```

## Game Sessions (Read-Only)

The Archivist API treats game sessions as read-only objects for clients of this module:

- There are no supported POST or DELETE endpoints for creating or deleting sessions.
- Session data (e.g., counts, last activity) may appear in GET responses but must not be mutated by clients.

## Error Handling

Your API should return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (invalid data)
- `401`: Unauthorized (invalid API key)
- `404`: Not Found (world not found)
- `500`: Internal Server Error

Example error response:

```json
{
  \"success\": false,
  \"error\": \"World not found\",
  \"code\": \"WORLD_NOT_FOUND\",
  \"message\": \"The specified world ID does not exist in our database\"
}
```

## Security Considerations

1. **HTTPS Only**: Always use HTTPS in production
2. **API Key Security**: Store API keys securely and rotate them regularly
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **CORS**: Configure CORS headers if needed for browser requests
5. **Input Validation**: Always validate and sanitize input data
6. **Logging**: Log requests for security monitoring

## Testing Your API

You can test your API endpoint using curl:

```bash
curl -X POST https://your-api.com/world-data \\n  -H \"Content-Type: application/json\" \\n  -H \"Authorization: Bearer your-api-key\" \\n  -d '{
    \"worldId\": \"test-world-123\",
    \"worldTitle\": \"Test Campaign\",
    \"timestamp\": \"2024-08-31T12:00:00.000Z\"
  }'
```

This should help you get started with building an API that works with the Archivist Sync module!

## Enhanced Biography Field Processing

The module now includes advanced biography field auto-matching and concatenation functionality. This allows for intelligent processing of character biographical information across multiple fields.

### Biography Field Discovery

The system automatically discovers biography-related fields in actor data, including:

- **Core Biography**: `biography`, `bio`, `backstory`, `appearance`
- **Personality**: `beliefs`, `catchphrases`, `dislikes`, `likes`, `attitude`
- **Relationships**: `allies`, `enemies`, `organizations`, `family`, `mentor`, `rival`
- **Background**: `birthplace`, `campaignnotes`, `personality`, `traits`, `background`
- **History**: `history`, `origin`, `motivation`, `goals`, `fears`, `secrets`

### Usage Examples

```javascript
// Import the enhanced field mapper functions
import { 
    processBiographyFields, 
    discoverBiographyFields,
    concatenateBiographyFields,
    writeBestBiographyEnhanced 
} from './scripts/modules/field-mapper.js';

// Example 1: Auto-discover and process all biography fields
const actor = game.actors.getName("Aragorn");
const result = processBiographyFields(actor, {
    includeFieldLabels: true,    // Add field names as headers
    preserveVisibility: true,    // Respect visibility settings
    convertToMarkdown: true      // Convert final HTML to markdown
});

console.log("Concatenated HTML:", result.html);
console.log("Markdown version:", result.markdown);
console.log("Discovered fields:", result.fields);

// Example 2: Just discover fields without processing
const biographyFields = discoverBiographyFields(actor);
biographyFields.forEach(field => {
    console.log(`${field.field}: ${field.value.substring(0, 50)}...`);
});

// Example 3: Enhanced writing with auto-processing
await writeBestBiographyEnhanced(actor, {
    includeFieldLabels: false,
    preserveVisibility: true,
    convertToMarkdown: true
});

// Example 4: Custom concatenation with specific options
const html = concatenateBiographyFields(biographyFields, {
    includeFieldLabels: true,
    preserveVisibility: false,  // Include hidden fields
    actor: actor
});
```

### Field Priority and Sorting

Fields are automatically sorted by priority:

1. **High Priority** (1000): `biography`, `bio`
2. **Very High** (900): `backstory`
3. **High** (800): `appearance`
4. **Medium-High** (700): `description`
5. **Medium** (600): `personality`
6. **Medium-Low** (500): `traits`
7. **Low** (400): `background`
8. **Very Low** (300): `history`
9. **Minimal** (200): `notes`
10. **Minimal** (100): `summary`

### Visibility Handling

The system respects Foundry's visibility settings when `preserveVisibility: true`:

```javascript
// Example actor with visibility settings
const actor = {
    system: {
        details: {
            biography: {
                value: "Public biography text",
                visibility: {
                    appearance: true,    // Visible
                    backstory: false     // Hidden
                }
            }
        }
    }
};

// Only visible fields will be included
const result = processBiographyFields(actor, {
    preserveVisibility: true
});
```

### HTML to Markdown Conversion

The system automatically converts HTML content to clean markdown:

```html
<!-- Input HTML -->
<h4>Appearance</h4>
<p>Tall and <strong>noble</strong> with <em>piercing</em> eyes</p>

<!-- Output Markdown -->
## Appearance

Tall and **noble** with _piercing_ eyes
```

### Integration with Existing Systems

This enhanced functionality is backward compatible with existing biography writing functions:

```javascript
// Original function still works
await writeBestBiography(actor, "<p>Simple biography text</p>");

// New enhanced function with auto-processing
await writeBestBiographyEnhanced(actor, {
    includeFieldLabels: true,
    preserveVisibility: true
});
```