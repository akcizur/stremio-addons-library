# Stremio Addons Library

Statická katalogová galerie Stremio doplňků pro GitHub Pages a lokální nástroje pro správu záloh.

## První doplněk: Stremio Account Exporter

Samostatný konfigurovatelný lokální addon v souboru `stremio-exporter-addon.js`. Jeho webové rozhraní běží pouze na `127.0.0.1` a umožňuje vytvořit soukromou JSON zálohu Stremio účtu.

### Co exportuje

- Účetní profil vrácený přes Stremio `getUser`.
- Nainstalované doplňky včetně celých descriptorů a jejich `transportUrl` (tyto URL mohou obsahovat soukromé konfigurační tokeny).
- Položky knihovny z kolekce `libraryItem`, pokud je endpoint `datastoreGet` dostupný.
- Nastavení profilu pouze v rozsahu, v jakém je vrací Stremio API.

### Co negarantuje

Lokální preference přehrávače a titulků nejsou garantovanou součástí cloudového profilu. Exportér je označí jako nedostupné, pokud je API nevrátí. Knihovna používá `datastoreGet`, což je méně zdokumentované rozhraní a může se změnit. Export proto obsahuje stav dostupnosti a varování; nejde o zaručený obraz všech dat aplikace.

### Spuštění

Vyžaduje Node.js 20+; žádné další balíčky nejsou potřeba.

```bash
node stremio-exporter-addon.js
```

Otevři [http://127.0.0.1:7000/configure](http://127.0.0.1:7000/configure). Přihlas se e-mailem a heslem nebo vlož existující AuthKey. Údaje se nezapisují do souborů, cookies ani Local Storage. Heslo se posílá pouze z loopback služby přímo na `https://api.strem.io`; dočasná relace založená heslem se po exportu zkusí ukončit. Existující AuthKey exportér neodhlašuje.

Addon manifest: [http://127.0.0.1:7000/manifest.json](http://127.0.0.1:7000/manifest.json). V Stremiu můžeš přidat lokální manifest nebo otevřít jeho Configure stránku. Služba musí běžet na stejném zařízení jako Stremio.

### Bezpečnostní upozornění

Záloha obsahuje citlivá osobní data a může obsahovat soukromé tokeny v URL některých doplňků. Neukládej ji do veřejného repozitáře a neposílej ji nikomu dalšímu. Exportér neposílá data na GitHub ani jiné úložiště; jediným vzdáleným cílem API požadavků je `api.strem.io`.

### API kompatibilita

Oficiální `stremio-api-client` potvrzuje přihlášení a synchronizaci profilu a kolekce doplňků. Čtení `libraryItem` přes `datastoreGet` je převzaté z komunitní API reference, nikoli z garance stabilního veřejného API. Při změně API se tato část může vrátit jako nedostupná.

## Galerie

- `index.html` — statická Google Sans galerie.
- `data/catalog.json` — katalog doplňků.
- `tools/sanitize-backup.js` — převod soukromé zálohy na veřejný katalog.
- `tools/health-check.js` — kontrola URL veřejných manifestů.
- `tools/public-url-overrides.json` — ručně ověřené veřejné URL.
- `backups/` — lokální soukromé zálohy ignorované Gitem.
- `tests/` — automatické testy.
- `.github/workflows/` — testy, health-check a nasazení Pages.

## Příkazy

```bash
npm test
npm run addon
npm run sanitize -- "backups/stremio-backup.json" "data/catalog.json"
npm run health
```

## GitHub Pages

1. V **Settings → Pages** nastav **Source: GitHub Actions**.
2. Workflow `Deploy Stremio Addons Library` publikuje galerii při pushi do `main`.
3. Galerie: https://akcizur.github.io/stremio-addons-library/

Lokální exporter není hostován na GitHub Pages; záměrně zůstává lokální kvůli práci s přihlašovacími údaji.
