#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const inputPath = args.find(value => !value.startsWith('--'));
const inputIndex = args.indexOf(inputPath);
const outputPath = inputPath && args[inputIndex + 1] && !args[inputIndex + 1].startsWith('--')
  ? args[inputIndex + 1] : 'data/catalog.json';
const overrideArg = args.find(value => value.startsWith('--overrides='));
const overridesPath = overrideArg ? overrideArg.slice('--overrides='.length) : 'tools/public-url-overrides.json';

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Použití: node tools/sanitize-backup.js <backup.json> [data/catalog.json] [--overrides=cesta.json]');
  process.exit(2);
}

const SECRET_KEY = /(token|secret|api[-_]?key|password|passwd|authorization|credential|private.?key|access.?key)/i;
const ALLOWED = new Set(['id', 'version', 'name', 'description', 'types', 'catalogs', 'resources', 'idPrefixes', 'behaviorHints']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function recordsOf(root) {
  if (Array.isArray(root)) return root;
  for (const value of [root?.addons, root?.installedAddons, root?.items, root?.data?.addons, root?.data?.installedAddons]) {
    if (Array.isArray(value)) return value;
  }
  return root && typeof root === 'object' && (root.manifest || root.id || root.name) ? [root] : [];
}
function manifestOf(record) {
  return record?.manifest && typeof record.manifest === 'object' ? record.manifest : record || {};
}
function urlOf(record) {
  return record?.transportUrl || record?.transportURL || record?.manifestUrl || record?.manifestURL || record?.url || '';
}
function isPublicUrl(value) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && ['/manifest.json', '/stremio/v1'].includes(pathname.replace(/\/$/, ''))
      && !/(token|secret|api[-_]?key|auth|credential|private)/i.test(url.hostname + pathname);
  } catch {
    return false;
  }
}
function cleanManifest(manifest) {
  const out = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (!ALLOWED.has(key) || SECRET_KEY.test(key)) continue;
    if (key === 'resources' && Array.isArray(value)) {
      out.resources = value.map(resource => {
        if (typeof resource === 'string') return resource;
        if (!resource || typeof resource !== 'object') return null;
        const clean = {};
        for (const child of ['name', 'types', 'idPrefixes']) {
          if (resource[child] !== undefined) clean[child] = resource[child];
        }
        return clean;
      }).filter(Boolean);
    } else if (key === 'catalogs' && Array.isArray(value)) {
      out.catalogs = value.map(item => {
        if (!item || typeof item !== 'object') return null;
        const clean = {};
        for (const child of ['type', 'id', 'name', 'extra', 'extraSupported', 'genres']) {
          if (item[child] !== undefined) clean[child] = item[child];
        }
        return clean;
      }).filter(Boolean);
    } else if (key === 'behaviorHints' && value && typeof value === 'object') {
      const hints = {};
      for (const child of ['configurable', 'configurationRequired', 'adult', 'p2p']) {
        if (typeof value[child] === 'boolean') hints[child] = value[child];
      }
      if (Object.keys(hints).length) out.behaviorHints = hints;
    } else if (Array.isArray(value)) {
      out[key] = value;
    } else if (typeof value !== 'object' || value === null) {
      out[key] = value;
    }
  }
  return out;
}

let backup;
try {
  backup = readJson(inputPath);
} catch (error) {
  console.error('Neplatný vstupní JSON: ' + error.message);
  process.exit(2);
}
let overrides = {};
if (fs.existsSync(overridesPath)) {
  try {
    const parsed = readJson(overridesPath);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) overrides = parsed;
  } catch (error) {
    console.error('Neplatný soubor override: ' + error.message);
    process.exit(2);
  }
}

const records = recordsOf(backup);
const output = [];
const seen = new Set();
let skippedUnsafe = 0;
let skippedMissing = 0;
let skippedDuplicate = 0;

for (const record of records) {
  const manifest = manifestOf(record);
  const id = String(manifest.id || record?.id || '').trim();
  const url = typeof overrides[id] === 'string' ? overrides[id].trim() : String(urlOf(record)).trim();
  if (!id || !url) {
    skippedMissing++;
    continue;
  }
  if (!isPublicUrl(url)) {
    skippedUnsafe++;
    continue;
  }
  const key = id + '\n' + url;
  if (seen.has(key)) {
    skippedDuplicate++;
    continue;
  }
  seen.add(key);
  const clean = cleanManifest(manifest);
  output.push({
    id,
    name: String(clean.name || manifest.name || id),
    description: String(clean.description || ''),
    transportUrl: url,
    manifest: clean
  });
}

const target = path.resolve(outputPath);
const localEntries = [];
if (fs.existsSync(target)) {
  try {
    const previous = readJson(target);
    const previousAddons = Array.isArray(previous) ? previous : previous?.addons;
    if (Array.isArray(previousAddons)) {
      for (const addon of previousAddons) {
        if (addon && addon.flags && addon.flags.localOnly === true) localEntries.push(addon);
      }
    }
  } catch {
    // The new output is still generated from the validated input backup.
  }
}
const combined = output.concat(localEntries);
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'stremio-addons-library-sanitizer',
  addons: combined.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'cs'))
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n', { mode: 0o600 });

console.log('Katalog uložen: ' + target);
console.log('Zařazeno: ' + output.length + '/' + records.length);\nconsole.log('Zachováno lokálních addonů: ' + localEntries.length);
console.log('Vynecháno bez ID/URL: ' + skippedMissing);
console.log('Vynecháno jako neveřejné/nebezpečné: ' + skippedUnsafe);
console.log('Vynecháno duplicit: ' + skippedDuplicate);
