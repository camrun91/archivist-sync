# Release Workflow Documentation

This module uses two separate GitHub Actions workflows for releases:

## 🚀 Production Release (main branch)

**Workflow:** `.github/workflows/auto-release.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `main` branch

### What it does:
1. ✅ Verifies version consistency between `module.json` and `package.json`
2. ✅ Checks that `CHANGELOG.md` has been updated for the new version
3. ✅ Creates a GitHub release with tag `vX.Y.Z`
4. ✅ Uploads `module.zip` and `module.json` as release assets
5. ✅ **Publishes to Foundry VTT package repository** (visible to all users)

### How to create a production release:
1. Update version in both `module.json` and `package.json`
2. Add a section for the new version in `CHANGELOG.md`:
   ```markdown
   ## [1.2.0] - 2025-01-15
   ### Added
   - New feature description
   ```
3. Commit and push to `main`
4. The workflow will automatically create the release

---

## 🧪 Beta Release (staging branch)

**Workflow:** `.github/workflows/beta-release.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `staging` branch

### What it does:
1. ✅ Takes the version from `module.json` and appends `-beta.{BUILD_NUMBER}`
2. ✅ Updates `module.json` URLs to point to the beta release
3. ✅ Creates a GitHub **pre-release** (marked as beta) with tag `vX.Y.Z-beta.N`
4. ✅ Uploads `module.zip` and `module.json` as release assets
5. ✅ Commits the updated `module.json` back to `staging` branch
6. ❌ **Does NOT publish to Foundry VTT** (beta releases are manual install only)

### How to create a beta release:
1. Work on the `staging` branch
2. Update version in both `module.json` and `package.json` (use the target version, e.g., `1.3.0`)
3. Commit and push to `staging`
4. The workflow will:
   - Create a release tagged `v1.3.0-beta.42` (where 42 is the build number)
   - Update `module.json` to point to this beta release
   - Commit the changes back to `staging`

### How users install beta releases:

Users install beta versions using the **`beta-latest`** manifest URL, which provides automatic updates:

```
https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json
```

In Foundry VTT:
1. Go to **Add-on Modules**
2. Click **Install Module**
3. Paste the beta-latest manifest URL above
4. Click **Install**

**Key benefit:** Once installed with the `beta-latest` URL, Foundry VTT will automatically detect new beta releases and prompt users to update! No need to reinstall or change the manifest URL.

---

## 📋 Branch Strategy

```
staging (beta releases)
   ↓
   ↓ (merge when ready)
   ↓
main (production releases)
```

### Typical workflow:
1. **Development:** Make changes on feature branches, merge to `staging`
2. **Beta Testing:** Push version bump to `staging` → creates beta release
3. **Testing:** Testers install beta via manifest URL and provide feedback
4. **Release:** When ready, merge `staging` to `main` → creates production release

---

## 🔧 Version Numbering

### Production (main):
- Tag: `v1.2.0`
- Version in module.json: `1.2.0`
- Manifest URL: `/releases/latest/download/module.json` (auto-updates)
- Download URL: `/releases/download/v1.2.0/module.zip` (specific version)

### Beta (staging):
- **Versioned tag:** `v1.2.0-beta.5` (specific beta with full changelog)
- **Auto-update tag:** `beta-latest` (always points to newest beta)
- Version in module.json: `1.2.0` (base version)
- Manifest URL: `/releases/download/beta-latest/module.json` (auto-updates!)
- Download URL: `/releases/download/beta-latest/module.zip` (auto-updates!)

**How it works:**
1. Each push to staging creates TWO releases:
   - A versioned beta release (e.g., `v1.2.0-beta.5`) with specific changelog
   - An updated `beta-latest` release that points to the newest beta
2. The `beta-latest` tag is force-updated to point to the latest commit
3. Users who install with the `beta-latest` URL automatically get updates!

---

## 🛠️ Troubleshooting

### Beta workflow keeps creating new releases
- Each push to `staging` that changes `module.json` or `package.json` will create a new beta release
- The run number increments automatically, so each beta gets a unique tag
- Use `[skip ci]` in commit messages to prevent workflow from running

### Module.json URLs are wrong after beta release
- The workflow automatically updates `module.json` and commits it back
- Wait a moment for the commit to complete
- Pull the latest changes from `staging`

### Want to test locally without creating a release
- Make changes but don't update the version numbers
- Or use `[skip ci]` in your commit message

### Merging staging to main
- The `staging` branch's `module.json` will have beta URLs:
  ```json
  "manifest": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.zip"
  ```
- Before merging to main, update these to production URLs:
  ```json
  "manifest": "https://github.com/camrun91/archivist-sync/releases/latest/download/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/v1.2.0/module.zip"
  ```
- The main branch should use `releases/latest/download/` for manifest (auto-updates)
- Update the download URL to match the version you're releasing

---

## 🎯 Best Practices

1. **Always update CHANGELOG.md** before releasing (production)
2. **Test on staging** before merging to main
3. **Keep versions in sync** between `module.json` and `package.json`
4. **Use semantic versioning**: `MAJOR.MINOR.PATCH`
5. **Beta testing**: Share the beta manifest URL with trusted testers
6. **Production release**: Only merge to main when ready for public release

