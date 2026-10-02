# Data and format reference

The website exports schema version **2**. The existing `id` field now holds the official PRNG ID. Version 1 IDs were sorted row numbers and cannot be used to join version 2 data.

## Basic fields

| Field      | Type           | PRNG source or meaning                                                              |
| ---------- | -------------- | ----------------------------------------------------------------------------------- |
| `id`       | integer        | `identyfikatorPRNG`, unchanged by filtering or sorting                              |
| `name`     | string         | `nazwaGlowna`                                                                       |
| `type`     | string         | `rodzajObiektu`: `miasto` → `city`, `wieś` → `village`; other values stay in Polish |
| `province` | string or null | `wojewodztwo` from the main point                                                   |
| `district` | string or null | `powiat` from the main point                                                        |
| `commune`  | string or null | `gmina` from the main point, without the `-gmina …` suffix                          |
| `lat`      | number         | WGS 84 latitude in decimal degrees                                                  |
| `lng`      | number         | WGS 84 longitude in decimal degrees                                                 |

Records are sorted by name, then ID. This order does not define identity. The main point is the source representation marked `punkt główny`; if none has that label, the first source representation is used. All source points remain available in `representations`. The raw GML geometry wrapper is not exported a second time.

## Extra fields

The website lists fields present in the current source. A missing selected value becomes `null` in JSON or GeoJSON and an empty cell in tabular formats.

| Field                          | PRNG source                                    | Value                                       |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| `status`                       | `statusNazwy`                                  | Original name status                        |
| `locality_code`                | `identyfikatorZewnetrzny`                      | External locality code, SIMC where supplied |
| `commune_code`                 | `identyfikatorGminy` in the main point         | TERYT commune code                          |
| `parent_name`                  | `nazwaMiejscowosciNadrzednej`                  | Parent locality name                        |
| `parent_code`                  | `identyfikatorMiejscowosciNadrzednej`          | Parent locality code                        |
| `iip_id`                       | `idiip`                                        | Full spatial information identifier         |
| `distinguishing_name`          | `elementRozrozniajacy`                         | Name element used to distinguish a record   |
| `generic_term`                 | `elementRodzajowy`                             | Generic name element                        |
| `category`                     | `kategoriaObiektu`                             | Source object category                      |
| `genitive`                     | `dopelniacz`                                   | Genitive form or ending                     |
| `adjective`                    | `przymiotnik`                                  | Adjective form                              |
| `notes`                        | `informacjeDodatkowe`                          | Source notes                                |
| `source_version`               | `wersjaObiektu`                                | Source version timestamp                    |
| `version_start`, `version_end` | `poczatekWersjiObiektu`, `koniecWersjiObiektu` | Version validity timestamps                 |
| `valid_from`, `valid_to`       | `waznaOd`, `waznaDo`                           | Name validity dates                         |
| `alternate_names`              | `nazwaOboczna`                                 | Array of names                              |
| `historical_names`             | `nazwaHistoryczna`                             | Array of names                              |
| `additional_names`             | `nazwaDodatkowa`                               | Array of source names and language details  |
| `endonyms`                     | `endonim`                                      | Array of local language names               |
| `exonyms`                      | `egzonim`                                      | Array of external language names            |
| `references`                   | `zrodloInformacji`                             | Array of source references                  |
| `representations`              | `reprezentacjaObiektu`                         | Array of source points                      |

Code fields are strings. For example, `"0244340"` must retain its initial zero. Source dates remain strings in their original form. Values of source categories, statuses, and types other than city/village remain in Polish.

Nested name fields use `name`, `language`, and `romanization` when supplied. References use `title`, `date`, and `publisher`. Point representations use `point_type`, `commune_code`, `commune`, `district`, `province`, `lat`, `lng`, and `projected_coordinates`. The latter preserves the original PL-1992 coordinate pair as text. Administrative names within a representation keep their original suffixes.

The snapshot builder sorts repeated value lists for consistent content comparison. Do not rely on list order. The original official ZIP remains the source for exact XML structure and ordering.

## Format rules

| Format  | Structure                                | Coordinates                                | Nested fields                    |
| ------- | ---------------------------------------- | ------------------------------------------ | -------------------------------- |
| JSON    | Array of records                         | Selected `lat` and `lng` fields            | Arrays and objects               |
| CSV     | Header row, comma separator, UTF-8, CRLF | Selected columns                           | JSON text in a quoted cell       |
| TSV     | Header row, tab separator, UTF-8, CRLF   | Selected columns                           | JSON text in a quoted cell       |
| GeoJSON | FeatureCollection of Point features      | Always `[longitude, latitude]` in geometry | Arrays and objects in properties |
| XLSX    | `Localities` and `Source` worksheets     | Selected columns                           | JSON text in a cell              |

Custom exports contain only the selected fields. GeoJSON always needs geometry, so its coordinates remain even if `lat` and `lng` are not selected as properties. Its top-level feature `id` is present only when the ID field is selected.

CSV and TSV quote cells with separators, newlines, or quotes. String cells that start with a spreadsheet formula marker receive a leading apostrophe. This prevents formula execution when a spreadsheet opens the file. JSON and GeoJSON retain the original text; XLSX stores text as string cells. The legacy Python TSV command applies the same text protection.

CSV and TSV files contain leading zeros, but spreadsheet applications can remove them during automatic type detection. Import code columns as text, or use XLSX, JSON, or GeoJSON.

Large custom exports need browser memory. Use a prepared file or reduce the selected fields on a device with limited memory. The full register includes source references and names, so it is much larger than the eight-field cities-and-villages dataset.

## Example

```json
{
  "id": 76566,
  "name": "Małachów",
  "type": "village",
  "province": "świętokrzyskie",
  "district": "konecki",
  "commune": "Końskie",
  "lat": 51.224092182361815,
  "lng": 20.2920359676266,
  "locality_code": "0244340"
}
```

This record illustrates the 30 September 2026 source. Future source updates can change its attributes while retaining the same PRNG ID.
