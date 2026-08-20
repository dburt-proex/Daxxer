// Database fidelity adapter: normalize recoverable legacy shapes and fail visibly
// on structural corruption before the DOM renderer can throw unpredictably.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Database && Daxxer.Database.mount;
  const Model = Daxxer.DatabaseModel;
  if (!base || !Model) return;

  Daxxer.Database.mount = function guardedDatabaseMount(container, page, opts = {}) {
    const normalized = Model.normalizePage(page);
    const errors = Model.validateState(normalized);

    if (errors.length) {
      container.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "db-model-error";
      panel.style.cssText = [
        "margin:16px 0",
        "padding:14px 16px",
        "border:1px solid var(--tag-red-bg)",
        "border-radius:8px",
        "background:var(--tag-red-bg)",
        "color:var(--text)",
        "font-size:13px",
        "line-height:1.5",
      ].join(";");

      const title = document.createElement("div");
      title.style.fontWeight = "650";
      title.textContent = "Database model needs repair";
      panel.appendChild(title);

      const detail = document.createElement("div");
      detail.style.marginTop = "4px";
      detail.textContent = errors.map((e) => e.id ? `${e.code}: ${e.id}` : e.code).join(" · ");
      panel.appendChild(detail);

      const note = document.createElement("div");
      note.style.cssText = "margin-top:6px;color:var(--text-dim)";
      note.textContent = "Daxxer stopped this database before rendering so duplicate or malformed identifiers are not silently mutated.";
      panel.appendChild(note);

      container.appendChild(panel);
      return { getState: () => normalized, errors };
    }

    return base(container, normalized, opts);
  };
})();
