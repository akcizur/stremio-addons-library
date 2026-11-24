#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
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
      && pathname.endsWith('/manifest.json')
      && !/(token|secret|api[-_]?key|auth|credential|private)/i.test(url.hostname + pathname);
  } catch {
    return false;
  }
}
function validManifest(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
    && typeof data.id === 'string' && typeof data.name === 'string'
    && typeof data.version === 'string' && Array.isArray(data.resources)
    && Array.isArray(data.types) && Array.isArray(data.catalogs);
}
function assertCors(response, label) {
  const value = response.headers.get('access-control-allow-origin');
  if (value !== '*' && value !== 'https://web.stremio.com' && value !== 'https://nuvio.tv') {
    throw new Error(label + ': chybí povolená CORS hlavička Access-Control-Allow-Origin (nalezena: ' + (value || 'žádná') + ')');
  }
}
async function getJson(url, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(label + ': HTTP ' + response.status);
    assertCors(response, label);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) throw new Error(label + ': Content-Type není JSON (' + type + ')');
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(label + ': timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function getAsset(url, label, contentTypePart) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(label + ': HTTP ' + response.status);
    assertCors(response, label);
    const type = response.headers.get('content-type') || '';
    if (!type.includes(contentTypePart)) throw new Error(label + ': neočekávaný Content-Type ' + type);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(label + ': timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

(async () => {
  let failed = 0;
  let checked = 0;
  let skippedLocal = 0;
  for (const addon of addons) {
    const url = addon?.transportUrl;
    if (addon?.flags?.localOnly === true) {
      skippedLocal++;
      console.log('LOCAL ' + String(addon?.name || addon?.id || 'Lokální doplněk') + ': kontrola přeskočena.');
      continue;
    }
    const label = String(addon?.name || addon?.id || 'Neznámý doplněk');
    if (!safeUrl(url)) {
      failed++;
      console.error('FAIL ' + label + ': URL manifestu není veřejné HTTPS URL.');
      continue;
    }
    checked++;
    try {
      const manifest = await getJson(url, label + ' manifest');
      if (!validManifest(manifest)) throw new Error('neplatná struktura Stremio manifestu');
      if (addon.id && manifest.id !== addon.id) throw new Error('ID manifestu neodpovídá katalogu');
      const base = url.slice(0, url.lastIndexOf('/') + 1);
      const manifestUrl = new URL(url);
      const basePath = manifestUrl.pathname.slice(0, manifestUrl.pathname.lastIndexOf('/') + 1);
      const root = manifestUrl.origin + basePath;

      for (const catalogSpec of manifest.catalogs) {
        const catalogPath = root + 'catalog/' + encodeURIComponent(catalogSpec.type) + '/' + encodeURIComponent(catalogSpec.id) + '.json';
        const catalogResponse = await getJson(catalogPath, label + ' catalog ' + catalogSpec.id);
        if (!catalogResponse || !Array.isArray(catalogResponse.metas)) throw new Error('katalog ' + catalogSpec.id + ' nevrací pole metas');
        for (const item of catalogResponse.metas) {
          if (!item || typeof item.id !== 'string' || typeof item.type !== 'string' || typeof item.name !== 'string') {
            throw new Error('položka katalogu ' + catalogSpec.id + ' nemá id/type/name');
          }
        }
        if (catalogResponse.metas[0]) {
          const item = catalogResponse.metas[0];
          const metaPath = root + 'meta/' + encodeURIComponent(item.type) + '/' + encodeURIComponent(item.id) + '.json';
          const metaResponse = await getJson(metaPath, label + ' meta ' + item.id);
          if (!metaResponse || !metaResponse.meta || metaResponse.meta.id !== item.id || metaResponse.meta.type !== item.type) {
            throw new Error('meta odpověď neodpovídá položce katalogu');
          }
        }
      }

      const configureUrl = root + 'configure/';
      await getAsset(configureUrl, label + ' configure', 'text/html');
      if (Array.isArray(addon.screenshots)) {
        for (const screenshot of addon.screenshots) {
          await getAsset(screenshot, label + ' screenshot', 'image/svg+xml');
        }
      }
      console.log('OK   ' + label + ' · manifest, ' + manifest.catalogs.length + ' katalogů, resources, CORS, Configure a screenshot');
    } catch (error) {
      failed++;
      console.error('FAIL ' + label + ': ' + error.message);
    }
  }
  console.log('\nKontrola: ' + checked + ' addonů ověřených, ' + skippedLocal + ' lokálních přeskočených, ' + failed + ' problémů, ' + addons.length + ' celkem.');
  if (failed) process.exitCode = 1;
})();
