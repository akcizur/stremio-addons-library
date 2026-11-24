#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const file = process.argv[2] || 'data/catalog.json';
if (!fs.existsSync(file)) {
  console.log(file + ' neexistuje – kontrola přeskočena.');
  process.exit(0);
}

const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
const addons = Array.isArray(catalog) ? catalog : (Array.isArray(catalog.addons) ? catalog.addons : []);
const timeoutMs = 12000;

function safeUrl(value) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/\/$/, '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (pathname.endsWith('/manifest.json') || pathname.endsWith('/stremio/v1'))
      && !/(token|secret|api[-_]?key|auth|credential|private)/i.test(url.hostname + pathname);
  } catch {
    return false;
  }
}
function validManifest(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
    && typeof data.id === 'string' && typeof data.name === 'string'
    && typeof data.version === 'string' && Array.isArray(data.resources)
    && Array.isArray(data.types);
}

(async () => {
  let failed = 0;
  let checked = 0;
  let skippedLocal = 0;
  for (const addon of addons) {
    const url = addon?.transportUrl;
    if (addon?.flags?.localOnly === true) {
      skippedLocal++;
      console.log('LOCAL ' + String(addon?.name || addon?.id || 'Lokální doplněk') + ': kontrola přeskočena (běží jen na zařízení uživatele).');
      continue;
    }
    const label = String(addon?.name || addon?.id || 'Neznámý doplněk');
    if (!safeUrl(url)) {
      failed++;
      console.error('SKIP ' + label + ': URL není ve veřejném bezpečném formátu.');
      continue;
    }
    checked++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'follow'
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if (!url.endsWith('/stremio/v1')) {
        const manifest = await response.json();
        if (!validManifest(manifest)) throw new Error('Neplatná struktura manifestu');
        if (addon.id && manifest.id !== addon.id) throw new Error('ID manifestu neodpovídá katalogu');
      }
      console.log('OK   ' + label);
    } catch (error) {
      failed++;
      console.error('FAIL ' + label + ': ' + (error.name === 'AbortError' ? 'timeout' : error.message));
    } finally {
      clearTimeout(timeout);
    }
  }
  console.log('\nKontrola: ' + checked + ' ověřených, ' + failed + ' problémů, ' + addons.length + ' celkem.');
  if (failed) process.exitCode = 1;
})();
