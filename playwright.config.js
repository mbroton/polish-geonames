import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
});
