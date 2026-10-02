export const BASIC_FIELDS = [
  "id",
  "name",
  "type",
  "province",
  "district",
  "commune",
  "lat",
  "lng",
];
export const FORMATS = ["json", "csv", "tsv", "geojson", "xlsx"];
export const PRESETS = [
  {
    id: "cities",
    name: "Cities",
    description: "Every city and town with official city status.",
    types: ["city"],
    fields: BASIC_FIELDS,
  },
  {
    id: "cities-villages",
    name: "Cities & villages",
    description: "The original dataset, now with stable source IDs.",
    types: ["city", "village"],
    fields: BASIC_FIELDS,
  },
  {
    id: "all-localities",
    name: "All localities",
    description:
      "Every locality type, including named parts. All source fields.",
    types: [],
    fields: null,
  },
];

export const FIELD_INFO = {
  id: ["PRNG ID", "Official record ID. It does not depend on sort order."],
  name: ["Name", "Main locality name, with Polish characters."],
  type: [
    "Locality type",
    "city and village use English names. Other types retain the source value.",
  ],
  province: ["Province", "Województwo."],
  district: ["County", "Powiat."],
  commune: ["Commune", "Gmina."],
  lat: ["Latitude", "WGS 84, decimal degrees."],
  lng: ["Longitude", "WGS 84, decimal degrees."],
  status: [
    "Name status",
    "Official, standardized, or non-standardized name, as recorded in PRNG.",
  ],
  locality_code: [
    "Locality code",
    "External locality code (SIMC where supplied). Leading zeros are preserved.",
  ],
  commune_code: [
    "Commune code",
    "Official TERYT commune code. Leading zeros are preserved.",
  ],
  parent_name: [
    "Parent locality",
    "Name of the locality that this part belongs to.",
  ],
  parent_code: [
    "Parent locality code",
    "Official code of the parent locality.",
  ],
  alternate_names: ["Alternate names", "Other names recorded in the source."],
  historical_names: [
    "Historical names",
    "Earlier names recorded in the source.",
  ],
  additional_names: [
    "Additional names",
    "Names with language and romanization, where supplied.",
  ],
  endonyms: ["Endonyms", "Local language names."],
  exonyms: ["Exonyms", "Names used in other languages."],
  distinguishing_name: [
    "Distinguishing name",
    "Source name used to distinguish the locality.",
  ],
  generic_term: ["Generic term", "Type term that forms part of the name."],
  category: ["Source category", "PRNG object category."],
  genitive: [
    "Genitive form",
    "Polish genitive form or ending supplied by PRNG.",
  ],
  adjective: ["Adjective", "Polish adjective derived from the locality name."],
  notes: ["Source notes", "Additional information supplied by PRNG."],
  source_version: [
    "Source version date",
    "Version timestamp of the official record.",
  ],
  version_start: ["Version start", "Start of this record version."],
  version_end: ["Version end", "End of this record version, if supplied."],
  valid_from: ["Valid from", "Date from which the name is valid."],
  valid_to: ["Valid to", "Date until which the name is valid."],
  iip_id: ["IIP identifier", "Full source spatial information identifier."],
  representations: [
    "All source points",
    "All point representations, source administrative names, WGS 84 coordinates, and original PL-1992 coordinate pairs.",
  ],
  references: [
    "Source references",
    "Titles, dates, and publishers of source documents.",
  ],
};

export const TYPE_LABELS = { city: "City / town", village: "Village" };
export const typeLabel = (type) => TYPE_LABELS[type] || type;
export const fold = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase();

export function matches(row, filter = {}) {
  return (
    (filter.types == null || filter.types.includes(row.type)) &&
    (!filter.province || row.province === filter.province) &&
    (!filter.district || row.district === filter.district) &&
    (!filter.commune || row.commune_code === filter.commune) &&
    (!filter.status || row.status === filter.status) &&
    (!filter.query || fold(row.name).includes(fold(filter.query)))
  );
}

export function selectFields(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}
