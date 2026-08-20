// Pure database-model helpers. Keep structural invariants out of DOM rendering.
window.Daxxer = window.Daxxer || {};

(function () {
  const fallbackId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

  function normalizePage(page, makeId = fallbackId) {
    const next = structuredClone(page || {});
    next.properties = Array.isArray(next.properties) ? next.properties : [];
    next.views = Array.isArray(next.views) ? next.views : [];
    next.rows = Array.isArray(next.rows) ? next.rows : [];

    if (!next.properties.some((p) => p && p.type === "title")) {
      next.properties.unshift({ id: makeId("p"), name: "Name", type: "title" });
    }

    if (next.views.length === 0) {
      next.views.push({ id: makeId("v"), name: "Table", type: "table" });
    }

    next.rows = next.rows.map((row) => ({
      ...row,
      cells: row && row.cells && typeof row.cells === "object" && !Array.isArray(row.cells)
        ? row.cells
        : {},
    }));

    // The legacy board renderer requires a status/select property. If a malformed
    // database opens directly into Board without one, prepend a safe Table view
    // so the database remains recoverable instead of throwing during render.
    const hasBoardGroupCandidate = next.properties.some((p) => p && (p.type === "status" || p.type === "select"));
    if (next.views[0] && next.views[0].type === "board" && !hasBoardGroupCandidate) {
      const table = next.views.find((v) => v && v.type === "table");
      if (table) next.views = [table, ...next.views.filter((v) => v !== table)];
      else next.views.unshift({ id: makeId("v"), name: "Table", type: "table" });
    }

    return next;
  }

  function duplicateIds(items) {
    const seen = new Set();
    const duplicates = new Set();
    for (const item of items) {
      if (!item || !item.id) continue;
      if (seen.has(item.id)) duplicates.add(item.id);
      seen.add(item.id);
    }
    return [...duplicates];
  }

  function normalizeNumberCells(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const numberProps = properties.filter((p) => p && p.type === "number" && p.id);

    for (const row of rows) {
      if (!row || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) continue;
      for (const property of numberProps) {
        const value = row.cells[property.id];
        if (value == null) continue;
        if (typeof value === "number") {
          if (!Number.isFinite(value)) {
            errors.push({ code: "invalid_number", rowId: row.id, propId: property.id, value });
          }
          continue;
        }
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed === "") {
            row.cells[property.id] = null;
            continue;
          }
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed)) row.cells[property.id] = parsed;
          else errors.push({ code: "invalid_number", rowId: row.id, propId: property.id, value });
          continue;
        }
        errors.push({ code: "invalid_number", rowId: row.id, propId: property.id, value });
      }
    }

    return errors;
  }

  function validateState(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const views = Array.isArray(state && state.views) ? state.views : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];

    for (const id of duplicateIds(properties)) errors.push({ code: "duplicate_property_id", id });
    for (const id of duplicateIds(views)) errors.push({ code: "duplicate_view_id", id });
    for (const id of duplicateIds(rows)) errors.push({ code: "duplicate_row_id", id });

    if (properties.filter((p) => p && p.type === "title").length !== 1) {
      errors.push({ code: "title_property_count" });
    }
    if (views.length === 0) errors.push({ code: "missing_view" });

    properties.forEach((p, index) => {
      if (!p || !p.id) errors.push({ code: "property_missing_id", index });
      if (!p || !p.type) errors.push({ code: "property_missing_type", index });
    });
    views.forEach((v, index) => {
      if (!v || !v.id) errors.push({ code: "view_missing_id", index });
      if (!v || !v.type) errors.push({ code: "view_missing_type", index });
    });
    rows.forEach((r, index) => {
      if (!r || !r.id) errors.push({ code: "row_missing_id", index });
      if (!r || !r.cells || typeof r.cells !== "object" || Array.isArray(r.cells)) {
        errors.push({ code: "row_invalid_cells", index });
      }
    });

    return errors;
  }

  Daxxer.DatabaseModel = { normalizePage, normalizeNumberCells, validateState, duplicateIds };
})();
