/**
 * locations.js
 * The warehouse location hierarchy (Zone → Aisle → Rack → Shelf → Bin),
 * a visual explorer grouped by zone, and location CRUD.
 */
(function (global) {
  "use strict";

  const { escapeHtml, clamp } = Utils;

  let selectedZone = "all";
  let locationSearch = "";
  let statusFilter = "all";

  function statusClass(status) {
    return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
  }

  function render(container) {
    const locations = Storage.getLocations();
    const zones = [...new Set(locations.map((l) => l.zone))].sort();

    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="loc-search" placeholder="Search by location ID…" value="${escapeHtml(locationSearch)}" />
        </div>
        <select id="loc-status-filter" style="max-width:180px;">
          <option value="all">All statuses</option>
          <option>Available</option><option>Partially Occupied</option><option>Full</option><option>Blocked</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-location-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          Add Location
        </button>
      </div>
      <div class="zone-tabs" id="zone-tabs">
        <button class="pill ${selectedZone === "all" ? "active" : ""}" data-zone="all">All Zones</button>
        ${zones.map((z) => `<button class="pill ${selectedZone === z ? "active" : ""}" data-zone="${z}">Zone ${z}</button>`).join("")}
      </div>
      <div id="location-grid-wrap"></div>
    `;
    document.getElementById("loc-status-filter").value = statusFilter;
    renderGrid();

    document.getElementById("loc-search").addEventListener("input", Utils.debounce((e) => { locationSearch = e.target.value; renderGrid(); }, 200));
    document.getElementById("loc-status-filter").addEventListener("change", (e) => { statusFilter = e.target.value; renderGrid(); });
    document.getElementById("zone-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-zone]");
      if (!btn) return;
      selectedZone = btn.dataset.zone;
      render(container);
    });
    document.getElementById("add-location-btn").addEventListener("click", () => openLocationModal());
  }

  function renderGrid() {
    const wrap = document.getElementById("location-grid-wrap");
    let locations = Storage.getLocations();
    if (selectedZone !== "all") locations = locations.filter((l) => l.zone === selectedZone);
    const term = locationSearch.trim().toLowerCase();
    if (term) locations = locations.filter((l) => l.id.toLowerCase().includes(term));
    if (statusFilter !== "all") locations = locations.filter((l) => l.status === statusFilter);

    if (!locations.length) {
      wrap.innerHTML = Components.emptyState({ title: "No locations found", message: "Try a different search or filter." });
      return;
    }

    wrap.innerHTML = `
      <div class="location-grid">
        ${locations.map((l) => {
          const pct = l.capacity ? clamp(Math.round((l.currentUtilization / l.capacity) * 100), 0, 100) : 0;
          return `
            <div class="location-card ${statusClass(l.status)}" data-loc="${l.id}">
              <div class="location-card-id">${escapeHtml(l.id)}</div>
              <div class="location-card-meta">${escapeHtml(l.aisle)} · ${escapeHtml(l.rack)} · ${escapeHtml(l.shelf)}</div>
              <div style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--color-ink-soft); margin-bottom:4px;"><span>${l.currentUtilization}/${l.capacity}</span><span>${pct}%</span></div>
              <div style="height:6px; border-radius:4px; background:var(--color-border); overflow:hidden; margin-bottom:8px;"><div style="height:100%; width:${pct}%; background:${pct >= 90 ? "var(--color-danger)" : pct >= 60 ? "var(--color-warning)" : "var(--color-success)"};"></div></div>
              ${Components.badge(l.status)}
            </div>
          `;
        }).join("")}
      </div>
    `;
    wrap.querySelectorAll("[data-loc]").forEach((card) => card.addEventListener("click", () => openLocationDetail(card.dataset.loc)));
  }

  function openLocationDetail(locationId) {
    const location = Storage.getLocations().find((l) => l.id === locationId);
    const inventory = Storage.getInventory().filter((i) => i.locationId === locationId);
    Components.openModal({
      title: `Location ${location.id}`,
      size: "lg",
      bodyHTML: `
        <div class="info-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px 20px; margin-bottom:18px;">
          <div><label>Zone</label><p>${escapeHtml(location.zone)}</p></div>
          <div><label>Status</label><p>${Components.badge(location.status)}</p></div>
          <div><label>Aisle / Rack</label><p>${escapeHtml(location.aisle)} / ${escapeHtml(location.rack)}</p></div>
          <div><label>Shelf / Bin</label><p>${escapeHtml(location.shelf)} / ${escapeHtml(location.bin)}</p></div>
          <div><label>Capacity</label><p>${location.capacity} units</p></div>
          <div><label>Utilization</label><p>${location.currentUtilization} units</p></div>
        </div>
        <h4 style="font-size:13px; margin-bottom:8px;">Stored Products</h4>
        ${inventory.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Reserved</th><th>Available</th></tr></thead>
            <tbody>${inventory.map((i) => `<tr><td class="cell-strong">${escapeHtml(i.productName)}</td><td class="cell-code">${escapeHtml(i.sku)}</td><td class="tabular">${i.quantity}</td><td class="tabular cell-soft">${i.reservedQuantity}</td><td class="tabular">${i.quantity - i.reservedQuantity}</td></tr>`).join("")}</tbody>
          </table></div>
        ` : Components.emptyState({ title: "No inventory here", message: "This location currently holds no products." })}
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Close</button><button class="btn btn-primary" id="edit-location-btn">Edit Location</button>`,
      onOpen: () => document.getElementById("edit-location-btn").addEventListener("click", () => { Components.closeModal(); openLocationModal(locationId); })
    });
  }

  function openLocationModal(locationId) {
    const location = locationId ? Storage.getLocations().find((l) => l.id === locationId) : null;
    Components.openModal({
      title: locationId ? "Edit Location" : "Add Location",
      bodyHTML: `
        <form id="location-form">
          <div class="field-row">
            <div class="field"><label for="lf-zone">Zone</label><input id="lf-zone" required value="${escapeHtml(location?.zone || "A")}" maxlength="1" /></div>
            <div class="field"><label for="lf-aisle">Aisle</label><input id="lf-aisle" value="${escapeHtml(location?.aisle || "Aisle 01")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="lf-rack">Rack</label><input id="lf-rack" value="${escapeHtml(location?.rack || "Rack 01")}" /></div>
            <div class="field"><label for="lf-shelf">Shelf</label><input id="lf-shelf" value="${escapeHtml(location?.shelf || "Shelf 01")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="lf-bin">Bin</label><input id="lf-bin" value="${escapeHtml(location?.bin || "Bin 01")}" /></div>
            <div class="field"><label for="lf-capacity">Capacity</label><input id="lf-capacity" type="number" min="1" step="1" value="${location?.capacity || 100}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="lf-utilization">Current Utilization</label><input id="lf-utilization" type="number" min="0" step="1" value="${location?.currentUtilization || 0}" /></div>
            <div class="field"><label for="lf-status">Status</label>
              <select id="lf-status"><option ${location?.status === "Available" || !location ? "selected" : ""}>Available</option><option ${location?.status === "Partially Occupied" ? "selected" : ""}>Partially Occupied</option><option ${location?.status === "Full" ? "selected" : ""}>Full</option><option ${location?.status === "Blocked" ? "selected" : ""}>Blocked</option></select>
            </div>
          </div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="location-save-btn">${locationId ? "Save Changes" : "Add Location"}</button>`,
      onOpen: () => document.getElementById("location-save-btn").addEventListener("click", () => saveFromModal(locationId))
    });
  }

  function saveFromModal(locationId) {
    const zone = document.getElementById("lf-zone").value.trim().toUpperCase();
    if (!zone) { Components.toast("Zone is required.", "error"); return; }
    const locations = Storage.getLocations();
    const data = {
      zone,
      aisle: document.getElementById("lf-aisle").value.trim(),
      rack: document.getElementById("lf-rack").value.trim(),
      shelf: document.getElementById("lf-shelf").value.trim(),
      bin: document.getElementById("lf-bin").value.trim(),
      capacity: parseInt(document.getElementById("lf-capacity").value, 10) || 100,
      currentUtilization: parseInt(document.getElementById("lf-utilization").value, 10) || 0,
      status: document.getElementById("lf-status").value
    };
    if (locationId) {
      const idx = locations.findIndex((l) => l.id === locationId);
      locations[idx] = Object.assign({}, locations[idx], data);
    } else {
      const seq = Utils.nextId("LOC", "nextLocationSeq").split("-")[1];
      const id = `${data.zone}-NEW-${seq}`;
      locations.push(Object.assign({ id }, data));
    }
    Storage.saveLocations(locations);
    Components.closeModal();
    Components.toast(`Location ${locationId ? "updated" : "added"}.`, "success");
    renderGrid();
  }

  function getAvailableLocations() {
    return Storage.getLocations().filter((l) => l.status !== "Blocked" && l.status !== "Full");
  }

  global.Locations = { render, getAvailableLocations, statusClass };
})(window);
