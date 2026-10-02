import {
  readFile,
  writeFile,
  mkdir,
  stat,
  cp,
  access,
  rm,
} from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PRESETS, FORMATS } from "../src/data.js";
import { exportData } from "../src/export.js";

const root = process.argv[2] || "public/data";
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const snapshotPath = join(root, "snapshots", manifest.version);
const previousPath = join(snapshotPath, "downloads.json");
const exporterHash = createHash("sha256")
  .update(await readFile("src/export.js"))
  .update(await readFile("src/data.js"))
  .update(await readFile("package-lock.json"))
  .digest("hex");
let downloads;
try {
  const saved = JSON.parse(await readFile(previousPath, "utf8"));
  const current = JSON.parse(
    await readFile(join(root, "downloads", "metadata.json"), "utf8"),
  );
  if (
    saved.exporter_hash !== exporterHash ||
    current.version !== manifest.version
  )
    throw new Error("Downloads need rebuilding.");
  downloads = saved.downloads;
  for (const preset of downloads)
    for (const file of preset.files) await access(join(root, file.path));
} catch {
  const rows = JSON.parse(
    gunzipSync(await readFile(join(root, manifest.records))),
  );
  await rm(join(root, "downloads"), { recursive: true, force: true });
  await mkdir(join(root, "downloads"), { recursive: true });
  downloads = [];
  for (const preset of PRESETS) {
    const selected = preset.types.length
      ? rows.filter((row) => preset.types.includes(row.type))
      : rows;
    const fields = preset.fields || manifest.fields;
    const files = [];
    for (const format of FORMATS) {
      const { data } = await exportData(selected, fields, format, manifest);
      const bytes = Buffer.from(data);
      const compressed = format !== "xlsx";
      const relative = `downloads/${preset.id}.${format}${compressed ? ".gz" : ""}`;
      await writeFile(
        join(root, relative),
        compressed ? gzipSync(bytes) : bytes,
      );
      files.push({
        format,
        path: relative,
        bytes: bytes.length,
        transfer_bytes: (await stat(join(root, relative))).size,
        compressed,
      });
      console.log(
        `${preset.id}.${format}: ${(bytes.length / 1e6).toFixed(1)} MB file, ${(files.at(-1).transfer_bytes / 1e6).toFixed(1)} MB transfer`,
      );
    }
    downloads.push({ id: preset.id, count: selected.length, fields, files });
  }
  await writeFile(
    previousPath,
    JSON.stringify({ exporter_hash: exporterHash, downloads }),
  );
}
manifest.downloads = downloads;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await cp(manifestPath, join(root, "downloads", "metadata.json"));
await writeFile(
  join(root, "downloads", "SOURCE.txt"),
  `${manifest.attribution}\n${manifest.license}\nSource export: ${manifest.source_export}\nSnapshot: ${manifest.version}\n\nID format changed in schema version 2: id is now the official PRNG ID. Old sequential IDs cannot be used to join releases.\n`,
);
