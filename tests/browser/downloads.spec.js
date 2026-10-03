import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

test.beforeEach(async ({ page }) => {
  // Browser checks must not depend on the public map tile service.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN49+HlfwAJXgPHxHvuMwAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.goto("./en/");
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("loading uses a spinner and the preview row reports the displayed record count", async ({
  page,
  context,
}) => {
  const records = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    name: `Example ${String(index + 1).padStart(2, "0")}`,
    type: "village",
    province: "Example province",
    district: "Example county",
    commune: "Example commune",
    commune_code: "0123456",
    status: "urzędowa",
    lat: 52,
    lng: 19,
  }));
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await context.route("**/index.json.gz", async (route) => {
    await pending;
    await route.fulfill({
      contentType: "application/gzip",
      body: gzipSync(JSON.stringify(records)),
    });
  });
  try {
    await page.reload();
    await expect(page.locator("#loading .loading-spinner")).toBeVisible();
    await expect(page.locator("#download-custom")).toBeDisabled();
    const spinner = await page.locator(".loading-spinner").boundingBox();
    const count = await page.locator("#match-count").boundingBox();
    expect(spinner.x).toBeGreaterThan(count.x + count.width);
    expect(
      Math.abs(spinner.y + spinner.height / 2 - count.y - count.height / 2),
    ).toBeLessThan(2);
  } finally {
    release();
  }
  await expect(page.locator("#download-custom")).toBeEnabled();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator(".selection-summary")).toHaveText("Records: 60");
  await expect(page.locator("#builder h2")).toHaveCount(0);
  await expect(page.locator(".preview-note")).toHaveCount(0);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-summary")).toHaveText("Shown: 50");
  await expect(page.locator("#preview-table tbody tr")).toHaveCount(50);
  const tabs = await page.locator(".preview-mode-tabs").boundingBox();
  const summary = await page.locator("#preview-summary").boundingBox();
  expect(summary.x).toBeGreaterThan(tabs.x + tabs.width);
  expect(
    Math.abs(summary.y + summary.height / 2 - tabs.y - tabs.height / 2),
  ).toBeLessThan(2);
  await page.getByRole("tab", { name: "Output", exact: true }).click();
  await expect(page.locator("#preview-summary")).toHaveText("Shown: 3");
  expect(
    JSON.parse(await page.locator("#output-preview").textContent()),
  ).toHaveLength(3);
  await expect(page.locator("#preview-summary")).toHaveAttribute(
    "title",
    "The download includes every matching record.",
  );
  await page.locator("#search").fill("Example 01");
  await expect(page.locator("#preview-summary")).toHaveText("Shown: 1");
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator("#preview-summary")).toHaveText("Shown: 1");
  await page.locator("#search").fill("no such record");
  await expect(page.locator("#preview-summary")).toHaveText("Shown: 0");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#download-custom")).toBeDisabled();
});

test("a failed data load stops the spinner and shows an error", async ({
  page,
  context,
}) => {
  await context.route("**/index.json.gz", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.reload();
  await expect(page.locator("#global-status")).toContainText(
    "The data file could not be loaded.",
  );
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#download-custom")).toBeDisabled();
});

test("builder starts from all types, filters names without accents, and resets", async ({
  page,
}) => {
  await expect(page.locator("#global-status")).toBeHidden();
  const total = await page
    .getByRole("contentinfo")
    .locator("#total-count")
    .textContent();
  expect(await page.locator("input[name=type]:not(:checked)").count()).toBe(0);
  await page.locator("#search").fill("malachow");
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await expect(page.locator("#preview-table")).toContainText("Małachów");
  await page.locator("[data-types=none]").click();
  await expect(page.locator("#match-count")).toHaveText("0");
  await expect(
    page.getByRole("contentinfo").locator("#total-count"),
  ).toHaveText(total);
  await expect(page.locator("#download-custom")).toBeDisabled();
  await page.locator("#reset-filters").click();
  await expect(page.locator("#download-custom")).toBeEnabled();
  await expect(page.locator("#search")).toHaveValue("");
});

test("custom download uses the selected fields in all four formats", async ({
  page,
}) => {
  await page.locator("#search").fill("malachow");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.locator("[data-fields=none]").click();
  await expect(page.locator("#download-custom")).toBeDisabled();
  await page.locator("input[name=field][value=id]").check();
  await page.locator("input[name=field][value=name]").check();
  await expect(page.locator("#preview-table th")).toHaveText(["id", "name"]);
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.locator("#format option")).toHaveText([
    "JSON",
    "CSV",
    "TSV",
    "GeoJSON",
  ]);
  for (const format of ["json", "csv", "tsv", "geojson"]) {
    await page.locator("#format").selectOption(format);
    await expect(page.locator("#download-custom")).toBeEnabled();
    const pending = page.waitForEvent("download");
    await page.locator("#download-custom").click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const bytes = await readFile(await download.path());
    if (format === "json") {
      const rows = JSON.parse(bytes);
      expect(rows).toContainEqual({ id: 76566, name: "Małachów" });
      expect(Object.keys(rows[0])).toEqual(["id", "name"]);
    } else if (format === "geojson") {
      const data = JSON.parse(bytes);
      const place = data.features.find((feature) => feature.id === 76566);
      expect(place.geometry.coordinates).toEqual([
        20.2920359676266, 51.224092182361815,
      ]);
      expect(place.properties).toEqual({ id: 76566, name: "Małachów" });
    } else {
      expect(bytes.toString()).toContain(
        `76566${format === "csv" ? "," : "\t"}Małachów`,
      );
    }
  }
});

test("extra source fields load on demand and preserve locality codes", async ({
  page,
}) => {
  await page.locator("#search").fill("malachow");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.locator(".advanced-fields summary").click();
  await page.locator("input[value=locality_code]").check();
  await expect(page.locator("#preview-table")).toContainText("0244340");
});

test("prepared downloads wait for scripts, ignore custom filters, and decompress correctly", async ({
  page,
}) => {
  await page.locator("[data-types=none]").click();
  await expect(page.locator("#match-count")).toHaveText("0");
  let release;
  const scriptReady = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/downloads.*.js", async (route) => {
    await scriptReady;
    await route.continue();
  });
  const button = page.getByRole("button", {
    name: "Download Cities & villages as JSON",
    exact: true,
  });
  try {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Download", exact: true })
      .click();
    await expect(button).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "Cities & villages file format" }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const rows = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(rows.find((row) => row.id === 76566).name).toBe("Małachów");
});

test("Map opens the builder and About preserves the full overview and selection", async ({
  page,
}) => {
  await page.goto("./en/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Map", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle(
    "miejsca.app | Places in Poland and their coordinates",
  );
  await expect(page.locator("#builder")).toBeVisible();
  await expect(page.locator("#about")).toBeHidden();
  await expect(page.locator("#downloads")).toBeHidden();
  await navigation.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveTitle("About | miejsca.app");
  await expect(page.locator("#about")).toBeVisible();
  await expect(page.locator("#builder")).toBeHidden();
  await expect(page.locator("#overview-map")).toBeVisible();
  await expect(page.locator("#overview-map")).toHaveJSProperty(
    "naturalWidth",
    1100,
  );
  const wholeMap = await page.locator("#overview-map").getAttribute("src");

  await navigation.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator("#search").fill("malachow");
  await page.locator("[data-types=none]").click();
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.locator("input[name=field][value=lat]").uncheck();
  await page.locator("#format").selectOption("csv");
  await expect(page.locator("#match-count")).toHaveText("0");
  await navigation.getByRole("link", { name: "Download", exact: true }).click();
  await expect(page.locator("#downloads")).toBeVisible();
  await expect(page.locator("#builder")).toBeHidden();

  await page.goBack();
  await expect(page.locator("#builder")).toBeVisible();
  await expect(page.locator("#search")).toHaveValue("malachow");
  await expect(page.locator("#format")).toHaveValue("csv");
  await expect(page.locator("input[name=field][value=lat]")).not.toBeChecked();
  await expect(page.locator("#match-count")).toHaveText("0");
  await page.goBack();
  await expect(page.locator("#about")).toBeVisible();
  expect(await page.locator("#overview-map").getAttribute("src")).toBe(
    wholeMap,
  );
  await page.goForward();
  await expect(page.locator("#builder")).toBeVisible();
  await expect(page.locator("#match-count")).toHaveText("0");
});

test("direct Download links survive a reload and all pages fit a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./en/download/");
  await page.reload();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Download", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#prepared-downloads")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#about")).toBeHidden();
  await expect(page.locator("#builder")).toBeHidden();
  for (const name of ["Download", "Map", "About"]) {
    await navigation.getByRole("link", { name, exact: true }).click();
    await expect(
      navigation.getByRole("link", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("direct About and Map links survive a reload", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await page.goto("./en/about/");
  await page.reload();
  await expect(page.locator("#about")).toBeVisible();
  await expect(page).toHaveTitle("About | miejsca.app");
  await expect(
    navigation.getByRole("link", { name: "About", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goto("./en/");
  await page.reload();
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#builder")).toBeVisible();
  await expect(page).toHaveTitle(
    "miejsca.app | Places in Poland and their coordinates",
  );
  await expect(
    navigation.getByRole("link", { name: "Map", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#map")).toHaveAttribute("aria-busy", "false");
});

test("map renders points and does not change the data selection when moved", async ({
  page,
}) => {
  await page.locator("#map").scrollIntoViewIfNeeded();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("aria-busy", "false");
  const count = await page.locator("#match-count").textContent();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator("#match-count")).toHaveText(count);
  await expect(page.locator("#map-error")).toBeHidden();
  await page.locator("#search").fill("boguszowice");
  await page.locator("#province").selectOption("śląskie");
  await page.locator("#district").selectOption("Rybnik");
  await page.locator("#commune").selectOption("2473011");
  await page.locator("#name-status").selectOption("urzędowa");
  await expect(page.locator("#match-count")).toHaveText("1");
  await page.locator("#fit-map").click();
  await expect(async () => {
    await page.locator(".maplibregl-canvas").click();
    await expect(page.locator(".maplibregl-popup")).toContainText("PRNG 7791", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
});

test("mobile tabs keep Map / Preview separate from Table / Output", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.locator(".advanced-fields summary").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Map", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Preview", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#table-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Table", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Output", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#output-panel")).toBeVisible();
  await expect(page.locator("#table-panel")).toBeHidden();
  await expect(
    page.getByRole("tab", { name: "Preview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.locator("#output-panel")).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#output-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Output", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#table-panel")).toBeVisible();
});

test("phone filters fold away while keeping the map selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#filters")).toBeHidden();
  await expect(page.locator("#map")).toBeInViewport();
  await page.locator("#filter-sidebar > summary").click();
  await page.locator("#search").fill("malachow");
  await expect(page.locator("#filter-summary")).toHaveText("1 active");
  await page.locator("#filter-sidebar > summary").click();
  await expect(page.locator("#filters")).toBeHidden();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await expect(page.locator("#download-custom")).toBeEnabled();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.locator("#filters")).toBeVisible();
  await expect(page.locator("#search")).toHaveValue("malachow");
  await page.locator("#reset-filters").click();
  await expect(page.locator("#search")).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#filter-summary")).toHaveText("All places");
});

test("footer pages explain the source and license without losing the selection", async ({
  page,
}) => {
  await page.locator("#search").fill("malachow");
  await page.locator("#format").selectOption("csv");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Data source", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data source", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#source")).toContainText("WGS 84");
  await footer.getByRole("link", { name: "License", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "License and attribution" }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download the source and attribution note" })
    .click();
  const download = await pending;
  const note = await readFile(await download.path(), "utf8");
  expect(note).toContain("GUGiK");
  expect(note).toContain("https://creativecommons.org/licenses/by/4.0/");
  await page.goBack();
  await expect(page.locator("#source")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#search")).toHaveValue("malachow");
  await expect(page.locator("#format")).toHaveValue("csv");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["source", "license"]) {
    await page.goto(`./en/${route}/`);
    await page.reload();
    await expect(page.locator(`[data-page="${route}"]`)).toBeVisible();
    await expect(footer.locator(`[data-route="${route}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
