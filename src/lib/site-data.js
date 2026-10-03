import { readFileSync } from "node:fs";

// HTML and downloads must describe the same validated snapshot.
export const manifest = JSON.parse(
  readFileSync("public/data/manifest.json", "utf8"),
);
if (!manifest.downloads)
  throw new Error("Run npm run data before building the website.");
