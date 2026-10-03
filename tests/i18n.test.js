import test from "node:test";
import assert from "node:assert/strict";
import {
  preferredLanguage,
  pagePath,
  translator,
  typeLabel,
  formatters,
} from "../src/i18n/index.js";

test("language selection respects an explicit choice and ordered browser preferences", () => {
  assert.equal(preferredLanguage("en", ["pl-PL"]), "en");
  assert.equal(preferredLanguage("pl", ["en-US"]), "pl");
  assert.equal(preferredLanguage(null, ["de-DE", "pl-PL", "en-US"]), "pl");
  assert.equal(preferredLanguage(null, ["en-US", "pl-PL"]), "en");
  assert.equal(preferredLanguage("invalid", ["PL-pl"]), "pl");
  assert.equal(preferredLanguage(null, ["de-DE", "fr-FR"]), "en");
  assert.equal(preferredLanguage(null, []), "en");
});

test("localized page addresses work at both a domain root and a project path", () => {
  assert.equal(pagePath("pl"), "/pl/");
  assert.equal(pagePath("en", "download"), "/en/download/");
  assert.equal(
    pagePath("pl", "source", "/polish-geonames"),
    "/polish-geonames/pl/zrodlo/",
  );
  assert.equal(
    pagePath("en", "home", "/polish-geonames/"),
    "/polish-geonames/en/",
  );
});

test("Polish labels translate the interface without changing source values", () => {
  const t = translator("pl");
  assert.equal(t("Download {format}", { format: "CSV" }), "Pobierz CSV");
  assert.equal(t("All counties"), "Wszystkie powiaty");
  assert.equal(typeLabel("city", "pl"), "Miasto");
  assert.equal(typeLabel("część wsi", "en"), "Part of a village");
  assert.equal(t("PRNG"), "PRNG");
});

test("numbers and dates use the selected language", () => {
  assert.equal(formatters("en").number(124247), "124,247");
  assert.equal(formatters("pl").number(124247), "124\u00a0247");
  assert.equal(formatters("en").date("2026-09-30"), "30 Sept 2026");
  assert.equal(formatters("pl").date("2026-09-30"), "30 wrz 2026");
  assert.equal(formatters("pl").size(1500000), "1,5 MB");
});
