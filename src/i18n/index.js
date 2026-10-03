import { polish } from "./pl.js";
import { FIELD_INFO } from "../data.js";

export const languages = ["en", "pl"];
export const routes = {
  en: {
    home: "",
    download: "download",
    about: "about",
    source: "source",
    license: "license",
  },
  pl: {
    home: "",
    download: "pobierz",
    about: "o-projekcie",
    source: "zrodlo",
    license: "licencja",
  },
};

export function preferredLanguage(saved, browserLanguages = []) {
  if (languages.includes(saved)) return saved;
  for (const language of browserLanguages) {
    const code = language.toLowerCase().split("-")[0];
    if (languages.includes(code)) return code;
  }
  return "en";
}

export function pagePath(locale, page = "home", base = "/") {
  const prefix = base.replace(/\/?$/, "/");
  const route = routes[locale][page];
  return `${prefix}${locale}/${route ? `${route}/` : ""}`;
}

export function translator(locale) {
  return (message, values = {}) => {
    const key = message.replace(/\s+/g, " ").trim();
    const text = locale === "pl" ? (polish[key] ?? key) : key;
    return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  };
}

const englishTypes = {
  city: "City / town",
  village: "Village",
  "część kolonii": "Part of a colony",
  "część miasta": "Part of a city / town",
  "część osady": "Part of a settlement",
  "część wsi": "Part of a village",
  "inny obiekt": "Other feature",
  kolonia: "Colony",
  "kolonia kolonii": "Colony of a colony",
  "kolonia osady": "Colony of a settlement",
  "kolonia wsi": "Colony of a village",
  leśniczówka: "Forester's lodge",
  osada: "Settlement",
  "osada kolonii": "Settlement of a colony",
  "osada leśna": "Forest settlement",
  "osada leśna wsi": "Forest settlement of a village",
  "osada osady": "Settlement of a settlement",
  "osada wsi": "Settlement of a village",
  osiedle: "Housing estate",
  "osiedle wsi": "Housing estate of a village",
  przysiółek: "Hamlet",
  "przysiółek kolonii": "Hamlet of a colony",
  "przysiółek osady": "Hamlet of a settlement",
  "przysiółek wsi": "Hamlet of a village",
  "schronisko turystyczne": "Tourist shelter",
};

export function typeLabel(type, locale) {
  if (locale === "pl") return { city: "Miasto", village: "Wieś" }[type] ?? type;
  return englishTypes[type] ?? type;
}

export function fieldInfo(field, locale) {
  const t = translator(locale);
  return (FIELD_INFO[field] ?? [field, "Original source field."]).map((text) =>
    t(text),
  );
}

export function formatters(locale) {
  const language = locale === "pl" ? "pl-PL" : "en-GB";
  const number = (value) => new Intl.NumberFormat(language).format(value);
  const date = (value) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  const size = (bytes) =>
    bytes < 1e6
      ? `${number(Math.ceil(bytes / 1000))} kB`
      : `${new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1e6)} MB`;
  return { number, date, size };
}
