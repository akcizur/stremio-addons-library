'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createBackup, manifest } = require('../stremio-exporter-addon');

test('manifest advertises a configurable local utility addon', () => {
  assert.equal(manifest.id, 'org.akcizur.stremio-account-exporter');
  assert.equal(manifest.behaviorHints.configurable, true);
  assert.deepEqual(manifest.resources, ['catalog', 'meta']);
  assert.deepEqual(manifest.types, ['movie']);
  assert.equal(manifest.version, '1.0.1');
});

test('password login exports profile, addon collection and library, then logs out temporary session', async () => {
  const calls = [];
  const api = async (method, params) => {
    calls.push({ method, params });
    if (method === 'login') return { authKey: 'temporary-session-secret' };
    if (method === 'getUser') return {
      _id: 'user-123',
      email: 'test@example.com',
      authKey: 'should-not-export',
      settings: { subtitles: { language: 'cs' }, privateToken: 'do-not-export' }
    };
    if (method === 'addonCollectionGet') return {
      lastModified: '2026-11-24T12:00:00.000Z',
      addons: [{ transportUrl: 'https://addon.example/manifest.json?token=private-config', manifest: { id: 'example.addon', name: 'Example' } }]
    };
    if (method === 'datastoreGet') return [{ _id: 'tt0133093', name: 'The Matrix', type: 'movie' }];
    if (method === 'logout') return {};
    throw new Error('Unexpected API method: ' + method);
  };

  const result = await createBackup({ email: 'test@example.com', password: 'pw-never-export' }, api);
  const json = JSON.stringify(result.data);
  assert.deepEqual(calls.map(x => x.method), ['login', 'getUser', 'addonCollectionGet', 'datastoreGet', 'logout']);
  assert.equal(result.stats.addons, 1);
  assert.equal(result.stats.libraryItems, 1);
  assert.equal(result.data.account.profile.email, 'test@example.com');
  assert.equal(result.data.account.profile.authKey, undefined);
  assert.deepEqual(result.data.account.settingsReturnedByAccountApi, { subtitles: { language: 'cs' } });
  assert.equal(result.data.installedAddons.items.length, 1);
  assert.equal(result.data.library.items[0]._id, 'tt0133093');
  assert.equal(result.data.exporter.authKeyIncluded, false);
  assert.equal(result.data.exporter.passwordIncluded, false);
  assert.ok(!json.includes('temporary-session-secret'));
  assert.ok(!json.includes('pw-never-export'));
  assert.ok(!json.includes('should-not-export'));
  // Private addon configuration URLs are intentionally retained in the private backup.
  assert.ok(json.includes('private-config'));
});

test('existing AuthKey is not logged out and library failure becomes a visible partial export', async () => {
  const calls = [];
  const api = async (method, params) => {
    calls.push(method);
    if (method === 'getUser') return { _id: 'user-456', email: 'authkey@example.com' };
    if (method === 'addonCollectionGet') return { addons: [] };
    if (method === 'datastoreGet') throw new Error('unsupported');
    throw new Error('Unexpected API method: ' + method);
  };

  const result = await createBackup({ authKey: 'existing-auth-key' }, api);
  assert.deepEqual(calls, ['getUser', 'addonCollectionGet', 'datastoreGet']);
  assert.equal(result.stats.libraryAvailable, false);
  assert.equal(result.data.library.available, false);
  assert.equal(result.data.library.count, 0);
  assert.equal(result.data.exporter.authMethod, 'existing-auth-key');
  assert.ok(result.data.warnings.some(x => x.includes('Knihovnu se nepodařilo načíst')));
});

test('local HTTP server serves manifest/configure and streams JSON backup response', async t => {
  const api = async method => {
    if (method === 'getUser') return { _id: 'user-789', email: 'local@example.com' };
    if (method === 'addonCollectionGet') return { addons: [] };
    if (method === 'datastoreGet') return [];
    throw new Error('Unexpected API method: ' + method);
  };
  const server = createServer({ apiRequest: api });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;

  const manifestResponse = await fetch(base + '/manifest.json');
  const loadedManifest = await manifestResponse.json();
  assert.equal(manifestResponse.status, 200);
  assert.equal(loadedManifest.behaviorHints.configurable, true);
  assert.deepEqual(loadedManifest.resources, ['catalog', 'meta']);

  const catalogResponse = await fetch(base + '/catalog/movie/account-exporter.json');
  assert.equal(catalogResponse.status, 200);
  assert.equal((await catalogResponse.json()).metas[0].id, 'stremio-account-exporter');

  const metaResponse = await fetch(base + '/meta/movie/stremio-account-exporter.json');
  assert.equal(metaResponse.status, 200);
  assert.equal((await metaResponse.json()).meta.id, 'stremio-account-exporter');

  const configureResponse = await fetch(base + '/configure');
  assert.equal(configureResponse.status, 200);
  assert.match(await configureResponse.text(), /Stremio Account Exporter/);

  const exportResponse = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authKey: 'local-test-key' })
  });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-disposition'), /attachment/);
  const backup = await exportResponse.json();
  assert.equal(backup.account.profile.email, 'local@example.com');
});
