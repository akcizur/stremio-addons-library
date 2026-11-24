'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('sanitizer preserves canonical public URL and omits token URL', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-library-'));
  try {
    const input = path.join(temp, 'backup.json');
    const output = path.join(temp, 'catalog.json');
    fs.writeFileSync(input, JSON.stringify([
      { manifest: { id: 'org.public', name: 'Public', version: '1.0.0', types: ['movie'], resources: ['stream'] }, transportUrl: 'https://addon.example/manifest.json' },
      { manifest: { id: 'org.private', name: 'Private', version: '1.0.0', types: ['movie'], resources: ['stream'] }, transportUrl: 'https://addon.example/manifest.json?token=not-public' }
    ]));
    const result = spawnSync(process.execPath, ['tools/sanitize-backup.js', input, output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const raw = fs.readFileSync(output, 'utf8');
    const catalog = JSON.parse(raw);
    assert.equal(catalog.addons.length, 1);
    assert.equal(catalog.addons[0].id, 'org.public');
    assert.ok(!raw.includes('not-public'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('sanitizer handles installedAddons wrapper and validated override', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-library-'));
  try {
    const input = path.join(temp, 'backup.json');
    const output = path.join(temp, 'catalog.json');
    const overrides = path.join(temp, 'overrides.json');
    fs.writeFileSync(input, JSON.stringify({ installedAddons: [
      { manifest: { id: 'org.custom', name: 'Custom', version: '1.0.0', types: ['movie'], resources: ['catalog'] }, transportUrl: 'https://addon.example/private-path/manifest.json' }
    ] }));
    fs.writeFileSync(overrides, JSON.stringify({ 'org.custom': 'https://public.example/manifest.json' }));
    const result = spawnSync(process.execPath, ['tools/sanitize-backup.js', input, output, '--overrides=' + overrides], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const catalog = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(catalog.addons.length, 1);
    assert.equal(catalog.addons[0].transportUrl, 'https://public.example/manifest.json');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('sanitizer removes private manifest properties', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-library-'));
  try {
    const input = path.join(temp, 'backup.json');
    const output = path.join(temp, 'catalog.json');
    fs.writeFileSync(input, JSON.stringify([
      { manifest: { id: 'org.safe', name: 'Safe', version: '1.0.0', types: ['movie'], resources: ['stream'], privateToken: 'do-not-publish', behaviorHints: { configurable: true, userSecret: 'private' } }, transportUrl: 'https://addon.example/manifest.json' }
    ]));
    const result = spawnSync(process.execPath, ['tools/sanitize-backup.js', input, output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const raw = fs.readFileSync(output, 'utf8');
    const catalog = JSON.parse(raw);
    assert.equal(catalog.addons.length, 1);
    assert.ok(!raw.includes('do-not-publish'));
    assert.ok(!raw.includes('userSecret'));
    assert.deepEqual(catalog.addons[0].manifest.behaviorHints, { configurable: true });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});


test('sanitizer preserves existing local-only addon when regenerating public catalog', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-library-'));
  try {
    const input = path.join(temp, 'backup.json');
    const output = path.join(temp, 'catalog.json');
    fs.writeFileSync(input, JSON.stringify([
      { manifest: { id: 'org.public', name: 'Public', version: '1.0.0', types: ['movie'], resources: ['stream'] }, transportUrl: 'https://addon.example/manifest.json' }
    ]));
    fs.writeFileSync(output, JSON.stringify({
      schemaVersion: 1,
      addons: [{
        id: 'org.akcizur.stremio-account-exporter',
        name: 'Stremio Account Exporter',
        transportUrl: 'http://127.0.0.1:7000/manifest.json',
        flags: { utility: true },
        manifest: { id: 'org.akcizur.stremio-account-exporter', resources: [], types: [], catalogs: [], behaviorHints: { configurable: true } }
      }]
    }));
    const result = spawnSync(process.execPath, ['tools/sanitize-backup.js', input, output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const catalog = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(catalog.addons.length, 2);
    assert.ok(catalog.addons.some(x => x.flags && x.flags.utility === true));
    assert.ok(catalog.addons.some(x => x.id === 'org.public'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
