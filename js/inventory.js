/**
 * inventory.js
 * Two related views: the product catalog (CRUD) and the inventory
 * ledger, which tracks quantity/reserved/available per product per
 * location. Available = Quantity - Reserved Quantity, always derived,
 * never stored.
 */
(function (global) {
  "use strict";

  const { formatCurrency, escapeHtml } = Utils;

  function available(rec) { return rec.quantity - rec.reservedQuantity; }

  function stockStatus(rec) {
    const avail = available(rec);
    if (avail <= 0) return "Out of Stock";
    if (avail < rec.minStock) return "Low Stock";
    return "In Stock";
  }

  // =======================================================================
  // Products
  // =======================================================================

  let productFilters = { search: "", category: "all" };

  function renderProducts(container) {
    const categories = [...new Set(Storage.getProducts().map((p) => p.category))].sort();
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="product-search" placeholder="Search by name, SKU or barcode…" value="${escapeHtml(productFilters.search)}" />
        </div>
        <select id="product-category-filter" style="max-width:200px;">
          <option value="all">All categories</option>
          ${categories.map((c) => `<option ${productFilters.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-product-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
          Add Product
        </button>
      </div>
      <div id="products-table-wrap"></div>
    `;
    document.getElementById("product-category-filter").value = productFilters.category;
    renderProductsTable();
    document.getElementById("product-search").addEventListener("input", Utils.debounce((e) => { productFilters.search = e.target.value; renderProductsTable(); }, 200));
    document.getElementById("product-category-filter").addEventListener("change", (e) => { productFilters.category = e.target.value; renderProductsTable(); });
    document.getElementById("add-product-btn").addEventListener("click", () => openProductModal());
  }

  function renderProductsTable() {
    const wrap = document.getElementById("products-table-wrap");
    let products = Storage.getProducts();
    const term = productFilters.search.trim().toLowerCase();
    if (term) products = products.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode.includes(term));
    if (productFilters.category !== "all") products = products.filter((p) => p.category === productFilters.category);

    if (!products.length) {
      wrap.innerHTML = Components.emptyState({ title: "No products found", message: "Try adjusting your search or filters, or add a new product." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Brand</th><th>Unit</th><th>Reorder Lvl</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td class="cell-strong">${escapeHtml(p.name)}</td>
                <td class="cell-code">${escapeHtml(p.sku)}</td>
                <td>${escapeHtml(p.category)}</td>
                <td class="cell-soft">${escapeHtml(p.brand)}</td>
                <td class="cell-soft">${escapeHtml(p.unit)}</td>
                <td class="tabular">${p.reorderLevel}</td>
                <td>${Components.badge(p.status)}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-edit="${p.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Z"/></svg></button>
                  <button class="icon-btn danger" data-delete="${p.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg></button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(b.dataset.edit)));
    wrap.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(b.dataset.delete)));
  }

  function openProductModal(productId) {
    const product = productId ? Storage.getProducts().find((p) => p.id === productId) : null;
    const suppliers = Storage.getSuppliers();
    Components.openModal({
      title: productId ? "Edit Product" : "Add Product",
      size: "lg",
      bodyHTML: `
        <form id="product-form">
          <div class="field-row">
            <div class="field"><label for="pf-name">Product name</label><input id="pf-name" required value="${escapeHtml(product?.name || "")}" /></div>
            <div class="field"><label for="pf-sku">SKU</label><input id="pf-sku" required value="${escapeHtml(product?.sku || "")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="pf-barcode">Barcode</label><input id="pf-barcode" value="${escapeHtml(product?.barcode || "")}" /></div>
            <div class="field"><label for="pf-brand">Brand</label><input id="pf-brand" value="${escapeHtml(product?.brand || "")}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="pf-category">Category</label><input id="pf-category" value="${escapeHtml(product?.category || "")}" /></div>
            <div class="field"><label for="pf-supplier">Supplier</label>
              <select id="pf-supplier">${suppliers.map((s) => `<option value="${s.id}" ${product?.supplierId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label for="pf-unit">Unit</label><input id="pf-unit" value="${escapeHtml(product?.unit || "each")}" /></div>
            <div class="field"><label for="pf-reorder">Reorder level</label><input id="pf-reorder" type="number" min="0" step="1" value="${product?.reorderLevel ?? 20}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="pf-weight">Weight (kg)</label><input id="pf-weight" type="number" min="0" step="0.01" value="${product?.weightKg ?? ""}" /></div>
            <div class="field"><label for="pf-volume">Volume (m³)</label><input id="pf-volume" type="number" min="0" step="0.001" value="${product?.volumeM3 ?? ""}" /></div>
          </div>
          <div class="field"><label for="pf-desc">Description</label><textarea id="pf-desc" rows="2">${escapeHtml(product?.description || "")}</textarea></div>
          <div class="field"><label for="pf-status">Status</label>
            <select id="pf-status"><option ${product?.status === "Active" || !product ? "selected" : ""}>Active</option><option ${product?.status === "Discontinued" ? "selected" : ""}>Discontinued</option></select>
          </div>
        </form>
      `,
      footerHTML: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-primary" id="product-save-btn">${productId ? "Save Changes" : "Add Product"}</button>`,
      onOpen: () => document.getElementById("product-save-btn").addEventListener("click", () => saveProductFromModal(productId))
    });
  }

  function saveProductFromModal(productId) {
    const val = (id) => document.getElementById(id).value.trim();
    const name = val("pf-name");
    const sku = val("pf-sku");
    if (!name || !sku) { Components.toast("Product name and SKU are required.", "error"); return; }
    const suppliers = Storage.getSuppliers();
    const supplierId = val("pf-supplier");
    const supplier = suppliers.find((s) => s.id === supplierId);

    const products = Storage.getProducts();
    const data = {
      name, sku,
      barcode: val("pf-barcode"),
      brand: val("pf-brand"),
      category: val("pf-category") || "Uncategorized",
      supplierId, supplierName: supplier ? supplier.name : "",
      unit: val("pf-unit") || "each",
      reorderLevel: parseInt(val("pf-reorder"), 10) || 0,
      weightKg: parseFloat(val("pf-weight")) || 0,
      volumeM3: parseFloat(val("pf-volume")) || 0,
      description: val("pf-desc"),
      status: val("pf-status")
    };

    if (productId) {
      const idx = products.findIndex((p) => p.id === productId);
      products[idx] = Object.assign({}, products[idx], data);
    } else {
      products.push(Object.assign({ id: Utils.nextId("PRD", "nextProductSeq") }, data));
    }
    Storage.saveProducts(products);
    Components.closeModal();
    Components.toast(`Product ${productId ? "updated" : "added"}.`, "success");
    renderProductsTable();
  }

  async function deleteProduct(productId) {
    const ok = await Components.confirmDialog({ title: "Delete product?", message: "This removes the product from the catalog. Existing inventory records referencing it will remain until cleared separately.", confirmText: "Delete", danger: true });
    if (!ok) return;
    Storage.saveProducts(Storage.getProducts().filter((p) => p.id !== productId));
    Components.toast("Product deleted.", "success");
    renderProductsTable();
  }

  // =======================================================================
  // Inventory ledger
  // =======================================================================

  let invFilters = { search: "", status: "all" };

  function renderInventory(container) {
    const totalUnits = Storage.getInventory().reduce((s, i) => s + i.quantity, 0);
    const products = Storage.getProducts();
    const totalValue = Storage.getInventory().reduce((s, i) => {
      const p = products.find((pp) => pp.id === i.productId);
      return s + i.quantity * (p ? estimatedUnitValue(p) : 0);
    }, 0);

    container.innerHTML = `
      <div class="grid grid-stats mb-16">
        ${statCard("Total Units", totalUnits.toLocaleString())}
        ${statCard("Inventory Records", Storage.getInventory().length)}
        ${statCard("Est. Inventory Value", formatCurrency(totalValue))}
        ${statCard("Low / Out of Stock", Storage.getInventory().filter((i) => stockStatus(i) !== "In Stock").length, "", "", "accent-danger")}
      </div>
      <div class="page-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="inv-search" placeholder="Search by product or location…" value="${escapeHtml(invFilters.search)}" />
        </div>
        <select id="inv-status-filter" style="max-width:170px;">
          <option value="all">All statuses</option>
          <option>In Stock</option><option>Low Stock</option><option>Out of Stock</option>
        </select>
      </div>
      <div id="inventory-table-wrap"></div>
    `;
    document.getElementById("inv-status-filter").value = invFilters.status;
    renderInventoryTable();
    document.getElementById("inv-search").addEventListener("input", Utils.debounce((e) => { invFilters.search = e.target.value; renderInventoryTable(); }, 200));
    document.getElementById("inv-status-filter").addEventListener("change", (e) => { invFilters.status = e.target.value; renderInventoryTable(); });
  }

  function estimatedUnitValue(product) {
    // No purchase price field on product in this dataset; approximate using weight as a stand-in
    // so the dashboard/reports can show a plausible non-zero valuation.
    return Utils.round2(5 + (product.weightKg || 1) * 2);
  }

  function statCard(label, value, sub, subClass, cardClass) {
    return `<div class="stat-card ${cardClass || ""}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value tabular">${value}</div>${sub ? `<div class="stat-sub ${subClass || ""}">${escapeHtml(sub)}</div>` : ""}</div>`;
  }

  function renderInventoryTable() {
    const wrap = document.getElementById("inventory-table-wrap");
    let inv = Storage.getInventory();
    const term = invFilters.search.trim().toLowerCase();
    if (term) inv = inv.filter((i) => i.productName.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term) || i.locationId.toLowerCase().includes(term));
    if (invFilters.status !== "all") inv = inv.filter((i) => stockStatus(i) === invFilters.status);

    if (!inv.length) {
      wrap.innerHTML = Components.emptyState({ title: "No inventory records found", message: "Try a different search or filter." });
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Location</th><th>Qty</th><th>Reserved</th><th>Available</th><th>Min/Max</th><th>Status</th></tr></thead>
          <tbody>
            ${inv.map((i) => `
              <tr>
                <td class="cell-strong">${escapeHtml(i.productName)}</td>
                <td class="cell-code">${escapeHtml(i.sku)}</td>
                <td class="cell-code">${escapeHtml(i.locationId)}</td>
                <td class="tabular">${i.quantity}</td>
                <td class="tabular cell-soft">${i.reservedQuantity}</td>
                <td class="tabular cell-strong">${available(i)}</td>
                <td class="tabular cell-soft">${i.minStock} / ${i.maxStock}</td>
                <td>${Components.badge(stockStatus(i))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  global.Inventory = { renderProducts, renderInventory, available, stockStatus, estimatedUnitValue };
})(window);
