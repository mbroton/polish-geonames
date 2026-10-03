import { matches, selectFields } from "./data.js";
import { exportData } from "./export.js";
import { decodedBody } from "./compression.js";

let index = [];
let manifest;
let base;
let complete;

async function readCompressed(path) {
  const response = await fetch(new URL(path, base));
  const stream = await decodedBody(response);
  return new Response(stream).json();
}

function fullRecords() {
  complete ??= readCompressed(manifest.records).catch((error) => {
    complete = null;
    throw error;
  });
  return complete;
}

self.onmessage = async ({ data: message }) => {
  const { request, action } = message;
  try {
    if (action === "load") {
      manifest = message.manifest;
      base = message.base;
      index = await readCompressed(manifest.index);
      self.postMessage({
        request,
        action,
        provinces: [
          ...new Set(index.map((row) => row.province).filter(Boolean)),
        ].sort(),
      });
      return;
    }
    if (action === "lookup") {
      self.postMessage({
        request,
        action,
        row: index.find((row) => row.id === message.id),
      });
      return;
    }
    const fields = message.fields;
    const needsDetails = fields.some(
      (field) => !manifest.core_fields.includes(field),
    );
    const records = needsDetails ? await fullRecords() : index;
    const selected = records.filter((row) => matches(row, message.filter));
    if (action === "export") {
      const { data, mime } = await exportData(selected, fields, message.format);
      self.postMessage({
        request,
        action,
        blob: new Blob([data], { type: mime }),
        count: selected.length,
      });
    } else {
      const points = new Float64Array(selected.length * 3);
      selected.forEach((row, i) =>
        points.set([row.lng, row.lat, row.id], i * 3),
      );
      const scoped = index.filter(
        (row) =>
          !message.filter.province || row.province === message.filter.province,
      );
      const communes = new Map(
        scoped
          .filter(
            (row) =>
              !message.filter.district ||
              row.district === message.filter.district,
          )
          .map((row) => [row.commune_code, row.commune]),
      );
      const nameCounts = new Map();
      for (const name of communes.values())
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      self.postMessage(
        {
          request,
          action,
          count: selected.length,
          points,
          rows: selected.slice(0, 50).map((row) => selectFields(row, fields)),
          geoRows: selected.slice(0, 3),
          districts: [
            ...new Set(scoped.map((row) => row.district).filter(Boolean)),
          ].sort(),
          communes: [...communes]
            .filter(([code, name]) => code && name)
            .map(([code, name]) => [
              code,
              nameCounts.get(name) > 1 ? `${name} (TERYT ${code})` : name,
            ])
            .sort((a, b) => a[1].localeCompare(b[1], "pl")),
        },
        [points.buffer],
      );
    }
  } catch (error) {
    self.postMessage({ request, action, error: error.message });
  }
};
