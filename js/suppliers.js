/**
 * suppliers.js
 * Supplier CRUD plus a quick view of each supplier's receiving history.
 */
(function (global) {
  "use strict";

  const { formatDate, escapeHtml } = Utils;
  let supplierSearch = "";

  function render(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="supplier-search" placeholder="Search suppliers…" value="${escapeHtml(supplierSearch)}" />
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-supplier-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          Add Supplier
        </button>
      </div>
      <div id="suppliers-table-wrap"></div>
    `;
    renderTable();
    document.getElementById("supplier-search").addEventListener("input", Utils.debounce((e) => { supplierSearch = e.target.value; renderTable(); }, 200));
    document.getElementById("add-supplier-btn").addEventListener("click", () => openModal());
  }

  function renderTable() {
    const wrap = document.getElementById("suppliers-table-wrap");
    const receipts = Storage.getReceipts();
    let suppliers = Storage.getSuppliers();
    const term = supplierSearch.trim().toLowerCase();
    if (term) suppliers = suppliers.filter((s) => s.name.toLowerCase().includes(term) || (s.contactPerson || "").toLowerCase().includes(term));

    if (!suppliers.length) {
      wrap.innerHTML = Components.emptyState({ title: "No suppliers found", message: "Try a different search, or add a new supplier." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Products Supplied</th><th>Orders</th><th></th></tr></thead>
          <tbody>
            ${suppliers.map((s) => {
              const orderCount = receipts.filter((r) => r.supplierId === s.id).length;
              return `
                <tr>
                  <td class="cell-strong">${escapeHtml(s.name)}</td>
                  <td class="cell-soft">${escapeHtml(s.contactPerson || "—")}</td>
                  <td class="cell-soft">${escapeHtml(s.phone || "—")}</td>
                  <td class="cell-soft">${escapeHtml(s.productsSupplied || "—")}</td>
                  <td class="tabular">${orderCount}</td>
                  <td class="row-actions">
                    <button class="btn btn-outline btn-sm" data-view="${s.id}">History</button>
                    <button class="icon-btn" data-edit="${s.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Z"/></svg></button>
                    <button class="icon-btn danger" data-delete="${s.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg></button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewHistory(b.dataset.view)));
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openModal(b.dataset.edit)));
    wrap.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteSupplier(b.dataset.delete)));
  }

  function viewHistory(supplierId) {
    const supplier = Storage.getSuppliers().find((s) => s.id === supplierId);
    const receipts = Storage.getReceipts().filter((r) => r.supplierId === supplierId).sort((a, b) => new Date(b.date) - new Date(a.date));
    Components.openModal({
      title: `${supplier.name} · Receiving History`,
      size: "lg",
      bodyHTML: receipts.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Receipt</th><th>Reference</th><th>Date</th><th>Items</th><th>Status</th></tr></thead>
          <tbody>${receipts.map((r) => `<tr><td class="cell-strong">${escapeHtml(r.id)}</td><td class="cell-code">${escapeHtml(r.referenceNumber)}</td><td class="cell-soft">${formatDate(r.date)}</td><td class="tabular">${r.items.length}</td><td>${Components.badge(r.status)}</td></tr>`).join("")}</tbody>
        </table></div>
      ` : Components.emptyState({ title: "No receiving history", message: "No orders have been placed with this supplier yet." }),
      footerHTML: `<button class="btn btn-outline" data-close-modal>Close</button>`
    });
  }

  function openModal(supplierId) {
    const supplier = supplierId ? Storage.getSuppliers().find((s) => s.id === supplierId) : null;
    Components.openModal({
      title: supplierId ? "Edit Supplier" : "Add Supplier",
      bodyHTML: `
        <form id="supplier-form">
          <div class="field"><label for="sf-name">Supplier name</label><input id="sf-name" required value="${escapeHtml(supplier?.name || "")}" /></div>
          <div class="field-row">
            <div class="field"><label for="sf-contact">Contact person</label><input id="sf-contact" value="${escapeHtml(supplier?.contactPerson || "")}" /></div>
            <div class="field"><label for="sf-phone">Phone</label><input id="sf-phone" value="${escapeHtml(supplier?.phone || "")}" /></div>
          </div>
          <div class="field"><label for="sf-email">Email</label><input id="sf-email" type="email" value="${escapeHtml(supplier?.email || "")}" /></div>
          <div class="field"><label for="sf-address">Address</label><input id="sf-address" value="${escapeHtml(supplier?.address || "")}" /></div>
          <div class="field"><label for="sf-products">Products supplied</label><input id="sf-products" value="${escapeHtml(supplier?.productsSupplied || "")}" /></div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="supplier-save-btn">${supplierId ? "Save Changes" : "Add Supplier"}</button>`,
      onOpen: () => document.getElementById("supplier-save-btn").addEventListener("click", () => saveFromModal(supplierId))
    });
  }

  function saveFromModal(supplierId) {
    const name = document.getElementById("sf-name").value.trim();
    if (!name) { Components.toast("Supplier name is required.", "error"); return; }
    const suppliers = Storage.getSuppliers();
    const data = {
      name,
      contactPerson: document.getElementById("sf-contact").value.trim(),
      phone: document.getElementById("sf-phone").value.trim(),
      email: document.getElementById("sf-email").value.trim(),
      address: document.getElementById("sf-address").value.trim(),
      productsSupplied: document.getElementById("sf-products").value.trim()
    };
    if (supplierId) {
      const idx = suppliers.findIndex((s) => s.id === supplierId);
      suppliers[idx] = Object.assign({}, suppliers[idx], data);
    } else {
      suppliers.push(Object.assign({ id: `SUP-${Date.now().toString(36)}` }, data));
    }
    Storage.saveSuppliers(suppliers);
    Components.closeModal();
    Components.toast(`Supplier ${supplierId ? "updated" : "added"}.`, "success");
    renderTable();
  }

  async function deleteSupplier(supplierId) {
    const ok = await Components.confirmDialog({ title: "Delete supplier?", message: "This removes the supplier record.", confirmText: "Delete", danger: true });
    if (!ok) return;
    Storage.saveSuppliers(Storage.getSuppliers().filter((s) => s.id !== supplierId));
    Components.toast("Supplier deleted.", "success");
    renderTable();
  }

  global.Suppliers = { render };
})(window);
