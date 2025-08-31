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