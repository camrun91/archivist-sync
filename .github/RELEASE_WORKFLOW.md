# Release Workflow Documentation

This module publishes **two parallel version lines to the same Foundry package
listing**: a legacy v13 line (`1.x`, from `main`) and a v14 line (`2.x`, from
`release/v14`). Foundry's registry natively supports multiple versions per
package, each with its own compatibility range — the Foundry client picks
whichever version matches the user's installed core version, so no separate
listing/package id is needed.

There are four GitHub Actions workflows involved:

| Branch | Workflow | Publishes to Foundry? | Version family |
|---|---|---|---|
| `main` | `auto-release.yml` | Yes | `1.x`, compat `13.x` |
| `release/v14` | `auto-release-v14.yml` | Yes | `2.x`, compat `14.x` |
| `staging` | `beta-release.yml` | No (GitHub pre-release only) | v14 betas |

Both stable workflows refuse to run if `module.json`'s version/compatibility
don't match their expected family — this guards against the exact incident
that previously broke v13 users (a v14-shaped build publishing under a v13
version string via `main`).

## 🚀 Production Release — v13 (main branch)

**Workflow:** `.github/workflows/auto-release.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `main` branch

### What it does:
1. ✅ Verifies `module.json` version is `1.x` and `compatibility.minimum` is `13.x` — refuses to publish otherwise
2. ✅ Verifies version consistency between `module.json` and `package.json`
3. ✅ Checks that `CHANGELOG.md` has been updated for the new version
4. ✅ Creates a GitHub release with tag `vX.Y.Z`
5. ✅ Updates the moving `v13-latest` tag/release so direct-manifest-URL installs auto-update
6. ✅ Uploads `module.zip` and `module.json` as release assets
7. ✅ **Publishes to Foundry VTT package repository** (visible to all users)

### How to create a production release:
1. Update version in both `module.json` and `package.json` (keep it in the `1.x` family)
2. Add a section for the new version in `CHANGELOG.md`:
   ```markdown
   ## [1.2.0] - 2025-01-15
   ### Added
   - New feature description
   ```
3. Commit and push to `main`
4. The workflow will automatically create the release

---

## 🚀 Production Release — v14 (release/v14 branch)

**Workflow:** `.github/workflows/auto-release-v14.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `release/v14` branch

### What it does:
Same steps as the v13 workflow above, but requires `module.json` version to be
`2.x` and `compatibility.minimum` to be `14.x`, and maintains its own moving
`v14-latest` tag/release instead of `v13-latest`. Publishes to the **same**
Foundry package listing as `main` (same `FOUNDRY_ADMIN_MODULE_ID`), as a
separate version entry with its own compatibility range.

### How to create a v14 production release:
1. Merge tested `staging` work into `release/v14` (create the branch from
   `staging` if it doesn't exist yet)
2. Update version in both `module.json` and `package.json` (keep it in the `2.x` family, compat `14.x`)
3. Add a section for the new version in `CHANGELOG.md`
4. Push to `release/v14` — the workflow creates the release and publishes to Foundry

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
2. Make your changes (code, features, bug fixes, etc.)
3. Commit and push to `staging`
4. The workflow **automatically runs** and:
   - Reads the version from `module.json` (e.g., `1.3.0`)
   - Creates a release tagged `v1.3.0-beta.{BUILD_NUMBER}` (auto-incrementing)
   - Updates `module.json` to point to `beta-latest`
   - Commits the changes back to `staging`

**Note:** You do NOT need to bump the version for each beta! The workflow uses the GitHub run number to auto-increment beta builds. Only update the version when you're ready to target a new release number.

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
                     staging (v14 beta releases)
                        ↓
                        ↓ (merge tested work when ready)
                        ↓
                     release/v14 (v14 production releases) ──┐
                                                              ├─→ same Foundry listing,
                     main (v13 production releases) ─────────┘   different version entries
```

`main` and `staging`/`release/v14` are independent lines — `main` no longer
receives the v14 rewrite. Fixes that apply to both must be ported by hand
(cherry-pick or reimplement), not by merging the branches into each other.

### Typical workflow:
1. **v14 development:** Make changes on feature branches, merge to `staging`
2. **v14 Beta Testing:** Push version bump to `staging` → creates beta release
3. **v14 Release:** When ready, merge `staging` to `release/v14` → creates v14 production release
4. **v13 maintenance:** Fixes/parity changes for the legacy line go directly to `main` → creates v13 production release

---

## 🔧 Version Numbering

### Production v13 (main):
- Tag: `v1.2.0`
- Version in module.json: `1.2.0`
- Manifest URL: `/releases/download/v13-latest/module.json` (auto-updates)
- Download URL: `/releases/download/v1.2.0/module.zip` (specific version)

### Production v14 (release/v14):
- Tag: `v2.1.0`
- Version in module.json: `2.1.0`
- Manifest URL: `/releases/download/v14-latest/module.json` (auto-updates)
- Download URL: `/releases/download/v2.1.0/module.zip` (specific version)

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

