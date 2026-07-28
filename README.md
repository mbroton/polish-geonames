# Polish geonames

A small, ready-to-use dataset of Polish **cities** and **villages**, with administrative divisions and WGS 84 coordinates.

It is derived from the official [Państwowy Rejestr Nazw Geograficznych (PRNG)](https://dane.gov.pl/pl/dataset/780,panstwowy-rejestr-nazw-geograficznych-prng) and deliberately keeps only the fields useful for common lookup and geocoding work.

## Download

Download the current JSON or TSV file from the [releases](https://github.com/mbroton/polish-geonames/releases).

## Dataset

| Field | Type | Description |
| --- | --- | --- |
| `id` | integer | Stable only within a particular release; assigned after sorting by name. |
| `name` | string | Locality name. |
| `type` | string | `city` or `village`. |
| `province` | string | Voivodeship (*województwo*). |
| `district` | string | County (*powiat*). |
| `commune` | string | Commune (*gmina*). |
| `lat` | float | Latitude, WGS 84. |
| `lng` | float | Longitude, WGS 84. |

### 2026 release

| Source | Value |
| --- | --- |
| Valid as of | 01/01/2026 |
| Dataset export | 16/01/2026 |
| Entries | 44,664 |
| Source format | GML / XML |
| Source licence | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |

The source register is updated continuously and verified annually by the Polish Head Office of Geodesy and Cartography. This repository publishes an annual snapshot.

## Regenerating the files

The checked-in parser reads a PRNG **miejscowości** GML export and writes either JSON or TSV:

```shell
python3 parser.py PRNG_MIEJSCOWOSCI_GML.xml polish-geonames.json
python3 parser.py PRNG_MIEJSCOWOSCI_GML.xml polish-geonames.tsv
```

The parser keeps only records whose official type is `miasto` or `wieś`, translates field names to English, validates the selected data, sorts it by locality name, and assigns sequential IDs.

## License

This work is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
