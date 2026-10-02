import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

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
  await page.goto("./#/map");
  await expect(page.locator("#loading")).toHaveText("Selection ready");
});

test("builder starts from all types, filters names without accents, and resets", async ({
  page,
}) => {
  await expect(page.locator("#global-status")).toBeHidden();
  expect(await page.locator("input[name=type]:not(:checked)").count()).toBe(0);
  await page.locator("#search").fill("malachow");
  await expect(page.locator("#loading")).toHaveText("Selection ready");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await expect(page.locator("#preview-table")).toContainText("Małachów");
  await page.locator("[data-types=none]").click();
  await expect(page.locator("#match-count")).toHaveText("0");
  await expect(page.locator("#download-custom")).toBeDisabled();
  await page.locator("#reset-filters").click();
  await expect(page.locator("#download-custom")).toBeEnabled();
  await expect(page.locator("#search")).toHaveValue("");
});

test("custom download uses the selected fields in all five formats", async ({
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
  for (const format of ["json", "csv", "tsv", "geojson", "xlsx"]) {
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
    } else if (format === "xlsx") {
      const book = XLSX.read(bytes);
      expect(book.SheetNames).toEqual(["Localities", "Source"]);
      expect(XLSX.utils.sheet_to_json(book.Sheets.Localities)).toContainEqual({
        id: 76566,
        name: "Małachów",
      });
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

test("ready-made downloads are independent of custom filters and decompress correctly", async ({
  page,
}) => {
  await page.locator("[data-types=none]").click();
  await expect(page.locator("#match-count")).toHaveText("0");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Download", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("link", {
      name: "Download Cities & villages as JSON",
      exact: true,
    })
    .click();
  const download = await pending;
  const rows = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(rows.find((row) => row.id === 76566).name).toBe("Małachów");
});

test("Home shows all localities and navigation preserves the custom selection", async ({
  page,
}) => {
  await page.goto("./");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#builder")).toBeHidden();
  await expect(page.locator("#downloads")).toBeHidden();
  await expect(page.locator("#overview-map")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const wholeMap = await page
    .locator("#overview-map")
    .evaluate((canvas) => canvas.toDataURL());
  const caption = await page.locator("#overview-caption").textContent();

  await navigation.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.locator("#loading")).toHaveText("Selection ready");
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
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#overview-caption")).toHaveText(caption);
  expect(
    await page
      .locator("#overview-map")
      .evaluate((canvas) => canvas.toDataURL()),
  ).toBe(wholeMap);
  await page.goForward();
  await expect(page.locator("#builder")).toBeVisible();
  await expect(page.locator("#match-count")).toHaveText("0");
});

test("direct Download links survive a reload and all pages fit a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/download");
  await page.reload();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Download", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#prepared-downloads")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#home")).toBeHidden();
  await expect(page.locator("#builder")).toBeHidden();
  for (const name of ["Download", "Home", "Map"]) {
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
    await page.goto(`./#/${route}`);
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
