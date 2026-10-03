import { BASIC_FIELDS } from "./data.js";
import { typeLabel } from "./i18n/index.js";
import {
  locale,
  t,
  number,
  base,
  basePath,
  manifest,
  showError,
  saveBlob,
} from "./client.js";
import { exportData } from "./export.js";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const $ = (selector) => document.querySelector(selector);
let latest;
let revision = 0;
let busy = true;
let exporting = false;
let map;
let mapModule;
let mapStarting = false;
let mapVisible = true;
let mapFitted = false;
let worker;
let sequence = 0;
const waiting = new Map();
const selectionKey = `polish-geonames:selection:${basePath}`;

async function revealMap() {
  await updateMap();
  if (!mapVisible || !map) return;
  map.resize();
  if (!mapFitted && map.getSource("places")) fitSelection();
}

function message(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const request = ++sequence;
    waiting.set(request, { resolve, reject });
    worker.postMessage({ request, action, ...payload });
  });
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function setOptions(select, entries, prompt) {
  const old = select.value;
  select.replaceChildren(
    option("", prompt),
    ...entries.map(([value, label]) => option(value, label)),
  );
  if (entries.some(([value]) => value === old)) select.value = old;
}

function fields() {
  return [...document.querySelectorAll("input[name=field]:checked")].map(
    (input) => input.value,
  );
}

function filter() {
  return {
    query: $("#search").value.trim(),
    types: [...document.querySelectorAll("input[name=type]:checked")].map(
      (input) => input.value,
    ),
    province: $("#province").value,
    district: $("#district").value,
    commune: $("#commune").value,
    status: $("#name-status").value,
  };
}

function updateDownloadState() {
  const selected = fields();
  const format = $("#format").value;
  const count = latest?.count || 0;
  $("#builder-results").setAttribute("aria-busy", String(busy || exporting));
  $("#loading").hidden = !busy && !exporting;
  $("#loading-text").textContent = exporting
    ? t("Preparing file…")
    : busy
      ? t(latest ? "Updating selection…" : "Loading the register…")
      : "";
  $("#fields-summary").textContent = `(${selected.length})`;
  const typeCount = filter().types.length;
  $("#types-summary").textContent =
    typeCount === Object.keys(manifest.types).length
      ? t("All types")
      : t("{count} selected", { count: number(typeCount) });
  const activeFilters = [
    $("#search").value.trim(),
    typeCount !== Object.keys(manifest.types).length,
    $("#province").value,
    $("#district").value,
    $("#commune").value,
    $("#name-status").value,
  ].filter(Boolean).length;
  $("#filter-summary").textContent = activeFilters
    ? t("{count} active", { count: number(activeFilters) })
    : t("All places");
  $("#download-custom").disabled =
    busy || exporting || !selected.length || !count;
  $("#download-label").replaceChildren(
    document.createTextNode(
      exporting
        ? t("Preparing file…")
        : t("Download {format}", { format: format.toUpperCase() }),
    ),
  );
  $("#export-summary").textContent = !selected.length
    ? t("Select at least one column.")
    : t("{count} columns selected", { count: number(selected.length) });
  $("#format-note").textContent = {
    json: t("A JSON array of the selected fields."),
    csv: t("Comma-separated values. Nested values use JSON text."),
    tsv: t("Tab-separated values. Nested values use JSON text."),
    geojson: t("Point features. Coordinates are always included in geometry."),
  }[format];
}

function renderTable() {
  const selected = fields();
  const header = document.createElement("tr");
  for (const field of selected) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = field;
    header.append(cell);
  }
  $("#preview-table thead").replaceChildren(header);
  const rows = latest.rows.map((row) => {
    const tr = document.createElement("tr");
    for (const field of selected) {
      const td = document.createElement("td");
      const value = row[field];
      td.textContent =
        value == null
          ? "—"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      td.title = td.textContent;
      tr.append(td);
    }
    return tr;
  });
  if (!rows.length || !selected.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = Math.max(selected.length, 1);
    td.textContent = !selected.length
      ? t("Select fields to preview your file.")
      : t("No matches. Change or reset your filters.");
    tr.append(td);
    rows.push(tr);
  }
  $("#preview-table tbody").replaceChildren(...rows);
}

function updatePreviewSummary() {
  const output = $("#tab-output").getAttribute("aria-selected") === "true";
  const shown =
    latest && fields().length
      ? output
        ? latest.geoRows.length
        : latest.rows.length
      : 0;
  $("#preview-summary").textContent = t("Shown: {count}", {
    count: number(shown),
  });
  $("#preview-summary").title = t(
    "The download includes every matching record.",
  );
}

async function renderOutput() {
  updatePreviewSummary();
  if (!latest) return;
  const selected = fields();
  if (!selected.length) {
    $("#output-preview").textContent = t("Select at least one field.");
    return;
  }
  const format = $("#format").value;
  const current = revision;
  const rows = latest.geoRows.slice(0, 3);
  const { data } = await exportData(rows, selected, format);
  if (current !== revision || format !== $("#format").value) return;
  $("#output-preview").textContent = ["json", "geojson"].includes(format)
    ? JSON.stringify(JSON.parse(data), null, 2)
    : data;
}

async function applyFilters() {
  saveSelection();
  const current = ++revision;
  busy = true;
  $("#builder-error").hidden = true;
  updateDownloadState();
  try {
    const response = await message("filter", {
      filter: filter(),
      fields: fields(),
    });
    if (current !== revision) return;
    latest = response;
    $("#match-count").textContent = number(response.count);
    setOptions(
      $("#district"),
      response.districts.map((name) => [name, name]),
      t("All counties"),
    );
    setOptions($("#commune"), response.communes, t("All communes"));
    $("#district").disabled = !$("#province").value;
    $("#commune").disabled = !$("#province").value;
    renderTable();
    await renderOutput();
    if (mapVisible) await updateMap();
  } catch (error) {
    if (current !== revision) return;
    showError($("#builder-error"), error);
    latest = null;
    $("#match-count").textContent = "—";
    updatePreviewSummary();
  } finally {
    if (current === revision) {
      busy = false;
      updateDownloadState();
    }
  }
}

function mapFeatures() {
  const points = latest.points;
  const features = [];
  for (let i = 0; i < points.length; i += 3)
    features.push({
      type: "Feature",
      properties: { id: points[i + 2] },
      geometry: { type: "Point", coordinates: [points[i], points[i + 1]] },
    });
  return { type: "FeatureCollection", features };
}

function fitSelection() {
  if (!map || !latest?.points.length) return;
  mapFitted = true;
  const points = latest.points;
  let west = 180,
    east = -180,
    south = 90,
    north = -90;
  for (let i = 0; i < points.length; i += 3) {
    west = Math.min(west, points[i]);
    east = Math.max(east, points[i]);
    south = Math.min(south, points[i + 1]);
    north = Math.max(north, points[i + 1]);
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: 40,
      maxZoom: 12,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 400,
    },
  );
}

async function updateMap() {
  if (!latest || mapStarting) return;
  if (map) {
    map.getSource("places")?.setData(mapFeatures());
    return;
  }
  mapStarting = true;
  try {
    mapModule = await import("maplibre-gl");
    mapModule.setWorkerUrl(mapWorkerUrl);
    map = new mapModule.Map({
      container: "map",
      center: [19.2, 52.05],
      zoom: 5.1,
      maxZoom: 16,
      attributionControl: false,
      locale: {
        "Map.Title": t("Map"),
        "NavigationControl.ZoomIn": t("Zoom in"),
        "NavigationControl.ZoomOut": t("Zoom out"),
        "NavigationControl.ResetBearing": t(
          "Drag to rotate map, click to reset north",
        ),
        "Popup.Close": t("Close popup"),
        "AttributionControl.ToggleAttribution": t("Toggle attribution"),
        "AttributionControl.MapFeedback": t("Map feedback"),
        "Marker.Title": t("Map marker"),
        "CooperativeGesturesHandler.WindowsHelpText": t(
          "Use Ctrl + scroll to zoom the map",
        ),
        "CooperativeGesturesHandler.MacHelpText": t(
          "Use ⌘ + scroll to zoom the map",
        ),
        "CooperativeGesturesHandler.MobileHelpText": t(
          "Use two fingers to move the map",
        ),
      },
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: `<a href="https://www.openstreetmap.org/copyright">${t("© OpenStreetMap contributors")}</a>`,
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f0f2f4" },
          },
          {
            id: "base",
            type: "raster",
            source: "base",
            paint: { "raster-opacity": 0.7, "raster-saturation": -0.8 },
          },
        ],
      },
    });
    map.addControl(new mapModule.NavigationControl({ showCompass: false }));
    map.addControl(
      new mapModule.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.on("error", (event) => {
      // Basemap network failures must not disable local data or downloads.
      if (!map.getSource("places"))
        showError(
          $("#map-error"),
          t(
            "The background map is unavailable. Table and downloads still work.",
          ),
        );
    });
    map.on("load", () => {
      if (!latest) return;
      map.addSource("places", {
        type: "geojson",
        data: mapFeatures(),
        cluster: true,
        clusterRadius: 35,
        clusterMaxZoom: 10,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#245fc5",
          "circle-opacity": 0.72,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            7,
            100,
            11,
            1000,
            17,
            10000,
            24,
          ],
        },
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#184a9e",
          "circle-radius": 4,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });
      map.on("click", "clusters", async (event) => {
        const feature = event.features[0];
        const zoom = await map
          .getSource("places")
          .getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      });
      map.on("click", "points", async (event) => {
        const feature = event.features[0];
        const { row } = await message("lookup", { id: feature.properties.id });
        if (!row) return;
        const content = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = row.name;
        const detail = document.createElement("p");
        detail.textContent = `${typeLabel(row.type, locale)} · ${row.commune || ""} · PRNG ${row.id}`;
        content.append(name, detail);
        new mapModule.Popup()
          .setLngLat(feature.geometry.coordinates)
          .setDOMContent(content)
          .addTo(map);
      });
      for (const layer of ["points", "clusters"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
      if (mapVisible) {
        map.resize();
        fitSelection();
      }
      map.once("idle", () => $("#map").setAttribute("aria-busy", "false"));
    });
  } catch {
    showError(
      $("#map-error"),
      t(
        "This browser could not start the map. Use the table to inspect your selection.",
      ),
    );
  } finally {
    mapStarting = false;
  }
}

function activateTab(button) {
  for (const tab of button
    .closest("[role=tablist]")
    .querySelectorAll("[role=tab]")) {
    const active = tab === button;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`#${tab.getAttribute("aria-controls")}`).hidden = !active;
  }
  mapVisible = $("#tab-map").getAttribute("aria-selected") === "true";
  updatePreviewSummary();
  if (mapVisible) revealMap();
  saveSelection();
}

function installEvents() {
  $("#filters").addEventListener("submit", (event) => event.preventDefault());
  $("#filters").addEventListener("change", (event) => {
    if (event.target.id === "province") {
      $("#district").value = "";
      $("#commune").value = "";
    }
    if (event.target.id === "district") $("#commune").value = "";
    applyFilters();
  });
  let searchTimer;
  $("#search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 180);
  });
  $("#filters").addEventListener("click", (event) => {
    const { types } = event.target.dataset;
    if (types) {
      document.querySelectorAll("input[name=type]").forEach((input) => {
        input.checked = types === "all";
      });
      applyFilters();
    }
  });
  $("#toggle-columns").addEventListener("click", () => {
    const panel = $("#export-fields");
    panel.hidden = !panel.hidden;
    $("#toggle-columns").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({ block: "nearest" });
  });
  $("#export-fields").addEventListener("change", applyFilters);
  $("#export-fields").addEventListener("click", (event) => {
    const action = event.target.dataset.fields;
    if (action) {
      document.querySelectorAll("input[name=field]").forEach((input) => {
        input.checked =
          action === "all" ||
          (action === "basic" && BASIC_FIELDS.includes(input.value));
      });
      applyFilters();
    }
  });
  $("#reset-filters").addEventListener("click", () => {
    $("#filters").reset();
    $("#district").value = "";
    $("#commune").value = "";
    document.querySelectorAll("input[name=type]").forEach((input) => {
      input.checked = true;
    });
    document.querySelectorAll("input[name=field]").forEach((input) => {
      input.checked = BASIC_FIELDS.includes(input.value);
    });
    applyFilters();
  });
  for (const tab of document.querySelectorAll("[role=tab]")) {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      const tabs = [
        ...tab.closest("[role=tablist]").querySelectorAll("[role=tab]"),
      ];
      const offset =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (offset) {
        event.preventDefault();
        const next =
          tabs[(tabs.indexOf(tab) + offset + tabs.length) % tabs.length];
        activateTab(next);
        next.focus();
      }
    });
  }
  $("#format").addEventListener("change", () => {
    saveSelection();
    updateDownloadState();
    renderOutput();
  });
  $("#fit-map").addEventListener("click", fitSelection);
  $("#download-custom").addEventListener("click", async () => {
    const format = $("#format").value;
    exporting = true;
    updateDownloadState();
    $("#builder-error").hidden = true;
    try {
      const { blob } = await message("export", {
        filter: filter(),
        fields: fields(),
        format,
      });
      saveBlob(blob, `polish-geonames-${manifest.source_export}.${format}`);
    } catch (error) {
      showError($("#builder-error"), error);
    } finally {
      exporting = false;
      updateDownloadState();
    }
  });
}

function saveSelection() {
  try {
    sessionStorage.setItem(
      selectionKey,
      JSON.stringify({
        filter: filter(),
        fields: fields(),
        format: $("#format").value,
        mainTab:
          $("#tab-map").getAttribute("aria-selected") === "true"
            ? "tab-map"
            : "tab-preview",
        previewTab:
          $("#tab-table").getAttribute("aria-selected") === "true"
            ? "tab-table"
            : "tab-output",
      }),
    );
  } catch {
    /* The builder also works when storage is disabled. */
  }
}

async function restoreSelection() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(selectionKey));
  } catch {
    return;
  }
  if (!saved || !saved.filter || !Array.isArray(saved.fields)) return;
  $("#search").value = saved.filter.query || "";
  $("#province").value = saved.filter.province || "";
  $("#name-status").value = saved.filter.status || "";
  if ([...$("#format").options].some((option) => option.value === saved.format))
    $("#format").value = saved.format;
  for (const input of document.querySelectorAll("input[name=type]"))
    input.checked =
      saved.filter.types == null || saved.filter.types.includes(input.value);
  for (const input of document.querySelectorAll("input[name=field]"))
    input.checked = saved.fields.includes(input.value);
  // Dependent options must exist before restoring county and commune values.
  const scope = await message("filter", { filter: filter(), fields: fields() });
  setOptions(
    $("#district"),
    scope.districts.map((name) => [name, name]),
    t("All counties"),
  );
  $("#district").value = saved.filter.district || "";
  const area = await message("filter", { filter: filter(), fields: fields() });
  setOptions($("#commune"), area.communes, t("All communes"));
  $("#commune").value = saved.filter.commune || "";
  if (["tab-table", "tab-output"].includes(saved.previewTab))
    activateTab($(`#${saved.previewTab}`));
  if (["tab-map", "tab-preview"].includes(saved.mainTab))
    activateTab($(`#${saved.mainTab}`));
}

async function start() {
  updateDownloadState();
  try {
    worker = new Worker(new URL("./data.worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const task = waiting.get(data.request);
      if (!task) return;
      waiting.delete(data.request);
      data.error ? task.reject(new Error(data.error)) : task.resolve(data);
    };
    worker.onerror = () => {
      for (const task of waiting.values())
        task.reject(
          new Error(
            "The browser could not process the data. Reload to try again.",
          ),
        );
      waiting.clear();
    };
    const { provinces } = await message("load", {
      manifest,
      base: base.href,
    });
    setOptions(
      $("#province"),
      provinces.map((name) => [name, name]),
      t("All provinces"),
    );
    $("#filter-controls").disabled = false;
    $("#export-fields").disabled = false;
    $("#toggle-columns").disabled = false;
    $("#reset-filters").disabled = false;
    await restoreSelection();
    installEvents();
    window.addEventListener("pagehide", saveSelection);
    document.addEventListener("click", (event) => {
      if (event.target.closest("a[href]")) saveSelection();
    });
    await applyFilters();
  } catch (error) {
    showError($("#global-status"), error);
    busy = false;
    updateDownloadState();
  }
}

const compactLayout = matchMedia("(max-width: 760px)");
const adaptFilters = () => {
  $("#filter-sidebar").open = !compactLayout.matches;
};
compactLayout.addEventListener("change", adaptFilters);
adaptFilters();
start();
