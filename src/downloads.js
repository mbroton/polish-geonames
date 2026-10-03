import { PRESETS } from "./data.js";
import { decodedBody } from "./compression.js";
import { t, size, base, manifest, showError, saveBlob } from "./client.js";

for (const row of document.querySelectorAll("[data-preset]")) {
  const preset = PRESETS.find((preset) => preset.id === row.dataset.preset);
  const info = manifest.downloads.find((download) => download.id === preset.id);
  const select = row.querySelector("select");
  const button = row.querySelector("button");
  const update = () => {
    const file = info.files.find((file) => file.format === select.value);
    button.setAttribute(
      "aria-label",
      t("Download {name} as {format}", {
        name: t(preset.name),
        format: select.value.toUpperCase(),
      }),
    );
    row.querySelector(".file-size").textContent = size(file.bytes);
  };
  select.disabled = false;
  select.addEventListener("change", update);
  update();
  button.addEventListener("click", async () => {
    const file = info.files.find((file) => file.format === select.value);
    button.disabled = true;
    select.disabled = true;
    row.querySelector(".file-size").textContent = t("Preparing…");
    button.querySelector(".download-label").textContent = t("Preparing…");
    try {
      const response = await fetch(new URL(file.path, base));
      const blob = await new Response(await decodedBody(response)).blob();
      saveBlob(
        blob,
        `polish-geonames-${preset.id}-${manifest.source_export}.${file.format}`,
      );
    } catch (error) {
      showError(document.querySelector("#global-status"), error);
    } finally {
      select.disabled = false;
      button.disabled = false;
      button.querySelector(".download-label").textContent = t("Download");
      update();
    }
  });
  button.disabled = false;
}
