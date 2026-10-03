# Development and publication

Setup, data updates, checks, and deployment for contributors.

## Run locally

Use Node.js 22.12 or later, npm 10.8.2 or later, and Python 3.10 or later. No Python packages are required.

```sh
npm ci
npm run data
npm run dev
```

Open the local address printed by Astro. The data command downloads the official ZIP, validates the register, and prepares all 12 downloads. Generated data is excluded from Git.

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

The `dist/` directory contains the complete static website and data. Astro builds both languages from the same validated snapshot. Download lists, counts, source dates, snapshot links, and the About dot map work without JavaScript. The browser performs custom exports in a worker and loads extra source details only when selected fields need them. Content pages do not load the builder or its locality index.

The build includes page titles, descriptions, canonical URLs, language alternatives, a sitemap, and dataset structured data. Builds use `https://miejsca.app` and the root path `/` by default. `SITE_URL` and `SITE_BASE_PATH` can override these values when testing another origin or hosting path.

Text files use gzip during transfer. The download buttons save normal `.json`, `.csv`, `.tsv`, or `.geojson` files. Direct `.gz` links must be decompressed by the caller. A current browser with Web Workers and `DecompressionStream` is required for the builder. Map display also requires WebGL; the table and exports can work without the map.

## Source and updates

The source is the [GUGiK locality register](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-nazw-geograficznych-prng/), fetched from its [official GML ZIP](https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_GML.zip). GML retains repeated names, references, and point representations which do not fit cleanly into spreadsheet cells. The parser maps these source attributes to English field names.

The publishing workflow runs on pushes to `main`, daily at **05:37 UTC**, and on manual runs from `main`. GitHub can delay scheduled runs or disable them in inactive repositories. The website shows the source export date and last successful check, and warns when a check is more than three days old.

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
                                         Publish to Cloudflare
```

IDs, coordinates, source fields, national coverage, minimum counts, and unexpected record loss are checked before publication. An older upstream export is rejected. A failed check leaves the deployed site intact. Record order alone does not create a new snapshot. When records are unchanged, the snapshot URL and source date stay the same; only check metadata changes.

After a successful deployment, the `data` branch stores the published state and the **latest 30 changed snapshots**. Each snapshot has full compressed JSON and source metadata. Older snapshot URLs expire when retention removes them. Change the limit with `--keep-snapshots`. The workflow checks Cloudflare's limits of 25 MiB per file and 20,000 files before deployment. The Git history of the data branch can still grow, so storage needs periodic review. Earlier GitHub releases are not changed or deleted.

The current metadata is at `data/manifest.json`. It lists download paths, counts, fields, source and check dates, content hash, and retained snapshot paths. `data/downloads/SOURCE.txt` contains attribution; `data/downloads/metadata.json` contains the same current metadata. Prepared download paths stay constant across updates. Use a snapshot path to pin source data while it is retained.

## Review and publication

Cloudflare Workers Static Assets serves the complete `dist/` directory at `https://miejsca.app`. The project has no Worker script. Pages, processed data, and prepared downloads are static files; custom exports run in the browser.

For a manual deployment, authenticate with `npx wrangler login`, generate real source data with `npm run data`, and run the checks below. Do not publish the test fixture. Then run:

```sh
npm run deploy
```

Wrangler builds the website before upload. `wrangler.jsonc` defines the account, asset directory, and custom domain. Cloudflare manages the domain's DNS record and HTTPS certificate.

GitHub Actions uses the `CLOUDFLARE_API_TOKEN` repository secret. Create a Cloudflare account API token with the **Edit Cloudflare Workers** template, scoped to this account and the `miejsca.app` zone. Store it using the interactive prompt:

```sh
gh secret set CLOUDFLARE_API_TOKEN --repo mbroton/polish-geonames
```

The account ID is in `wrangler.jsonc`. The workflow checks for the token before downloading data. It restores the last published snapshot, checks the official source, builds the site, and runs the browser tests before deployment. A data or test failure leaves the live website unchanged. After deployment, it checks the public pages and saves the published state to `data`. Generated data is never committed to `main`.

Pushes to other branches and pull requests run checks with a fixed fixture and cannot publish the site. To deploy `main` manually through GitHub Actions:

```sh
gh workflow run update-data.yml --ref main --repo mbroton/polish-geonames
```

## Checks

```sh
npm test
npx playwright install chromium
npm run build
npm run test:browser
```

Browser tests need generated data. Branch and pull request checks use a small fixed source fixture and the production URL settings. The publishing workflow and local review use the real source. Checks cover all four export formats, source IDs and leading zeros, filters, Reset, map loading, mobile layout, keyboard tabs, language selection, saved selections, and HTML without JavaScript. Update tests verify unchanged snapshots, validation failures, and storage on the data branch without changing `main`.

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
