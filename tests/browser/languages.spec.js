import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("Polish browser preferences select Polish only at the language entry point", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "pl-PL", baseURL });
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const page = await context.newPage();
  await page.goto("./");
  await expect(page).toHaveURL(/\/pl\/$/);
  await expect(page).toHaveTitle(
    "miejsca.app | Miejsca w Polsce i ich współrzędne",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.locator("#builder")).toHaveAttribute("aria-label", "Mapa");
  await page.goto("./en/download/");
  await expect(page).toHaveURL(/\/en\/download\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await context.close();
});

test("unsupported browser languages fall back to English", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: "fr-FR", baseURL });
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const page = await context.newPage();
  await page.goto("./");
  await expect(page).toHaveURL(/\/en\/$/);
  await context.close();
});

test("the selector opens the equivalent page and remembers the user's choice", async ({
  page,
}) => {
  await page.goto("./en/source/");
  const summary = page.locator(".language-selector > summary");
  const polish = page.getByRole("link", { name: "Polski", exact: true });
  await expect(polish).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(polish).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(polish).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.click();
  await page.locator("#source-title").click();
  await expect(polish).toBeHidden();
  await page.locator(".language-selector > summary").click();
  await page.getByRole("link", { name: "Polski", exact: true }).click();
  await expect(page).toHaveURL(/\/pl\/zrodlo\/$/);
  await expect(page.locator("#source-title")).toHaveText("Źródło danych");
  await page.goto("./");
  await expect(page).toHaveURL(/\/pl\/$/);
  await page.goto("./en/about/");
  await expect(page).toHaveURL(/\/en\/about\/$/);
  await page.goto("./");
  await expect(page).toHaveURL(/\/pl\/$/);
  await page.locator(".language-selector > summary").click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await page.goto("./");
  await expect(page).toHaveURL(/\/en\/$/);
});

test("language selection still works when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
      });
    }
    Object.defineProperty(navigator, "languages", { value: ["pl-PL"] });
  });
  await page.goto("./");
  await expect(page).toHaveURL(/\/pl\/$/);
  await page.locator(".language-selector > summary").click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("switching language preserves all filters, columns, format, and preview tabs", async ({
  page,
}) => {
  await page.goto("./en/");
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator("#search").fill("boguszowice");
  await page.locator("#province").selectOption("śląskie");
  await page.locator("#district").selectOption("Rybnik");
  await page.locator("#commune").selectOption("2473011");
  await page.locator("#name-status").selectOption("urzędowa");
  await page.locator("#toggle-columns").click();
  await page.locator("[data-fields=none]").click();
  await page.locator("input[name=field][value=id]").check();
  await page.locator("input[name=field][value=name]").check();
  await page.locator("#format").selectOption("csv");
  await page.locator("#tab-preview").click();
  await page.locator("#tab-output").click();
  await expect(page.locator("#match-count")).toHaveText("1");
  await page.locator(".language-selector > summary").click();
  await page.getByRole("link", { name: "Polski", exact: true }).click();
  await expect(page.locator("#builder-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#search")).toHaveValue("boguszowice");
  await expect(page.locator("#province")).toHaveValue("śląskie");
  await expect(page.locator("#district")).toHaveValue("Rybnik");
  await expect(page.locator("#commune")).toHaveValue("2473011");
  await expect(page.locator("#name-status")).toHaveValue("urzędowa");
  await expect(page.locator("#format")).toHaveValue("csv");
  await expect(page.locator("input[name=field]:checked")).toHaveCount(2);
  await expect(page.locator("#output-panel")).toBeVisible();
  await expect(page.locator("#output-preview")).toContainText(
    "7791,Boguszowice",
  );
  await page.locator("#format").selectOption("json");
  const pending = page.waitForEvent("download");
  await page.locator("#download-custom").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^polish-geonames-.*\.json$/);
  expect(JSON.parse(await readFile(await download.path(), "utf8"))).toEqual([
    { id: 7791, name: "Boguszowice" },
  ]);
});

test("content and all prepared file formats are available without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  for (const [route, title, language] of [
    ["en/download", "Prepared downloads", "en"],
    ["pl/pobierz", "Gotowe pliki do pobrania", "pl"],
  ]) {
    await page.goto(`./${route}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator("#prepared-downloads tr")).toHaveCount(3);
    await expect(page.locator(".direct-downloads a[download]")).toHaveCount(12);
    await expect(page.locator("#total-count")).not.toHaveText("—");
    const href = await page
      .locator(".direct-downloads a")
      .first()
      .getAttribute("href");
    expect((await page.request.get(href)).status()).toBe(200);
  }
  await page.goto("./pl/zrodlo/");
  await expect(page.locator("#upstream-note")).toContainText(
    "Eksport źródłowy:",
  );
  await expect(page.locator("#snapshot-list a").first()).toBeVisible();
  await page.goto("./pl/o-projekcie/");
  await expect(page.locator("#overview-map")).toHaveJSProperty(
    "naturalWidth",
    1100,
  );
  await page.goto("./pl/licencja/");
  await expect(page.locator("#license-title")).toHaveText(
    "Licencja i autorstwo",
  );
  await page.locator(".language-selector > summary").click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page.locator("#license-title")).toHaveText(
    "License and attribution",
  );
  await context.close();
});

test("content pages avoid the builder data and provide localized search metadata", async ({
  page,
  request,
}) => {
  const loaded = [];
  page.on("request", (request) => loaded.push(request.url()));
  await page.goto("./pl/pobierz/");
  await expect(
    page.locator("#prepared-downloads select").first(),
  ).toBeEnabled();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/pl\/pobierz\/$/,
  );
  await expect(page.locator('link[hreflang="en"]')).toHaveAttribute(
    "href",
    /\/en\/download\/$/,
  );
  await expect(page.locator('link[hreflang="pl"]')).toHaveAttribute(
    "href",
    /\/pl\/pobierz\/$/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Wybierz gotowy zestaw danych i format pliku.",
  );
  const datasets = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(datasets).toHaveLength(3);
  expect(datasets[0].name).toBe("Miasta");
  expect(datasets[0].distribution).toHaveLength(4);
  expect(
    loaded.some((url) =>
      /index\.json|records\.json|maplibre|data\.worker/.test(url),
    ),
  ).toBe(false);
  expect((await request.get("./sitemap-index.xml")).status()).toBe(200);
  expect((await request.get("./robots.txt")).status()).toBe(200);
  expect((await request.get("./en/missing-page/")).status()).toBe(404);
});

test("Polish pages fit a phone and map controls are translated", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "pl/",
    "pl/pobierz/",
    "pl/o-projekcie/",
    "pl/zrodlo/",
    "pl/licencja/",
  ]) {
    await page.goto(`./${route}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("./pl/");
  await expect(
    page.getByRole("button", { name: "Powiększ", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#filter-summary")).toHaveText("Wszystkie obiekty");
  for (const width of [320, 600, 760, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const summary = await page.locator("#types-summary").boundingBox();
  const actions = await page
    .locator(".filter-group > .check-actions")
    .boundingBox();
  expect(actions.y).toBeGreaterThanOrEqual(summary.y + summary.height);
});
