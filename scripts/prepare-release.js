#!/usr/bin/env node

/**
 * Interactive script to prepare a new release
 * Updates version numbers and creates a changelog entry
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function updateModuleJson(version) {
  const modulePath = resolve(rootDir, 'module.json');
  const moduleData = JSON.parse(readFileSync(modulePath, 'utf-8'));

  moduleData.version = version;
  moduleData.download = `https://github.com/camrun91/archivist-sync/releases/download/v${version}/module.zip`;

  writeFileSync(modulePath, JSON.stringify(moduleData, null, 2) + '\n');
  log(`✅ Updated module.json to version ${version}`, 'green');
}

function updateChangelog(version) {
  const changelogPath = resolve(rootDir, 'CHANGELOG.md');
  let changelog = readFileSync(changelogPath, 'utf-8');

  const date = new Date().toISOString().split('T')[0];
  const newEntry = `## [${version}] - ${date}

### Added
- 

### Changed
- 

### Fixed
- 

`;

  // Insert after the Unreleased section
  changelog = changelog.replace(/## \[Unreleased\]\n/, `## [Unreleased]\n\n${newEntry}`);

  writeFileSync(changelogPath, changelog);
  log(`✅ Updated CHANGELOG.md with version ${version}`, 'green');
  log('   Please edit CHANGELOG.md to add release notes!', 'yellow');
}

function getCurrentVersion() {
  const modulePath = resolve(rootDir, 'module.json');
  const moduleData = JSON.parse(readFileSync(modulePath, 'utf-8'));
  return moduleData.version;
}

function bumpVersion(type) {
  const current = getCurrentVersion();
  const parts = current.split('.').map(Number);

  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2]++;
      break;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }

  return parts.join('.');
}

// Main execution
try {
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch';

  if (!['major', 'minor', 'patch'].includes(versionType)) {
    log('Usage: npm run prepare-release [major|minor|patch]', 'red');
    log('Example: npm run prepare-release minor', 'yellow');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(versionType);

  log('', 'reset');
  log('📦 Preparing Release', 'bright');
  log('==================', 'bright');
  log(`Current version: ${currentVersion}`, 'blue');
  log(`New version: ${newVersion} (${versionType})`, 'green');
  log('', 'reset');

  // Update files
  updateModuleJson(newVersion);

  // Update package.json via npm
  try {
    execSync(`npm version ${newVersion} --no-git-tag-version`, {
      cwd: rootDir,
      stdio: 'ignore',
    });
    log(`✅ Updated package.json to version ${newVersion}`, 'green');
  } catch (error) {
    log(`⚠️  Could not update package.json automatically`, 'yellow');
  }

  updateChangelog(newVersion);

  log('', 'reset');
  log('✨ Next Steps:', 'bright');
  log('1. Edit CHANGELOG.md and add release notes', 'yellow');
  log('2. Review the changes: git diff', 'yellow');
  log(
    '3. Commit the changes: git add . && git commit -m "chore: prepare release v' +
      newVersion +
      '"',
    'yellow'
  );
  log(
    '4. Create and push the tag: git tag v' + newVersion + ' && git push origin v' + newVersion,
    'yellow'
  );
  log('5. The release workflow will automatically publish to Foundry VTT', 'yellow');
  log('', 'reset');
} catch (error) {
  log(`❌ Error: ${error.message}`, 'red');
  process.exit(1);
}
