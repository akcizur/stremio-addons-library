# Stremio Addons Library

Statická katalogová galerie Stremio doplňků pro GitHub Pages. Bez frameworku, backendu a build kroku.

## Funkce
- Načítá veřejný katalog z data/catalog.json.
- Umožňuje import JSON exportu tlačítkem nebo přetažením souboru. Import zůstává pouze v prohlížeči.
- Vyhledává podle názvu, ID, popisu a funkcí.
- Filtruje podle stream, catalog, subtitles a meta.
- Zobrazuje detail doplňku a jeho manifest.
- Otevírá instalaci přes protokol stremio://.
- Exportuje pouze veřejně bezpečné URL.
- Obsahuje sanitizaci záloh a týdenní kontrolu manifestů přes GitHub Actions.

## Typografie
Rozhraní používá Google Sans z Google Fonts API (400, 500, 600, 700). Font se načítá s fallbacky Roboto a Arial; při nedostupnosti Google Fonts zůstane web čitelný.

## Struktura
- index.html — samotná galerie.
- data/catalog.json — veřejný katalog.
- backups/ — lokální soukromé zálohy; obsah je ignorován Gitem.
- tools/sanitize-backup.js — bezpečný převod zálohy na veřejný katalog.
- tools/health-check.js — kontrola URL manifestů.
- tools/public-url-overrides.json — ručně ověřené veřejné URL.
- tests/sanitize-backup.test.js — testy sanitizace.
- .github/workflows/deploy-pages.yml — nasazení GitHub Pages.
- .github/workflows/health-check.yml — pravidelná kontrola dostupnosti.

## Lokální použití
Vyžaduje Node.js 20+.

    npm test
    npm run sanitize -- "backups/stremio-backup.json" "data/catalog.json"
    npm run health

Sanitizer podporuje pole doplňků i obaly addons, installedAddons, items, data.addons a data.installedAddons.

Nestandardní veřejné URL lze po ruční kontrole doplnit do tools/public-url-overrides.json podle ID manifestu. Override musí být veřejná HTTPS URL bez query stringu, přihlašovacích údajů a soukromých tokenů.

## GitHub Pages
1. Otevři Settings → Pages.
2. V části Build and deployment nastav Source na GitHub Actions.
3. Workflow Deploy Stremio Addons Library publikuje web při pushi do main.
4. Adresa webu: https://akcizur.github.io/stremio-addons-library/

Workflow používá oprávnění pages: write a id-token: write deklarovaná přímo v YAML.

## Bezpečnost soukromých záloh
Surová záloha Stremio účtu může obsahovat e-mail, historii sledování a konfigurační URL s API klíči nebo tokeny. Nikdy ji necommituj do veřejného repozitáře.

- Složka backups/ je ignorovaná, kromě prázdného souboru .gitkeep.
- Sanitizer ponechává pouze známá veřejná pole manifestu.
- URL s query parametry, autentizací, podezřelým tokenem v cestě nebo nestandardní cestou odmítá.
- Veřejný export vynechá URL, které nesplní bezpečnostní kontrolu.

## Formát katalogu
Katalog používá objekt s poli schemaVersion, generatedAt, source a addons. Každý záznam obsahuje id, name, description, transportUrl a očištěný manifest.

## Poznámka k instalaci
Odkaz stremio:// předává URL manifestu aplikaci Stremio. Funkčnost závisí na instalaci aplikace a povolení externího protokolu v prohlížeči.
