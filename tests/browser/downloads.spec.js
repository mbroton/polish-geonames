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
  await page.goto("./");
  await expect(page.locator("#loading")).toHaveText("Selection ready");
});

test("builder starts from all types, filters names without accents, and resets", async ({
  page,
}) => {
  await expect(page.locator("#global-status")).toBeHidden();
  expect(await page.locator("input[name=type]:not(:checked)").count()).toBe(0);
  await page.locator("#search").fill("malachow");
  await expect(page.locator("#loading")).toHaveText("Selection ready");
  await page.getByRole("tab", { name: "Table", exact: true }).click();
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
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await page.locator("[data-fields=none]").click();
  await expect(page.locator("#download-custom")).toBeDisabled();
  await page.locator("input[name=field][value=id]").check();
  await page.locator("input[name=field][value=name]").check();
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
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator("#preview-table")).toContainText("76566");
  await page.locator(".advanced-fields summary").click();
  await page.locator("input[value=locality_code]").check();
  await expect(page.locator("#preview-table")).toContainText("0244340");
});

test("ready-made downloads are independent of custom filters and decompress correctly", async ({
  page,
}) => {
  await page.locator("[data-types=none]").click();
  await expect(page.locator("#match-count")).toHaveText("0");
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
    await expect(page.locator(".maplibregl-popup")).toContainText(
      "PRNG 7791",
      { timeout: 1_000 },
    );
  }).toPass({ timeout: 30_000 });
});

test("mobile layout fits the screen and supports keyboard preview tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Map", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Table", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#table-panel")).toBeVisible();
});
