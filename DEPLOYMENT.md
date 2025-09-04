# Deployment and Distribution Guide

## Overview

This guide covers the complete deployment and distribution process for the Archivist Sync Foundry VTT module, including build processes, release management, and distribution strategies.

## Pre-Deployment Checklist

### 1. Code Quality Checks

**Linting and Formatting**:
```bash
# Run linting
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Format code
npm run format
```

**Testing**:
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in CI mode
npm run test:ci
```

### 2. Version Management

**Update Version Numbers**:
```bash
# Update version in module.json
# Update version in package.json
# Update CHANGELOG.md
```

**Version Bumping Script**:
```bash
#!/bin/bash
# scripts/bump-version.sh

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

# Update module.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" module.json

# Update package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Update CHANGELOG.md
echo "## Version $VERSION - $(date +%Y-%m-%d)" >> CHANGELOG.md

echo "Version bumped to $VERSION"
```

### 3. Documentation Updates

**Required Documentation Updates**:
- [ ] README.md - User documentation
- [ ] CHANGELOG.md - Version history
- [ ] API_EXAMPLE.md - API integration examples
- [ ] All developer documentation files

**Documentation Validation**:
```bash
# Check for broken links
npm run docs:check

# Validate markdown syntax
npm run docs:validate
```

## Build Process

### 1. Development Build

**Local Development Build**:
```bash
# Install dependencies
npm install

# Run development build
npm run build:dev

# Watch for changes
npm run build:watch
```

**Build Configuration** (`webpack.config.js`):
```javascript
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './scripts/archivist-sync.js',
  output: {
    filename: 'archivist-sync.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};
```

### 2. Production Build

**Production Build Process**:
```bash
# Clean previous builds
npm run clean

# Run production build
npm run build:prod

# Optimize assets
npm run optimize

# Generate source maps
npm run sourcemaps
```

**Production Webpack Configuration**:
```javascript
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './scripts/archivist-sync.js',
  output: {
    filename: 'archivist-sync.min.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true
          }
        }
      })
    ]
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};
```

### 3. Asset Optimization

**CSS Optimization**:
```bash
# Minify CSS
npm run css:minify

# Remove unused CSS
npm run css:purge
```

**Image Optimization**:
```bash
# Optimize images
npm run images:optimize

# Generate responsive images
npm run images:responsive
```

## Release Management

### 1. Release Process

**Automated Release Script**:
```bash
#!/bin/bash
# scripts/release.sh

set -e

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

echo "Starting release process for version $VERSION"

# Run tests
echo "Running tests..."
npm test

# Run linting
echo "Running linting..."
npm run lint

# Build production version
echo "Building production version..."
npm run build:prod

# Update version numbers
echo "Updating version numbers..."
./scripts/bump-version.sh $VERSION

# Commit changes
echo "Committing changes..."
git add .
git commit -m "Release version $VERSION"

# Create tag
echo "Creating tag..."
git tag -a "v$VERSION" -m "Release version $VERSION"

# Push changes
echo "Pushing changes..."
git push origin main
git push origin "v$VERSION"

echo "Release $VERSION completed successfully!"
```

### 2. GitHub Releases

**Release Template**:
```markdown
## Archivist Sync v{VERSION}

### New Features
- Feature 1
- Feature 2

### Bug Fixes
- Fix 1
- Fix 2

### Improvements
- Improvement 1
- Improvement 2

### Installation

#### Manual Installation
1. Download the latest release
2. Extract to your Foundry VTT modules directory
3. Restart Foundry VTT
4. Enable the module in your world

#### Automatic Installation
1. In Foundry VTT, go to "Add-on Modules"
2. Click "Install Module"
3. Paste the manifest URL: `https://github.com/yourusername/archivist-sync/releases/latest/download/module.json`
4. Click "Install"

### Compatibility
- Foundry VTT: v13.341+
- Systems: All systems supported
- Modules: No known conflicts

### Changelog
See [CHANGELOG.md](CHANGELOG.md) for detailed changes.
```

### 3. Release Automation

**GitHub Actions Release Workflow**:
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
    
    - name: Install dependencies
      run: npm install
    
    - name: Run tests
      run: npm test
    
    - name: Build production
      run: npm run build:prod
    
    - name: Create release
      uses: actions/create-release@v1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ github.ref }}
        release_name: Release ${{ github.ref }}
        body_path: RELEASE_TEMPLATE.md
        draft: false
        prerelease: false
```

## Distribution Strategies

### 1. GitHub Releases

**Release Assets**:
- `module.json` - Module manifest
- `archivist-sync.zip` - Complete module package
- `archivist-sync.min.js` - Minified JavaScript
- `archivist-sync.css` - Stylesheet
- `README.md` - User documentation

**Release Script**:
```bash
#!/bin/bash
# scripts/create-release-assets.sh

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

# Create release directory
mkdir -p releases/$VERSION

# Copy module files
cp module.json releases/$VERSION/
cp -r scripts releases/$VERSION/
cp -r styles releases/$VERSION/
cp -r templates releases/$VERSION/
cp -r lang releases/$VERSION/
cp README.md releases/$VERSION/
cp CHANGELOG.md releases/$VERSION/

# Create zip package
cd releases/$VERSION
zip -r ../archivist-sync-$VERSION.zip .
cd ../..

echo "Release assets created for version $VERSION"
```

### 2. Foundry VTT Module Repository

**Module Repository Submission**:
1. Ensure module meets repository requirements
2. Submit module for review
3. Wait for approval
4. Module becomes available in Foundry VTT

**Repository Requirements**:
- Valid `module.json` manifest
- Proper versioning
- Documentation
- No conflicts with other modules
- Follows Foundry VTT guidelines

### 3. Direct Distribution

**Manual Distribution**:
```bash
# Create distribution package
npm run dist

# Upload to web server
npm run upload

# Update manifest URLs
npm run update-manifest
```

**Distribution Script**:
```bash
#!/bin/bash
# scripts/distribute.sh

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

# Create distribution package
echo "Creating distribution package..."
npm run build:prod
npm run create-release-assets $VERSION

# Upload to distribution server
echo "Uploading to distribution server..."
rsync -av releases/$VERSION/ user@server:/path/to/modules/archivist-sync/

# Update manifest URLs
echo "Updating manifest URLs..."
sed -i "s/yourusername/actualusername/g" releases/$VERSION/module.json

echo "Distribution completed for version $VERSION"
```

## Environment Configuration

### 1. Development Environment

**Environment Variables**:
```bash
# .env.development
NODE_ENV=development
API_BASE_URL=https://archivist-api-staging.up.railway.app/v1
DEBUG=true
LOG_LEVEL=debug
```

**Development Configuration**:
```javascript
// config/development.js
export const config = {
  apiBaseUrl: process.env.API_BASE_URL || 'https://archivist-api-staging.up.railway.app/v1',
  debug: process.env.DEBUG === 'true',
  logLevel: process.env.LOG_LEVEL || 'debug'
};
```

### 2. Production Environment

**Environment Variables**:
```bash
# .env.production
NODE_ENV=production
API_BASE_URL=https://archivist-api-production.up.railway.app/v1
DEBUG=false
LOG_LEVEL=error
```

**Production Configuration**:
```javascript
// config/production.js
export const config = {
  apiBaseUrl: process.env.API_BASE_URL || 'https://archivist-api-production.up.railway.app/v1',
  debug: false,
  logLevel: 'error'
};
```

## Monitoring and Analytics

### 1. Error Tracking

**Error Monitoring Setup**:
```javascript
// utils/error-tracking.js
class ErrorTracker {
  constructor() {
    this.enabled = process.env.NODE_ENV === 'production';
  }
  
  trackError(error, context = {}) {
    if (!this.enabled) return;
    
    // Send error to monitoring service
    this.sendError({
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: new Date().toISOString(),
      version: CONFIG.VERSION
    });
  }
  
  sendError(errorData) {
    // Implementation for error tracking service
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorData)
    }).catch(console.error);
  }
}
```

### 2. Usage Analytics

**Analytics Implementation**:
```javascript
// utils/analytics.js
class Analytics {
  constructor() {
    this.enabled = process.env.NODE_ENV === 'production';
  }
  
  trackEvent(event, properties = {}) {
    if (!this.enabled) return;
    
    this.sendEvent({
      event: event,
      properties: properties,
      timestamp: new Date().toISOString(),
      version: CONFIG.VERSION
    });
  }
  
  sendEvent(eventData) {
    // Implementation for analytics service
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    }).catch(console.error);
  }
}
```

## Security Considerations

### 1. Code Signing

**Code Signing Process**:
```bash
# Generate signing key
openssl genrsa -out private-key.pem 2048

# Sign module
openssl dgst -sha256 -sign private-key.pem -out signature.sig module.json

# Verify signature
openssl dgst -sha256 -verify public-key.pem -signature signature.sig module.json
```

### 2. Security Headers

**Security Configuration**:
```javascript
// security/headers.js
export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
};
```

## Rollback Procedures

### 1. Emergency Rollback

**Rollback Script**:
```bash
#!/bin/bash
# scripts/rollback.sh

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

echo "Rolling back to version $VERSION"

# Revert to previous version
git checkout "v$VERSION"

# Update version numbers
./scripts/bump-version.sh $VERSION

# Rebuild and redeploy
npm run build:prod
npm run deploy

echo "Rollback to version $VERSION completed"
```

### 2. Hotfix Process

**Hotfix Workflow**:
1. Create hotfix branch from main
2. Make minimal changes
3. Test thoroughly
4. Deploy hotfix
5. Merge back to main

**Hotfix Script**:
```bash
#!/bin/bash
# scripts/hotfix.sh

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

# Create hotfix branch
git checkout -b hotfix/$VERSION

# Make changes (manual step)
echo "Make your changes, then run:"
echo "git add ."
echo "git commit -m 'Hotfix: description'"
echo "git push origin hotfix/$VERSION"
```

## Maintenance

### 1. Dependency Updates

**Update Dependencies**:
```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update to latest versions
npm install package@latest
```

**Security Audit**:
```bash
# Run security audit
npm audit

# Fix security issues
npm audit fix
```

### 2. Documentation Maintenance

**Documentation Updates**:
- Keep README.md current
- Update API documentation
- Maintain changelog
- Update troubleshooting guide

**Documentation Validation**:
```bash
# Check documentation
npm run docs:check

# Validate links
npm run docs:validate-links
```

This comprehensive deployment and distribution guide ensures reliable and professional module releases while maintaining code quality and user experience.