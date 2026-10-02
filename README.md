# Polish geonames

Download Polish cities, villages, and other localities with official PRNG IDs, administrative divisions, and WGS 84 coordinates. Use a prepared dataset or build a file with the places and fields you need.

**[Open the website](https://mbroton.github.io/polish-geonames/)** — available after the first approved deployment. This branch contains the website for review. Publication is disabled by default.

[Earlier annual releases](https://github.com/mbroton/polish-geonames/releases) remain available. Their IDs differ from the new data; see [ID migration](#id-migration).

## Downloads

The top menu has three views:

- **Map:** the map and custom download builder. Filter places, inspect the Table or Output preview, and choose Columns and a file format for your download.
- **Download:** prepared datasets in all five formats.
- **About:** a brief introduction and a dot map of the full register.

The website opens directly on the map. Switching views keeps the custom selection. Direct links such as `#/about` and `#/download` work on GitHub Pages; existing `#/map` links still open the builder. The About overview always shows all records, independent of the custom filters.

The footer shows the locality count and an “Up to date as of” date from the last successful source check, alongside the source, license, GitHub, and author links. The Data source page gives the source export date and snapshot details.

There are two separate download paths:

```text
Official PRNG locality register
               |
       Validated snapshot
               |
        +------+------------------+
        |                         |
 Prepared downloads        Custom download
        |                         |
 Choose a dataset          Start with the full register
 Choose a format           Filter places and select fields
        |                  Preview map, table, or output
        |                  Choose a format
        +------------+------------+
                     |
        JSON / CSV / TSV / GeoJSON / XLSX
```

| Prepared dataset  | Places                                            | Fields                |
| ----------------- | ------------------------------------------------- | --------------------- |
| Cities            | Every place with city status                      | 8 basic fields        |
| Cities & villages | The scope of the earlier releases                 | 8 basic fields        |
| All localities    | Every source locality type, including named parts | All source attributes |

The custom builder starts with **all locality types**. Filter by name, type, province, county, commune, or name status. Select basic or extra source fields. The map shows the same selection as the download; moving the map does not change the selection.

On the Map page, place filters sit beside the results. Columns, format, and download controls sit below the map or preview. On phones, expand the Filters row to change the selection; the row shows how many filters are active.

Coordinates describe representative points, not boundaries or street addresses. See the [field and format reference](docs/DATA.md) for exact output rules.

## Run locally

Use Node.js 22.12 or later and Python 3.10 or later. No Python packages are required.

```sh
npm ci
npm run data
npm run dev
```

Open the local address printed by Vite. The data command downloads the official ZIP, validates the register, and prepares all 15 downloads. The full workbook is large, so the first build takes longer than later local builds. Generated data is excluded from Git.

To use an existing **official GML ZIP**:

```sh
python3 scripts/build_data.py --source /path/to/PRNG_MIEJSCOWOSCI_GML.zip
node scripts/build_downloads.js
npm run dev
```

Build and inspect the static site:

```sh
npm run build
npm run preview
```

The `dist/` directory contains the complete website and data. It can be served from a GitHub Pages project path or a domain root. The browser performs custom exports in a worker. It loads extra source details only when selected fields need them. Ready-made files are prepared during the build.

Text files use gzip during transfer. The download buttons save normal `.json`, `.csv`, `.tsv`, or `.geojson` files. Direct `.gz` links must be decompressed by the caller. XLSX files need no extra decompression. A current browser with Web Workers and `DecompressionStream` is required for the builder. Map display also requires WebGL; the table and exports can work without the map.

## Source and updates

The source is the [GUGiK locality register](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-nazw-geograficznych-prng/), fetched from its [official GML ZIP](https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_GML.zip). GML retains repeated names, references, and point representations which do not fit cleanly into spreadsheet cells. The parser maps these source attributes to English field names.

The reviewed source export from 30 September 2026 contains 124,247 records in 25 types. Of these, 1,026 are cities and 43,638 are villages. These counts are a source snapshot, not fixed product limits.

The update workflow checks daily at **05:37 UTC** and also supports manual runs. GitHub can delay scheduled runs or disable them in inactive repositories. The website shows the source export date and last successful check, and warns when a check is more than three days old.

```text
Fetch official ZIP -> Parse -> Validate -> Compare record content
                                 |                 |
                              Failure       +------+------+
                                 |          |             |
                         Keep live site  Unchanged      Changed
                                            |             |
                                      Update check    New snapshot
                                            +------+------+
                                                   |
                                     Build and validate static site
                                                   |
                                          Publish with Pages
```

IDs, coordinates, source fields, national coverage, minimum counts, and unexpected record loss are checked before publication. An older upstream export is rejected. A failed check leaves the deployed site intact. Record order alone does not create a new snapshot. When records are unchanged, the snapshot URL and source date stay the same; only check metadata changes.

The `data` branch stores the last validated state and the **latest 30 changed snapshots**. Each snapshot has full compressed JSON and source metadata. Older snapshot URLs expire when retention removes them. Change the limit with `--keep-snapshots`; the publication workflow rejects sites above 900 MB. The Git history of the data branch can still grow, so storage needs periodic review. Earlier GitHub releases are not changed or deleted.

The current metadata is at `data/manifest.json`. It lists download paths, counts, fields, source and check dates, content hash, and retained snapshot paths. `data/downloads/SOURCE.txt` contains attribution; `data/downloads/metadata.json` contains the same current metadata. Prepared download paths stay constant across updates. Use a snapshot path to pin source data while it is retained.

## ID migration

**This is a breaking data change.** The existing `id` field now contains `identyfikatorPRNG`, the official source ID. Sorting, filtering, or adding another locality does not renumber it. No replacement ID field is added.

Releases through **v0.4.0** assigned row numbers after sorting. Do not join those IDs to new exports. Re-import the data with PRNG IDs. Existing saved references need a reviewed mapping from their old record details or original source export; a place name alone is not a reliable match.

Upstream can still edit, remove, or replace a record. This project preserves the supplied ID and does not invent an ID when the source is incomplete. External locality and commune codes are optional source attributes, stored as strings to preserve leading zeros.

## Review and publication

Nothing needs to be published to review the website locally. The publishing workflow cannot run until both conditions hold:

1. The code is on `main` after review and merge.
2. The repository variable `ENABLE_WEBSITE_PUBLISH` is set to `true`.

After approval, configure **Settings → Pages → Build and deployment → GitHub Actions**, set that variable, and run **Check PRNG and publish website**. The workflow saves generated state to `data` and deploys a Pages artifact. It does not commit to `main` or create GitHub releases. Leave the variable unset to keep publication disabled.

The site uses relative asset paths. A custom domain can be connected later through the Pages settings without changing the application.

## Checks

```sh
npm test
npx playwright install chromium
npm run build
npm run test:browser
```

Browser tests need generated data. CI uses a small fixed source fixture. Local review should use the real source. CI checks all five export formats, source IDs and leading zeros, filters, Reset, map loading, mobile layout, and keyboard tabs. Update tests verify unchanged snapshots, validation failures, and storage on the data branch without changing `main`.

For a small local test build, run the following instead of `npm run data`. **It replaces the generated local dataset.**

```sh
python3 scripts/build_fixture.py
node scripts/build_downloads.js
```

The original parser command is still supported:

```sh
python3 parser.py PRNG_MIEJSCOWOSCI_GML.xml polish-geonames.json
python3 parser.py PRNG_MIEJSCOWOSCI_GML.xml polish-geonames.tsv
python3 parser.py PRNG_MIEJSCOWOSCI_GML.xml all-localities.json --all
```

The default CLI export keeps cities, villages, and the eight basic fields. `--all` includes every locality type and source attribute. Both use official PRNG IDs.

## Attribution and license

Data: GUGiK, Państwowy Rejestr Nazw Geograficznych (PRNG), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted by Polish geonames. Keep this attribution when using or sharing the data. The website links to a source note, and XLSX exports include a source sheet.

Map tiles and map data: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). No map account or API key is needed. Map tiles are the only external service used by the browser; exports use files served with this website.

This work retains the repository's [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) license. Bundled dependencies retain their own licenses.
