import { selectFields } from "./data.js";

const MIME = {
  json: "application/json",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
  geojson: "application/geo+json",
};

function cell(value) {
  return value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : value;
}

function delimitedCell(value, separator) {
  let text = String(cell(value));
  // Spreadsheet applications can execute text that starts with a formula marker.
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  if (text.includes(separator) || /["\r\n]/.test(text))
    text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function geojson(rows, fields) {
  return {
    type: "FeatureCollection",
    features: rows.map((row) => {
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng))
        throw new Error(`Missing coordinates for ${row.name}.`);
      return {
        type: "Feature",
        ...(fields.includes("id") ? { id: row.id } : {}),
        geometry: { type: "Point", coordinates: [row.lng, row.lat] },
        properties: selectFields(row, fields),
      };
    }),
  };
}

export async function exportData(rows, fields, format) {
  if (!fields.length) throw new Error("Select at least one field.");
  let data;
  if (format === "json")
    data = JSON.stringify(rows.map((row) => selectFields(row, fields)));
  else if (format === "geojson") data = JSON.stringify(geojson(rows, fields));
  else if (format === "csv" || format === "tsv") {
    const separator = format === "csv" ? "," : "\t";
    data =
      [
        fields.join(separator),
        ...rows.map((row) =>
          fields
            .map((field) => delimitedCell(row[field], separator))
            .join(separator),
        ),
      ].join("\r\n") + "\r\n";
  } else throw new Error("Unknown download format.");
  return { data, mime: MIME[format] };
}
