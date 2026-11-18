# Release Workflow Documentation

This module publishes **two parallel version lines to the same Foundry package
listing**: a legacy v13 line (`1.x`, from `release/v13`) and a v14 line (`2.x`, from
`main`). Foundry's registry natively supports multiple versions per
package, each with its own compatibility range — the Foundry client picks
whichever version matches the user's installed core version, so no separate
listing/package id is needed.

There are three GitHub Actions workflows involved:

| Branch | Workflow | Publishes to Foundry? | Version family |
|---|---|---|---|
| `main` | `auto-release-v14.yml` | Yes | `2.x`, compat `14.x` |
| `release/v13` | `auto-release-v13.yml` | Yes | `1.x`, compat `13.x` |
| `staging` | `beta-release.yml` | No (GitHub pre-release only) | v14 betas |

Both stable workflows refuse to run if `module.json`'s version/compatibility
don't match their expected family — this guards against the exact incident
that previously broke v13 users (a v14-shaped build publishing under a v13
version string via `release/v13`).

## 🚀 Production Release — v13 (release/v13 branch)

**Workflow:** `.github/workflows/auto-release-v13.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `release/v13` branch

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
3. Commit and push to `release/v13`
4. The workflow will automatically create the release

---

## 🚀 Production Release — v14 (main branch)

**Workflow:** `.github/workflows/auto-release-v14.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `main` branch

### What it does:
Same steps as the v13 workflow above, but requires `module.json` version to be
`2.x` and `compatibility.minimum` to be `14.x`, and maintains its own moving
`v14-latest` tag/release instead of `v13-latest`. Publishes to the **same**
Foundry package listing as `release/v13` (same `FOUNDRY_ADMIN_MODULE_ID`), as a
separate version entry with its own compatibility range.

Its GitHub releases are created with `make_latest: false`, so the repo-wide
`/releases/latest` URL always stays on the v13 track. This protects v13 users
who installed before `v13-latest` existed and still have
`/releases/latest/download/module.json` stored as their manifest URL — without
it, each v14 publish would silently repoint those installs at v14.

### How to create a v14 production release:
1. Merge/promote tested `staging` work into `main`
2. Resolve the version in both `module.json` and `package.json` (keep it in the
   `2.x` family, compat `14.x`) — `staging` merges often carry beta or `1.x`
   values that the workflow will reject
3. Add a section for the new version in `CHANGELOG.md`
4. Push to `main` — the workflow creates the release and publishes to Foundry

   > ⚠️ `release/v13` must keep its own `auto-release-v13.yml`. GitHub evaluates workflows
   > from the ref being pushed, so a `release/v13` without that file accepts version bumps
   > and silently publishes nothing.

Before the *first* v14 stable release, complete the one-time
[Reclaiming /releases/latest](#-reclaiming-releaseslatest-required-once-still-pending) checklist.

---

## 🧪 Beta Release (staging branch)

**Workflow:** `.github/workflows/beta-release.yml`

### When it runs:
- Automatically triggered when `module.json` or `package.json` is pushed to the `staging` branch

### What it does:
1. ✅ Takes the version from `module.json` and appends `-beta.{BUILD_NUMBER}`
2. ✅ Writes the beta version into `module.json` and updates manifest/download URLs to `beta-latest`
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
   - Writes the beta version into `module.json` and points manifest/download at `beta-latest`
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
                     staging  ── v14 betas ──────────────► GitHub pre-release only
                        │                                  (beta-release.yml, beta-latest)
                        │ merge tested work when ready
                        ▼
                     main     ── v14 stable (2.x / compat 14.x) ──┐
                                 auto-release-v14.yml             │  same Foundry package
                                 tag: v14-latest                  ├─ listing, two version
                                 make_latest: false               │  entries
                                                                  │
                     release/v13 ── v13 stable (1.x / compat 13.x)┘
                                 auto-release-v13.yml
                                 tag: v13-latest
                                 make_latest: true
```

`main` and `release/v13` are independent lines — they must not be merged into
each other. Fixes that apply to both must be ported by hand
(cherry-pick or reimplement), not by merging the branches into each other.

### Typical workflow:
1. **v14 development:** Make changes on feature branches, merge to `staging`
2. **v14 Beta Testing:** Push version bump to `staging` → creates beta release
3. **v14 Release:** When ready, merge `staging` to `main` → creates v14 production release
4. **v13 maintenance:** Fixes/parity changes for the legacy line go directly to `release/v13` → creates v13 production release

---

## 🔀 Reclaiming /releases/latest (required once, still pending)

Installs made before `v13-latest` existed still store
`/releases/latest/download/module.json` as their manifest URL. That URL is
repo-wide, so whichever release GitHub last marked "latest" owns those users.

Current state:

- `v13-latest` **does not exist yet**; the next v13 stable release from `release/v13`
  creates it.
- GitHub's repo-wide "Latest" is `v1.3.13` and **must stay on the v13 track**:
  `auto-release-v13.yml` sets `make_latest: true`, `auto-release-v14.yml` sets
  `make_latest: false`.
- Moving `/releases/latest` onto v14 is a **future, separate decision**, only safe once
  `v13-latest` exists and legacy installs have been migrated to it.

Run this checklist **once, before the first v14 stable publish on `main`**:

1. **Seed `v13-latest`.** Push a normal v13 production release on `release/v13`.
   Its release is created with `make_latest: true`, which creates the moving
   `v13-latest` tag and keeps the repo-wide latest pointer on the v13 track.
2. **Confirm it took.** Open the repo's Releases page (or
   `/releases/latest`) and verify the release badged "Latest" is a `v1.x`
   release.
3. **Only then publish v14.** Push the first `main` stable release. Its workflow
   uses `make_latest: false`, so it never touches the repo-wide latest pointer.
4. **Optional user migration.** Legacy installs stay safe as long as `release/v13`
   keeps reclaiming latest and `main` never sets `make_latest`. Users
   who *want* the moving v13 track explicitly can reinstall with
   `https://github.com/camrun91/archivist-sync/releases/download/v13-latest/module.json`.

---

## 🔧 Version Numbering

### Production v13 (release/v13):
- Tag: `v1.2.0`
- Version in module.json: `1.2.0`
- Manifest URL: `/releases/download/v13-latest/module.json` (auto-updates)
- Download URL in the published manifest: `/releases/download/v1.2.0/module.zip` (immutable for that release)

### Production v14 (main):
- Tag: `v2.1.0`
- Version in module.json: `2.1.0`
- Manifest URL: `/releases/download/v14-latest/module.json` (auto-updates)
- Download URL in the published manifest: `/releases/download/v2.1.0/module.zip` (immutable for that release)

**Manifest vs. download:** only the *manifest* URL moves. Each track's
`*-latest` release also hosts copies of `module.json` and `module.zip` so
Foundry's update check always reads the newest version for that track — but the
`download` field inside every published `module.json` points at that release's
own versioned zip. A given version therefore always installs the exact bits it
was built from, even after a newer release moves the `*-latest` tag.

### Beta (staging):
- **Versioned tag:** `v1.2.0-beta.5` (specific beta with full changelog)
- **Auto-update tag:** `beta-latest` (always points to newest beta)
- Version in module.json: `1.2.0-beta.5` (beta version written before upload)
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

### Promoting staging to main
- The `staging` branch's `module.json` will have beta URLs:
  ```json
  "manifest": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.json",
  "download": "https://github.com/camrun91/archivist-sync/releases/download/beta-latest/module.zip"
  ```
- You do **not** need to fix these by hand: both stable workflows rewrite these
  fields before packaging, precisely so leaked beta URLs can't ship — `manifest`
  becomes their own track's moving tag (`v13-latest` or `v14-latest`), and
  `download` becomes that release's versioned zip (`/releases/download/v2.1.0/module.zip`).
- Do **not** point any manifest at `releases/latest/download/`, and do **not**
  hand-edit which release GitHub marks "latest". That pointer is repo-wide and is
  managed by the workflows: `release/v13` claims it (`make_latest: true`), `main`
  leaves it alone (`make_latest: false`). See
  [Reclaiming /releases/latest](#-reclaiming-releaseslatest-required-once-still-pending).

---

## 🎯 Best Practices

1. **Always update CHANGELOG.md** before releasing (production)
2. **Test on staging** before promoting to `main`
3. **Keep versions in sync** between `module.json` and `package.json`
4. **Use semantic versioning**: `MAJOR.MINOR.PATCH`
5. **Beta testing**: Share the beta manifest URL with trusted testers
6. **Production release**: Only push to `release/v13` (v13) or `main` (v14) when ready for public release
