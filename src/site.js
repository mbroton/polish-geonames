import { preferredLanguage, pagePath } from "./i18n/index.js";
import { t, basePath, manifest } from "./client.js";

const preferenceKey = `polish-geonames:language:${basePath}`;
let saved;
try {
  saved = localStorage.getItem(preferenceKey);
} catch {
  /* Storage can be disabled. */
}

const entry = document.body.dataset.entry === "true";
if (entry) {
  const language = preferredLanguage(saved, navigator.languages);
  location.replace(pagePath(language, "home", basePath) + location.search);
} else {
  const languageSelector = document.querySelector(".language-selector");
  for (const event of ["click", "focusin"]) {
    document.addEventListener(event, ({ target }) => {
      if (!languageSelector.contains(target)) languageSelector.open = false;
    });
  }
  languageSelector.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      languageSelector.open = false;
      languageSelector.querySelector("summary").focus();
    }
  });
  document.querySelectorAll("[data-language]").forEach((link) => {
    link.addEventListener("click", () => {
      try {
        localStorage.setItem(preferenceKey, link.dataset.language);
      } catch {
        /* Navigation still works without storage. */
      }
    });
  });
  if (Date.now() - new Date(manifest.last_checked).getTime() > 3 * 86400_000) {
    const status = document.querySelector("#global-status");
    status.textContent = t(
      "The source check is overdue. The downloads below remain the last validated snapshot.",
    );
    status.hidden = false;
  }
  if (document.body.dataset.view === "home") import("./main.js");
  if (document.body.dataset.view === "download") import("./downloads.js");
}
