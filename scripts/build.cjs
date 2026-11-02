#!/usr/bin/env node
'use strict';

// Build store-specific packages from one WebExtension source tree.
// Only the manifest differs. All JavaScript, HTML and icons are shared.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const targets = ['chrome', 'edge', 'firefox', 'safari'];
const files = ['src', 'assets', 'LICENSE', 'docs/THIRD_PARTY_LICENSE.txt'];

function manifestFor(target) {
  if (!targets.includes(target)) throw new Error('Unknown target: ' + target);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (target === 'chrome' || target === 'edge') {
    // Manifest V3 Chromium store validators require a service worker.
    manifest.background = { service_worker: 'src/background.js' };
  } else {
    // Firefox uses an event page. Safari uses background scripts by default.
    manifest.background = {
      scripts: ['src/unread-icon.js', 'src/background.js']
    };
  }
  if (target === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'dotlater@the-aries.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] }
      }
    };
  }
  return manifest;
}

function build(target, out = path.join(root, 'dist')) {
  const manifest = manifestFor(target);
  const directory = path.join(out, target);
  const archive = path.join(out, 'DotLater-v' + manifest.version + '-' + target + '.zip');
  fs.mkdirSync(out, { recursive: true });
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  for (const file of files) {
    const src = path.join(root, file);
    const dst = path.join(directory, file);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  }
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(archive, { force: true });
  const paths = ['manifest.json', ...files];
  // zip is available on macOS, Linux and most developer workstations.
  const result = spawnSync('zip', ['-q', '-X', '-r', archive, ...paths], {
    cwd: directory, encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('zip failed: ' + result.stderr);
  return { target, directory, archive };
}

if (require.main === module) {
  const selected = process.argv[2] || 'all';
  const out = process.env.DOTLATER_BUILD_OUT
    ? path.resolve(process.env.DOTLATER_BUILD_OUT)
    : path.join(root, 'dist');
  const chosen = selected === 'all' ? targets : [selected];
  try {
    for (const target of chosen) {
      const artifact = build(target, out);
      console.log(artifact.target + ': ' + artifact.archive);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { targets, manifestFor, build };
