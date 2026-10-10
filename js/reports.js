/**
 * reports.js
 * Pure calculation helpers for the Reports page (and reused by the
 * dashboard). Each function takes raw arrays from Storage and returns
 * plain data — rendering happens in app.js.
 */
(function (global) {
  "use strict";

  const { round2 } = Utils;

  function inRange(dateStr, from, to) {
    const t = new Date(dateStr).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime()) return false;
    return true;
  }

  function inventoryReport(inventory) {
    return inventory.map((i) => ({
      product: i.productName, sku: i.sku, location: i.locationId,
      quantity: i.quantity, reserved: i.reservedQuantity,
      available: i.quantity - i.reservedQuantity,
      status: Inventory.stockStatus(i)
    }));
  }

  function stockMovementReport(movements, from, to) {
    let list = movements;
    if (from || to) list = list.filter((m) => inRange(m.date, from, to));
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function receivingReport(receipts, from, to) {
    let list = receipts;
    if (from || to) list = list.filter((r) => inRange(r.date, from, to));
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function dispatchReport(dispatches, from, to) {
    let list = dispatches;
    if (from || to) list = list.filter((d) => inRange(d.date, from, to));
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function locationUtilizationReport(locations) {
    return locations.map((l) => ({
      id: l.id, zone: l.zone, capacity: l.capacity, utilization: l.currentUtilization,
      utilizationPct: l.capacity ? round2((l.currentUtilization / l.capacity) * 100) : 0,
      status: l.status
    })).sort((a, b) => b.utilizationPct - a.utilizationPct);
  }

  function lowStockReport(inventory) {
    return inventory.filter((i) => Inventory.stockStatus(i) !== "In Stock")
      .map((i) => ({ product: i.productName, sku: i.sku, location: i.locationId, quantity: i.quantity, available: i.quantity - i.reservedQuantity, minStock: i.minStock, status: Inventory.stockStatus(i) }))
      .sort((a, b) => a.available - b.available);
  }

  function stockVarianceReport(movements) {
    return movements.filter((m) => m.type === "Correction" && m.reference === "Stock Count")
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((m) => ({
        date: m.date, product: m.productName, sku: m.sku,
        variance: (m.toLocationId ? "+" : "-") + m.quantity,
        location: m.toLocationId || m.fromLocationId, reason: m.reason
      }));
  }

  function supplierReport(suppliers, receipts) {
    return suppliers.map((s) => {
      const orders = receipts.filter((r) => r.supplierId === s.id);
      const totalUnits = orders.reduce((sum, r) => sum + r.items.reduce((a, it) => a + it.quantity, 0), 0);
      return { supplier: s.name, orders: orders.length, totalUnits, productsSupplied: s.productsSupplied };
    }).sort((a, b) => b.orders - a.orders);
  }

  function customerDispatchReport(customers, dispatches) {
    return customers.map((c) => {
      const orders = dispatches.filter((d) => d.customerId === c.id);
      const totalUnits = orders.reduce((sum, d) => sum + d.items.reduce((a, it) => a + it.quantity, 0), 0);
      return { customer: c.name, orders: orders.length, totalUnits };
    }).sort((a, b) => b.orders - a.orders);
  }

  function inventoryValuation(inventory, products) {
    let totalUnits = 0, totalPurchaseValue = 0, totalRetailValue = 0;
    inventory.forEach((i) => {
      const p = products.find((pp) => pp.id === i.productId);
      const unitValue = p ? Inventory.estimatedUnitValue(p) : 0;
      const retailMarkup = 1.4;
      totalUnits += i.quantity;
      totalPurchaseValue += i.quantity * unitValue;
      totalRetailValue += i.quantity * unitValue * retailMarkup;
    });
    const grossMargin = totalRetailValue - totalPurchaseValue;
    return {
      totalUnits, totalPurchaseValue: round2(totalPurchaseValue),
      totalRetailValue: round2(totalRetailValue), grossMargin: round2(grossMargin),
      marginPct: totalRetailValue ? round2((grossMargin / totalRetailValue) * 100) : 0
    };
  }

  global.Reports = {
    inventoryReport, stockMovementReport, receivingReport, dispatchReport,
    locationUtilizationReport, lowStockReport, stockVarianceReport,
    supplierReport, customerDispatchReport, inventoryValuation
  };
})(window);
