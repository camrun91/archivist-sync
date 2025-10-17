# Beta Release Setup - Summary

## What Was Implemented

The beta release system now provides **automatic updates** for testers using a stable `beta-latest` tag.

### Key Features

1. **Two releases per beta deployment:**
   - **Versioned release** (e.g., `v1.3.0-beta.5`) - for historical reference
   - **`beta-latest` release** - automatically updated, provides stable URL

2. **Automatic updates for users:**
   - Users install once with the `beta-latest` manifest URL
   - Foundry VTT automatically detects new beta versions
   - No need to reinstall or change URLs

3. **Separate from production:**
   - Beta releases are marked as "pre-release" in GitHub
   - NOT published to Foundry VTT official package repository
   - Main branch workflow remains unchanged

## How It Works

### For Developers (staging branch):

1. Push version bump to `staging` branch
2. Workflow automatically:
   - Creates `v1.3.0-beta.{BUILD_NUMBER}` release
   - Force-updates `beta-latest` tag to point to this release
   - Updates `module.json` URLs to point to `beta-latest`
   - Commits changes back to `staging`

### For Beta Testers (users):

1. Install using this manifest URL:
   ```
   https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json
   ```

2. Foundry automatically checks for updates and prompts when new beta is available

3. To switch back to stable:
   - Uninstall beta module
   - Install production version from Foundry package manager

## Files Modified

1. **`.github/workflows/beta-release.yml`**
   - New workflow for staging branch
   - Creates dual releases (versioned + beta-latest)
   - Force-updates beta-latest tag
   - Updates module.json automatically

2. **`.github/RELEASE_WORKFLOW.md`**
   - Comprehensive documentation
   - Explains both production and beta workflows
   - Troubleshooting guide

3. **`CONTRIBUTING.md`**
   - Added release workflow section
   - Quick reference for developers

4. **`README.md`**
   - Added beta installation instructions
   - Highlighted automatic update feature

## Manifest URLs

### Production (main):
```json
{
  "manifest": "https://github.com/camrun91/archivist-sync/releases/latest/download/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/v1.2.0/module.zip"
}
```

### Beta (staging):
```json
{
  "manifest": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.zip"
}
```

## Important Notes

### When merging staging to main:
- Update `module.json` URLs from `beta-latest` to production URLs
- Make sure version numbers are correct
- Update `CHANGELOG.md` if not already done

### The beta-latest tag:
- Is a "moving target" - always points to newest beta
- Allows Foundry to detect updates via version comparison
- Force-pushed on each beta release (this is intentional)

### Version numbering:
- Base version in `module.json`: `1.3.0`
- Versioned tag created: `v1.3.0-beta.5`
- Auto-update tag: `beta-latest` (points to `v1.3.0-beta.5`)

## Benefits

✅ **For testers:** Install once, get automatic updates  
✅ **For developers:** Simple workflow, automatic tag management  
✅ **For project:** Clear separation between stable and beta  
✅ **For releases:** Historical tracking via versioned tags  

## Testing the Setup

1. Create a `staging` branch if it doesn't exist
2. Make a small change
3. Update version in `module.json` and `package.json` to next version (e.g., `1.3.0`)
4. Commit and push to `staging`
5. Check GitHub Actions for workflow execution
6. Verify two releases appear:
   - `v1.3.0-beta.1` (or similar)
   - `beta-latest`
7. Test the beta-latest manifest URL in Foundry

## Questions?

See `.github/RELEASE_WORKFLOW.md` for detailed documentation or open an issue.

