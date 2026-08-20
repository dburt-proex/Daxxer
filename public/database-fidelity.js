// Database fidelity adapter: normalize recoverable legacy shapes, enforce existing
// typed-property contracts, and fail visibly on structural corruption.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Database && Daxxer.Database.mount;
  const Model = Daxxer.DatabaseModel;
  if (!base || !Model) return;

  const numberKey = (error) => `${error.rowId || ""}|${error.propId || ""}`;

  function numberCells(container) {
    return Array.from(container.querySelectorAll("[data-row][data-prop]"));
  }

  function clearNumberErrors(container) {
    numberCells(container).forEach((cell) => {
      cell.style.outline = "";
      cell.style.outlineOffset = "";
      cell.style.background = "";
      if (cell.dataset.numberError === "1") {
        cell.removeAttribute("title");
        delete cell.dataset.numberError;
      }
    });
  }

  function markNumberErrors(container, errors) {
    clearNumberErrors(container);
    for (const error of errors) {
      const cell = numberCells(container).find((el) =>
        el.dataset.row === String(error.rowId) && el.dataset.prop === String(error.propId));
      if (!cell) continue;
      cell.dataset.numberError = "1";
      cell.title = `Enter a valid number. Current value: ${String(error.value)}`;
      cell.style.outline = "1px solid rgba(235, 87, 87, 0.8)";
      cell.style.outlineOffset = "-1px";
      cell.style.background = "rgba(235, 87, 87, 0.06)";
    }
  }

  function patchZeroDisplays(container, state) {
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const numberIds = new Set(properties.filter((p) => p && p.type === "number").map((p) => String(p.id)));
    const rowMap = new Map(rows.filter(Boolean).map((row) => [String(row.id), row]));

    for (const cell of numberCells(container)) {
      if (!numberIds.has(cell.dataset.prop)) continue;
      const row = rowMap.get(cell.dataset.row);
      if (!row || !row.cells || row.cells[cell.dataset.prop] !== 0) continue;
      const editable = cell.querySelector(".ct-text");
      if (editable && editable.textContent === "") editable.textContent = "0";
    }
  }

  Daxxer.Database.mount = function guardedDatabaseMount(container, page, opts = {}) {
    const normalized = Model.normalizePage(page);
    const structuralErrors = Model.validateState(normalized);

    if (structuralErrors.length) {
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
      detail.textContent = structuralErrors.map((e) => e.id ? `${e.code}: ${e.id}` : e.code).join(" · ");
      panel.appendChild(detail);

      const note = document.createElement("div");
      note.style.cssText = "margin-top:6px;color:var(--text-dim)";
      note.textContent = "Daxxer stopped this database before rendering so duplicate or malformed identifiers are not silently mutated.";
      panel.appendChild(note);

      container.appendChild(panel);
      return { getState: () => normalized, errors: structuralErrors };
    }

    const initialNumberErrors = Model.normalizeNumberCells(normalized);
    let toleratedInvalid = new Map(initialNumberErrors.map((error) => [numberKey(error), String(error.value)]));
    let currentState = normalized;

    function onChange(state) {
      currentState = state;
      const numberErrors = Model.normalizeNumberCells(state);
      markNumberErrors(container, numberErrors);

      // Do not make an existing malformed legacy number prevent unrelated edits,
      // but reject any newly-created or changed invalid number value from persistence.
      const newlyInvalid = numberErrors.filter((error) => {
        const prior = toleratedInvalid.get(numberKey(error));
        return prior === undefined || prior !== String(error.value);
      });
      if (newlyInvalid.length) return;

      toleratedInvalid = new Map(numberErrors.map((error) => [numberKey(error), String(error.value)]));
      if (opts.onChange) opts.onChange(state);
      setTimeout(() => patchZeroDisplays(container, currentState), 0);
    }

    const api = base(container, normalized, { ...opts, onChange });
    currentState = api && api.getState ? api.getState() : normalized;
    markNumberErrors(container, initialNumberErrors);
    setTimeout(() => patchZeroDisplays(container, currentState), 0);

    // Internal database rerenders can happen without onChange (for example view
    // switches). Re-apply the zero display fix after user interactions that can
    // trigger those rerenders while leaving the renderer implementation isolated.
    const repatch = () => setTimeout(() => patchZeroDisplays(container, currentState), 0);
    container.addEventListener("click", repatch);
    container.addEventListener("drop", repatch);

    return api;
  };
})();
