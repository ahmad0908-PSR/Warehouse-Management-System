/**
 * stock-movements.js
 * Everything that changes inventory without a receiving/dispatch order:
 * transfers between locations, manual adjustments (increase, decrease,
 * damage, loss, correction, return), physical stock counting, and the
 * full movement ledger used to review history.
 */
(function (global) {
  "use strict";

  const { formatDate, escapeHtml } = Utils;
  const ADJUSTMENT_TYPES = ["Increase", "Decrease", "Damage", "Loss", "Correction", "Return"];
  const INCREASING_TYPES = new Set(["Increase", "Return"]);

  // =======================================================================
  // Movement ledger
  // =======================================================================

  let ledgerFilters = { search: "", type: "all", from: "", to: "" };

  function renderLedger(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="mov-search" placeholder="Search by product or reference…" value="${escapeHtml(ledgerFilters.search)}" />
        </div>
        <select id="mov-type-filter" style="max-width:160px;">
          <option value="all">All types</option>
          ${["Receiving", "Dispatch", "Transfer", "Increase", "Decrease", "Damage", "Loss", "Correction", "Return"].map((t) => `<option ${ledgerFilters.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <input type="date" id="mov-from" value="${ledgerFilters.from}" style="max-width:150px;" />
        <input type="date" id="mov-to" value="${ledgerFilters.to}" style="max-width:150px;" />
      </div>
      <div id="movements-table-wrap"></div>
    `;
    document.getElementById("mov-type-filter").value = ledgerFilters.type;
    renderLedgerTable();
    document.getElementById("mov-search").addEventListener("input", Utils.debounce((e) => { ledgerFilters.search = e.target.value; renderLedgerTable(); }, 200));
    document.getElementById("mov-type-filter").addEventListener("change", (e) => { ledgerFilters.type = e.target.value; renderLedgerTable(); });
    document.getElementById("mov-from").addEventListener("change", (e) => { ledgerFilters.from = e.target.value; renderLedgerTable(); });
    document.getElementById("mov-to").addEventListener("change", (e) => { ledgerFilters.to = e.target.value; renderLedgerTable(); });
  }

  function movementTypeBadgeClass(t) {
    if (["Receiving", "Increase", "Return"].includes(t)) return "badge-success";
    if (["Dispatch", "Decrease"].includes(t)) return "badge-info";
    if (["Damage", "Loss"].includes(t)) return "badge-danger";
    if (t === "Transfer") return "badge-accent";
    return "badge-neutral";
  }

  function renderLedgerTable() {
    const wrap = document.getElementById("movements-table-wrap");
    let movements = [...Storage.getMovements()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const term = ledgerFilters.search.trim().toLowerCase();
    if (term) movements = movements.filter((m) => m.productName.toLowerCase().includes(term) || (m.reference || "").toLowerCase().includes(term) || m.sku.toLowerCase().includes(term));
    if (ledgerFilters.type !== "all") movements = movements.filter((m) => m.type === ledgerFilters.type);
    if (ledgerFilters.from) movements = movements.filter((m) => m.date >= ledgerFilters.from);
    if (ledgerFilters.to) movements = movements.filter((m) => m.date <= ledgerFilters.to);

    if (!movements.length) {
      wrap.innerHTML = Components.emptyState({ title: "No movements found", message: "Try adjusting your search, type or date range." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th><th>Reason</th></tr></thead>
          <tbody>
            ${movements.map((m) => `
              <tr>
                <td class="cell-soft">${formatDate(m.date)}</td>
                <td class="cell-strong">${escapeHtml(m.productName)}</td>
                <td><span class="badge ${movementTypeBadgeClass(m.type)}">${escapeHtml(m.type)}</span></td>
                <td class="tabular">${m.quantity}</td>
                <td class="cell-code">${escapeHtml(m.fromLocationId || "—")}</td>
                <td class="cell-code">${escapeHtml(m.toLocationId || "—")}</td>
                <td class="cell-code">${escapeHtml(m.reference || "—")}</td>
                <td class="cell-soft">${escapeHtml(m.reason || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // =======================================================================
  // Transfers
  // =======================================================================

  function renderTransfers(container) {
    const products = Storage.getProducts();
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title-row"><h3>New Transfer</h3></div>
          <form id="transfer-form">
            <div class="field"><label for="tf-product">Product</label>
              <select id="tf-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label for="tf-from">From location</label><select id="tf-from"></select></div>
            <div class="field"><label for="tf-to">To location</label><select id="tf-to"></select></div>
            <div class="field"><label for="tf-qty">Quantity</label><input id="tf-qty" type="number" min="1" step="1" value="1" /></div>
            <div class="field"><label for="tf-reason">Reason</label><input id="tf-reason" placeholder="e.g. Rebalancing stock between bins" /></div>
            <button type="button" class="btn btn-primary btn-block" id="transfer-save-btn">Transfer Stock</button>
          </form>
        </div>
        <div class="card">
          <div class="card-title-row"><h3>Recent Transfers</h3></div>
          <div id="recent-transfers"></div>
        </div>
      </div>
    `;
    populateLocationSelectsForProduct(products[0]?.id);
    paintRecentTransfers();

    document.getElementById("tf-product").addEventListener("change", (e) => populateLocationSelectsForProduct(e.target.value));
    document.getElementById("transfer-save-btn").addEventListener("click", saveTransfer);
  }

  function populateLocationSelectsForProduct(productId) {
    const inventory = Storage.getInventory().filter((i) => i.productId === productId);
    const locations = Storage.getLocations();
    const fromSelect = document.getElementById("tf-from");
    const toSelect = document.getElementById("tf-to");
    fromSelect.innerHTML = inventory.map((i) => `<option value="${i.locationId}">${escapeHtml(i.locationId)} (${i.quantity - i.reservedQuantity} available)</option>`).join("") || `<option value="">No stock found</option>`;
    toSelect.innerHTML = locations.filter((l) => l.status !== "Blocked").map((l) => `<option value="${l.id}">${escapeHtml(l.id)}</option>`).join("");
  }

  function saveTransfer() {
    const productId = document.getElementById("tf-product").value;
    const fromLocationId = document.getElementById("tf-from").value;
    const toLocationId = document.getElementById("tf-to").value;
    const qty = parseInt(document.getElementById("tf-qty").value, 10) || 0;
    const reason = document.getElementById("tf-reason").value.trim() || "Stock transfer";

    if (!fromLocationId) { Components.toast("No stock available for this product.", "error"); return; }
    if (fromLocationId === toLocationId) { Components.toast("Choose two different locations.", "error"); return; }
    if (qty <= 0) { Components.toast("Quantity must be greater than zero.", "error"); return; }

    const inventory = Storage.getInventory();
    const products = Storage.getProducts();
    const product = products.find((p) => p.id === productId);
    const fromRec = inventory.find((i) => i.productId === productId && i.locationId === fromLocationId);
    const availableAtFrom = fromRec ? fromRec.quantity - fromRec.reservedQuantity : 0;
    if (qty > availableAtFrom) { Components.toast(`Only ${availableAtFrom} units available at ${fromLocationId}.`, "error"); return; }

    fromRec.quantity -= qty;
    let toRec = inventory.find((i) => i.productId === productId && i.locationId === toLocationId);
    if (toRec) {
      toRec.quantity += qty;
    } else {
      inventory.push({
        id: Utils.nextId("INV", "nextInventorySeq"),
        productId, productName: product.name, sku: product.sku,
        locationId: toLocationId, quantity: qty, reservedQuantity: 0,
        minStock: product.reorderLevel, maxStock: product.reorderLevel * 4
      });
    }

    const locations = Storage.getLocations();
    const fromLoc = locations.find((l) => l.id === fromLocationId);
    const toLoc = locations.find((l) => l.id === toLocationId);
    if (fromLoc) { fromLoc.currentUtilization = Math.max(fromLoc.currentUtilization - qty, 0); fromLoc.status = fromLoc.currentUtilization >= fromLoc.capacity ? "Full" : fromLoc.currentUtilization > 0 ? "Partially Occupied" : "Available"; }
    if (toLoc) { toLoc.currentUtilization = Math.min(toLoc.currentUtilization + qty, toLoc.capacity * 1.5); toLoc.status = toLoc.currentUtilization >= toLoc.capacity ? "Full" : "Partially Occupied"; }

    const movements = Storage.getMovements();
    movements.push({
      id: Utils.nextId("MOV", "nextMovementSeq"),
      date: new Date().toISOString().slice(0, 10),
      productId, productName: product.name, sku: product.sku,
      type: "Transfer", quantity: qty,
      fromLocationId, toLocationId,
      reference: "Manual Transfer", reason, notes: ""
    });

    Storage.saveInventory(inventory);
    Storage.saveLocations(locations);
    Storage.saveMovements(movements);
    Components.toast(`Transferred ${qty} units from ${fromLocationId} to ${toLocationId}.`, "success");
    populateLocationSelectsForProduct(productId);
    paintRecentTransfers();
  }

  function paintRecentTransfers() {
    const el = document.getElementById("recent-transfers");
    const transfers = Storage.getMovements().filter((m) => m.type === "Transfer").sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    if (!transfers.length) { el.innerHTML = Components.emptyState({ title: "No transfers yet", message: "Transfers you make will appear here." }); return; }
    el.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Qty</th><th>From → To</th><th>Date</th></tr></thead>
        <tbody>${transfers.map((m) => `<tr><td class="cell-strong">${escapeHtml(m.productName)}</td><td class="tabular">${m.quantity}</td><td class="cell-code">${escapeHtml(m.fromLocationId)} → ${escapeHtml(m.toLocationId)}</td><td class="cell-soft">${formatDate(m.date)}</td></tr>`).join("")}</tbody>
      </table></div>
    `;
  }

  // =======================================================================
  // Stock Adjustments
  // =======================================================================

  function renderAdjustments(container) {
    const products = Storage.getProducts();
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title-row"><h3>New Adjustment</h3></div>
          <form id="adjustment-form">
            <div class="field"><label for="af-product">Product</label>
              <select id="af-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label for="af-location">Location</label><select id="af-location"></select></div>
            <div class="field-row">
              <div class="field"><label for="af-type">Adjustment type</label>
                <select id="af-type">${ADJUSTMENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
              </div>
              <div class="field"><label for="af-qty">Quantity</label><input id="af-qty" type="number" min="1" step="1" value="1" /></div>
            </div>
            <div class="field"><label for="af-reason">Reason</label><input id="af-reason" placeholder="e.g. Damaged during handling" /></div>
            <p class="field-hint mb-16">Increase and Return add to stock. Decrease, Damage, Loss and Correction subtract from stock.</p>
            <button type="button" class="btn btn-primary btn-block" id="adjustment-save-btn">Record Adjustment</button>
          </form>
        </div>
        <div class="card">
          <div class="card-title-row"><h3>Recent Adjustments</h3></div>
          <div id="recent-adjustments"></div>
        </div>
      </div>
    `;
    populateAdjustmentLocations(products[0]?.id);
    paintRecentAdjustments();
    document.getElementById("af-product").addEventListener("change", (e) => populateAdjustmentLocations(e.target.value));
    document.getElementById("adjustment-save-btn").addEventListener("click", saveAdjustment);
  }

  function populateAdjustmentLocations(productId) {
    const inventory = Storage.getInventory().filter((i) => i.productId === productId);
    const select = document.getElementById("af-location");
    select.innerHTML = inventory.map((i) => `<option value="${i.locationId}">${escapeHtml(i.locationId)} (qty ${i.quantity})</option>`).join("") || `<option value="">No stock found</option>`;
  }

  function saveAdjustment() {
    const productId = document.getElementById("af-product").value;
    const locationId = document.getElementById("af-location").value;
    const type = document.getElementById("af-type").value;
    const qty = parseInt(document.getElementById("af-qty").value, 10) || 0;
    const reason = document.getElementById("af-reason").value.trim() || `${type} adjustment`;

    if (!locationId) { Components.toast("No stock found for this product.", "error"); return; }
    if (qty <= 0) { Components.toast("Quantity must be greater than zero.", "error"); return; }

    const inventory = Storage.getInventory();
    const rec = inventory.find((i) => i.productId === productId && i.locationId === locationId);
    const products = Storage.getProducts();
    const product = products.find((p) => p.id === productId);
    const isIncrease = INCREASING_TYPES.has(type);

    if (!isIncrease && qty > rec.quantity) { Components.toast(`Only ${rec.quantity} units on hand to reduce.`, "error"); return; }
    rec.quantity = isIncrease ? rec.quantity + qty : rec.quantity - qty;

    const locations = Storage.getLocations();
    const loc = locations.find((l) => l.id === locationId);
    if (loc) {
      loc.currentUtilization = Math.max(0, loc.currentUtilization + (isIncrease ? qty : -qty));
      loc.status = loc.currentUtilization >= loc.capacity ? "Full" : loc.currentUtilization > 0 ? "Partially Occupied" : "Available";
    }

    const movements = Storage.getMovements();
    movements.push({
      id: Utils.nextId("MOV", "nextMovementSeq"),
      date: new Date().toISOString().slice(0, 10),
      productId, productName: product.name, sku: product.sku,
      type, quantity: qty,
      fromLocationId: isIncrease ? null : locationId,
      toLocationId: isIncrease ? locationId : null,
      reference: "Manual Adjustment", reason, notes: ""
    });

    Storage.saveInventory(inventory);
    Storage.saveLocations(locations);
    Storage.saveMovements(movements);
    Components.toast("Stock adjustment recorded.", "success");
    populateAdjustmentLocations(productId);
    paintRecentAdjustments();
  }

  function paintRecentAdjustments() {
    const el = document.getElementById("recent-adjustments");
    const adjustmentTypes = new Set(ADJUSTMENT_TYPES);
    const adjustments = Storage.getMovements().filter((m) => adjustmentTypes.has(m.type)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    if (!adjustments.length) { el.innerHTML = Components.emptyState({ title: "No adjustments yet", message: "Adjustments you record will appear here." }); return; }
    el.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Type</th><th>Qty</th><th>Date</th></tr></thead>
        <tbody>${adjustments.map((m) => `<tr><td class="cell-strong">${escapeHtml(m.productName)}</td><td><span class="badge ${movementTypeBadgeClass(m.type)}">${escapeHtml(m.type)}</span></td><td class="tabular">${m.quantity}</td><td class="cell-soft">${formatDate(m.date)}</td></tr>`).join("")}</tbody>
      </table></div>
    `;
  }

  // =======================================================================
  // Stock Count
  // =======================================================================

  let countLocationId = null;
  let countedValues = {};

  function renderStockCount(container) {
    const locations = Storage.getLocations();
    if (!countLocationId && locations.length) countLocationId = locations[0].id;
    countedValues = {};

    container.innerHTML = `
      <div class="page-toolbar">
        <label style="margin:0;" for="count-location-select">Location</label>
        <select id="count-location-select" style="max-width:260px;">
          ${locations.map((l) => `<option value="${l.id}" ${l.id === countLocationId ? "selected" : ""}>${escapeHtml(l.id)}</option>`).join("")}
        </select>
      </div>
      <div id="count-table-wrap"></div>
    `;
    paintCountTable();
    document.getElementById("count-location-select").addEventListener("change", (e) => { countLocationId = e.target.value; countedValues = {}; paintCountTable(); });
  }

  function paintCountTable() {
    const wrap = document.getElementById("count-table-wrap");
    const inventory = Storage.getInventory().filter((i) => i.locationId === countLocationId);
    if (!inventory.length) {
      wrap.innerHTML = Components.emptyState({ title: "No inventory at this location", message: "Choose a different location to count." });
      return;
    }
    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Expected</th><th>Counted</th><th>Variance</th><th></th></tr></thead>
          <tbody>
            ${inventory.map((i) => `
              <tr data-count-row="${i.id}">
                <td class="cell-strong">${escapeHtml(i.productName)}</td>
                <td class="cell-code">${escapeHtml(i.sku)}</td>
                <td class="tabular">${i.quantity}</td>
                <td><input type="number" min="0" step="1" class="count-input" data-inv="${i.id}" value="${countedValues[i.id] ?? i.quantity}" style="max-width:110px;" /></td>
                <td class="tabular variance-cell" data-variance-for="${i.id}">0</td>
                <td class="row-actions"><button class="btn btn-outline btn-sm" data-approve="${i.id}">Approve</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    wrap.querySelectorAll(".count-input").forEach((input) => {
      input.addEventListener("input", () => updateVariance(input.dataset.inv));
      updateVariance(input.dataset.inv);
    });
    wrap.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => approveCount(b.dataset.approve)));
  }

  function updateVariance(invId) {
    const inventory = Storage.getInventory();
    const rec = inventory.find((i) => i.id === invId);
    const input = document.querySelector(`.count-input[data-inv="${invId}"]`);
    const counted = parseInt(input.value, 10) || 0;
    countedValues[invId] = counted;
    const variance = counted - rec.quantity;
    const cell = document.querySelector(`[data-variance-for="${invId}"]`);
    cell.textContent = (variance > 0 ? "+" : "") + variance;
    cell.style.color = variance === 0 ? "var(--color-ink-soft)" : variance > 0 ? "var(--color-success)" : "var(--color-danger)";
  }

  function approveCount(invId) {
    const inventory = Storage.getInventory();
    const rec = inventory.find((i) => i.id === invId);
    const counted = countedValues[invId] ?? rec.quantity;
    const variance = counted - rec.quantity;
    if (variance === 0) { Components.toast("No variance to approve.", "error"); return; }

    const products = Storage.getProducts();
    const product = products.find((p) => p.id === rec.productId);
    rec.quantity = counted;
    Storage.saveInventory(inventory);

    const movements = Storage.getMovements();
    movements.push({
      id: Utils.nextId("MOV", "nextMovementSeq"),
      date: new Date().toISOString().slice(0, 10),
      productId: rec.productId, productName: rec.productName, sku: rec.sku,
      type: "Correction", quantity: Math.abs(variance),
      fromLocationId: variance < 0 ? countLocationId : null,
      toLocationId: variance > 0 ? countLocationId : null,
      reference: "Stock Count", reason: `Cycle count variance approved (${variance > 0 ? "+" : ""}${variance})`, notes: ""
    });
    Storage.saveMovements(movements);
    Components.toast(`Adjustment of ${variance > 0 ? "+" : ""}${variance} approved for ${product ? product.name : rec.productId}.`, "success");
    paintCountTable();
  }

  global.StockMovements = { renderLedger, renderTransfers, renderAdjustments, renderStockCount };
})(window);
