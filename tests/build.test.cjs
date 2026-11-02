const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { targets, manifestFor, build } = require('../scripts/build.cjs');

const root = path.resolve(__dirname, '..');

test('each marketplace receives only its supported background configuration', () => {
  assert.deepEqual(targets, ['chrome', 'edge', 'firefox', 'safari']);
  for (const target of targets) {
    const manifest = manifestFor(target);
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, '1.0');
    assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
    assert.equal(manifest.host_permissions, undefined);
    assert.deepEqual(manifest.commands._execute_action.suggested_key,
      { default: 'Ctrl+Shift+X', mac: 'Command+Shift+X' });
    if (target === 'chrome' || target === 'edge') {
      assert.deepEqual(manifest.background, { service_worker: 'src/background.js' });
    } else {
      assert.deepEqual(manifest.background, {
        scripts: ['src/unread-icon.js', 'src/background.js']
      });
    }
    if (target === 'firefox') {
      assert.equal(manifest.browser_specific_settings.gecko.id, 'dotlater@the-aries.github.io');
      assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions,
        { required: ['none'] });
    } else {
      assert.equal(manifest.browser_specific_settings, undefined);
    }
  }
  assert.throws(() => manifestFor('unsupported'), /Unknown target/);
});

test('store ZIP archives are built from identical source files', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dotlater-build-test-'));
  try {
    for (const target of targets) {
      const result = build(target, out);
      assert.ok(fs.statSync(result.archive).size > 0);
      const manifest = JSON.parse(fs.readFileSync(path.join(result.directory, 'manifest.json')));
      assert.deepEqual(manifest, manifestFor(target));
      for (const file of [
        'src/background.js', 'src/content.js', 'src/unread-icon.js',
        'src/options.js', 'src/options.html', 'assets/icons/dot-32.png',
        'assets/icons/green-dot-32.png', 'LICENSE', 'docs/THIRD_PARTY_LICENSE.txt'
      ]) {
        assert.deepEqual(fs.readFileSync(path.join(result.directory, file)),
          fs.readFileSync(path.join(root, file)), target + ': ' + file);
      }
      const zipped = spawnSync('unzip', ['-Z', '-1', result.archive], { encoding: 'utf8' });
      assert.equal(zipped.status, 0, zipped.stderr);
      assert.ok(zipped.stdout.split(/\r?\n/).includes('manifest.json'));
      assert.ok(zipped.stdout.split(/\r?\n/).includes('src/background.js'));
      assert.ok(zipped.stdout.split(/\r?\n/).includes('docs/THIRD_PARTY_LICENSE.txt'));
      assert.doesNotMatch(zipped.stdout, /(^|\/)\.git(\/|$)|node_modules|tests\//m);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
