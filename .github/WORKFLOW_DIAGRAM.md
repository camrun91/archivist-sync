# Release Workflow Diagram

## Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DEVELOPMENT WORKFLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Feature    │
│   Branches   │
└──────┬───────┘
       │ merge
       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  STAGING BRANCH                                                          │
│  ────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  Push non-Markdown change to staging                                    │
│         ↓                                                                │
│  🤖 BETA-RELEASE.YML WORKFLOW                                            │
│         │                                                                │
│         ├─→ Create versioned release: v1.3.0-beta.5                     │
│         │   └─→ Contains full changelog                                 │
│         │   └─→ Tagged with specific version                            │
│         │   └─→ Release assets advertise version 1.3.0-beta.5           │
│         │                                                                │
│         ├─→ Update beta-latest tag (force push)                         │
│         │   └─→ Points to latest beta commit                            │
│         │                                                                │
│         ├─→ Create/update beta-latest release                           │
│         │   └─→ Stable URL for auto-updates                             │
│         │   └─→ Contains module.zip + module.json                       │
│         │                                                                │
│         └─→ Restore module.json in staging                              │
│             └─→ Base version + URLs point to beta-latest                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                       │
                       │ merge when ready
                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  MAIN BRANCH                                                             │
│  ────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  Push with version bump in module.json/package.json                     │
│         ↓                                                                │
│  🤖 AUTO-RELEASE.YML WORKFLOW                                            │
│         │                                                                │
│         ├─→ Verify CHANGELOG.md updated                                 │
│         │                                                                │
│         ├─→ Create production release: v1.3.0                           │
│         │   └─→ Contains changelog from CHANGELOG.md                    │
│         │   └─→ Tagged with version number                              │
│         │                                                                │
│         ├─→ Upload module.zip + module.json                             │
│         │                                                                │
│         └─→ 🚀 Publish to Foundry VTT Package Repository                │
│             └─→ Available to all Foundry users                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## User Installation Paths

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BETA TESTERS                                    │
│                                                                        │
│  Install with:                                                         │
│  github.com/[repo]/releases/download/beta-latest/module.json          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────┐            │
│  │  Beta v1.3.0-beta.5 installed                        │            │
│  └──────────────────────────────────────────────────────┘            │
│                       │                                               │
│                       │ new beta released                             │
│                       ↓                                               │
│  ┌──────────────────────────────────────────────────────┐            │
│  │  ⚠️ Update Available: v1.3.0-beta.6                  │            │
│  │  [Install Update]                                    │            │
│  └──────────────────────────────────────────────────────┘            │
│                       │                                               │
│                       │ automatic detection                           │
│                       ↓                                               │
│  ✅ Always get latest beta automatically!                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION USERS                                    │
│                                                                        │
│  Install from Foundry Package Manager                                 │
│  or use: github.com/[repo]/releases/latest/download/module.json       │
│                                                                        │
│  ┌──────────────────────────────────────────────────────┐            │
│  │  Archivist Sync v1.2.0 installed                     │            │
│  └──────────────────────────────────────────────────────┘            │
│                       │                                               │
│                       │ new production release                        │
│                       ↓                                               │
│  ┌──────────────────────────────────────────────────────┐            │
│  │  ⚠️ Update Available: v1.3.0                         │            │
│  │  [Install Update]                                    │            │
│  └──────────────────────────────────────────────────────┘            │
│                       │                                               │
│                       │ automatic detection                           │
│                       ↓                                               │
│  ✅ Always get latest stable release!                                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## GitHub Releases View

```
┌─────────────────────────────────────────────────────────────────────┐
│  Releases                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🟢 Latest Release                                                  │
│  v1.2.0                                                             │
│  Published to Foundry VTT • 2 weeks ago                            │
│  📦 module.zip    📄 module.json                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🧪 Pre-release                                                     │
│  beta-latest → Latest Beta Release                                 │
│  Current: v1.3.0-beta.6 • Updated 5 minutes ago                    │
│  📦 module.zip    📄 module.json                                    │
│  ⭐ Use this for auto-updating beta channel!                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🧪 Pre-release                                                     │
│  v1.3.0-beta.6 → Beta 1.3.0-beta.6                                 │
│  Published 5 minutes ago                                            │
│  📦 module.zip    📄 module.json                                    │
│  📋 Full changelog for this specific beta                          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🧪 Pre-release                                                     │
│  v1.3.0-beta.5 → Beta 1.3.0-beta.5                                 │
│  Published 2 days ago                                               │
│  📦 module.zip    📄 module.json                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🟢 Release                                                         │
│  v1.1.0                                                             │
│  Published 1 month ago                                              │
│  📦 module.zip    📄 module.json                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Points

### 🎯 For Beta Testers
- **Single install** with `beta-latest` manifest URL
- **Automatic updates** when new betas are released
- **Stable URL** never changes
- Can see **all beta versions** in releases if needed

### 🎯 For Developers
- **Staging branch** for beta testing
- **Main branch** for production
- **Automatic versioning** and tagging
- **Base version stays on `staging`** while release assets use `-beta.N`
- **Dual releases** keep history while enabling auto-updates

### 🎯 For Production Users
- **Foundry Package Manager** (easiest)
- **Latest release** always available via `/latest/` URL
- **Automatic updates** like any other Foundry module
- **Not affected** by beta releases

## Tags Explained

| Tag Pattern | Type | Purpose | Updates |
|------------|------|---------|---------|
| `v1.2.0` | Production | Stable releases | Never changes |
| `v1.3.0-beta.5` | Beta (versioned) | Specific beta | Never changes |
| `beta-latest` | Beta (moving) | Auto-update channel | Force-updated each beta |

## How Auto-Updates Work

1. **Foundry checks** the manifest URL periodically
2. **Reads version** from the downloaded `module.json`
3. **Compares** to installed version
4. **Prompts user** if newer version detected

Because `beta-latest` points to the newest beta's `module.json` with an incremented version number, Foundry automatically detects updates!
