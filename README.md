# Polish geonames

Polish cities, villages, and other named places, with administrative divisions and WGS 84 coordinates from the official Państwowy Rejestr Nazw Geograficznych (PRNG).

## Download

**[Download data on miejsca.app](https://miejsca.app/)**

The website gives you more download options:

- Ready-made datasets of cities, cities and villages, or all named places in the register.
- Custom files with the places and fields you need.
- JSON, CSV, TSV, and GeoJSON formats.

The website is available in Polish and English.

Through **v0.4.0**, this project provided annual snapshots of cities and villages in JSON and TSV. Those files remain in [GitHub Releases](https://github.com/mbroton/polish-geonames/releases). New downloads are available through the website.

## Data

Records include names, types, provinces, counties, communes, and point coordinates. Coordinates represent places, not boundaries or street addresses. See the [data and format reference](docs/DATA.md) for field details.

Website downloads use official PRNG IDs. Releases through v0.4.0 used row numbers; those IDs cannot be used to match records in new downloads.

## Source and license

Source: GUGiK, [Państwowy Rejestr Nazw Geograficznych (PRNG)](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-nazw-geograficznych-prng/). Converted by Polish geonames.

Data and this project are licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Keep the source and conversion attribution when you use or share the data.
