/**
 * storage.js
 * The app's entire data layer. Static JSON files under /data are used only
 * as the first-run seed; every runtime read/write goes through
 * localStorage, keyed under the "meridianWMS." prefix.
 */
(function (global) {
  "use strict";

  const KEYS = {
    config: "meridianWMS.config",
    settings: "meridianWMS.settings",
    products: "meridianWMS.products",
    locations: "meridianWMS.locations",
    suppliers: "meridianWMS.suppliers",
    customers: "meridianWMS.customers",
    inventory: "meridianWMS.inventory",
    receipts: "meridianWMS.receipts",
    dispatches: "meridianWMS.dispatches",
    movements: "meridianWMS.movements",
    initFlag: "meridianWMS.initialized"
  };

  const SEED_FILES = {
    config: "data/config.json",
    settings: "data/settings.json",
    products: "data/products.json",
    locations: "data/locations.json",
    suppliers: "data/suppliers.json",
    customers: "data/customers.json",
    inventory: "data/inventory.json",
    receipts: "data/receipts.json",
    dispatches: "data/dispatches.json",
    movements: "data/stock_movements.json"
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Storage: failed to parse ${key}`, e);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Storage: failed to save ${key}`, e);
      return false;
    }
  }

  async function fetchSeed(name) {
    try {
      const res = await fetch(SEED_FILES[name]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Storage: could not load seed for "${name}", using empty default.`, e);
      return name === "config" || name === "settings" ? {} : [];
    }
  }

  // The portfolio link is owner-controlled: it always comes from data/config.json,
  // never from localStorage edits or imported backups.
  let seedPortfolioUrl = "";

  async function seedAll() {
    const names = Object.keys(SEED_FILES);
    const values = await Promise.all(names.map(fetchSeed));
    names.forEach((name, i) => writeJSON(KEYS[name], values[i]));
    writeJSON(KEYS.initFlag, true);
    seedPortfolioUrl = values[names.indexOf("config")].portfolioUrl || "";
  }

  async function init() {
    const alreadyInitialized = readJSON(KEYS.initFlag, false);
    if (!alreadyInitialized) {
      await seedAll();
    } else {
      const seedConfig = await fetchSeed("config");
      seedPortfolioUrl = seedConfig.portfolioUrl || "";
      const currentConfig = readJSON(KEYS.config, {});
      writeJSON(KEYS.config, Object.assign({}, seedConfig, currentConfig, { portfolioUrl: seedPortfolioUrl }));
    }
    global.AppConfig = readJSON(KEYS.config, {});
  }

  async function resetDemoData() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    await seedAll();
    global.AppConfig = readJSON(KEYS.config, {});
  }

  function clearAppData() {
    writeJSON(KEYS.inventory, []);
    writeJSON(KEYS.receipts, []);
    writeJSON(KEYS.dispatches, []);
    writeJSON(KEYS.movements, []);
  }

  function exportAll() {
    const payload = {};
    Object.entries(KEYS).forEach(([name, key]) => {
      if (name === "initFlag") return;
      payload[name] = readJSON(key, name === "config" || name === "settings" ? {} : []);
    });
    payload.exportedAt = new Date().toISOString();
    return JSON.stringify(payload, null, 2);
  }

  function importAll(jsonString) {
    const parsed = JSON.parse(jsonString);
    const validNames = Object.keys(KEYS).filter((n) => n !== "initFlag");
    let importedAny = false;
    validNames.forEach((name) => {
      if (Object.prototype.hasOwnProperty.call(parsed, name)) {
        writeJSON(KEYS[name], parsed[name]);
        importedAny = true;
      }
    });
    if (!importedAny) throw new Error("No recognizable data found in file.");
    writeJSON(KEYS.config, Object.assign({}, readJSON(KEYS.config, {}), { portfolioUrl: seedPortfolioUrl }));
    writeJSON(KEYS.initFlag, true);
    global.AppConfig = readJSON(KEYS.config, {});
    return true;
  }

  const Storage = {
    KEYS,
    init, resetDemoData, clearAppData, exportAll, importAll,

    getConfig: () => readJSON(KEYS.config, {}),
    saveConfig: (v) => { writeJSON(KEYS.config, v); global.AppConfig = v; },

    getSettings: () => readJSON(KEYS.settings, {}),
    saveSettings: (v) => writeJSON(KEYS.settings, v),

    getProducts: () => readJSON(KEYS.products, []),
    saveProducts: (v) => writeJSON(KEYS.products, v),

    getLocations: () => readJSON(KEYS.locations, []),
    saveLocations: (v) => writeJSON(KEYS.locations, v),

    getSuppliers: () => readJSON(KEYS.suppliers, []),
    saveSuppliers: (v) => writeJSON(KEYS.suppliers, v),

    getCustomers: () => readJSON(KEYS.customers, []),
    saveCustomers: (v) => writeJSON(KEYS.customers, v),

    getInventory: () => readJSON(KEYS.inventory, []),
    saveInventory: (v) => writeJSON(KEYS.inventory, v),

    getReceipts: () => readJSON(KEYS.receipts, []),
    saveReceipts: (v) => writeJSON(KEYS.receipts, v),

    getDispatches: () => readJSON(KEYS.dispatches, []),
    saveDispatches: (v) => writeJSON(KEYS.dispatches, v),

    getMovements: () => readJSON(KEYS.movements, []),
    saveMovements: (v) => writeJSON(KEYS.movements, v)
  };

  global.Storage = Storage;
})(window);
