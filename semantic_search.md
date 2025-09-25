# Semantic Search & Matching Documentation

This document explains the semantic search and matching functionality of the Archivist Sync module. For basic module usage, see the main [README.md](README.md).

## 🧠 What is Semantic Search?

Semantic search goes beyond simple keyword matching by understanding the **meaning** and **context** of content. Instead of looking for exact word matches, it uses AI embeddings to find conceptually similar content, even when different words are used.

### Example:
- **Traditional Search**: "sword" only finds documents containing the word "sword"
- **Semantic Search**: "sword" also finds documents about "blade", "weapon", "katana", "rapier", etc.

## 🔄 How the Semantic Matching Works

### 1. **Entity Extraction** (`importer-extractor.js`)
The module scans your Foundry world and extracts entities into a standardized format:

```javascript
// Example extracted entity
{
  kind: 'Actor',
  subtype: 'character', 
  name: 'Aragorn',
  body: 'Ranger from the North...',
  tags: ['ranger', 'noble'],
  images: ['path/to/portrait.jpg'],
  metadata: { system: actor.system }
}
```

**Supported Entity Types:**
- **Actors** (Characters, NPCs, Monsters)
- **Journal Entries** (Lore, Notes, Stories)
- **Scenes** (Maps, Locations)

### 2. **Semantic Mapping** (`semantic-mapper.js`)
Uses AI embeddings to intelligently map Foundry entities to Archivist types:

```javascript
// The module uses Xenova/all-MiniLM-L6-v2 model for embeddings
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Calculates semantic similarity between concepts
const similarity = cosineSimilarity(conceptVector, candidateVector);
```

**Mapping Process:**
1. **Rule-Based Matching**: Applies predefined rules based on entity type, folder names, tags
2. **Semantic Analysis**: Uses AI embeddings to find semantically similar content
3. **Confidence Scoring**: Combines rule-based and semantic scores for final mapping

### 3. **Intelligent Field Mapping** (`importer-mapper.js`)
Maps Foundry data fields to Archivist fields using JSONPath expressions:

```javascript
// Example mapping rules
{
  if: { kind: 'Actor', path: 'metadata.type', eq: 'character' },
  mapTo: 'Character',
  fields: {
    title: '$.name',                    // Actor name → Character title
    description: '$.metadata.system.details.biography', // Bio → Description
    portraitUrl: '$.images[0]'         // First image → Portrait
  },
  labels: ['PC'],
  confidenceBoost: 0.2
}
```

### 4. **Content Normalization** (`importer-normalizer.js`)
Cleans and standardizes content for better semantic matching:

- **HTML to Markdown**: Converts Foundry's rich text to clean markdown
- **Tag Extraction**: Finds hashtags and creates semantic tags
- **Link Resolution**: Processes Foundry UUID links
- **Boilerplate Removal**: Strips Foundry-specific formatting

## 🎯 Semantic Search Features

### **Automatic Entity Classification**
The module intelligently categorizes your Foundry entities:

- **Characters** → Archivist Characters (PCs, NPCs)
- **Journal Entries** → Archivist Factions (organizations, guilds)
- **Scenes** → Archivist Locations (maps, places)

### **Smart Field Detection**
Uses semantic similarity to suggest the best field mappings:

```javascript
// Example: Finding the best field for character description
const candidates = [
  { path: 'system.details.biography', label: 'Biography' },
  { path: 'system.details.background', label: 'Background' },
  { path: 'system.details.description', label: 'Description' }
];

const concepts = ['character description', 'biography', 'background'];
const bestMatch = await suggestBestStringPath(candidates, concepts);
// Returns: { path: 'system.details.biography', score: 0.89 }
```

### **Confidence-Based Import**
The module uses confidence thresholds to determine import strategy:

- **High Confidence (≥75%)**: Automatically imports
- **Medium Confidence (40-74%)**: Queues for review
- **Low Confidence (<40%)**: Excludes from import

## 🔧 Technical Architecture

### **Core Components**

1. **ImporterService** (`importer-service.js`)
   - Orchestrates the entire import process
   - Manages confidence thresholds and corrections
   - Handles batch processing and progress tracking

2. **ArchivistApiService** (`archivist-api.js`)
   - Manages all API communications
   - Handles rate limiting and retry logic
   - Supports both streaming and non-streaming responses

3. **SemanticMapper** (`semantic-mapper.js`)
   - Provides AI-powered semantic matching
   - Uses browser-based embeddings (no server required)
   - Caches models in IndexedDB for performance

### **Data Flow**

```
Foundry Entities → Extraction → Normalization → Semantic Mapping → API Upload
     ↓              ↓            ↓              ↓                ↓
  Actors/        Generic      Clean Text    AI Embeddings    Archivist
  Journals/      Entities     + Tags        + Rules         Characters/
  Scenes                                        ↓            Factions/
                                                Confidence    Locations
                                                Scoring
```

## 🚀 Usage Examples

### **Basic Import Process**
```javascript
// 1. Extract entities from Foundry
const entities = extractGenericEntities();

// 2. Map to Archivist format using semantic analysis
const mapped = entities.map(entity => mapEntityToArchivist(entity));

// 3. Import with confidence thresholds
await importerService.runImport({
  thresholdA: 0.75,  // Auto-import high confidence
  thresholdB: 0.40,  // Queue medium confidence
  onProgress: (status) => console.log(`Progress: ${status.completed}/${status.total}`)
});
```

### **Semantic Field Mapping**
```javascript
// Find the best field for character descriptions
const candidates = discoverStringPaths(actor.system, /(bio|descr|name|notes)/i);
const concepts = ['character description', 'biography', 'background'];
const bestField = await suggestBestStringPath(candidates, concepts);

console.log(`Best field: ${bestField.path} (confidence: ${bestField.score})`);
```

## 🎨 Advanced Features

### **Custom Mapping Rules**
You can define custom mapping rules for specific game systems:

```javascript
const customPreset = {
  rules: [
    {
      if: { kind: 'Actor', path: 'metadata.type', eq: 'character' },
      mapTo: 'Character',
      fields: { title: '$.name', description: '$.body' },
      labels: ['PC'],
      confidenceBoost: 0.3
    }
  ]
};
```

### **Correction System**
The module supports manual corrections that override automatic mappings:

```javascript
// Override specific entity mappings
const corrections = {
  byUuid: {
    'Actor.abc123': { targetType: 'Character', fieldPaths: { title: '$.name' } }
  },
  byKey: {
    'Actor|npc|monsters': { targetType: 'Character' }
  }
};
```

### **Content Processing**
Advanced text processing for better semantic matching:

```javascript
// Convert HTML to clean markdown
const markdown = htmlToMarkdown(foundryHtmlContent);

// Extract semantic tags from content
const tags = collectTagsFromText("This is a #ranger #noble character");

// Resolve Foundry links to Archivist links
const resolved = resolveCrosslinks(markdown, uuidToArchivist);
```

## 🔍 Understanding the Matching Algorithm

### **Step 1: Rule-Based Filtering**
```javascript
// Check if entity matches rule conditions
if (entity.kind === 'Actor' && entity.metadata.type === 'character') {
  // Apply character-specific mapping
}
```

### **Step 2: Semantic Analysis**
```javascript
// Generate embeddings for concepts and candidates
const conceptEmbeddings = await embedder(['character', 'hero', 'protagonist']);
const candidateEmbeddings = await embedder(['Aragorn', 'Ranger', 'Noble']);

// Calculate semantic similarity
const similarity = cosineSimilarity(conceptEmbeddings, candidateEmbeddings);
```

### **Step 3: Confidence Scoring**
```javascript
let confidence = 0.55; // Base confidence for rule match

// Boost confidence based on heuristics
if (entity.images?.length) confidence += 0.05;
if (entity.tags?.length) confidence += 0.05;
if (entity.kind === 'Actor' && rule.mapTo === 'Character') confidence += 0.25;

// Apply rule-specific boosts
if (rule.confidenceBoost) confidence += rule.confidenceBoost;
```

## 🛠️ Configuration

### **API Setup**
```javascript
// Configure API endpoint and authentication
const config = {
  API_BASE_URL: 'https://api.archivist.com/v1',
  API_KEY: 'your-api-key-here'
};
```

### **Import Settings**
```javascript
// Configure import behavior
const importConfig = {
  thresholdA: 0.75,    // Auto-import threshold
  thresholdB: 0.40,    // Review queue threshold
  sampleSize: 20,      // Preview sample size
  batchSize: 100       // API batch size
};
```

## 🔧 Development

### **Adding New Entity Types**
```javascript
// Extend ImporterKinds
export const ImporterKinds = {
  // ... existing types
  Item: 'Item',
  Macro: 'Macro'
};

// Add extraction logic
export function extractGenericEntities() {
  // ... existing extraction
  // Add new entity type extraction
}
```

### **Custom Mapping Presets**
```javascript
// Create system-specific presets
const dnd5ePreset = {
  rules: [
    {
      if: { kind: 'Actor', path: 'metadata.type', eq: 'character' },
      mapTo: 'Character',
      fields: {
        title: '$.name',
        description: '$.metadata.system.details.biography',
        portraitUrl: '$.images[0]'
      },
      labels: ['PC']
    }
  ]
};
```

## 🎯 Best Practices

### **For Content Creators**
1. **Use Descriptive Names**: Clear, semantic names improve matching accuracy
2. **Add Meaningful Tags**: Use hashtags and folder names that describe content
3. **Include Rich Descriptions**: Detailed biographies and descriptions improve semantic analysis
4. **Organize with Folders**: Use folder names that indicate content type (e.g., "NPCs", "Locations")

### **For Developers**
1. **Test with Sample Data**: Use the preview functionality to test mappings
2. **Adjust Confidence Thresholds**: Fine-tune based on your content quality
3. **Monitor API Usage**: The module includes rate limiting and retry logic
4. **Use Corrections**: Override automatic mappings when needed

## 🔍 Troubleshooting

### **Common Issues**

**Low Confidence Scores**
- Check entity names and descriptions for clarity
- Ensure proper folder organization
- Add meaningful tags and metadata

**Mapping Errors**
- Review mapping rules for your game system
- Use the correction system to override incorrect mappings
- Check field paths in mapping presets

**API Errors**
- Verify API key and endpoint configuration
- Check network connectivity
- Monitor rate limiting (module includes automatic retry)

### **Debug Information**
The module provides detailed logging for troubleshooting:

```javascript
// Enable debug logging
console.log('Entity extraction:', entities);
console.log('Mapping results:', mappedEntities);
console.log('Confidence scores:', confidenceScores);
```

## 📚 API Reference

### **Core Functions**
- `extractGenericEntities(sampleLimit?)` - Extract entities from Foundry
- `mapEntityToArchivist(entity, overridePreset?)` - Map entity to Archivist format
- `suggestBestStringPath(candidates, concepts)` - Find best field mapping
- `htmlToMarkdown(html)` - Convert HTML to markdown
- `resolveCrosslinks(markdown, uuidToArchivist)` - Resolve Foundry links

### **Service Classes**
- `ImporterService` - Main import orchestration
- `ArchivistApiService` - API communication
- `SemanticMapper` - AI-powered semantic matching

## 🤝 Contributing

This module is designed to be extensible. Key areas for contribution:

1. **New Game System Support**: Add mapping presets for different RPG systems
2. **Enhanced Semantic Models**: Improve AI embedding models and algorithms
3. **Additional Entity Types**: Support for more Foundry entity types
4. **UI Improvements**: Better user interfaces for mapping configuration

---

**Note**: This module uses browser-based AI embeddings, so no external AI services are required. All semantic processing happens locally in your browser for privacy and performance.