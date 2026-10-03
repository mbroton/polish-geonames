import { translator, formatters } from "./i18n/index.js";

export const locale = document.documentElement.lang;
export const t = translator(locale);
export const { number, date, size } = formatters(locale);
export const basePath = import.meta.env.BASE_URL.replace(/\/?$/, "/");
export const base = new URL(`${basePath}data/`, location.origin);
export const manifest = JSON.parse(
  document.querySelector("#site-data").textContent,
);

export function showError(target, error) {
  const message = error?.message || error;
  const translated = t(message);
  // Native browser errors are not stable translation keys.
  target.textContent =
    locale === "pl" && translated === message && error instanceof Error
      ? t("The operation failed. Please try again.")
      : translated;
  target.hidden = false;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
