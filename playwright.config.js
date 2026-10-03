import { defineConfig } from "@playwright/test";

const basePath = (process.env.SITE_BASE_PATH || "").replace(/\/$/, "");
const previewURL = `http://127.0.0.1:4173${basePath}/`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || previewURL,
    headless: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Playwright owns this process; Astro must keep it in the foreground.
        command: "npm run preview -- --port 4173 --ignore-lock",
        url: previewURL,
        reuseExistingServer: !process.env.CI,
      },
});
