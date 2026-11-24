#!/usr/bin/env node
'use strict';

// Local-only Stremio Account Exporter. Node.js 20+, no external packages.
const http = require('node:http');
const { URL } = require('node:url');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 7000);
const API_BASE = 'https://api.strem.io/api/';
const MAX_BODY = 64 * 1024;
const API_METHODS = new Set(['login', 'getUser', 'addonCollectionGet', 'datastoreGet', 'logout']);

const manifest = {
  id: 'org.akcizur.stremio-account-exporter',
  version: '1.0.1',
  name: 'Stremio Account Exporter',
  description: 'Local-first utility for exporting your Stremio profile, installed addons and library to a private JSON backup.',
  resources: ['catalog', 'meta'],
  types: ['movie'],
  catalogs: [{ type: 'movie', id: 'account-exporter', name: 'Account Exporter', extra: [] }],
  behaviorHints: { configurable: true, configurationRequired: false }
};

const catalogResponse = {
  metas: [{
    id: 'stremio-account-exporter',
    type: 'movie',
    name: 'Stremio Account Exporter',
    description: 'A local utility for exporting Stremio account data. Open Configure to access the private exporter.',
    releaseInfo: 'Local utility',
    runtime: 'Utility'
  }]
};

const metaResponse = {
  meta: {
    id: 'stremio-account-exporter',
    type: 'movie',
    name: 'Stremio Account Exporter',
    description: 'Local-first account backup utility. Configure this addon to launch the exporter on the same computer as Stremio.',
    releaseInfo: 'Utility',
    runtime: 'No playback — account export tool'
  }
};

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        reject(new Error('Požadavek je příliš velký.'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Neplatný JSON požadavek.')); }
    });
    req.on('error', reject);
  });
}

async function stremioRequest(method, params) {
  if (!API_METHODS.has(method)) throw new Error('Nepovolená API operace.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(API_BASE + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(params || {}),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw new Error('Stremio API vrátilo HTTP ' + response.status + '.');
    const body = await response.json();
    if (body && body.error) {
      const message = body.error.message || 'Požadavek byl odmítnut.';
      throw new Error(String(message).slice(0, 180));
    }
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'result')) {
      throw new Error('Odpověď Stremio API nemá očekávané pole result.');
    }
    return body.result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Stremio API neodpovědělo v časovém limitu.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function removeSecrets(value) {
  if (Array.isArray(value)) return value.map(removeSecrets);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(auth.?key|password|passwd|token|secret|credential|session.?key)/i.test(key)) continue;
    output[key] = removeSecrets(child);
  }
  return output;
}

function asArray(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.library)) return result.library;
  if (result && Array.isArray(result.items)) return result.items;
  if (result && Array.isArray(result.results)) return result.results;
  return [];
}

async function createBackup(input, api = stremioRequest) {
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const suppliedAuthKey = typeof input.authKey === 'string' ? input.authKey.trim() : '';
  let authKey = suppliedAuthKey;
  let createdSession = false;

  if (!authKey && email && password) {
    const login = await api('login', { email, password });
    authKey = login && typeof login.authKey === 'string' ? login.authKey : '';
    createdSession = Boolean(authKey);
    if (!authKey) throw new Error('Přihlášení nevrátilo platný AuthKey.');
  } else if (!authKey) {
    throw new Error('Vyplň e-mail a heslo, nebo vlož existující AuthKey.');
  }

  try {
    const profileRaw = await api('getUser', { authKey });
    if (!profileRaw || typeof profileRaw !== 'object' || !profileRaw._id) {
      throw new Error('Stremio nevrátilo platný uživatelský profil.');
    }

    const results = await Promise.allSettled([
      api('addonCollectionGet', { authKey, update: true, addFromURL: [] }),
      api('datastoreGet', { authKey, collection: 'libraryItem', all: true })
    ]);
    const addonResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const libraryResult = results[1].status === 'fulfilled' ? results[1].value : null;
    const addons = addonResult && Array.isArray(addonResult.addons) ? addonResult.addons : [];
    const libraryItems = results[1].status === 'fulfilled' ? asArray(libraryResult) : [];
    const profile = removeSecrets(profileRaw);
    const accountSettings = profileRaw.settings || profileRaw.preferences || null;
    const warnings = [];

    if (results[0].status === 'rejected') warnings.push('Seznam nainstalovaných doplňků se nepodařilo načíst.');
    else if (!Array.isArray(addonResult && addonResult.addons)) warnings.push('Stremio vrátilo neznámý formát kolekce doplňků.');
    if (results[1].status === 'rejected') warnings.push('Knihovnu se nepodařilo načíst. Rozhraní datastoreGet nemusí být dostupné nebo se mohlo změnit.');
    if (!accountSettings) warnings.push('Cloudový profil neobsahoval samostatné nastavení přehrávače/titulků. Lokální nastavení aplikace není tímto API garantováno.');
    warnings.push('Export instalovaných doplňků obsahuje jejich původní transportUrl. Některé URL mohou obsahovat soukromé konfigurační tokeny — zálohu nezveřejňuj.');

    const data = {
      schemaVersion: 1,
      exporter: {
        id: manifest.id,
        version: manifest.version,
        exportedAt: new Date().toISOString(),
        authMethod: createdSession ? 'email-password' : 'existing-auth-key',
        authKeyIncluded: false,
        passwordIncluded: false
      },
      account: {
        profile,
        settingsReturnedByAccountApi: accountSettings ? removeSecrets(accountSettings) : null
      },
      installedAddons: {
        available: results[0].status === 'fulfilled' && Array.isArray(addonResult && addonResult.addons),
        count: addons.length,
        lastModified: addonResult && addonResult.lastModified ? addonResult.lastModified : null,
        items: addons
      },
      library: {
        collection: 'libraryItem',
        available: results[1].status === 'fulfilled',
        count: libraryItems.length,
        items: libraryItems
      },
      localPlayerAndSubtitleSettings: {
        included: false,
        reason: 'Not guaranteed by the account API; device-local preferences must be exported separately from the app profile if available.'
      },
      warnings
    };
    return { data, stats: { addons: addons.length, libraryItems: libraryItems.length, libraryAvailable: results[1].status === 'fulfilled' } };
  } finally {
    // Invalidate only a temporary session created by email/password login.
    // A caller-supplied AuthKey may belong to the active Stremio app session.
    if (createdSession && authKey) {
      try { await api('logout', { authKey }); } catch { /* Best-effort cleanup. */ }
    }
  }
}

const PAGE = String.raw`<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Stremio Account Exporter</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--bg:#0b0b0c;--surface:#141416;--line:#303036;--text:#f4f4f5;--muted:#a1a1aa}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -20%,#202027 0,transparent 48%),var(--bg);color:var(--text);font:14px/1.55 "Google Sans",Roboto,Arial,sans-serif;display:grid;place-items:center;padding:26px}
main{width:min(590px,100%)}.brand{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin:0 0 24px}
.mark{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#eeeef0;color:#111;font-size:14px;letter-spacing:0}
h1{font-size:clamp(29px,5vw,40px);line-height:1.05;letter-spacing:-.06em;margin:0 0 12px}.lead{margin:0 0 24px;color:var(--muted);font-size:13px}
.panel{border:1px solid var(--line);border-radius:18px;background:rgb(20 20 22 / 94%);padding:22px}
.warning{border:1px solid #62501f;background:#211c10;color:#ead99e;border-radius:11px;padding:12px 13px;font-size:11px;line-height:1.55;margin-bottom:20px}
label{display:block;margin:14px 0 6px;color:#d4d4d8;font-size:11px;font-weight:600}
input{width:100%;height:43px;border:1px solid var(--line);border-radius:10px;background:#0c0c0e;color:var(--text);padding:0 12px;font:inherit;outline:none}
input:focus{border-color:#888891;box-shadow:0 0 0 3px #ffffff0c}
.or{display:flex;align-items:center;gap:12px;margin:16px 0;color:#71717a;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.or:before,.or:after{content:"";height:1px;background:var(--line);flex:1}
button,.button{width:100%;min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #eeeef0;border-radius:10px;background:#eeeef0;color:#111114;font:600 12px "Google Sans",Roboto,Arial,sans-serif;text-decoration:none;cursor:pointer;margin-top:18px}
button:disabled{opacity:.55;cursor:wait}.secondary{background:transparent;border-color:var(--line);color:var(--text);margin-top:9px}
.help{margin:17px 0 0;color:var(--muted);font-size:10px}.help a{color:#ddd;text-decoration:underline;text-underline-offset:3px}
.status{min-height:20px;margin-top:14px;color:var(--muted);font-size:11px}.status.error{color:#ff9d9d}.status.success{color:#a4e4b3}
.footer{margin-top:18px;color:#66666e;font-size:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
</style></head><body><main>
<div class="brand"><span class="mark">S</span> Stremio utilities / account export</div>
<h1>Tvůj Stremio účet.<br>Bezpečně do JSON.</h1>
<p class="lead">Export probíhá lokálně na tomto počítači. Přihlašovací údaje se předají pouze oficiálnímu Stremio API přes HTTPS a po exportu se neukládají.</p>
<section class="panel">
<div class="warning"><strong>Soukromá záloha.</strong> Export nainstalovaných doplňků může obsahovat jejich konfigurační URL a soukromé tokeny (například pro debrid služby). Ulož JSON bezpečně a nikdy ho necommituj do veřejného GitHub repozitáře.</div>
<form id="exportForm">
<label for="email">E-mail ke Stremio účtu</label><input id="email" name="email" type="email" autocomplete="off" placeholder="jmeno@example.com">
<label for="password">Heslo</label><input id="password" name="password" type="password" autocomplete="new-password" placeholder="Heslo Stremio účtu">
<div class="or">nebo použij existující AuthKey</div>
<label for="authKey">Stremio AuthKey</label><input id="authKey" name="authKey" type="password" autocomplete="off" spellcheck="false" placeholder="Vlož existující AuthKey">
<button id="exportButton" type="submit">↓ Přihlásit a stáhnout zálohu</button>
</form>
<div id="status" class="status" role="status" aria-live="polite"></div>
<p class="help">Heslo ani AuthKey se neukládají do Local Storage, cookies ani URL. Při přihlášení heslem se dočasná API relace po dokončení exportu zkusí odhlásit. Při použití vlastního AuthKey zůstává jeho relace nedotčená.</p>
<a class="button secondary" href="stremio://127.0.0.1:__PORT__/manifest.json">↗ Otevřít doplněk ve Stremiu</a>
<p class="help">Pro instalaci musí tato lokální služba běžet na stejném zařízení jako Stremio.</p>
</section>
<div class="footer"><span>LOCAL ONLY · 127.0.0.1:__PORT__</span><span>Node.js built-ins · No external packages</span></div>
</main>
<script>
(function(){
var form=document.getElementById('exportForm'),button=document.getElementById('exportButton'),status=document.getElementById('status');
form.addEventListener('submit',async function(event){
event.preventDefault();
var email=document.getElementById('email').value.trim(),password=document.getElementById('password').value,authKey=document.getElementById('authKey').value.trim();
if(authKey&&(email||password)){status.textContent='Vyber pouze jednu metodu přihlášení.';status.className='status error';return;}
if(!authKey&&(!email||!password)){status.textContent='Vyplň e-mail a heslo, nebo vlož AuthKey.';status.className='status error';return;}
button.disabled=true;button.textContent='Načítám data ze Stremia…';status.textContent='Ověřuji účet a stahuji profil, doplňky a knihovnu.';status.className='status';
try{
var response=await fetch('/api/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email,password:password,authKey:authKey})});
if(!response.ok){var problem={};try{problem=await response.json();}catch(e){}throw new Error(problem.error||'Export selhal (HTTP '+response.status+').');}
var blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download='stremio-account-backup-'+new Date().toISOString().slice(0,10)+'.json';
document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
var addonCount=response.headers.get('x-export-addons')||'0',libraryCount=response.headers.get('x-export-library')||'0',libraryAvailable=response.headers.get('x-export-library-available')==='true';
status.textContent='Záloha stažena · '+addonCount+' doplňků · '+libraryCount+' položek knihovny'+(libraryAvailable?'':' · knihovna nedostupná');
status.className='status success';form.reset();
}catch(error){status.textContent=error.message;status.className='status error';}
finally{button.disabled=false;button.textContent='↓ Přihlásit a stáhnout zálohu';}
});
})();
</script></body></html>`;

function validLocalRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' || parsed.host.toLowerCase() !== host) return false;
    } catch { return false; }
  }
  return true;
}

function createServer(options) {
  const api = options && options.apiRequest ? options.apiRequest : stremioRequest;
  return http.createServer(async (req, res) => {
    if (!validLocalRequest(req)) {
      send(res, 403, JSON.stringify({ error: 'Tato služba přijímá požadavky pouze z lokálního zařízení.' }));
      return;
    }
    const url = new URL(req.url, 'http://' + (req.headers.host || HOST + ':' + PORT));
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/configure')) {
      send(res, 200, PAGE.replaceAll('__PORT__', String(PORT)), 'text/html; charset=utf-8');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(manifest));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/catalog/movie/account-exporter.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(catalogResponse));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/meta/movie/stremio-account-exporter.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(metaResponse));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/healthz') {
      send(res, 200, JSON.stringify({ ok: true, service: manifest.id, host: HOST, port: PORT }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/export') {
      try {
        const input = await readJsonBody(req);
        const result = await createBackup(input, api);
        const json = JSON.stringify(result.data, null, 2) + '\n';
        const filename = 'stremio-account-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + filename + '"',
          'Content-Length': Buffer.byteLength(json),
          'Cache-Control': 'no-store, max-age=0',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Export-Addons': String(result.stats.addons),
          'X-Export-Library': String(result.stats.libraryItems),
          'X-Export-Library-Available': String(result.stats.libraryAvailable)
        });
        res.end(json);
      } catch (error) {
        const message = error && error.message ? String(error.message).slice(0, 220) : 'Export se nezdařil.';
        send(res, 400, JSON.stringify({ error: message }));
      }
      return;
    }
    send(res, 404, JSON.stringify({ error: 'Stránka nebyla nalezena.' }));
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log('Stremio Account Exporter běží pouze lokálně.');
    console.log('Konfigurace: http://' + HOST + ':' + PORT + '/configure');
    console.log('Manifest:    http://' + HOST + ':' + PORT + '/manifest.json');
    console.log('Server neposlouchá v síti LAN a neukládá heslo ani AuthKey.');
  });
  server.on('error', error => {
    console.error('Server se nepodařilo spustit: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { manifest, createBackup, createServer, stremioRequest, removeSecrets, asArray };
