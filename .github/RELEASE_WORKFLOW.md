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
- Automatically triggered when a non-Markdown change is pushed to the `staging` branch

### What it does:
1. ✅ Takes the base version from `module.json` and appends `-beta.{BUILD_NUMBER}`
2. ✅ Prepares beta release assets with `module.json.version = X.Y.Z-beta.N`
3. ✅ Updates release asset URLs to point to `beta-latest`
4. ✅ Creates a GitHub **pre-release** (marked as beta) with tag `vX.Y.Z-beta.N`
5. ✅ Uploads `module.zip` and `module.json` as release assets
6. ✅ Restores `module.json` on `staging` to the base version and beta URLs, then commits if needed
7. ❌ **Does NOT publish to Foundry VTT** (beta releases are manual install only)

### How to create a beta release:
1. Work on the `staging` branch
2. Make your changes (code, templates, JSON, assets, etc.)
3. Commit and push a non-Markdown change to `staging`
4. The workflow **automatically runs** and:
   - Reads the base version from `module.json` (e.g., `2.0.0`)
   - Creates a release tagged `vX.Y.Z-beta.{BUILD_NUMBER}` (auto-incrementing)
   - Publishes release assets whose `module.json` version is `X.Y.Z-beta.{BUILD_NUMBER}`
   - Keeps the `staging` branch on the base version while pointing `manifest`/`download` at `beta-latest`
   - Commits the metadata update back to `staging` if the branch still had production URLs

**Note:** You do NOT need to bump the version for each beta. The workflow uses the GitHub run number to auto-increment beta builds. Only update the base version when you're ready to target a new release number. Markdown-only doc pushes are ignored.

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
2. **Beta Testing:** Push a non-Markdown change to `staging` → creates beta release
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
- **Release asset version:** `1.2.0-beta.5`
- **Version on `staging` after workflow:** `1.2.0` (base version)
- Manifest URL: `/releases/download/beta-latest/module.json` (auto-updates!)
- Download URL: `/releases/download/beta-latest/module.zip` (auto-updates!)

**How it works:**
1. Each push to staging creates TWO releases:
   - A versioned beta release (e.g., `v1.2.0-beta.5`) with specific changelog
   - An updated `beta-latest` release that points to the newest beta
2. The `beta-latest` tag is force-updated to point to the latest commit
3. The uploaded beta manifest advertises the beta version (`X.Y.Z-beta.N`), so Foundry can detect updates
4. Users who install with the `beta-latest` URL automatically get updates

---

## 🛠️ Troubleshooting

### Beta workflow keeps creating new releases
- Each non-Markdown push to `staging` will create a new beta release
- The run number increments automatically, so each beta gets a unique tag
- Use `[skip ci]` in commit messages to prevent workflow from running

### Module.json URLs are wrong after beta release
- The workflow restores `module.json` on `staging` to the base version with beta URLs and commits it back if needed
- Wait a moment for the commit to complete
- Pull the latest changes from `staging`

### Want to test locally without creating a release
- Keep the change local until you're ready to push
- Or use `[skip ci]` in your commit message
- Markdown-only doc pushes are ignored by the beta workflow

### Merging staging to main
- The `staging` branch's `module.json` should keep the base version, but it will have beta URLs:
  ```json
  "manifest": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.zip"
  ```
- Before merging to main, update these to production URLs:
  ```json
  "manifest": "https://github.com/camrun91/archivist-sync/releases/latest/download/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/v1.2.0/module.zip"
  ```
- Make sure `module.json.version` matches `package.json.version` before pushing to `main`
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
