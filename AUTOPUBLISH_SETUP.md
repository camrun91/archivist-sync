# fvtt-autopublish Setup Guide

This document provides a quick reference for the automated release system using `fvtt-autopublish`.

## ✅ What's Been Set Up

### GitHub Actions Workflows

1. **`.github/workflows/ci.yml`** - Continuous Integration
   - Runs on every push and PR to main/tooling
   - Lints code with ESLint
   - Validates module.json structure
   - Tests on Node.js 18.x and 20.x

2. **`.github/workflows/release.yml`** - Automated Release
   - Triggers when you push a version tag (e.g., `v1.2.3`)
   - Verifies version matches between tag and module.json
   - Creates module.zip archive
   - Creates GitHub Release with changelog
   - Publishes to Foundry VTT package system via `fvtt-autopublish`

3. **`.github/workflows/prepare-release.yml`** - Release Preparation (Optional)
   - Manual workflow you can trigger from GitHub UI
   - Creates a PR with version bumps and changelog template

### Scripts

- **`npm run prepare-release [patch|minor|major]`** - Bump version and update changelog
- **`npm run build`** - Lint and create module.zip
- **`npm run build:zip`** - Create module.zip for distribution
- **`npm run version:patch/minor/major`** - Bump version in package.json only

### Documentation

- **`RELEASE.md`** - Complete release process documentation
- **`CONTRIBUTING.md`** - Contributor guidelines (updated)
- **`README.md`** - Project overview (updated with CI badge)
- **`.github/PULL_REQUEST_TEMPLATE.md`** - PR template
- **`.github/ISSUE_TEMPLATE/`** - Bug report and feature request templates

## 🔑 Required Setup

### 1. Get Your Foundry VTT Package Token

1. Go to https://foundryvtt.com/me/packages
2. Find your "Archivist Sync" package (or create it if it doesn't exist)
3. Click "Edit" on the package
4. Find the "Package Administration Token" section
5. Generate or copy your token

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repository: https://github.com/camrun91/archivist-sync
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `PACKAGE_TOKEN`
5. Value: Paste your Foundry VTT package token
6. Click **Add secret**

### 3. Verify Module is Registered on Foundry VTT

If you haven't already registered your module:

1. Go to https://foundryvtt.com/packages/submit
2. Submit your module with the manifest URL:
   ```
   https://github.com/camrun91/archivist-sync/releases/latest/download/module.json
   ```
3. Wait for approval from Foundry VTT team

## 🚀 Quick Start: Making a Release

### Simple Method (Recommended)

```bash
# 1. Prepare the release (bumps version, updates changelog)
npm run prepare-release patch

# 2. Edit CHANGELOG.md and add your release notes

# 3. Review the changes
git diff

# 4. Commit the changes
git add .
git commit -m "chore: prepare release v1.0.1"
git push origin main

# 5. Create and push the tag
git tag v1.0.1
git push origin v1.0.1

# 🎉 GitHub Actions will automatically publish to Foundry VTT!
```

### What Happens Automatically

1. ✅ GitHub Actions detects the tag
2. ✅ Runs linter to verify code quality
3. ✅ Verifies version matches tag
4. ✅ Creates module.zip with your files
5. ✅ Extracts changelog for release notes
6. ✅ Creates GitHub Release
7. ✅ Publishes to Foundry VTT via `fvtt-autopublish`
8. ✅ Users can update in Foundry VTT!

## 📋 Release Checklist

Before every release:

- [ ] All features tested in Foundry VTT
- [ ] CHANGELOG.md updated with changes
- [ ] Version numbers match in module.json and package.json
- [ ] No linting errors: `npm run lint`
- [ ] Committed all changes to main branch
- [ ] Tag created with correct version: `git tag v1.2.3`
- [ ] Tag pushed: `git push origin v1.2.3`

After release:

- [ ] Verify GitHub Release created: https://github.com/camrun91/archivist-sync/releases
- [ ] Verify published to Foundry VTT: https://foundryvtt.com/packages/archivist-sync
- [ ] Test installation in Foundry VTT
- [ ] Announce release to users (Discord, Reddit, etc.)

## 🔍 Monitoring Releases

### View GitHub Actions

https://github.com/camrun91/archivist-sync/actions

- Click on any workflow run to see logs
- "Release Module" shows the autopublish process
- Green checkmark = success
- Red X = failed (check logs for details)

### Common Issues

**Version mismatch error:**
```
Version mismatch: module.json has 1.0.0 but tag is 1.0.1
```
**Fix:** Make sure to run `npm run prepare-release` to update all version numbers before tagging.

**PACKAGE_TOKEN not found:**
```
Error: Input required and not supplied: package-token
```
**Fix:** Add your Foundry VTT package token to GitHub Secrets (see above).

**Linting errors:**
```
✖ 2 problems (2 errors, 0 warnings)
```
**Fix:** Run `npm run lint:fix` locally and fix remaining errors before pushing tag.

## 📦 What Gets Published

The release workflow publishes:

1. **GitHub Release** at https://github.com/camrun91/archivist-sync/releases/tag/v1.x.x
   - `module.zip` - Complete module package
   - `module.json` - Manifest file
   - Release notes from CHANGELOG.md

2. **Foundry VTT Package** at https://foundryvtt.com/packages/archivist-sync
   - Users can install/update from in-app
   - Manifest URL: https://github.com/camrun91/archivist-sync/releases/latest/download/module.json

## 🔄 Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.0 → 1.0.1): Bug fixes, no breaking changes
  ```bash
  npm run prepare-release patch
  ```

- **Minor** (1.0.0 → 1.1.0): New features, no breaking changes
  ```bash
  npm run prepare-release minor
  ```

- **Major** (1.0.0 → 2.0.0): Breaking changes
  ```bash
  npm run prepare-release major
  ```

## 🆘 Troubleshooting

### Release failed on GitHub Actions

1. Click the failed workflow run
2. Expand the failed step to see error details
3. Common fixes:
   - Version mismatch: Update module.json and retag
   - Linting errors: Fix locally and force push
   - Missing secret: Add PACKAGE_TOKEN to GitHub Secrets

### Release succeeded but not in Foundry VTT

1. Check Foundry VTT package page for errors
2. Verify manifest URL is correct: https://github.com/camrun91/archivist-sync/releases/latest/download/module.json
3. Wait 5-10 minutes for Foundry VTT cache to update
4. Contact Foundry VTT support if issue persists

### Need to redo a release

To delete and recreate a release:

```bash
# Delete the tag locally
git tag -d v1.0.1

# Delete the tag on GitHub
git push origin :refs/tags/v1.0.1

# Delete the GitHub Release manually through the UI

# Fix your changes, commit, and create new tag
git tag v1.0.1
git push origin v1.0.1
```

## 📚 Additional Resources

- [fvtt-autopublish Documentation](https://github.com/Foundry-VTT-PF2e-mods/fvtt-autopublish)
- [Foundry VTT Package Development](https://foundryvtt.com/article/package-development/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## 💡 Tips

- Test releases on a staging branch first
- Always update CHANGELOG.md before releasing
- Tag releases during off-peak hours for users
- Include screenshots for major UI changes
- Announce releases on Foundry VTT Discord
- Keep a consistent release schedule

---

**Setup Complete!** 🎉

Your module is now configured for automated releases. Just push a tag and let GitHub Actions handle the rest!

