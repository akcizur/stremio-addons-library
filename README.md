# Stremio Addons Library

Statická katalogová galerie Stremio doplňků pro GitHub Pages a lokální nástroje pro správu záloh.

## První doplněk: Stremio Account Exporter

**Veřejný manifest:** [https://akcizur.github.io/stremio-addons-library/addons/account-exporter/manifest.json](https://akcizur.github.io/stremio-addons-library/addons/account-exporter/manifest.json)

Manifest, katalog, metadata a Configure stránka jsou hostované veřejně na GitHub Pages. Veřejná Configure stránka neobsluhuje přihlašovací údaje. Odkazuje uživatele na samostatný exporter, který běží na stejném počítači jako Stremio.

### Co exportuje
- Uživatelský profil vrácený přes Stremio `getUser`.
- Nainstalované doplňky včetně jejich plných descriptorů a `transportUrl` (tyto URL mohou obsahovat soukromé konfigurační tokeny).
- Položky knihovny z kolekce `libraryItem`, pokud je endpoint `datastoreGet` dostupný.
- Nastavení profilu pouze v rozsahu, v jakém je vrací Stremio API.

### Co negarantuje
Lokální preference přehrávače a titulků nejsou garantovanou součástí cloudového profilu. Exportér je označí jako nedostupné, pokud je API nevrátí. Knihovna používá `datastoreGet`, jehož podpora není garantována jako stabilní veřejné API.

### Spuštění lokálního exporteru
Vyžaduje Node.js 20+; žádné další balíčky nejsou potřeba.

```bash
node stremio-exporter-addon.js
```

Otevři [http://127.0.0.1:7000/configure](http://127.0.0.1:7000/configure). Přihlas se e-mailem a heslem nebo vlož existující AuthKey. Údaje se nezapisují do souborů, cookies ani Local Storage. Heslo se posílá pouze z lokálního procesu přímo na `https://api.strem.io`; dočasná relace založená heslem se po exportu zkusí odhlásit. Existující AuthKey exporter neodhlašuje.

### Veřejné endpointy addon
- `/addons/account-exporter/manifest.json` — veřejný addon manifest.
- `/addons/account-exporter/configure/` — stránka Configure v Stremio.
- `/addons/account-exporter/catalog/movie/account-exporter.json` — utility katalog.
- `/addons/account-exporter/meta/movie/stremio-account-exporter.json` — metadata utility karty.

### Bezpečnost
Záloha obsahuje citlivá osobní data a může obsahovat soukromé tokeny v URL některých doplňků. Neukládej ji do veřejného repozitáře a neposílej ji nikomu dalšímu. Veřejný web nikdy nepřijímá heslo ani AuthKey; pouze lokální Node.js proces komunikuje s API.

## Galerie a nástroje
- `index.html` — statická Google Sans galerie.
- `data/catalog.json` — katalog doplňků.
- `addons/account-exporter/` — veřejný Stremio addon manifest, katalog, metadata a Configure stránka.
- `stremio-exporter-addon.js` — lokální exportní služba.
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
Galerie a addon endpointy se nasazují přes GitHub Actions:
https://akcizur.github.io/stremio-addons-library/
