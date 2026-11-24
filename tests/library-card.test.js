'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const addon = catalog.addons.find(x => x.id === 'org.akcizur.stremio-account-exporter');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'addons/account-exporter/manifest.json'), 'utf8'));

test('account exporter has a real public HTTPS manifest URL', () => {
  assert.ok(addon);
  assert.match(addon.transportUrl, /^https:\/\/akcizur\.github\.io\/stremio-addons-library\/addons\/account-exporter\/manifest\.json$/);
  assert.equal(addon.transportUrl.endsWith('/manifest.json'), true);
  assert.equal(addon.manifest.id, manifest.id);
  assert.equal(addon.manifest.version, manifest.version);
});

test('manifest exposes compatible Stremio addon resources and Configure', () => {
  assert.equal(manifest.id, 'org.akcizur.stremio-account-exporter');
  assert.equal(manifest.behaviorHints.configurable, true);
  assert.deepEqual(manifest.resources, ['catalog', 'meta']);
  assert.ok(manifest.types.includes('movie'));
  assert.ok(Array.isArray(manifest.catalogs));
});

test('catalog item resolves to a matching metadata endpoint', () => {
  const catalogResponse = JSON.parse(fs.readFileSync(path.join(root, 'addons/account-exporter/catalog/movie/account-exporter.json'), 'utf8'));
  const metaResponse = JSON.parse(fs.readFileSync(path.join(root, 'addons/account-exporter/meta/movie/stremio-account-exporter.json'), 'utf8'));
  const item = catalogResponse.metas[0];
  assert.equal(item.id, metaResponse.meta.id);
  assert.equal(item.type, metaResponse.meta.type);
  assert.equal(item.name, metaResponse.meta.name);
  assert.equal(item.id, 'stremio-account-exporter');
});

test('card has screenshot preview and platform-specific installation actions', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /card-preview/);
  assert.match(html, /screenshots/);
  assert.match(html, /platformLink\(url,'stremio'\)/);
  assert.match(html, /platformLink\(url,'nuvio'\)/);
  assert.match(html, /data-streamlet-url/);
  assert.match(html, /Sources → Add Stremio addon/);
  assert.doesNotMatch(html, /streamlet:\/\//);
  assert.ok(addon.screenshots.some(x => x.endsWith('/assets/screenshots/account-exporter.svg')));
  assert.ok(fs.existsSync(path.join(root, 'assets/screenshots/account-exporter.svg')));
});

test('deployment includes addon endpoints and screenshot asset', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(workflow, /cp -R addons _site\/addons/);
  assert.match(workflow, /cp -R assets _site\/assets/);
});
