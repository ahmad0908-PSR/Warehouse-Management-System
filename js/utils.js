/**
 * utils.js
 * Small, dependency-free helper functions shared across the app.
 */
(function (global) {
  "use strict";

  function formatCurrency(amount) {
    const cfg = global.AppConfig || { currencySymbol: "$", currencyDecimals: 2 };
    const value = Number(amount) || 0;
    const fixed = value.toFixed(cfg.currencyDecimals != null ? cfg.currencyDecimals : 2);
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${cfg.currencySymbol || "$"}${parts.join(".")}`;
  }

  function formatDate(isoString, opts) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const options = opts || { month: "short", day: "numeric", year: "numeric" };
    return d.toLocaleDateString("en-US", options);
  }

  function formatDateTime(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${datePart} · ${timePart}`;
  }

  function isSameDay(isoString, referenceDate) {
    const d = new Date(isoString);
    const ref = referenceDate || new Date();
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  }

  function nextId(prefix, seqKey) {
    const settings = Storage.getSettings();
    const seq = settings[seqKey] || 1;
    settings[seqKey] = seq + 1;
    Storage.saveSettings(settings);
    return `${prefix}-${seq}`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay || 250);
    };
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function statusBadgeClass(status) {
    switch (status) {
      case "Available":
      case "Received":
      case "Dispatched":
      case "Ready":
      case "Active":
      case "Completed":
      case "Approved":
        return "badge-success";
      case "Partially Occupied":
      case "Partially Received":
      case "Picking":
      case "Pending":
        return "badge-warning";
      case "Full":
      case "Blocked":
      case "Cancelled":
      case "Out of Stock":
        return "badge-danger";
      default:
        return "badge-neutral";
    }
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  global.Utils = {
    formatCurrency, formatDate, formatDateTime, isSameDay,
    nextId, escapeHtml, debounce, round2, clamp, statusBadgeClass, downloadFile, readFileAsText
  };
})(window);
