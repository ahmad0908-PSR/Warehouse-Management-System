/**
 * receiving.js
 * Inbound goods receiving: create an order against a supplier, add
 * products/quantities/locations, then confirm receipt — which updates
 * inventory and logs a stock movement.
 */
(function (global) {
  "use strict";

  const { formatDate, escapeHtml } = Utils;

  let receiptFilters = { search: "", status: "all" };
  let draftItems = [];

  function render(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="rcv-search" placeholder="Search by supplier or reference…" value="${escapeHtml(receiptFilters.search)}" />
        </div>
        <select id="rcv-status-filter" style="max-width:180px;">
          <option value="all">All statuses</option>
          <option>Pending</option><option>Partially Received</option><option>Received</option><option>Cancelled</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="new-receipt-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          New Receiving Order
        </button>
      </div>
      <div id="receipts-table-wrap"></div>
    `;
    document.getElementById("rcv-status-filter").value = receiptFilters.status;
    renderTable();
    document.getElementById("rcv-search").addEventListener("input", Utils.debounce((e) => { receiptFilters.search = e.target.value; renderTable(); }, 200));
    document.getElementById("rcv-status-filter").addEventListener("change", (e) => { receiptFilters.status = e.target.value; renderTable(); });
    document.getElementById("new-receipt-btn").addEventListener("click", () => openReceiptModal());
  }

  function renderTable() {
    const wrap = document.getElementById("receipts-table-wrap");
    let receipts = [...Storage.getReceipts()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const term = receiptFilters.search.trim().toLowerCase();
    if (term) receipts = receipts.filter((r) => r.supplierName.toLowerCase().includes(term) || r.referenceNumber.toLowerCase().includes(term) || r.id.toLowerCase().includes(term));
    if (receiptFilters.status !== "all") receipts = receipts.filter((r) => r.status === receiptFilters.status);

    if (!receipts.length) {
      wrap.innerHTML = Components.emptyState({ title: "No receiving orders found", message: "Try a different filter, or create a new receiving order." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Receipt</th><th>Supplier</th><th>Reference</th><th>Date</th><th>Items</th><th>Units</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${receipts.map((r) => `
              <tr>
                <td class="cell-strong">${escapeHtml(r.id)}</td>
                <td>${escapeHtml(r.supplierName)}</td>
                <td class="cell-code">${escapeHtml(r.referenceNumber)}</td>
                <td class="cell-soft">${formatDate(r.date)}</td>
                <td class="tabular">${r.items.length}</td>
                <td class="tabular cell-soft">${r.items.reduce((s, it) => s + it.quantity, 0)}</td>
                <td>${Components.badge(r.status)}</td>
                <td class="row-actions">
                  <button class="btn btn-outline btn-sm" data-view="${r.id}">View</button>
                  ${r.status === "Pending" || r.status === "Partially Received" ? `<button class="btn btn-primary btn-sm" data-confirm="${r.id}">Confirm</button>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewReceipt(b.dataset.view)));
    wrap.querySelectorAll("[data-confirm]").forEach((b) => b.addEventListener("click", () => confirmReceipt(b.dataset.confirm)));
  }

  function openReceiptModal() {
    const suppliers = Storage.getSuppliers();
    const products = Storage.getProducts();
    const locations = Locations.getAvailableLocations();
    draftItems = [{ productId: products[0]?.id, quantity: 1, locationId: locations[0]?.id }];

    Components.openModal({
      title: "New Receiving Order",
      size: "lg",
      bodyHTML: `
        <form id="receipt-form">
          <div class="field-row">
            <div class="field"><label for="rf-supplier">Supplier</label>
              <select id="rf-supplier">${suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label for="rf-reference">Reference number</label><input id="rf-reference" value="PO-${Math.floor(10000 + Math.random() * 89999)}" /></div>
          </div>
          <label>Items</label>
          <div id="receipt-items"></div>
          <button type="button" class="btn btn-ghost btn-sm mt-8" id="add-item-btn">+ Add item</button>
          <div class="field mt-16"><label for="rf-notes">Notes</label><textarea id="rf-notes" rows="2"></textarea></div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="receipt-save-btn">Create Order</button>`,
      onOpen: (root) => {
        paintItems(root, products, locations);
        root.querySelector("#add-item-btn").addEventListener("click", () => {
          draftItems.push({ productId: products[0]?.id, quantity: 1, locationId: locations[0]?.id });
          paintItems(root, products, locations);
        });
        root.querySelector("#receipt-save-btn").addEventListener("click", () => saveReceiptFromModal(root));
      }
    });
  }

  function paintItems(root, products, locations) {
    const wrap = root.querySelector("#receipt-items");
    wrap.innerHTML = draftItems.map((item, idx) => `
      <div class="field-row" style="grid-template-columns: 2fr 1fr 1.4fr auto; align-items:end; margin-bottom:8px;" data-item-row="${idx}">
        <div class="field" style="margin:0;"><label>Product</label>
          <select class="item-product">${products.map((p) => `<option value="${p.id}" ${item.productId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
        </div>
        <div class="field" style="margin:0;"><label>Qty</label><input type="number" class="item-qty" min="1" step="1" value="${item.quantity}" /></div>
        <div class="field" style="margin:0;"><label>Location</label>
          <select class="item-location">${locations.map((l) => `<option value="${l.id}" ${item.locationId === l.id ? "selected" : ""}>${escapeHtml(l.id)}</option>`).join("")}</select>
        </div>
        <button type="button" class="icon-btn danger remove-item-btn" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
    `).join("");

    wrap.querySelectorAll(".item-product").forEach((el, i) => el.addEventListener("change", () => { draftItems[i].productId = el.value; }));
    wrap.querySelectorAll(".item-qty").forEach((el, i) => el.addEventListener("input", () => { draftItems[i].quantity = parseInt(el.value, 10) || 1; }));
    wrap.querySelectorAll(".item-location").forEach((el, i) => el.addEventListener("change", () => { draftItems[i].locationId = el.value; }));
    wrap.querySelectorAll(".remove-item-btn").forEach((btn, i) => btn.addEventListener("click", () => {
      if (draftItems.length <= 1) { Components.toast("A receiving order needs at least one item.", "error"); return; }
      draftItems.splice(i, 1);
      paintItems(root, products, locations);
    }));
  }

  function saveReceiptFromModal(root) {
    const suppliers = Storage.getSuppliers();
    const products = Storage.getProducts();
    const supplierId = document.getElementById("rf-supplier").value;
    const supplier = suppliers.find((s) => s.id === supplierId);
    const items = draftItems.map((it) => {
      const p = products.find((pp) => pp.id === it.productId);
      return { productId: it.productId, productName: p ? p.name : "", sku: p ? p.sku : "", quantity: it.quantity, locationId: it.locationId };
    });

    const receipt = {
      id: Utils.nextId("RCV", "nextReceiptSeq"),
      supplierId, supplierName: supplier ? supplier.name : "",
      date: new Date().toISOString().slice(0, 10),
      referenceNumber: document.getElementById("rf-reference").value.trim(),
      items,
      status: "Pending",
      notes: document.getElementById("rf-notes").value.trim()
    };
    const receipts = Storage.getReceipts();
    receipts.push(receipt);
    Storage.saveReceipts(receipts);
    Components.closeModal();
    Components.toast(`Receiving order ${receipt.id} created.`, "success");
    renderTable();
  }

  function viewReceipt(receiptId) {
    const receipt = Storage.getReceipts().find((r) => r.id === receiptId);
    Components.openModal({
      title: `Receiving Order · ${receipt.id}`,
      size: "lg",
      bodyHTML: `
        <div class="info-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px 20px; margin-bottom:18px;">
          <div><label>Supplier</label><p>${escapeHtml(receipt.supplierName)}</p></div>
          <div><label>Reference</label><p class="cell-code">${escapeHtml(receipt.referenceNumber)}</p></div>
          <div><label>Date</label><p>${formatDate(receipt.date)}</p></div>
          <div><label>Status</label><p>${Components.badge(receipt.status)}</p></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Location</th></tr></thead>
          <tbody>${receipt.items.map((it) => `<tr><td class="cell-strong">${escapeHtml(it.productName)}</td><td class="cell-code">${escapeHtml(it.sku)}</td><td class="tabular">${it.quantity}</td><td class="cell-code">${escapeHtml(it.locationId)}</td></tr>`).join("")}</tbody>
        </table></div>
        ${receipt.notes ? `<p class="text-soft mt-16" style="font-size:12.5px;">${escapeHtml(receipt.notes)}</p>` : ""}
      `,
      footerHTML: `
        <button class="btn btn-outline" data-close-modal>Close</button>
        ${receipt.status === "Pending" || receipt.status === "Partially Received" ? `<button class="btn btn-primary" id="confirm-from-view-btn">Confirm Receipt</button>` : ""}
      `,
      onOpen: (root) => {
        const btn = root.querySelector("#confirm-from-view-btn");
        if (btn) btn.addEventListener("click", () => { Components.closeModal(); confirmReceipt(receiptId); });
      }
    });
  }

  function confirmReceipt(receiptId) {
    const receipts = Storage.getReceipts();
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) return;

    const inventory = Storage.getInventory();
    const products = Storage.getProducts();
    const movements = Storage.getMovements();
    const locations = Storage.getLocations();

    receipt.items.forEach((item) => {
      let rec = inventory.find((i) => i.productId === item.productId && i.locationId === item.locationId);
      if (rec) {
        rec.quantity += item.quantity;
      } else {
        const product = products.find((p) => p.id === item.productId);
        inventory.push({
          id: Utils.nextId("INV", "nextInventorySeq"),
          productId: item.productId, productName: item.productName, sku: item.sku,
          locationId: item.locationId, quantity: item.quantity, reservedQuantity: 0,
          minStock: product ? product.reorderLevel : 10,
          maxStock: product ? product.reorderLevel * 4 : 100
        });
      }
      const loc = locations.find((l) => l.id === item.locationId);
      if (loc) {
        loc.currentUtilization = Math.min(loc.currentUtilization + item.quantity, loc.capacity * 1.5);
        loc.status = loc.currentUtilization >= loc.capacity ? "Full" : loc.currentUtilization > 0 ? "Partially Occupied" : "Available";
      }
      movements.push({
        id: Utils.nextId("MOV", "nextMovementSeq"),
        date: new Date().toISOString().slice(0, 10),
        productId: item.productId, productName: item.productName, sku: item.sku,
        type: "Receiving", quantity: item.quantity,
        fromLocationId: null, toLocationId: item.locationId,
        reference: receipt.id, reason: "Goods receipt confirmed", notes: ""
      });
    });

    receipt.status = "Received";
    Storage.saveInventory(inventory);
    Storage.saveLocations(locations);
    Storage.saveMovements(movements);
    Storage.saveReceipts(receipts);
    Components.toast(`Receipt ${receipt.id} confirmed — inventory updated.`, "success");
    renderTable();
  }

  global.Receiving = { render };
})(window);
