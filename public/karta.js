const GEOJSON_URL = "https://raw.githubusercontent.com/okfse/sweden-geojson/master/swedish_municipalities.geojson";
const MULTIPLE_PRODUCTS_COLOR = "#7c3aed";
const NO_CUSTOMER_COLOR = "#e5e7e3";

let currentUser = null;
let products = [];
let municipalities = [];
let regions = [];
const pendingAreaProducts = { municipality: new Map(), region: new Map() };
let municipalityByCode = new Map();
let geoData = null;
let mapPathGroup = null;
let zoomBehavior = null;

const mapContainer = document.querySelector("#map-svg-container");
const statusElement = document.querySelector("#map-status");
const tooltip = document.querySelector("#tooltip");
const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const municipalityRows = document.querySelector("#municipality-rows");
const regionRows = document.querySelector("#region-rows");

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error || "Begäran misslyckades. Försök igen.");
    error.status = response.status;
    if (response.status === 401 && path !== "/api/login") showLogin();
    throw error;
  }
  return data;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showLogin(message = "") {
  currentUser = null;
  document.querySelector("#account-label").textContent = "Logga in för att visa kundkartan";
  document.querySelector("#login-button").hidden = false;
  document.querySelector("#logout-button").hidden = true;
  document.querySelector("#login-error").textContent = message;
  document.querySelector("#login-error").hidden = !message;
  statusElement.textContent = "Logga in för att visa kundstatus.";
  if (!loginDialog.open) loginDialog.showModal();
}

function setUser(user) {
  currentUser = user;
  document.querySelector("#account-label").textContent =
    `${user.displayName || user.email} · ${user.role === "admin" ? "Admin" : "Läsare"}`;
  document.querySelector("#login-button").hidden = true;
  document.querySelector("#logout-button").hidden = false;
}

function selectedProducts(municipality) {
  return products.filter(product => municipality.products.includes(product.id));
}

function municipalityColor(municipality) {
  if (!municipality?.products.length) return NO_CUSTOMER_COLOR;
  if (municipality.products.length > 1) return MULTIPLE_PRODUCTS_COLOR;
  return products.find(product => product.id === municipality.products[0])?.color || NO_CUSTOMER_COLOR;
}

function renderLegend() {
  const legend = document.querySelector("#legend-list");
  legend.innerHTML = products.map(product => `
    <li class="legend-item">
      <span class="legend-swatch" style="background:${escapeHTML(product.color)}"></span>
      ${escapeHTML(product.name)}
    </li>
  `).join("") + `
    <li class="legend-item">
      <span class="legend-swatch" style="background:${MULTIPLE_PRODUCTS_COLOR}"></span>
      Flera produkter
    </li>
    <li class="legend-item">
      <span class="legend-swatch" style="background:${NO_CUSTOMER_COLOR};border:1px solid var(--line)"></span>
      Ej kund
    </li>`;

  const counts = products.map(product => ({
    ...product,
    count: municipalities.filter(municipality => municipality.products.includes(product.id)).length
  }));
  document.querySelector("#product-stats").innerHTML = counts.map(product => `
    <div class="stat-row">
      <span class="stat-label"><span class="stat-dot" style="background:${escapeHTML(product.color)}"></span>
        ${escapeHTML(product.name)}</span>
      <span class="stat-value">${product.count}</span>
    </div>
  `).join("") + `
    <div class="stat-row">
      <span class="stat-label"><span class="stat-dot" style="background:${MULTIPLE_PRODUCTS_COLOR}"></span>Flera produkter</span>
      <span class="stat-value">${municipalities.filter(municipality => municipality.products.length > 1).length}</span>
    </div>`;
  document.querySelector("#stat-total").textContent =
    municipalities.filter(municipality => municipality.products.length > 0).length.toLocaleString("sv-SE");
  document.querySelector("#stat-municipalities").textContent =
    municipalities.length.toLocaleString("sv-SE");
}

function renderMunicipalityRows() {
  renderAreaRows("municipality");
}

function renderAreaRows(type) {
  const isRegion = type === "region";
  const areas = isRegion ? regions : municipalities;
  const rows = isRegion ? regionRows : municipalityRows;
  const areaName = isRegion ? "regioner" : "kommuner";
  if (!areas.length) {
    rows.innerHTML = `<tr><td class="empty-row" colspan="3">Logga in för att visa ${isRegion ? "regionlistan" : "kommunlistan"}.</td></tr>`;
    return;
  }
  const search = document.querySelector(`#${type}-search`).value.trim().toLocaleLowerCase("sv");
  const filter = document.querySelector(`#${type}-filter`).value;
  const filtered = areas.filter(municipality => {
    if (search && !municipality.name.toLocaleLowerCase("sv").includes(search)) return false;
    if (filter === "customers" && municipality.products.length === 0) return false;
    if (filter === "noncustomers" && municipality.products.length > 0) return false;
    return true;
  });

  const customerCount = areas.filter(area => area.products.length > 0).length;
  document.querySelector(isRegion ? "#region-list-meta" : "#customer-list-meta").textContent =
    `Visar ${filtered.length} av ${areas.length} ${areaName} · ${customerCount} kunder`;
  if (!filtered.length) {
    rows.innerHTML = `<tr><td class="empty-row" colspan="3">Inga ${areaName} matchar filtret.</td></tr>`;
    return;
  }

  rows.innerHTML = filtered.map(municipality => {
    const isAdmin = currentUser?.role === "admin";
    const pending = pendingAreaProducts[type].get(municipality.code);
    const displayedProducts = pending || municipality.products;
    const productControls = isAdmin
      ? `<div class="municipality-products">${products.map(product => `
          <label class="municipality-product-option">
            <input type="checkbox" data-product-checkbox="${escapeHTML(product.id)}"
              aria-label="${escapeHTML(product.name)} för ${escapeHTML(municipality.name)}"
              ${displayedProducts.includes(product.id) ? "checked" : ""}>
            ${escapeHTML(product.name)}
          </label>
        `).join("")}</div>`
      : selectedProducts(municipality).map(product => `
          <span class="product-badge" style="background:${escapeHTML(product.color)}20;color:${escapeHTML(product.color)}">
            <span class="product-swatch" style="background:${escapeHTML(product.color)}"></span>${escapeHTML(product.name)}
          </span>
        `).join("") || '<span style="color:var(--muted)">Ej kund</span>';
    return `
      <tr data-code="${escapeHTML(municipality.code)}">
        <td>${escapeHTML(municipality.name)}</td>
        <td>${productControls}</td>
        <td>${isAdmin
          ? `<button class="row-save" type="button" ${pending ? "" : "disabled"}>Spara</button><span class="row-status" role="status">${pending ? "Osparade ändringar" : ""}</span>`
          : '<span aria-label="Ingen åtgärd">–</span>'}</td>
      </tr>`;
  }).join("");
}

function orientMunicipalityGeometry(data) {
  for (const feature of data.features) {
    const geometry = feature.geometry;
    if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
      throw new Error("Kartans gränsdata innehåller en kommun med ogiltig geometri.");
    }
    if (d3.geoArea(feature) <= 2 * Math.PI) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) ring.reverse();
    }
    if (d3.geoArea(feature) > 2 * Math.PI) {
      throw new Error("Kartans kommungränser kunde inte anpassas för visning.");
    }
  }
  return data;
}

function drawMap(data) {
  d3.select(mapContainer).select("svg").remove();
  const rect = mapContainer.getBoundingClientRect();
  const width = rect.width || 640;
  const height = Math.max(rect.height || 580, 500);
  const projection = d3.geoMercator().fitSize([width, height], data);
  const path = d3.geoPath().projection(projection);

  const svg = d3.select(mapContainer)
    .insert("svg", ".zoom-controls")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Sverigekarta med kommuner");
  const group = svg.append("g").attr("class", "map-g");
  mapPathGroup = group;

  group.selectAll("path")
    .data(data.features)
    .join("path")
    .attr("d", path)
    .attr("fill", feature => municipalityColor(municipalityByCode.get(feature.properties.id)))
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .attr("class", "municipality")
    .attr("tabindex", 0)
    .attr("aria-label", feature => {
      const municipality = municipalityByCode.get(feature.properties.id);
      return `${municipality.name}: ${selectedProducts(municipality).map(product => product.name).join(", ") || "Ej kund"}`;
    })
    .style("cursor", "default")
    .on("mousemove", showMunicipalityTooltip)
    .on("focus", showMunicipalityTooltip)
    .on("mouseleave blur", hideTooltip);

  zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 12])
    .on("zoom", event => group.attr("transform", event.transform));
  svg.call(zoomBehavior);
  document.querySelector("#zoom-in").onclick = () => svg.transition().call(zoomBehavior.scaleBy, 1.5);
  document.querySelector("#zoom-out").onclick = () => svg.transition().call(zoomBehavior.scaleBy, 0.67);
  document.querySelector("#zoom-reset").onclick =
    () => svg.transition().call(zoomBehavior.transform, d3.zoomIdentity);
}

function showMunicipalityTooltip(event, feature) {
  const municipality = municipalityByCode.get(feature.properties.id);
  const productBadges = selectedProducts(municipality).map(product => `
    <span class="tt-badge" style="background:${escapeHTML(product.color)}20;color:${escapeHTML(product.color)}">
      <span class="tt-badge-dot" style="background:${escapeHTML(product.color)}"></span>${escapeHTML(product.name)}
    </span>
  `).join("");
  tooltip.innerHTML = `<strong>${escapeHTML(municipality.name)}</strong>${
    productBadges || '<span style="font-size:12px;color:var(--muted)">Ej kund</span>'
  }`;
  tooltip.classList.add("visible");
  const x = event.clientX || 20;
  const y = event.clientY || 20;
  const tooltipWidth = tooltip.offsetWidth || 180;
  const tooltipHeight = tooltip.offsetHeight || 80;
  tooltip.style.left = `${Math.min(x + 14, window.innerWidth - tooltipWidth - 10)}px`;
  tooltip.style.top = `${Math.min(y + 14, window.innerHeight - tooltipHeight - 10)}px`;
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

function updateMapColors() {
  if (!mapPathGroup) return;
  mapPathGroup.selectAll("path.municipality")
    .attr("fill", feature => municipalityColor(municipalityByCode.get(feature.properties.id)))
    .attr("aria-label", feature => {
      const municipality = municipalityByCode.get(feature.properties.id);
      return `${municipality.name}: ${selectedProducts(municipality).map(product => product.name).join(", ") || "Ej kund"}`;
    });
}

async function loadMapData() {
  statusElement.textContent = "Laddar karta och kommunlista…";
  const [customerData, geography] = await Promise.all([
    api("/api/municipality-customers"),
    d3.json(GEOJSON_URL)
  ]);
  if (!Array.isArray(customerData.municipalities) || customerData.municipalities.length !== 290 ||
      !Array.isArray(customerData.products) || !Array.isArray(geography?.features) ||
      geography.features.length !== customerData.municipalities.length) {
    throw new Error("Kommunlistan och kartans gränsdata stämmer inte överens.");
  }
  const codes = new Set(customerData.municipalities.map(municipality => municipality.code));
  const featureCodes = new Set(geography.features.map(feature => feature.properties.id));
  if (featureCodes.size !== customerData.municipalities.length ||
      geography.features.some(feature => !codes.has(feature.properties.id)) ||
      customerData.municipalities.some(municipality => !featureCodes.has(municipality.code))) {
    throw new Error("Kartans områdeskoder kunde inte kopplas till kommunlistan.");
  }

  products = customerData.products;
  municipalities = customerData.municipalities;
  municipalityByCode = new Map(municipalities.map(municipality => [municipality.code, municipality]));
  geoData = orientMunicipalityGeometry(geography);
  renderLegend();
  renderMunicipalityRows();
  drawMap(geoData);
  statusElement.textContent = `${municipalities.length} kommuner`;
}

async function loadRegionData() {
  const data = await api("/api/region-customers");
  if (!Array.isArray(data.regions) || data.regions.length !== 21 || !Array.isArray(data.products)) {
    throw new Error("Regionlistan kunde inte läsas.");
  }
  regions = data.regions;
  products = data.products;
  renderAreaRows("region");
}

async function loadCustomerData() {
  await Promise.all([
    loadMapData().catch(error => {
      if (error.status !== 401) statusElement.textContent = error.message;
    }),
    loadRegionData().catch(error => {
      if (error.status !== 401) {
        document.querySelector("#region-list-meta").textContent = error.message;
        regionRows.innerHTML = '<tr><td class="empty-row" colspan="3">Regionlistan kunde inte laddas.</td></tr>';
      }
    })
  ]);
}

document.querySelector("#municipality-search").addEventListener("input", renderMunicipalityRows);
document.querySelector("#municipality-filter").addEventListener("change", renderMunicipalityRows);
document.querySelector("#region-search").addEventListener("input", () => renderAreaRows("region"));
document.querySelector("#region-filter").addEventListener("change", () => renderAreaRows("region"));

function handleAreaChange(event, type) {
  if (!event.target.matches("[data-product-checkbox]")) return;
  const row = event.target.closest("tr");
  const code = row.dataset.code;
  const municipality = type === "region" ? regions.find(region => region.code === code) : municipalityByCode.get(code);
  const selected = [...row.querySelectorAll("[data-product-checkbox]:checked")]
    .map(input => input.dataset.productCheckbox).sort();
  const current = [...municipality.products].sort();
  const changed = JSON.stringify(selected) !== JSON.stringify(current);
  if (changed) pendingAreaProducts[type].set(code, selected);
  else pendingAreaProducts[type].delete(code);
  row.querySelector(".row-save").disabled = !changed;
  row.querySelector(".row-status").textContent = changed ? "Osparade ändringar" : "";
  row.querySelector(".row-status").classList.remove("error");
}

async function handleAreaSave(event, type) {
  const saveButton = event.target.closest(".row-save");
  if (!saveButton || saveButton.disabled || currentUser?.role !== "admin") return;
  const row = saveButton.closest("tr");
  const code = row.dataset.code;
  const selected = [...row.querySelectorAll("[data-product-checkbox]:checked")]
    .map(input => input.dataset.productCheckbox);
  const status = row.querySelector(".row-status");
  const inputs = row.querySelectorAll("[data-product-checkbox]");
  for (const input of inputs) input.disabled = true;
  saveButton.disabled = true;
  saveButton.textContent = "Sparar…";
  status.textContent = "";
  status.classList.remove("error");
  try {
    const isRegion = type === "region";
    await api(`/api/admin/${isRegion ? "regions" : "municipalities"}/${code}/products`, {
      method: "PUT",
      body: JSON.stringify({ products: selected })
    });
    const area = isRegion ? regions.find(region => region.code === code) : municipalityByCode.get(code);
    area.products = selected;
    pendingAreaProducts[type].delete(code);
    renderAreaRows(type);
    if (!isRegion) {
      renderLegend();
      updateMapColors();
    }
    const rows = isRegion ? regionRows : municipalityRows;
    const savedStatus = rows.querySelector(`[data-code="${code}"] .row-status`);
    if (savedStatus) savedStatus.textContent = "Sparat";
  } catch (error) {
    for (const input of inputs) input.disabled = false;
    saveButton.disabled = false;
    saveButton.textContent = "Spara";
    status.textContent = error.message;
    status.classList.add("error");
  }
}

for (const [type, rows] of [["municipality", municipalityRows], ["region", regionRows]]) {
  rows.addEventListener("change", event => handleAreaChange(event, type));
  rows.addEventListener("click", event => handleAreaSave(event, type));
}

document.querySelector("#login-button").addEventListener("click", () => {
  document.querySelector("#login-error").hidden = true;
  loginDialog.showModal();
  document.querySelector("#login-email").focus();
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim();
  const codeInput = document.querySelector("#login-code");
  const submitButton = document.querySelector("#login-submit");
  submitButton.disabled = true;
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, code: codeInput.value })
    });
    codeInput.value = "";
    setUser(result.user);
    loginDialog.close();
  } catch (error) {
    codeInput.value = "";
    document.querySelector("#login-error").textContent = error.message;
    document.querySelector("#login-error").hidden = false;
    return;
  } finally {
    submitButton.disabled = false;
  }
  await loadCustomerData();
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
    currentUser = null;
    products = [];
    municipalities = [];
    regions = [];
    pendingAreaProducts.municipality.clear();
    pendingAreaProducts.region.clear();
    municipalityByCode.clear();
    mapPathGroup = null;
    d3.select(mapContainer).select("svg").remove();
    renderMunicipalityRows();
    renderAreaRows("region");
    document.querySelector("#account-label").textContent = "Logga in för att visa kundkartan";
    document.querySelector("#login-button").hidden = false;
    document.querySelector("#logout-button").hidden = true;
    document.querySelector("#customer-list-meta").textContent = "Logga in för att visa listan.";
    document.querySelector("#region-list-meta").textContent = "Logga in för att visa listan.";
    document.querySelector("#stat-total").textContent = "–";
    document.querySelector("#stat-municipalities").textContent = "290";
    document.querySelector("#product-stats").innerHTML = "";
    document.querySelector("#legend-list").innerHTML = "";
    statusElement.textContent = "Logga in för att visa kundstatus.";
    showLogin();
  } catch (error) {
    statusElement.textContent = error.message;
  }
});

async function initialize() {
  try {
    const result = await api("/api/me");
    setUser(result.user);
    await loadCustomerData();
  } catch (error) {
    if (error.status !== 401) statusElement.textContent = error.message;
  }
}

initialize();
