import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.SITE_URL || "https://miejsca.app",
  base: process.env.SITE_BASE_PATH || "/",
  output: "static",
  trailingSlash: "always",
  integrations: [sitemap()],
  vite: { worker: { format: "es" } },
});
