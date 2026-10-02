import "./style.css";
import {
  BASIC_FIELDS,
  FIELD_INFO,
  PRESETS,
  FORMATS,
  typeLabel,
} from "./data.js";
import { exportData } from "./export.js";
import { decodedBody } from "./compression.js";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat("en-GB").format(value);
const date = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
const size = (bytes) =>
  bytes < 1e6
    ? `${Math.ceil(bytes / 1000)} kB`
    : `${(bytes / 1e6).toFixed(1)} MB`;
const base = new URL("./data/", document.baseURI);
let manifest;
let latest;
let revision = 0;
let busy = true;
let exporting = false;
let map;
let mapModule;
let mapStarting = false;
let mapVisible = false;
let mapFitted = false;
let currentPage = "home";
let worker;
let sequence = 0;
const waiting = new Map();

function showPage(focus = false) {
  if (location.hash === "#main-content") return;
  const route = location.hash.replace(/^#\/?/, "");
  currentPage = ["about", "download", "source", "license"].includes(route)
    ? route
    : "home";
  for (const page of document.querySelectorAll("[data-page]")) {
    page.hidden = page.dataset.page !== currentPage;
  }
  for (const link of document.querySelectorAll("[data-route]")) {
    if (link.dataset.route === currentPage)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title =
    currentPage === "home"
      ? "Polish Geonames — Map & data downloads"
      : `${{ about: "About", download: "Download", source: "Data source", license: "License" }[currentPage]} — Polish Geonames`;
  mapVisible =
    currentPage === "home" &&
    $("#tab-map").getAttribute("aria-selected") === "true";
  if (mapVisible) revealMap();
  if (focus) {
    document
      .querySelector(`[data-page="${currentPage}"] h2`)
      .focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function drawOverview(points) {
  const canvas = $("#overview-map");
  const context = canvas.getContext("2d");
  // Scale longitude at Poland's central latitude to keep geographic proportions.
  const longitudeScale = Math.cos((52 * Math.PI) / 180);
  const scale = Math.min(
    (canvas.width - 60) / (10.2 * longitudeScale),
    (canvas.height - 60) / 6,
  );
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#245fc580";
  for (let i = 0; i < points.length; i += 2) {
    const x = canvas.width / 2 + (points[i] - 19.1) * longitudeScale * scale;
    const y = canvas.height / 2 + (52 - points[i + 1]) * scale;
    context.fillRect(x, y, 1.6, 1.6);
  }
  canvas.setAttribute("aria-busy", "false");
}

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

function showError(target, error) {
  target.textContent = error?.message || error;
  target.hidden = false;
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

function checkbox(value, label, checked, name, description, count) {
  const wrapper = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = value;
  input.name = name;
  input.checked = checked;
  const text = document.createElement("span");
  text.className = "check-label";
  text.textContent = label;
  if (description) wrapper.title = description;
  wrapper.append(input, text);
  if (count != null) {
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = number(count);
    wrapper.append(badge);
  }
  return wrapper;
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

function renderDownloads() {
  for (const preset of PRESETS) {
    const info = manifest.downloads.find(
      (download) => download.id === preset.id,
    );
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row"><b></b><span class="file-details"></span></th><td class="file-size"></td><td><select></select></td><td><a class="button" download>Download</a></td>`;
    row.querySelector("b").textContent = preset.name;
    row.querySelector("th").title = preset.description;
    row.querySelector(".file-details").textContent =
      `${number(info.count)} places · ${info.fields.length} fields`;
    const select = row.querySelector("select");
    select.setAttribute("aria-label", `${preset.name} file format`);
    select.replaceChildren(
      ...FORMATS.map((format) =>
        option(
          format,
          format === "xlsx" ? "Excel (.xlsx)" : format.toUpperCase(),
        ),
      ),
    );
    const update = () => {
      const file = info.files.find((file) => file.format === select.value);
      const link = row.querySelector("a");
      link.href = new URL(file.path, base);
      link.setAttribute(
        "aria-label",
        `Download ${preset.name} as ${select.value.toUpperCase()}`,
      );
      row.querySelector(".file-size").textContent = size(file.bytes);
    };
    select.addEventListener("change", update);
    update();
    $("#prepared-downloads").append(row);
    row.querySelector("a").addEventListener("click", async (event) => {
      const file = info.files.find((file) => file.format === select.value);
      if (!file.compressed) return;
      event.preventDefault();
      const link = event.currentTarget;
      if (link.getAttribute("aria-disabled") === "true") return;
      link.setAttribute("aria-disabled", "true");
      select.disabled = true;
      row.querySelector(".file-size").textContent = "Preparing…";
      link.textContent = "Preparing…";
      try {
        const response = await fetch(new URL(file.path, base));
        const blob = await new Response(await decodedBody(response)).blob();
        saveBlob(
          blob,
          `polish-geonames-${preset.id}-${manifest.source_export}.${file.format}`,
        );
      } catch (error) {
        showError($("#global-status"), error);
      } finally {
        select.disabled = false;
        link.removeAttribute("aria-disabled");
        link.textContent = "Download";
        update();
      }
    });
  }
  $("#prepared-downloads").setAttribute("aria-busy", "false");
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function updateDownloadState() {
  const selected = fields();
  const format = $("#format").value;
  const count = latest?.count || 0;
  $("#fields-summary").textContent = `(${selected.length})`;
  const typeCount = filter().types.length;
  $("#types-summary").textContent =
    typeCount === Object.keys(manifest.types).length
      ? "All types"
      : `${typeCount} selected`;
  const activeFilters = [
    $("#search").value.trim(),
    typeCount !== Object.keys(manifest.types).length,
    $("#province").value,
    $("#district").value,
    $("#commune").value,
    $("#name-status").value,
  ].filter(Boolean).length;
  $("#filter-summary").textContent = activeFilters
    ? `${activeFilters} active`
    : "All places";
  $("#download-custom").disabled =
    busy || exporting || !selected.length || !count;
  $("#download-custom").replaceChildren(
    document.createTextNode(
      exporting ? "Preparing file…" : `Download ${format.toUpperCase()}`,
    ),
  );
  $("#export-summary").textContent = !selected.length
    ? "Select at least one column."
    : `${selected.length} columns selected`;
  $("#format-note").textContent = {
    json: "A JSON array of the selected fields.",
    csv: "Comma-separated values. Nested values use JSON text.",
    tsv: "Tab-separated values. Nested values use JSON text.",
    geojson: "Point features. Coordinates are always included in geometry.",
    xlsx: "Excel workbook with a source information sheet.",
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
      ? "Select fields to preview your file."
      : "No matches. Change or reset your filters.";
    tr.append(td);
    rows.push(tr);
  }
  $("#preview-table tbody").replaceChildren(...rows);
}

async function renderOutput() {
  if (!latest) return;
  const selected = fields();
  if (!selected.length) {
    $("#output-preview").textContent = "Select at least one field.";
    return;
  }
  const format = $("#format").value;
  const current = revision;
  const rows = latest.geoRows.slice(0, 3);
  if (format === "xlsx") {
    $("#output-preview").textContent = JSON.stringify(
      latest.rows.slice(0, 3),
      null,
      2,
    );
    $("#output-note").textContent =
      "Values for the first 3 rows. The download is an Excel workbook, not JSON.";
  } else {
    const { data } = await exportData(rows, selected, format, manifest);
    if (current !== revision || format !== $("#format").value) return;
    $("#output-preview").textContent = ["json", "geojson"].includes(format)
      ? JSON.stringify(JSON.parse(data), null, 2)
      : data;
    $("#output-note").textContent =
      "Preview of the first 3 matching records. The download includes every match.";
  }
}

async function applyFilters() {
  const current = ++revision;
  busy = true;
  $("#builder-error").hidden = true;
  $("#loading").textContent = fields().some(
    (field) => !manifest.core_fields.includes(field),
  )
    ? "Loading source details…"
    : "Updating selection…";
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
      "All counties",
    );
    setOptions($("#commune"), response.communes, "All communes");
    $("#district").disabled = !$("#province").value;
    $("#commune").disabled = !$("#province").value;
    renderTable();
    await renderOutput();
    if (mapVisible) await updateMap();
    $("#loading").textContent = response.count
      ? "Selection ready"
      : "No matching places";
  } catch (error) {
    if (current !== revision) return;
    showError($("#builder-error"), error);
    $("#loading").textContent = "Could not update the preview";
    latest = null;
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
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
          "The background map is unavailable. Table and downloads still work.",
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
        detail.textContent = `${typeLabel(row.type)} · ${row.commune || ""} · PRNG ${row.id}`;
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
      "This browser could not start the map. Use the table to inspect your selection.",
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
  mapVisible =
    currentPage === "home" &&
    $("#tab-map").getAttribute("aria-selected") === "true";
  if (mapVisible) revealMap();
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

async function start() {
  try {
    const response = await fetch(new URL("manifest.json", base), {
      cache: "no-cache",
    });
    if (!response.ok)
      throw new Error("The dataset is unavailable. Please try again later.");
    manifest = await response.json();
    if (!manifest.downloads)
      throw new Error(
        "The data build is incomplete. Run the download build before starting the site.",
      );
    $("#total-count").textContent = number(manifest.count);
    $("#check-date").textContent =
      `Up to date as of ${date(manifest.last_checked)}`;
    if (Date.now() - new Date(manifest.last_checked).getTime() > 3 * 86400_000)
      showError(
        $("#global-status"),
        "The source check is overdue. The downloads below remain the last validated snapshot.",
      );
    $("#upstream-note").textContent =
      `Source export: ${date(manifest.source_export)}. Latest checked upstream export: ${date(manifest.upstream_export)}. Published snapshot: ${manifest.version}.`;
    for (const snapshot of manifest.history) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = new URL(snapshot.records, base);
      link.textContent = `${snapshot.source_export} · ${number(snapshot.count)} localities · JSON.gz`;
      const metadata = document.createElement("a");
      metadata.href = new URL(
        `snapshots/${snapshot.version}/metadata.json`,
        base,
      );
      metadata.textContent = "metadata";
      li.append(link, " · ", metadata);
      $("#snapshot-list").append(li);
    }
    renderDownloads();
    const types = Object.entries(manifest.types).sort(([a], [b]) =>
      a === "city"
        ? -1
        : b === "city"
          ? 1
          : a === "village"
            ? -1
            : b === "village"
              ? 1
              : a.localeCompare(b, "pl"),
    );
    for (const [type, count] of types)
      $("#type-options").append(
        checkbox(type, typeLabel(type), true, "type", null, count),
      );
    for (const field of manifest.fields) {
      const info = FIELD_INFO[field] || [field, "Original source field."];
      $(
        BASIC_FIELDS.includes(field) ? "#basic-fields" : "#extra-fields",
      ).append(
        checkbox(
          field,
          info[0],
          BASIC_FIELDS.includes(field),
          "field",
          info[1],
        ),
      );
    }
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
    const { provinces, points } = await message("load", {
      manifest,
      base: base.href,
    });
    drawOverview(points);
    setOptions(
      $("#province"),
      provinces.map((name) => [name, name]),
      "All provinces",
    );
    $("#filter-controls").disabled = false;
    $("#export-fields").disabled = false;
    $("#toggle-columns").disabled = false;
    $("#reset-filters").disabled = false;
    installEvents();
    await applyFilters();
  } catch (error) {
    showError($("#global-status"), error);
    $("#loading").textContent = "The register could not be loaded";
    $("#overview-map").setAttribute("aria-busy", "false");
  }
}

const compactLayout = matchMedia("(max-width: 760px)");
const adaptFilters = () => {
  $("#filter-sidebar").open = !compactLayout.matches;
};
compactLayout.addEventListener("change", adaptFilters);
adaptFilters();
window.addEventListener("hashchange", () => showPage(true));
showPage();
start();
