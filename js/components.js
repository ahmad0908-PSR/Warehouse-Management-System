/**
 * components.js
 * Small reusable UI builders: toasts, modals, confirm dialogs, badges,
 * and empty-state markup. Nothing here touches app state directly.
 */
(function (global) {
  "use strict";

  function toast(message, type) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${type || ""}`.trim();
    const icon = type === "error"
      ? '<svg class="toast-icon" viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2Zm0 6 1 7h-2l1-7Zm0 9.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>'
      : type === "success"
      ? '<svg class="toast-icon" viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"/></svg>'
      : '<svg class="toast-icon" viewBox="0 0 24 24"><path d="M11 7h2v6h-2Zm0 8h2v2h-2Z"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    el.innerHTML = `${icon}<span>${Utils.escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 0.2s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 200);
    }, 3200);
  }

  function closeModal() {
    const root = document.getElementById("modal-root");
    root.innerHTML = "";
    document.removeEventListener("keydown", handleModalEsc);
  }

  function handleModalEsc(e) {
    if (e.key === "Escape") closeModal();
  }

  function openModal(opts) {
    const root = document.getElementById("modal-root");
    const sizeClass = opts.size === "lg" ? "modal-lg" : opts.size === "sm" ? "modal-sm" : "";
    root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop>
        <div class="modal ${sizeClass}" role="dialog" aria-modal="true" aria-label="${Utils.escapeHtml(opts.title || "")}">
          <div class="modal-header">
            <h3>${Utils.escapeHtml(opts.title || "")}</h3>
            <button class="modal-close" data-close-modal aria-label="Close dialog">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <div class="modal-body">${opts.bodyHTML || ""}</div>
          ${opts.footerHTML ? `<div class="modal-footer">${opts.footerHTML}</div>` : ""}
        </div>
      </div>
    `;
    root.querySelector("[data-close-backdrop]").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close-backdrop")) closeModal();
    });
    root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
    document.addEventListener("keydown", handleModalEsc);
    if (typeof opts.onOpen === "function") opts.onOpen(root);
  }

  function confirmDialog({ title, message, confirmText, danger }) {
    return new Promise((resolve) => {
      openModal({
        title: title || "Are you sure?",
        size: "sm",
        bodyHTML: `<p style="color:var(--color-ink-soft); font-size:13.5px;">${Utils.escapeHtml(message || "")}</p>`,
        footerHTML: `
          <button class="btn btn-outline" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${Utils.escapeHtml(confirmText || "Confirm")}</button>
        `,
        onOpen: (root) => {
          root.querySelector("[data-cancel]").addEventListener("click", () => { closeModal(); resolve(false); });
          root.querySelector("[data-confirm]").addEventListener("click", () => { closeModal(); resolve(true); });
        }
      });
    });
  }

  function badge(status) {
    return `<span class="badge ${Utils.statusBadgeClass(status)}">${Utils.escapeHtml(status)}</span>`;
  }

  function emptyState({ title, message, actionHTML }) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 10h8M8 14h5"/></svg>
        <h4>${Utils.escapeHtml(title || "Nothing here yet")}</h4>
        <p>${Utils.escapeHtml(message || "")}</p>
        ${actionHTML || ""}
      </div>
    `;
  }

  function loadingRow(label) {
    return `<div class="loading-row"><span class="spinner"></span><span>${Utils.escapeHtml(label || "Loading…")}</span></div>`;
  }

  global.Components = { toast, openModal, closeModal, confirmDialog, badge, emptyState, loadingRow };
})(window);
