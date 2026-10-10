/**
 * dispatch.js
 * Outbound dispatch: create an order against a customer, reserving
 * stock immediately; move it through Picking → Ready → Dispatched
 * (which deducts inventory), or cancel it (which releases the
 * reservation).
 */
(function (global) {
  "use strict";

  const { formatDate, escapeHtml } = Utils;

  const STATUS_FLOW = ["Pending", "Picking", "Ready", "Dispatched"];
  let dispatchFilters = { search: "", status: "all" };
  let draftItems = [];

  function render(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="dsp-search" placeholder="Search by customer or reference…" value="${escapeHtml(dispatchFilters.search)}" />
        </div>
        <select id="dsp-status-filter" style="max-width:170px;">
          <option value="all">All statuses</option>
          ${STATUS_FLOW.concat("Cancelled").map((s) => `<option ${dispatchFilters.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="new-dispatch-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          New Dispatch Order
        </button>
      </div>
      <div id="dispatch-table-wrap"></div>
    `;
    document.getElementById("dsp-status-filter").value = dispatchFilters.status;
    renderTable();
    document.getElementById("dsp-search").addEventListener("input", Utils.debounce((e) => { dispatchFilters.search = e.target.value; renderTable(); }, 200));
    document.getElementById("dsp-status-filter").addEventListener("change", (e) => { dispatchFilters.status = e.target.value; renderTable(); });
    document.getElementById("new-dispatch-btn").addEventListener("click", () => openDispatchModal());
  }

  function renderTable() {
    const wrap = document.getElementById("dispatch-table-wrap");
    let dispatches = [...Storage.getDispatches()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const term = dispatchFilters.search.trim().toLowerCase();
    if (term) dispatches = dispatches.filter((d) => d.customerName.toLowerCase().includes(term) || d.referenceNumber.toLowerCase().includes(term) || d.id.toLowerCase().includes(term));
    if (dispatchFilters.status !== "all") dispatches = dispatches.filter((d) => d.status === dispatchFilters.status);

    if (!dispatches.length) {
      wrap.innerHTML = Components.emptyState({ title: "No dispatch orders found", message: "Try a different filter, or create a new dispatch order." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dispatch</th><th>Customer</th><th>Reference</th><th>Date</th><th>Items</th><th>Units</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${dispatches.map((d) => {
              const nextIdx = STATUS_FLOW.indexOf(d.status);
              const nextStatus = nextIdx >= 0 && nextIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[nextIdx + 1] : null;
              return `
                <tr>
                  <td class="cell-strong">${escapeHtml(d.id)}</td>
                  <td>${escapeHtml(d.customerName)}</td>
                  <td class="cell-code">${escapeHtml(d.referenceNumber)}</td>
                  <td class="cell-soft">${formatDate(d.date)}</td>
                  <td class="tabular">${d.items.length}</td>
                  <td class="tabular cell-soft">${d.items.reduce((s, it) => s + it.quantity, 0)}</td>
                  <td>${Components.badge(d.status)}</td>
                  <td class="row-actions">
                    <button class="btn btn-outline btn-sm" data-view="${d.id}">View</button>
                    ${nextStatus ? `<button class="btn btn-primary btn-sm" data-advance="${d.id}">${nextStatus === "Dispatched" ? "Confirm Dispatch" : "Mark " + nextStatus}</button>` : ""}
                    ${d.status !== "Dispatched" && d.status !== "Cancelled" ? `<button class="icon-btn danger" data-cancel="${d.id}" aria-label="Cancel"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewDispatch(b.dataset.view)));
    wrap.querySelectorAll("[data-advance]").forEach((b) => b.addEventListener("click", () => advanceDispatch(b.dataset.advance)));
    wrap.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancelDispatch(b.dataset.cancel)));
  }

  function openDispatchModal() {
    const customers = Storage.getCustomers();
    const products = Storage.getProducts();
    const inventory = Storage.getInventory();
    draftItems = [{ productId: products[0]?.id, quantity: 1 }];

    Components.openModal({
      title: "New Dispatch Order",
      size: "lg",
      bodyHTML: `
        <form id="dispatch-form">
          <div class="field-row">
            <div class="field"><label for="df-customer">Customer</label>
              <select id="df-customer">${customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label for="df-reference">Reference number</label><input id="df-reference" value="SO-${Math.floor(10000 + Math.random() * 89999)}" /></div>
          </div>
          <label>Items</label>
          <div id="dispatch-items"></div>
          <button type="button" class="btn btn-ghost btn-sm mt-8" id="add-dispatch-item-btn">+ Add item</button>
          <p class="field-hint mt-8">Stock is reserved as soon as the order is created; it's deducted from inventory only when you confirm dispatch.</p>
          <div class="field mt-16"><label for="df-notes">Notes</label><textarea id="df-notes" rows="2"></textarea></div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="dispatch-save-btn">Create & Reserve Stock</button>`,
      onOpen: (root) => {
        paintItems(root, products, inventory);
        root.querySelector("#add-dispatch-item-btn").addEventListener("click", () => {
          draftItems.push({ productId: products[0]?.id, quantity: 1 });
          paintItems(root, products, inventory);
        });
        root.querySelector("#dispatch-save-btn").addEventListener("click", () => saveDispatchFromModal(root));
      }
    });
  }

  function availableForProduct(inventory, productId) {
    return inventory.filter((i) => i.productId === productId).reduce((s, i) => s + (i.quantity - i.reservedQuantity), 0);
  }

  function paintItems(root, products, inventory) {
    const wrap = root.querySelector("#dispatch-items");
    wrap.innerHTML = draftItems.map((item, idx) => {
      const avail = availableForProduct(inventory, item.productId);
      return `
        <div class="field-row" style="grid-template-columns: 2fr 1fr 1.4fr auto; align-items:end; margin-bottom:8px;" data-item-row="${idx}">
          <div class="field" style="margin:0;"><label>Product</label>
            <select class="item-product">${products.map((p) => `<option value="${p.id}" ${item.productId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
          </div>
          <div class="field" style="margin:0;"><label>Qty</label><input type="number" class="item-qty" min="1" step="1" value="${item.quantity}" /></div>
          <div class="field" style="margin:0;"><label>Available</label><input class="item-avail" value="${avail} units" disabled /></div>
          <button type="button" class="icon-btn danger remove-item-btn" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll(".item-product").forEach((el, i) => el.addEventListener("change", () => { draftItems[i].productId = el.value; paintItems(root, products, inventory); }));
    wrap.querySelectorAll(".item-qty").forEach((el, i) => el.addEventListener("input", () => { draftItems[i].quantity = parseInt(el.value, 10) || 1; }));
    wrap.querySelectorAll(".remove-item-btn").forEach((btn, i) => btn.addEventListener("click", () => {
      if (draftItems.length <= 1) { Components.toast("A dispatch order needs at least one item.", "error"); return; }
      draftItems.splice(i, 1);
      paintItems(root, products, inventory);
    }));
  }

  function saveDispatchFromModal(root) {
    const customers = Storage.getCustomers();
    const products = Storage.getProducts();
    const inventory = Storage.getInventory();
    const customerId = document.getElementById("df-customer").value;
    const customer = customers.find((c) => c.id === customerId);

    for (const it of draftItems) {
      const avail = availableForProduct(inventory, it.productId);
      if (it.quantity > avail) {
        const p = products.find((pp) => pp.id === it.productId);
        Components.toast(`Only ${avail} units of "${p ? p.name : "this product"}" are available.`, "error");
        return;
      }
    }

    // Reserve stock across whichever location(s) have availability, earliest location first.
    const items = [];
    draftItems.forEach((it) => {
      let remaining = it.quantity;
      const product = products.find((p) => p.id === it.productId);
      const recs = inventory.filter((i) => i.productId === it.productId && (i.quantity - i.reservedQuantity) > 0);
      let primaryLocationId = null;
      recs.forEach((rec) => {
        if (remaining <= 0) return;
        const availHere = rec.quantity - rec.reservedQuantity;
        const take = Math.min(availHere, remaining);
        rec.reservedQuantity += take;
        remaining -= take;
        if (!primaryLocationId) primaryLocationId = rec.locationId;
      });
      items.push({ productId: it.productId, productName: product ? product.name : "", sku: product ? product.sku : "", quantity: it.quantity, locationId: primaryLocationId });
    });
    Storage.saveInventory(inventory);

    const dispatch = {
      id: Utils.nextId("DSP", "nextDispatchSeq"),
      customerId, customerName: customer ? customer.name : "",
      date: new Date().toISOString().slice(0, 10),
      referenceNumber: document.getElementById("df-reference").value.trim(),
      items,
      status: "Pending",
      notes: document.getElementById("df-notes").value.trim()
    };
    const dispatches = Storage.getDispatches();
    dispatches.push(dispatch);
    Storage.saveDispatches(dispatches);
    Components.closeModal();
    Components.toast(`Dispatch order ${dispatch.id} created and stock reserved.`, "success");
    renderTable();
  }

  function viewDispatch(dispatchId) {
    const dispatch = Storage.getDispatches().find((d) => d.id === dispatchId);
    const nextIdx = STATUS_FLOW.indexOf(dispatch.status);
    const nextStatus = nextIdx >= 0 && nextIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[nextIdx + 1] : null;
    Components.openModal({
      title: `Dispatch Order · ${dispatch.id}`,
      size: "lg",
      bodyHTML: `
        <div class="info-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px 20px; margin-bottom:18px;">
          <div><label>Customer</label><p>${escapeHtml(dispatch.customerName)}</p></div>
          <div><label>Reference</label><p class="cell-code">${escapeHtml(dispatch.referenceNumber)}</p></div>
          <div><label>Date</label><p>${formatDate(dispatch.date)}</p></div>
          <div><label>Status</label><p>${Components.badge(dispatch.status)}</p></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>From Location</th></tr></thead>
          <tbody>${dispatch.items.map((it) => `<tr><td class="cell-strong">${escapeHtml(it.productName)}</td><td class="cell-code">${escapeHtml(it.sku)}</td><td class="tabular">${it.quantity}</td><td class="cell-code">${escapeHtml(it.locationId || "—")}</td></tr>`).join("")}</tbody>
        </table></div>
        ${dispatch.notes ? `<p class="text-soft mt-16" style="font-size:12.5px;">${escapeHtml(dispatch.notes)}</p>` : ""}
      `,
      footerHTML: `
        <button class="btn btn-outline" data-close-modal>Close</button>
        ${nextStatus ? `<button class="btn btn-primary" id="advance-from-view-btn">${nextStatus === "Dispatched" ? "Confirm Dispatch" : "Mark " + nextStatus}</button>` : ""}
      `,
      onOpen: (root) => {
        const btn = root.querySelector("#advance-from-view-btn");
        if (btn) btn.addEventListener("click", () => { Components.closeModal(); advanceDispatch(dispatchId); });
      }
    });
  }

  function advanceDispatch(dispatchId) {
    const dispatches = Storage.getDispatches();
    const dispatch = dispatches.find((d) => d.id === dispatchId);
    const nextIdx = STATUS_FLOW.indexOf(dispatch.status);
    const nextStatus = STATUS_FLOW[nextIdx + 1];
    if (!nextStatus) return;

    if (nextStatus === "Dispatched") {
      const inventory = Storage.getInventory();
      const movements = Storage.getMovements();
      const locations = Storage.getLocations();

      dispatch.items.forEach((item) => {
        if (!item.locationId) return;
        const rec = inventory.find((i) => i.productId === item.productId && i.locationId === item.locationId);
        if (rec) {
          rec.quantity = Math.max(rec.quantity - item.quantity, 0);
          rec.reservedQuantity = Math.max(rec.reservedQuantity - item.quantity, 0);
        }
        const loc = locations.find((l) => l.id === item.locationId);
        if (loc) {
          loc.currentUtilization = Math.max(loc.currentUtilization - item.quantity, 0);
          loc.status = loc.currentUtilization >= loc.capacity ? "Full" : loc.currentUtilization > 0 ? "Partially Occupied" : "Available";
        }
        movements.push({
          id: Utils.nextId("MOV", "nextMovementSeq"),
          date: new Date().toISOString().slice(0, 10),
          productId: item.productId, productName: item.productName, sku: item.sku,
          type: "Dispatch", quantity: item.quantity,
          fromLocationId: item.locationId, toLocationId: null,
          reference: dispatch.id, reason: "Dispatch confirmed", notes: ""
        });
      });
      Storage.saveInventory(inventory);
      Storage.saveMovements(movements);
      Storage.saveLocations(locations);
    }

    dispatch.status = nextStatus;
    Storage.saveDispatches(dispatches);
    Components.toast(`Dispatch ${dispatch.id} marked ${nextStatus.toLowerCase()}.`, "success");
    renderTable();
  }

  async function cancelDispatch(dispatchId) {
    const ok = await Components.confirmDialog({ title: "Cancel dispatch order?", message: "This releases any reserved stock back to available inventory.", confirmText: "Cancel Order", danger: true });
    if (!ok) return;
    const dispatches = Storage.getDispatches();
    const dispatch = dispatches.find((d) => d.id === dispatchId);
    const inventory = Storage.getInventory();
    dispatch.items.forEach((item) => {
      if (!item.locationId) return;
      const rec = inventory.find((i) => i.productId === item.productId && i.locationId === item.locationId);
      if (rec) rec.reservedQuantity = Math.max(rec.reservedQuantity - item.quantity, 0);
    });
    dispatch.status = "Cancelled";
    Storage.saveInventory(inventory);
    Storage.saveDispatches(dispatches);
    Components.toast("Dispatch order cancelled and stock released.", "success");
    renderTable();
  }

  global.Dispatch = { render };
})(window);
