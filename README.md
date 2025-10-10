# Archivist Sync

[![CI](https://github.com/camrun91/archivist-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/camrun91/archivist-sync/actions/workflows/ci.yml)

Foundry VTT v13 module to connect your world to the Archivist service. It provides a guided setup wizard, a Sync Options console to push/pull data, an optional real‑time sync for CRUD events, and an in‑client "Ask Archivist" sidebar chat.

## Features

- **Guided World Setup (Wizard)**: Validate API key, select or create an Archivist campaign, choose mapping presets or fields, pick initial content to link/create, import existing Archivist content, and generate session recap journals.
- **Sync Options Console**: Push/pull Characters, Items, Locations, Factions, and Recaps between Foundry and Archivist with progress tracking and retry-aware requests.
- **Ask Archivist Chat (Sidebar)**: A streaming RAG chat tab appears in the Foundry sidebar once the world is configured and initialized.
- **Real‑Time Sync (optional)**: When enabled, GM clients automatically POST/PATCH/DELETE supported entities as you create/update/delete them in Foundry.
- **System Presets + Mapping**: Built‑in presets for D&D 5e, PF2e, and CoC 7e; robust property discovery to work with other systems via configurable paths.
- **Safe Markdown Handling**: HTML from Foundry is normalized to Markdown for API writes; Markdown from Archivist is converted to sanitized HTML when writing back to Foundry.

## Installation

### Manual
1. Download this repository.
2. Place it in your Foundry data folder at `Data/modules/archivist-sync/`.
3. Restart Foundry and enable the module in your world’s Module Settings.

### Manifest URL
Use your repository’s release manifest URL (update the placeholder in `module.json`):

`https://github.com/yourusername/archivist-sync/releases/latest/download/module.json`

Tip: Also update the `url`, `manifest`, `download`, and `bugs` fields in `module.json` to point to your repo.

## Getting Started

### 1) Open Sync Options
Go to Game Settings → Module Settings → Archivist Sync → open the Sync Options menu. From there you can launch the World Setup wizard.

### 2) Run the World Setup wizard
The wizard guides you through:
- API key validation (stored as a world setting)
- Loading your Archivist campaigns (or creating one from your Foundry world title)
- Selecting the campaign to link
- Choosing or adjusting mapping presets/paths for character and item fields
- Optionally selecting Foundry content to link or create in Archivist
- Importing existing Archivist content into Foundry (Characters, Items, Locations, Factions) and creating Recaps journals from sessions

When you complete setup, the world is marked “initialized”, which also enables the sidebar chat if an API key and campaign are set.

### 3) Ask Archivist chat (Sidebar)
After initialization, an “Archivist Chat” tab appears in the Foundry sidebar. It streams responses as you type. Chat availability requires all of:
- API key configured
- An Archivist campaign selected
- World initialization completed via the setup wizard

### 4) Sync Options (Push/Pull)
Use the Sync Options dialog to:
- Push and pull Characters, Items, Locations, and Factions
- Pull and update Recaps (sessions are read‑only for create/delete but their title/summary can be updated)
- Inspect and adjust mappings and include rules

### 5) Real‑Time Sync (optional)
Enable “Real‑Time Sync” in settings to have the GM client mirror CRUD events to Archivist:
- Create: Characters (PC/NPC), Items, Locations, Factions
- Update: Characters, Items, Locations, Factions, and Recaps (title/summary)
- Delete: Items, Locations, Factions (Characters currently not deleted)
Notes:
- Runs only for GMs and only when a campaign is selected.
- Images are submitted only if the source is an https URL.

## API Details (what the module does)

- **Base URL**: `https://api.myarchivist.ai/v1`
- **Auth Header**: `x-api-key: <YOUR_API_KEY>`
- **Sessions (Recaps)**: The module lists sessions and can PATCH existing sessions (title/summary). It does not create or delete sessions.
- **Ask endpoint**: Chat uses a non-versioned root path: POST to `/ask` with `{ campaign_id, messages, stream?: true }` and streams text when requested.

Examples (representative; bodies vary by type):

```json
// Create Character
{
  "character_name": "Elowen",
  "description": "...markdown...",
  "image": "https://...",
  "campaign_id": "<id>"
}
```

```json
// Ask (RAG chat)
{
  "campaign_id": "<id>",
  "messages": [
    { "role": "user", "content": "Who is the duke?" }
  ],
  "stream": true
}
```

## Compatibility

- Foundry VTT: v13 (minimum 13.341; verified 13.346)
- Systems: Works best with D&D 5e, PF2e, and CoC 7e presets; other systems supported via mapping discovery and custom paths

## Security & Permissions

- The API key is stored as a world-scoped setting.
- The Sync Options menu is restricted to GMs. Real‑Time Sync executes only on GM clients.
- The sidebar chat is available to users once the world is configured and initialized.
- Use HTTPS endpoints; requests include CORS-safe headers and exponential backoff on `429` and network failures.

## Troubleshooting

- “Chat not available”: Ensure API key is set, a campaign is selected, and the world has been initialized via the setup wizard.
- “Rate limited (429)”: The module automatically retries with exponential backoff and jitter; wait and retry if necessary.
- “CORS error”: Your server must allow browser requests from your Foundry origin for API routes.
- “Images missing”: Only https image URLs are sent to Archivist; local file paths are ignored for API writes.

## Development

### Setup

1. Install Node.js 18.x or 20.x (or use `.nvmrc` with `nvm use`)
2. Install dependencies: `npm install`

### Code Quality

This project uses ESLint and Prettier for code quality and formatting:

```bash
# Check for linting issues
npm run lint

# Auto-fix formatting issues
npm run lint:fix
```

### Continuous Integration

GitHub Actions automatically runs on all pushes and pull requests:
- **Linting**: Checks code style and catches common errors
- **Validation**: Ensures module.json is valid and required files exist
- **Release**: Automatically publishes to Foundry VTT when tags are pushed

See [CONTRIBUTING.md](CONTRIBUTING.md) for development details and [RELEASE.md](RELEASE.md) for the release process.

### Key Files

```
archivist-sync/
├── module.json
├── package.json                        # Dependencies and scripts
├── .eslintrc.json                      # ESLint configuration
├── .prettierrc.json                    # Prettier configuration
├── scripts/
│   ├── archivist-sync.js               # Module bootstrap (sidebar tab, availability, RTS listeners)
│   ├── modules/config.js               # Constants and setting keys
│   ├── modules/settings-manager.js     # Registers settings and availability checks
│   ├── services/archivist-api.js       # API client with throttling and retries
│   ├── dialogs/world-setup-dialog.js   # Guided setup wizard
│   ├── dialogs/sync-options-dialog.js  # Push/Pull console and tools
│   └── dialogs/ask-chat-window.js      # Sidebar chat UI logic
├── templates/                          # Handlebars templates
└── styles/archivist-sync.css
```

## License

MIT

## Support

- Issues: set the `bugs` URL in `module.json` to your repository’s issues page
- Sample config: a reference JSON is available and linked from the setup wizard

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines, including:
- Development setup
- Code style requirements
- Pre-commit checklist
- Pull request process

---

Remember to update `module.json` URLs (`url`, `manifest`, `download`, `bugs`) to point to your repository and releases.