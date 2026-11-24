# Stremio Addons Library

Statická katalogová galerie Stremio doplňků pro GitHub Pages a lokální správu záloh.

## První doplněk: Stremio Account Exporter

**Veřejný manifest:**  
https://akcizur.github.io/stremio-addons-library/addons/account-exporter/manifest.json

### Instalace podle aplikace

- **Stremio:** otevři \`stremio://akcizur.github.io/stremio-addons-library/addons/account-exporter/manifest.json\`.
- **Nuvio:** otevři \`nuvio://akcizur.github.io/stremio-addons-library/addons/account-exporter/manifest.json\`. Alternativně vlož veřejnou HTTPS manifest URL do Settings → Content & Discovery → Addons.
- **Streamlet:** v aplikaci otevři Sources → Add Stremio addon → From URL a vlož HTTPS manifest URL. Streamlet podle dokumentace přijímá manifest URL nebo \`stremio://\` v poli Module URL; není zde vymyšlený neověřený \`streamlet://\` protokol.

[Veřejná Configure stránka](https://akcizur.github.io/stremio-addons-library/addons/account-exporter/configure/) vysvětluje spuštění lokálního exportéru. [Náhled rozhraní](https://akcizur.github.io/stremio-addons-library/assets/screenshots/account-exporter.svg).

### Co exportuje

- Uživatelský profil vrácený přes Stremio \`getUser\`.
- Nainstalované doplňky včetně plných descriptorů a \`transportUrl\` (tyto URL mohou obsahovat soukromé konfigurační tokeny).
- Položky knihovny z kolekce \`libraryItem\`, pokud je endpoint \`datastoreGet\` dostupný.
- Nastavení profilu pouze v rozsahu, v jakém je vrací Stremio API.

Lokální preference přehrávače a titulků nejsou garantovanou součástí cloudového profilu. Export je označí jako nedostupný, pokud jej účetní API nevrátí. Knihovna používá méně zdokumentované rozhraní \`datastoreGet\`.

### Spuštění lokálního exportéru

Vyžaduje Node.js 20+. Žádné další balíčky nejsou potřeba.

\`\`\`bash
node stremio-exporter-addon.js
\`\`\`

Otevři http://127.0.0.1:7000/configure. Přihlas se e-mailem a heslem nebo vlož existující AuthKey. Údaje se nezapisují do souborů, cookies ani Local Storage. Heslo se posílá pouze lokálním procesem přímo na \`https://api.strem.io\`; dočasná relace založená heslem se po exportu zkusí odhlásit. Existující AuthKey exportér neodhlašuje.

Lokální Node.js služba musí běžet na stejném zařízení jako Stremio. Veřejná Configure stránka sama nepřijímá heslo ani AuthKey.

### Veřejné endpointy

- \`/addons/account-exporter/manifest.json\` — veřejný addon manifest.
- \`/addons/account-exporter/configure/\` — veřejná Configure stránka.
- \`/addons/account-exporter/catalog/movie/account-exporter.json\` — katalog.
- \`/addons/account-exporter/meta/movie/stremio-account-exporter.json\` — metadata.
- \`/assets/screenshots/account-exporter.svg\` — screenshot-preview pro kartu knihovny.

### Validace

GitHub Actions kontroluje:
- JSON manifest a shodu s katalogem.
- JavaScript syntaxi galerie a Node nástrojů.
- Odpovědi katalogu a metadat a jejich vazby na sebe.
- Veřejnou Configure stránku, screenshot a CORS hlavičky.
- Automatické testy importu, sanitizace a instalačních variant.

### Bezpečnost

Soukromá záloha může obsahovat e-mail, historii sledování a tokeny v URL nainstalovaných doplňků. Neukládej ji do veřejného repozitáře a nesdílej ji. Složka \`backups/\` je ignorovaná Gitem.

## Galerie a nástroje

- \`index.html\` — Google Sans katalog s vyhledáváním, kategoriemi, screenshoty a instalačními volbami Stremio / Nuvio / Streamlet.
- \`data/catalog.json\` — veřejný katalog.
- \`addons/account-exporter/\` — manifest, Configure, katalog a metadata.
- \`assets/screenshots/\` — screenshot-preview obrázky pro karty.
- \`stremio-exporter-addon.js\` — lokální exportní služba.
- \`tools/sanitize-backup.js\` — převod soukromé zálohy na veřejný katalog.
- \`tools/health-check.js\` — kontrola veřejných endpointů a CORS.
- \`tests/\` — automatické testy.

## Příkazy

\`\`\`bash
npm test
npm run addon
npm run sanitize -- "backups/stremio-backup.json" "data/catalog.json"
npm run health
\`\`\`

## GitHub Pages

Galerie a veřejný addon jsou publikovány přes GitHub Actions:
https://akcizur.github.io/stremio-addons-library/
