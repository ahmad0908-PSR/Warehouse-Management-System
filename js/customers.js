/**
 * customers.js
 * Customer CRUD plus a quick view of each customer's dispatch history.
 */
(function (global) {
  "use strict";

  const { formatDate, escapeHtml } = Utils;
  let customerSearch = "";

  function render(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="customer-search" placeholder="Search customers…" value="${escapeHtml(customerSearch)}" />
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-customer-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          Add Customer
        </button>
      </div>
      <div id="customers-table-wrap"></div>
    `;
    renderTable();
    document.getElementById("customer-search").addEventListener("input", Utils.debounce((e) => { customerSearch = e.target.value; renderTable(); }, 200));
    document.getElementById("add-customer-btn").addEventListener("click", () => openModal());
  }

  function renderTable() {
    const wrap = document.getElementById("customers-table-wrap");
    const dispatches = Storage.getDispatches();
    let customers = Storage.getCustomers();
    const term = customerSearch.trim().toLowerCase();
    if (term) customers = customers.filter((c) => c.name.toLowerCase().includes(term) || (c.contactPerson || "").toLowerCase().includes(term));

    if (!customers.length) {
      wrap.innerHTML = Components.emptyState({ title: "No customers found", message: "Try a different search, or add a new customer." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Contact</th><th>Phone</th><th>Orders</th><th></th></tr></thead>
          <tbody>
            ${customers.map((c) => {
              const orderCount = dispatches.filter((d) => d.customerId === c.id).length;
              return `
                <tr>
                  <td class="cell-strong">${escapeHtml(c.name)}</td>
                  <td class="cell-soft">${escapeHtml(c.contactPerson || "—")}</td>
                  <td class="cell-soft">${escapeHtml(c.phone || "—")}</td>
                  <td class="tabular">${orderCount}</td>
                  <td class="row-actions">
                    <button class="btn btn-outline btn-sm" data-view="${c.id}">History</button>
                    <button class="icon-btn" data-edit="${c.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Z"/></svg></button>
                    <button class="icon-btn danger" data-delete="${c.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg></button>
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
    wrap.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteCustomer(b.dataset.delete)));
  }

  function viewHistory(customerId) {
    const customer = Storage.getCustomers().find((c) => c.id === customerId);
    const dispatches = Storage.getDispatches().filter((d) => d.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date));
    Components.openModal({
      title: `${customer.name} · Dispatch History`,
      size: "lg",
      bodyHTML: dispatches.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Dispatch</th><th>Reference</th><th>Date</th><th>Items</th><th>Status</th></tr></thead>
          <tbody>${dispatches.map((d) => `<tr><td class="cell-strong">${escapeHtml(d.id)}</td><td class="cell-code">${escapeHtml(d.referenceNumber)}</td><td class="cell-soft">${formatDate(d.date)}</td><td class="tabular">${d.items.length}</td><td>${Components.badge(d.status)}</td></tr>`).join("")}</tbody>
        </table></div>
      ` : Components.emptyState({ title: "No dispatch history", message: "No orders have been placed for this customer yet." }),
      footerHTML: `<button class="btn btn-outline" data-close-modal>Close</button>`
    });
  }

  function openModal(customerId) {
    const customer = customerId ? Storage.getCustomers().find((c) => c.id === customerId) : null;
    Components.openModal({
      title: customerId ? "Edit Customer" : "Add Customer",
      bodyHTML: `
        <form id="customer-form">
          <div class="field"><label for="cf-name">Customer name</label><input id="cf-name" required value="${escapeHtml(customer?.name || "")}" /></div>
          <div class="field-row">
            <div class="field"><label for="cf-contact">Contact person</label><input id="cf-contact" value="${escapeHtml(customer?.contactPerson || "")}" /></div>
            <div class="field"><label for="cf-phone">Phone</label><input id="cf-phone" value="${escapeHtml(customer?.phone || "")}" /></div>
          </div>
          <div class="field"><label for="cf-email">Email</label><input id="cf-email" type="email" value="${escapeHtml(customer?.email || "")}" /></div>
          <div class="field"><label for="cf-address">Address</label><input id="cf-address" value="${escapeHtml(customer?.address || "")}" /></div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="customer-save-btn">${customerId ? "Save Changes" : "Add Customer"}</button>`,
      onOpen: () => document.getElementById("customer-save-btn").addEventListener("click", () => saveFromModal(customerId))
    });
  }

  function saveFromModal(customerId) {
    const name = document.getElementById("cf-name").value.trim();
    if (!name) { Components.toast("Customer name is required.", "error"); return; }
    const customers = Storage.getCustomers();
    const data = {
      name,
      contactPerson: document.getElementById("cf-contact").value.trim(),
      phone: document.getElementById("cf-phone").value.trim(),
      email: document.getElementById("cf-email").value.trim(),
      address: document.getElementById("cf-address").value.trim()
    };
    if (customerId) {
      const idx = customers.findIndex((c) => c.id === customerId);
      customers[idx] = Object.assign({}, customers[idx], data);
    } else {
      customers.push(Object.assign({ id: `CUS-${Date.now().toString(36)}` }, data));
    }
    Storage.saveCustomers(customers);
    Components.closeModal();
    Components.toast(`Customer ${customerId ? "updated" : "added"}.`, "success");
    renderTable();
  }

  async function deleteCustomer(customerId) {
    const ok = await Components.confirmDialog({ title: "Delete customer?", message: "This removes the customer record.", confirmText: "Delete", danger: true });
    if (!ok) return;
    Storage.saveCustomers(Storage.getCustomers().filter((c) => c.id !== customerId));
    Components.toast("Customer deleted.", "success");
    renderTable();
  }

  global.Customers = { render };
})(window);
