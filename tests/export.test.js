import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { matches } from "../src/data.js";
import { exportData } from "../src/export.js";
import { decodedBody } from "../src/compression.js";

const row = {
  id: 76566,
  name: "Małachów",
  type: "village",
  province: "świętokrzyskie",
  district: "konecki",
  commune: "Końskie",
  commune_code: "2605033",
  locality_code: "0244340",
  lat: 51.224092182361815,
  lng: 20.2920359676266,
  alternate_names: ["One", "Two"],
};

test("filters match independent place properties and distinguish no types from all types", () => {
  assert.equal(
    matches(row, {
      types: ["village"],
      query: "malachow",
      province: "świętokrzyskie",
    }),
    true,
  );
  assert.equal(matches(row, { types: ["city"] }), false);
  assert.equal(matches(row, { types: [] }), false);
  assert.equal(matches(row, {}), true);
  assert.equal(matches(row, { commune: "2605033" }), true);
  assert.equal(matches(row, { commune: "wrong" }), false);
  assert.equal(matches(row, { district: "other" }), false);
});

test("JSON preserves source ID, Polish text, leading zeros, and only selected fields", async () => {
  const { data } = await exportData(
    [row],
    ["name", "id", "locality_code", "alternate_names"],
    "json",
  );
  assert.deepEqual(JSON.parse(data), [
    {
      name: "Małachów",
      id: 76566,
      locality_code: "0244340",
      alternate_names: ["One", "Two"],
    },
  ]);
});

test("GeoJSON uses longitude first and retains geometry when coordinate fields are deselected", async () => {
  const { data } = await exportData([row], ["name"], "geojson");
  assert.deepEqual(JSON.parse(data), {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [20.2920359676266, 51.224092182361815],
        },
        properties: { name: "Małachów" },
      },
    ],
  });
});

test("CSV quotes commas, quotes and line breaks; spreadsheet formulas are text", async () => {
  const { data } = await exportData(
    [{ name: 'A,"B"\nC', note: "=1+1" }],
    ["name", "note"],
    "csv",
  );
  assert.equal(data, 'name,note\r\n"A,""B""\nC",\'=1+1\r\n');
});

test("TSV preserves tabs with quoting and missing optional values as empty cells", async () => {
  const { data } = await exportData(
    [{ name: "A\tB" }],
    ["name", "missing"],
    "tsv",
  );
  assert.equal(data, 'name\tmissing\r\n"A\tB"\t\r\n');
});

test("empty field selection is rejected", async () => {
  await assert.rejects(
    exportData([row], [], "json"),
    /Select at least one field/,
  );
});

test("data loads with both raw gzip files and server-decoded responses", async () => {
  for (const bytes of [
    gzipSync('[{"id":76566}]'),
    Buffer.from('[{"id":76566}]'),
  ]) {
    const body = await decodedBody(new Response(bytes));
    assert.deepEqual(await new Response(body).json(), [{ id: 76566 }]);
  }
  await assert.rejects(
    decodedBody(new Response("not found", { status: 404 })),
    /could not be loaded/,
  );
});
