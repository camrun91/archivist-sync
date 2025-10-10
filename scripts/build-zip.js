#!/usr/bin/env node

/**
 * Build script to create a distributable module.zip file
 * This matches the structure created by the GitHub Actions release workflow
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

console.log('🏗️  Building module.zip...');

// Remove old zip if it exists
const zipPath = resolve(rootDir, 'module.zip');
if (existsSync(zipPath)) {
  unlinkSync(zipPath);
  console.log('   Removed old module.zip');
}

// Create the zip file
try {
  const command = `cd "${rootDir}" && zip -r module.zip \
    module.json \
    README.md \
    CHANGELOG.md \
    CONTRIBUTING.md \
    LICENSE \
    lang/ \
    scripts/ \
    styles/ \
    templates/ \
    -x "*.git*" -x "*node_modules*" -x "*.DS_Store" -x "*scripts/build-zip.js" -x "*scripts/prepare-release.js"`;

  execSync(command, { stdio: 'inherit' });
  console.log('✅ module.zip created successfully!');

  // Show the file size
  const stats = execSync(`ls -lh "${zipPath}" | awk '{print $5}'`, {
    encoding: 'utf-8',
  });
  console.log(`   Size: ${stats.trim()}`);
} catch (error) {
  console.error('❌ Error creating module.zip:', error.message);
  process.exit(1);
}
