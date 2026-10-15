/**
 * app.js
 * Router + dashboard + reports + settings + app chrome for Meridian
 * WMS. Inventory/products, locations, receiving, dispatch, transfers,
 * adjustments, stock count, suppliers and customers each live in their
 * own module.
 */
(function (global) {
  "use strict";

  const { formatCurrency, formatDate, isSameDay, escapeHtml, round2 } = Utils;

  const ROUTES = {
    dashboard: { title: "Dashboard", subtitle: "A snapshot of warehouse operations today.", render: renderDashboard },
    inventory: { title: "Inventory", subtitle: "Quantity, reserved and available stock by location.", render: (c) => Inventory.renderInventory(c) },
    products: { title: "Products", subtitle: "The warehouse's product catalog.", render: (c) => Inventory.renderProducts(c) },
    locations: { title: "Locations", subtitle: "Zone → Aisle → Rack → Shelf → Bin.", render: (c) => Locations.render(c) },
    receiving: { title: "Receiving", subtitle: "Inbound orders from suppliers.", render: (c) => Receiving.render(c) },
    dispatch: { title: "Dispatch", subtitle: "Outbound orders to customers.", render: (c) => Dispatch.render(c) },
    transfers: { title: "Transfers", subtitle: "Move stock between locations.", render: (c) => StockMovements.renderTransfers(c) },
    adjustments: { title: "Stock Adjustments", subtitle: "Increases, decreases, damage, loss, correction and returns.", render: (c) => StockMovements.renderAdjustments(c) },
    "stock-count": { title: "Stock Count", subtitle: "Compare expected vs counted quantities by location.", render: (c) => StockMovements.renderStockCount(c) },
    suppliers: { title: "Suppliers", subtitle: "Vendors and their receiving history.", render: (c) => Suppliers.render(c) },
    customers: { title: "Customers", subtitle: "Customers and their dispatch history.", render: (c) => Customers.render(c) },
    reports: { title: "Reports", subtitle: "Inventory, movement, receiving, dispatch and valuation reports.", render: renderReports },
    settings: { title: "Settings", subtitle: "Warehouse info and data management.", render: renderSettings }
  };

  let charts = {};

  // ---------------------------------------------------------------------
  // Boot + routing
  // ---------------------------------------------------------------------

  async function boot() {
    await Storage.init();
    applyChrome();
    wireChrome();
    window.addEventListener("hashchange", route);
    if (!global.location.hash) global.location.hash = "#/dashboard";
    route();
  }

  function applyChrome() {
    const cfg = Storage.getConfig();
    document.title = cfg.warehouseName || "Meridian Distribution Center";
    const brand = document.querySelector(".brand-name");
    if (brand) brand.textContent = (cfg.warehouseName || "Meridian").split(" ")[0].toUpperCase();
    const link = document.getElementById("portfolio-link");
    if (link) link.href = cfg.portfolioUrl || "#";
  }

  function wireChrome() {
    const shell = document.querySelector(".app-shell");
    document.getElementById("sidebar-collapse").addEventListener("click", () => shell.classList.toggle("collapsed"));
    document.getElementById("mobile-nav-toggle").addEventListener("click", () => shell.classList.add("mobile-open"));
    document.getElementById("sidebar-scrim").addEventListener("click", closeMobileNav);
    document.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", closeMobileNav));
  }

  function closeMobileNav() {
    document.querySelector(".app-shell").classList.remove("mobile-open");
  }

  function currentRouteName() {
    const hash = global.location.hash.replace(/^#\/?/, "");
    return ROUTES[hash] ? hash : "dashboard";
  }

  function route() {
    destroyCharts();
    const name = currentRouteName();
    const def = ROUTES[name];
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
    document.getElementById("page-title").textContent = def.title;
    document.getElementById("page-subtitle").textContent = def.subtitle || "";
    const content = document.getElementById("app-content");
    content.innerHTML = "";
    def.render(content);
  }

  function goTo(routeName) {
    global.location.hash = `#/${routeName}`;
  }

  function destroyCharts() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
  }

  global.App = { goTo, route };

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------

  function renderDashboard(container) {
    const products = Storage.getProducts();
    const inventory = Storage.getInventory();
    const locations = Storage.getLocations();
    const receipts = Storage.getReceipts();
    const dispatches = Storage.getDispatches();
    const movements = Storage.getMovements();

    const totalUnits = inventory.reduce((s, i) => s + i.quantity, 0);
    const valuation = Reports.inventoryValuation(inventory, products);
    const lowStock = inventory.filter((i) => Inventory.stockStatus(i) === "Low Stock").length;
    const outOfStock = inventory.filter((i) => Inventory.stockStatus(i) === "Out of Stock").length;
    const pendingReceiving = receipts.filter((r) => r.status === "Pending" || r.status === "Partially Received").length;
    const pendingDispatch = dispatches.filter((d) => d.status !== "Dispatched" && d.status !== "Cancelled").length;
    const todaysReceived = movements.filter((m) => m.type === "Receiving" && isSameDay(m.date)).reduce((s, m) => s + m.quantity, 0);
    const todaysDispatched = movements.filter((m) => m.type === "Dispatch" && isSameDay(m.date)).reduce((s, m) => s + m.quantity, 0);

    container.innerHTML = `
      <div class="grid grid-stats">
        ${statCard("Total Products", products.length)}
        ${statCard("Total Inventory Units", totalUnits.toLocaleString())}
        ${statCard("Inventory Value", formatCurrency(valuation.totalPurchaseValue))}
        ${statCard("Storage Locations", locations.length)}
      </div>
      <div class="grid grid-stats mt-16">
        ${statCard("Low-Stock Items", lowStock, "below minimum", lowStock ? "negative" : "", lowStock ? "accent-danger" : "")}
        ${statCard("Out-of-Stock Items", outOfStock, "need reordering", outOfStock ? "negative" : "", outOfStock ? "accent-danger" : "")}
        ${statCard("Pending Receiving", pendingReceiving, "orders awaiting confirmation")}
        ${statCard("Pending Dispatch", pendingDispatch, "orders in progress")}
      </div>
      <div class="grid grid-stats mt-16">
        ${statCard("Today's Received Units", todaysReceived, "", "", "accent-info")}
        ${statCard("Today's Dispatched Units", todaysDispatched, "", "", "accent-info")}
        ${statCard("Est. Gross Margin", formatCurrency(valuation.grossMargin), `${valuation.marginPct}% margin`, "", "accent-info")}
        ${statCard("Avg. Utilization", avgUtilization(locations) + "%", "across all locations")}
      </div>
      <div class="grid grid-charts">
        <div class="card chart-card"><div class="card-title-row"><h3>Inventory by Category</h3></div><canvas id="chart-category"></canvas></div>
        <div class="card chart-card"><div class="card-title-row"><h3>Warehouse Utilization by Zone</h3></div><canvas id="chart-utilization"></canvas></div>
      </div>
      <div class="grid grid-charts-2">
        <div class="card chart-card"><div class="card-title-row"><h3>Receiving vs Dispatch Trend (14 days)</h3></div><canvas id="chart-trend"></canvas></div>
        <div class="card chart-card"><div class="card-title-row"><h3>Stock Movement by Type</h3></div><canvas id="chart-movement-type"></canvas></div>
      </div>
    `;

    try {
      drawCategory(inventory, products);
      drawUtilization(locations);
      drawTrend(movements);
      drawMovementType(movements);
    } catch (e) {
      console.warn("Dashboard charts could not be drawn.", e);
    }
  }

  function avgUtilization(locations) {
    if (!locations.length) return 0;
    const total = locations.reduce((s, l) => s + (l.capacity ? l.currentUtilization / l.capacity : 0), 0);
    return Math.round((total / locations.length) * 100);
  }

  function statCard(label, value, sub, subClass, cardClass) {
    return `<div class="stat-card ${cardClass || ""}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value tabular">${value}</div>${sub ? `<div class="stat-sub ${subClass || ""}">${escapeHtml(sub)}</div>` : ""}</div>`;
  }

  function drawCategory(inventory, products) {
    const map = {};
    inventory.forEach((i) => {
      const p = products.find((pp) => pp.id === i.productId);
      const cat = p ? p.category : "Uncategorized";
      map[cat] = (map[cat] || 0) + i.quantity;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ctx = document.getElementById("chart-category");
    if (!ctx) return;
    charts.category = new Chart(ctx, {
      type: "doughnut",
      data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: ["#F5B700", "#1E293B", "#2F6FED", "#1F9D63", "#D6455B", "#C4791A", "#8B99A8", "#7C5CFF"] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10.5 } } } } }
    });
  }

  function drawUtilization(locations) {
    const zones = [...new Set(locations.map((l) => l.zone))].sort();
    const data = zones.map((z) => {
      const zoneLocs = locations.filter((l) => l.zone === z);
      const cap = zoneLocs.reduce((s, l) => s + l.capacity, 0);
      const used = zoneLocs.reduce((s, l) => s + l.currentUtilization, 0);
      return cap ? Math.round((used / cap) * 100) : 0;
    });
    const ctx = document.getElementById("chart-utilization");
    if (!ctx) return;
    charts.utilization = new Chart(ctx, {
      type: "bar",
      data: { labels: zones.map((z) => `Zone ${z}`), datasets: [{ label: "Utilization %", data, backgroundColor: "#F5B700", borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } } } }
    });
  }

  function drawTrend(movements) {
    const days = [];
    const received = [];
    const dispatched = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      received.push(movements.filter((m) => m.type === "Receiving" && m.date === key).reduce((s, m) => s + m.quantity, 0));
      dispatched.push(movements.filter((m) => m.type === "Dispatch" && m.date === key).reduce((s, m) => s + m.quantity, 0));
    }
    const ctx = document.getElementById("chart-trend");
    if (!ctx) return;
    charts.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels: days,
        datasets: [
          { label: "Received", data: received, borderColor: "#1F9D63", backgroundColor: "rgba(31,157,99,0.1)", tension: 0.3, fill: true, pointRadius: 2 },
          { label: "Dispatched", data: dispatched, borderColor: "#2F6FED", backgroundColor: "rgba(47,111,237,0.1)", tension: 0.3, fill: true, pointRadius: 2 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function drawMovementType(movements) {
    const types = ["Receiving", "Dispatch", "Transfer", "Increase", "Decrease", "Damage", "Loss", "Correction", "Return"];
    const data = types.map((t) => movements.filter((m) => m.type === t).length);
    const ctx = document.getElementById("chart-movement-type");
    if (!ctx) return;
    charts.movementType = new Chart(ctx, {
      type: "bar",
      data: { labels: types, datasets: [{ label: "Movements", data, backgroundColor: "#1E293B", borderRadius: 4 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------

  let activeReport = "inventory";

  function renderReports(container) {
    container.innerHTML = `
      <div class="page-toolbar">
        <div class="pill-row" id="report-tabs">
          ${[
            ["inventory", "Inventory"], ["movement", "Stock Movement"], ["receiving", "Receiving"],
            ["dispatch", "Dispatch"], ["utilization", "Location Utilization"], ["lowstock", "Low Stock"],
            ["variance", "Stock Variance"], ["supplier", "Supplier"], ["customer", "Customer Dispatch"], ["valuation", "Inventory Valuation"]
          ].map(([k, label]) => `<button class="pill ${activeReport === k ? "active" : ""}" data-report="${k}">${label}</button>`).join("")}
        </div>
        <div class="spacer"></div>
        <button class="btn btn-outline" id="print-report-btn">
          <svg class="btn-icon" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M6 14h12v7H6v-7Z"/></svg>
          Print Report
        </button>
      </div>
      <div id="report-body" class="card"></div>
    `;
    renderReportBody();
    document.getElementById("report-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-report]");
      if (!btn) return;
      activeReport = btn.dataset.report;
      renderReports(container);
    });
    document.getElementById("print-report-btn").addEventListener("click", () => window.print());
  }

  function reportTable(headers, rows) {
    if (!rows.length) return Components.emptyState({ title: "No data yet", message: "There's nothing to report for this selection yet." });
    return `<div class="table-wrap" id="print-area"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderReportBody() {
    const body = document.getElementById("report-body");
    const products = Storage.getProducts();
    const inventory = Storage.getInventory();
    const locations = Storage.getLocations();
    const receipts = Storage.getReceipts();
    const dispatches = Storage.getDispatches();
    const movements = Storage.getMovements();
    const suppliers = Storage.getSuppliers();
    const customers = Storage.getCustomers();

    if (activeReport === "inventory") {
      const rows = Reports.inventoryReport(inventory);
      body.innerHTML = `<h3 class="mb-16">Inventory Report</h3>${reportTable(["Product", "SKU", "Location", "Qty", "Reserved", "Available", "Status"], rows.map((r) => [escapeHtml(r.product), escapeHtml(r.sku), escapeHtml(r.location), r.quantity, r.reserved, r.available, Components.badge(r.status)]))}`;
    } else if (activeReport === "movement") {
      const rows = Reports.stockMovementReport(movements);
      body.innerHTML = `<h3 class="mb-16">Stock Movement Report</h3>${reportTable(["Date", "Product", "Type", "Qty", "From", "To"], rows.map((m) => [formatDate(m.date), escapeHtml(m.productName), escapeHtml(m.type), m.quantity, escapeHtml(m.fromLocationId || "—"), escapeHtml(m.toLocationId || "—")]))}`;
    } else if (activeReport === "receiving") {
      const rows = Reports.receivingReport(receipts);
      body.innerHTML = `<h3 class="mb-16">Receiving Report</h3>${reportTable(["Receipt", "Supplier", "Date", "Items", "Status"], rows.map((r) => [escapeHtml(r.id), escapeHtml(r.supplierName), formatDate(r.date), r.items.length, Components.badge(r.status)]))}`;
    } else if (activeReport === "dispatch") {
      const rows = Reports.dispatchReport(dispatches);
      body.innerHTML = `<h3 class="mb-16">Dispatch Report</h3>${reportTable(["Dispatch", "Customer", "Date", "Items", "Status"], rows.map((d) => [escapeHtml(d.id), escapeHtml(d.customerName), formatDate(d.date), d.items.length, Components.badge(d.status)]))}`;
    } else if (activeReport === "utilization") {
      const rows = Reports.locationUtilizationReport(locations);
      body.innerHTML = `<h3 class="mb-16">Location Utilization</h3>${reportTable(["Location", "Zone", "Capacity", "Utilization", "Utilization %", "Status"], rows.map((r) => [escapeHtml(r.id), escapeHtml(r.zone), r.capacity, r.utilization, r.utilizationPct + "%", Components.badge(r.status)]))}`;
    } else if (activeReport === "lowstock") {
      const rows = Reports.lowStockReport(inventory);
      body.innerHTML = `<h3 class="mb-16">Low Stock Report</h3>${reportTable(["Product", "SKU", "Location", "Available", "Min Stock", "Status"], rows.map((r) => [escapeHtml(r.product), escapeHtml(r.sku), escapeHtml(r.location), r.available, r.minStock, Components.badge(r.status)]))}`;
    } else if (activeReport === "variance") {
      const rows = Reports.stockVarianceReport(movements);
      body.innerHTML = `<h3 class="mb-16">Stock Variance Report</h3>${reportTable(["Date", "Product", "Location", "Variance", "Reason"], rows.map((r) => [formatDate(r.date), escapeHtml(r.product), escapeHtml(r.location || "—"), r.variance, escapeHtml(r.reason)]))}`;
    } else if (activeReport === "supplier") {
      const rows = Reports.supplierReport(suppliers, receipts);
      body.innerHTML = `<h3 class="mb-16">Supplier Report</h3>${reportTable(["Supplier", "Orders", "Total Units", "Products Supplied"], rows.map((r) => [escapeHtml(r.supplier), r.orders, r.totalUnits, escapeHtml(r.productsSupplied || "—")]))}`;
    } else if (activeReport === "customer") {
      const rows = Reports.customerDispatchReport(customers, dispatches);
      body.innerHTML = `<h3 class="mb-16">Customer Dispatch Report</h3>${reportTable(["Customer", "Orders", "Total Units"], rows.map((r) => [escapeHtml(r.customer), r.orders, r.totalUnits]))}`;
    } else if (activeReport === "valuation") {
      const v = Reports.inventoryValuation(inventory, products);
      body.innerHTML = `<h3 class="mb-16">Inventory Valuation</h3>
        <div class="grid grid-stats">
          ${statCard("Total Units", v.totalUnits.toLocaleString())}
          ${statCard("Purchase Value", formatCurrency(v.totalPurchaseValue))}
          ${statCard("Retail Value", formatCurrency(v.totalRetailValue))}
          ${statCard("Gross Margin", formatCurrency(v.grossMargin) + ` (${v.marginPct}%)`)}
        </div>
        <p class="field-hint mt-16">Purchase value is estimated from each product's weight-based unit cost, since this dataset doesn't track a separate purchase price per product; retail value assumes a 40% markup.</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  function renderSettings(container) {
    const cfg = Storage.getConfig();
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title-row"><h3>Warehouse Information</h3></div>
          <form id="settings-form">
            <div class="field"><label for="st-name">Warehouse name</label><input id="st-name" value="${escapeHtml(cfg.warehouseName || "")}" /></div>
            <div class="field"><label for="st-address">Address</label><input id="st-address" value="${escapeHtml(cfg.address || "")}" /></div>
            <div class="field-row">
              <div class="field"><label for="st-phone">Phone</label><input id="st-phone" value="${escapeHtml(cfg.phone || "")}" /></div>
              <div class="field"><label for="st-email">Email</label><input id="st-email" value="${escapeHtml(cfg.email || "")}" /></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="st-currency">Currency symbol</label><input id="st-currency" value="${escapeHtml(cfg.currencySymbol || "$")}" /></div>
              <div class="field"><label for="st-lowstock">Low-stock threshold</label><input id="st-lowstock" type="number" min="0" step="1" value="${cfg.lowStockThreshold || 25}" /></div>
            </div>
            <button type="button" class="btn btn-primary" id="save-settings-btn">Save Settings</button>
          </form>
        </div>

        <div class="card danger-zone">
          <div class="card-title-row"><h3>Data Management</h3></div>
          <p class="text-soft mb-16">All data is stored locally in your browser. Use these tools to back up, restore, or reset that data.</p>
          <div class="flex gap-8" style="flex-wrap:wrap;">
            <button class="btn btn-outline" id="export-data-btn">Export Data (JSON)</button>
            <label class="btn btn-outline" for="import-data-input" style="cursor:pointer;">Import Data (JSON)</label>
            <input type="file" id="import-data-input" accept="application/json" class="hidden" />
          </div>
          <hr style="border:none; border-top:1px solid var(--color-border); margin:18px 0;" />
          <div class="flex gap-8" style="flex-wrap:wrap;">
            <button class="btn btn-ghost" id="reset-demo-btn">Reset Demo Data</button>
            <button class="btn btn-danger" id="clear-data-btn">Clear All Data</button>
          </div>
          <p class="field-hint mt-16">Reset Demo Data reloads the original sample inventory, receiving, dispatch and movement history. Clear All Data empties transactional data without reseeding — this cannot be undone.</p>
        </div>
      </div>
    `;

    document.getElementById("save-settings-btn").addEventListener("click", () => {
      const val = (id) => document.getElementById(id).value.trim();
      const updated = Object.assign({}, cfg, {
        warehouseName: val("st-name"),
        address: val("st-address"),
        phone: val("st-phone"),
        email: val("st-email"),
        currencySymbol: val("st-currency") || "$",
        lowStockThreshold: parseInt(val("st-lowstock"), 10) || 25
      });
      Storage.saveConfig(updated);
      applyChrome();
      Components.toast("Settings saved.", "success");
    });

    document.getElementById("export-data-btn").addEventListener("click", () => {
      Utils.downloadFile(`meridian-wms-backup-${new Date().toISOString().slice(0, 10)}.json`, Storage.exportAll());
      Components.toast("Data exported.", "success");
    });

    document.getElementById("import-data-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await Utils.readFileAsText(file);
        const ok = await Components.confirmDialog({ title: "Import data?", message: "This overwrites your current data with the contents of this file.", confirmText: "Import", danger: true });
        if (!ok) { e.target.value = ""; return; }
        Storage.importAll(text);
        Components.toast("Data imported successfully.", "success");
        applyChrome();
        route();
      } catch (err) {
        Components.toast("Could not import that file. Make sure it's a valid export.", "error");
      }
      e.target.value = "";
    });

    document.getElementById("reset-demo-btn").addEventListener("click", async () => {
      const ok = await Components.confirmDialog({ title: "Reset demo data?", message: "This replaces all current data with the original sample inventory, receiving, dispatch and movement history.", confirmText: "Reset Data", danger: true });
      if (!ok) return;
      await Storage.resetDemoData();
      Components.toast("Demo data restored.", "success");
      applyChrome();
      route();
    });

    document.getElementById("clear-data-btn").addEventListener("click", async () => {
      const ok = await Components.confirmDialog({ title: "Clear all data?", message: "This permanently empties your inventory, receiving, dispatch and stock movement records.", confirmText: "Clear Data", danger: true });
      if (!ok) return;
      Storage.clearAppData();
      Components.toast("All application data cleared.", "success");
      route();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})(window);
