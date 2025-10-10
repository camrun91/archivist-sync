# Release Process

This document describes how to create and publish a new release of the Archivist Sync module.

## Overview

The release process is automated through GitHub Actions and uses `fvtt-autopublish` to publish to Foundry VTT's package system.

## Prerequisites

1. **GitHub Repository Secrets**
   - `PACKAGE_TOKEN`: Your Foundry VTT package administration token
     - Get this from: https://foundryvtt.com/me/packages
     - Add to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

2. **Permissions**
   - Write access to the repository
   - Ability to create and push tags

## Release Methods

### Method 1: Manual Release (Recommended for control)

1. **Prepare the release locally:**
   ```bash
   # Bump version (patch/minor/major)
   npm run prepare-release patch
   ```

2. **Edit CHANGELOG.md:**
   - The script creates a new section with placeholders
   - Fill in the actual changes under Added/Changed/Fixed sections
   - Remove empty sections

3. **Review and commit:**
   ```bash
   git diff  # Review changes
   git add module.json package.json CHANGELOG.md
   git commit -m "chore: prepare release v1.2.3"
   git push origin main
   ```

4. **Create and push the release tag:**
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

5. **GitHub Actions automatically:**
   - ✅ Runs linter to verify code quality
   - ✅ Verifies version in module.json matches the tag
   - ✅ Creates module.zip archive
   - ✅ Extracts changelog for release notes
   - ✅ Creates GitHub Release with assets
   - ✅ Publishes to Foundry VTT package system

### Method 2: Automated Pull Request (GitHub UI)

1. **Trigger the workflow:**
   - Go to: GitHub → Actions → "Prepare Release"
   - Click "Run workflow"
   - Enter version number (e.g., 1.2.3)
   - Select release type (major/minor/patch)

2. **Review the Pull Request:**
   - The workflow creates a PR with version updates
   - Edit CHANGELOG.md directly in the PR
   - Add actual release notes

3. **Merge the PR:**
   - Once approved, merge to main

4. **Tag the release:**
   ```bash
   git pull origin main
   git tag v1.2.3
   git push origin v1.2.3
   ```

5. **GitHub Actions publishes automatically**

## Version Numbers

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, incompatible API changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward-compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward-compatible

## What Gets Released

The GitHub release includes:
- `module.zip` - Complete module package for Foundry VTT
- `module.json` - Module manifest file
- Release notes from CHANGELOG.md

The `module.zip` contains:
```
module.json
README.md
CHANGELOG.md
CONTRIBUTING.md
LICENSE
lang/
scripts/
styles/
templates/
```

## Verifying a Release

After the release workflow completes:

1. **Check GitHub Release:**
   - Go to: https://github.com/camrun91/archivist-sync/releases
   - Verify the release exists with correct version
   - Download module.zip and verify contents

2. **Check Foundry VTT Package:**
   - Go to: https://foundryvtt.com/packages/archivist-sync
   - Verify the new version appears
   - Check the manifest URL is correct

3. **Test in Foundry VTT:**
   - Install/update the module in Foundry VTT
   - Verify it loads correctly
   - Test core functionality

## Troubleshooting

### Release workflow fails

**Version mismatch error:**
- Ensure the tag version matches module.json version exactly
- Tag: `v1.2.3` should match module.json: `"version": "1.2.3"`

**Linting errors:**
- Run `npm run lint:fix` locally first
- Fix any remaining errors
- Commit and push before tagging

**Missing PACKAGE_TOKEN:**
- Add your Foundry VTT package token to GitHub Secrets
- Name it exactly: `PACKAGE_TOKEN`

### Release published but not visible in Foundry VTT

- Check that the manifest URL is correct in the GitHub release
- Verify PACKAGE_TOKEN has proper permissions
- Check Foundry VTT package page for errors
- It may take a few minutes for the package to update

### Need to unpublish a release

1. **Delete the GitHub release:**
   - Go to Releases → Click the release → Delete

2. **Delete the tag:**
   ```bash
   git tag -d v1.2.3
   git push origin :refs/tags/v1.2.3
   ```

3. **Contact Foundry VTT support** if you need to remove a version from their package system

## Hotfix Process

For urgent fixes:

1. **Create hotfix branch:**
   ```bash
   git checkout -b hotfix/v1.2.4
   ```

2. **Make the fix and bump version:**
   ```bash
   npm run prepare-release patch
   # Edit CHANGELOG.md
   git add .
   git commit -m "fix: critical bug fix"
   ```

3. **Merge to main:**
   ```bash
   git checkout main
   git merge hotfix/v1.2.4
   git push origin main
   ```

4. **Tag and release:**
   ```bash
   git tag v1.2.4
   git push origin v1.2.4
   ```

## Changelog Guidelines

Follow [Keep a Changelog](https://keepachangelog.com/) format:

### Added
For new features.

### Changed
For changes in existing functionality.

### Deprecated
For soon-to-be removed features.

### Removed
For now removed features.

### Fixed
For any bug fixes.

### Security
In case of vulnerabilities.

## Tips

- Always test releases on a local Foundry VTT instance first
- Keep a consistent release cadence
- Document breaking changes prominently
- Update module compatibility ranges as needed
- Include screenshots for major UI changes
- Tag releases during off-peak hours for users

## Questions?

- Check GitHub Actions logs for detailed error information
- Review the [fvtt-autopublish documentation](https://github.com/Foundry-VTT-PF2e-mods/fvtt-autopublish)
- Open an issue on GitHub for help

