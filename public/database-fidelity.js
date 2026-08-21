// Database fidelity adapter: normalize recoverable legacy shapes, enforce existing
// typed-property contracts, and fail visibly on structural corruption.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Database && Daxxer.Database.mount;
  const Model = Daxxer.DatabaseModel;
  if (!base || !Model) return;

  const errorKey = (error) => `${error.rowId || ""}|${error.propId || ""}`;
  const typedKinds = new Set(["date", "date_range", "url", "email", "phone"]);
  const systemKinds = new Set(["unique_id", "created_time", "last_edited_time"]);

  function dataCells(container) {
    return Array.from(container.querySelectorAll("[data-row][data-prop]"));
  }

  function errorValue(value) {
    if (value && typeof value === "object") {
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    return String(value);
  }

  function clearModelErrors(container) {
    dataCells(container).forEach((cell) => {
      cell.style.outline = "";
      cell.style.outlineOffset = "";
      cell.style.background = "";
      if (cell.dataset.modelError === "1") {
        cell.removeAttribute("title");
        delete cell.dataset.modelError;
      }
    });
  }

  function errorMessage(error) {
    const messages = {
      invalid_number: "Enter a valid finite number.",
      invalid_date: "Enter a valid date in YYYY-MM-DD form.",
      invalid_date_range: "Enter a valid date range whose end is not before its start.",
      invalid_url: "Enter an absolute http:// or https:// URL.",
      invalid_email: "Enter a valid email address.",
      invalid_phone: "Enter a phone value containing at least three digits and standard phone punctuation.",
      invalid_place: "Enter a place with a name, address, or a valid latitude/longitude pair.",
      invalid_system_time: "System-owned timestamps must be canonical UTC ISO timestamps.",
      invalid_relation: "Relations must contain a unique array of stable row IDs.",
      dangling_relation: `Related row ${error.targetId || ""} no longer exists.`,
    };
    return `${messages[error.code] || "Enter a valid value."} Current value: ${errorValue(error.value)}`;
  }

  function markModelErrors(container, errors) {
    clearModelErrors(container);
    for (const error of errors) {
      const cell = dataCells(container).find((el) =>
        el.dataset.row === String(error.rowId) && el.dataset.prop === String(error.propId));
      if (!cell) continue;
      cell.dataset.modelError = "1";
      cell.title = errorMessage(error);
      cell.style.outline = "1px solid rgba(235, 87, 87, 0.8)";
      cell.style.outlineOffset = "-1px";
      cell.style.background = "rgba(235, 87, 87, 0.06)";
    }
  }

  function collectTypedErrors(state) {
    return [
      ...Model.normalizeNumberCells(state),
      ...Model.normalizeTypedScalarCells(state),
      ...Model.normalizePlaceCells(state),
      ...Model.normalizeRelationCells(state),
      ...Model.normalizeSystemPropertyCells(state),
    ];
  }

  function patchZeroDisplays(container, state) {
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const numberIds = new Set(properties.filter((p) => p && p.type === "number").map((p) => String(p.id)));
    const rowMap = new Map(rows.filter(Boolean).map((row) => [String(row.id), row]));

    for (const cell of dataCells(container)) {
      if (!numberIds.has(cell.dataset.prop)) continue;
      const row = rowMap.get(cell.dataset.row);
      if (!row || !row.cells || row.cells[cell.dataset.prop] !== 0) continue;
      const editable = cell.querySelector(".ct-text");
      if (editable && editable.textContent === "") editable.textContent = "0";
    }
  }

  function inputStyle() {
    return "width:100%;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;padding:1px 0";
  }

  function wireTextInput(input, commit) {
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  }

  function dateInputHtml(value, field) {
    const text = value == null ? "" : String(value);
    const type = !text || Model.isIsoDate(text) ? "date" : "text";
    return `<input data-daxxer-typed="1" data-field="${field}" type="${type}" value="${text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}" style="${inputStyle()}" />`;
  }

  function patchTypedEditors(container, state, commitState) {
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const propMap = new Map(properties.filter(Boolean).map((property) => [String(property.id), property]));
    const rowMap = new Map(rows.filter(Boolean).map((row) => [String(row.id), row]));

    for (const cell of dataCells(container)) {
      const property = propMap.get(cell.dataset.prop);
      if (!property || !typedKinds.has(property.type)) continue;
      if (cell.querySelector('[data-daxxer-typed="1"]')) continue;

      const row = rowMap.get(cell.dataset.row);
      if (!row || !row.cells) continue;
      const value = row.cells[property.id];

      if (property.type === "date") {
        cell.innerHTML = dateInputHtml(value, "value");
        const input = cell.querySelector('[data-daxxer-typed="1"]');
        const commit = () => {
          row.cells[property.id] = input.value || null;
          commitState(state);
        };
        input.addEventListener("change", commit);
        wireTextInput(input, commit);
        continue;
      }

      if (property.type === "date_range") {
        const start = value && typeof value === "object" && !Array.isArray(value) ? value.start : value;
        const end = value && typeof value === "object" && !Array.isArray(value) ? value.end : null;
        cell.innerHTML = `<div style="display:flex;align-items:center;gap:6px">${dateInputHtml(start, "start")}<span style="color:var(--text-mute)">→</span>${dateInputHtml(end, "end")}</div>`;
        const startInput = cell.querySelector('[data-field="start"]');
        const endInput = cell.querySelector('[data-field="end"]');
        const commit = () => {
          if (!startInput.value && !endInput.value) row.cells[property.id] = null;
          else row.cells[property.id] = { start: startInput.value, end: endInput.value || null };
          commitState(state);
        };
        startInput.addEventListener("change", commit);
        endInput.addEventListener("change", commit);
        wireTextInput(startInput, commit);
        wireTextInput(endInput, commit);
        continue;
      }

      const inputType = property.type === "email" ? "email" : property.type === "phone" ? "tel" : "url";
      const input = document.createElement("input");
      input.dataset.daxxerTyped = "1";
      input.dataset.field = "value";
      input.type = inputType;
      input.value = value == null ? "" : String(value);
      input.style.cssText = inputStyle();
      cell.innerHTML = "";
      cell.appendChild(input);
      wireTextInput(input, () => {
        row.cells[property.id] = input.value || null;
        commitState(state);
      });
    }
  }

  function patchSystemDisplays(container, state) {
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const propMap = new Map(properties.filter(Boolean).map((property) => [String(property.id), property]));
    const rowMap = new Map(rows.filter(Boolean).map((row) => [String(row.id), row]));

    for (const cell of dataCells(container)) {
      const property = propMap.get(cell.dataset.prop);
      if (!property || !systemKinds.has(property.type)) continue;
      const row = rowMap.get(cell.dataset.row);
      if (!row) continue;
      const raw = Model.systemValueFor(property, row);
      const label = raw && property.type !== "unique_id" && Model.isIsoTimestamp(raw)
        ? new Date(raw).toLocaleString()
        : (raw == null ? "" : String(raw));
      cell.innerHTML = "";
      const value = document.createElement("span");
      value.dataset.daxxerSystem = "1";
      value.textContent = label;
      value.title = property.type === "unique_id"
        ? "System-owned stable ID"
        : (raw || "No trusted timestamp is available for this legacy row yet");
      value.style.cssText = "display:inline-block;color:var(--text-dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%";
      cell.appendChild(value);
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

    const initialTypedErrors = collectTypedErrors(normalized);
    let toleratedInvalid = new Map(initialTypedErrors.map((error) => [errorKey(error), errorValue(error.value)]));
    let currentState = normalized;
    let lastPersistedState = structuredClone(normalized);

    function onChange(state) {
      currentState = state;
      Model.applySystemMetadata(lastPersistedState, state, new Date().toISOString());
      const typedErrors = collectTypedErrors(state);
      markModelErrors(container, typedErrors);

      const newlyInvalid = typedErrors.filter((error) => {
        const prior = toleratedInvalid.get(errorKey(error));
        return prior === undefined || prior !== errorValue(error.value);
      });
      if (newlyInvalid.length) return;

      toleratedInvalid = new Map(typedErrors.map((error) => [errorKey(error), errorValue(error.value)]));
      if (opts.onChange) opts.onChange(state);
      lastPersistedState = structuredClone(state);
      setTimeout(() => patchZeroDisplays(container, currentState), 0);
    }

    const api = base(container, normalized, { ...opts, onChange });
    currentState = api && api.getState ? api.getState() : normalized;
    markModelErrors(container, initialTypedErrors);

    const repatch = () => setTimeout(() => {
      patchZeroDisplays(container, currentState);
      patchTypedEditors(container, currentState, onChange);
      patchSystemDisplays(container, currentState);
      markModelErrors(container, collectTypedErrors(currentState));
    }, 0);

    repatch();
    container.addEventListener("click", repatch);
    container.addEventListener("drop", repatch);

    return api;
  };
})();
