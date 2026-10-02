import { selectFields } from "./data.js";

const MIME = {
  json: "application/json",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
  geojson: "application/geo+json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

export async function exportData(rows, fields, format, metadata = {}) {
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
  } else if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(
      [fields, ...rows.map((row) => fields.map((field) => cell(row[field])))],
      { dense: true },
    );
    sheet["!autofilter"] = { ref: sheet["!ref"] };
    XLSX.utils.book_append_sheet(workbook, sheet, "Localities");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Source", metadata.attribution || "PRNG / GUGiK"],
        ["Source export", metadata.source_export || ""],
        ["Snapshot", metadata.version || ""],
        [
          "License",
          metadata.license || "https://creativecommons.org/licenses/by/4.0/",
        ],
        ["Nested fields", "Arrays and objects are stored as JSON text."],
      ]),
      "Source",
    );
    data = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      compression: true,
      bookSST: true,
    });
  } else throw new Error("Unknown download format.");
  return { data, mime: MIME[format] };
}
