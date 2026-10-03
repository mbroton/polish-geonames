import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { manifest } from "../../lib/site-data.js";

export function GET() {
  const rows = JSON.parse(
    gunzipSync(readFileSync(`public/data/${manifest.index}`)),
  );
  // Match the existing dot map, including longitude scaling at central Poland.
  const longitudeScale = Math.cos((52 * Math.PI) / 180);
  const scale = Math.min(1040 / (10.2 * longitudeScale), 740 / 6);
  const points = rows
    .map(({ lng, lat }) => {
      const x = (550 + (lng - 19.1) * longitudeScale * scale).toFixed(1);
      const y = (400 + (52 - lat) * scale).toFixed(1);
      return `<rect x="${x}" y="${y}" width="1.6" height="1.6"/>`;
    })
    .join("");
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="800" viewBox="0 0 1100 800"><g fill="#245fc5" fill-opacity="0.5">${points}</g></svg>`,
    {
      headers: { "Content-Type": "image/svg+xml" },
    },
  );
}
