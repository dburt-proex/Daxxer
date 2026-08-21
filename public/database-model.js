// Pure database-model helpers. Keep structural invariants out of DOM rendering.
window.Daxxer = window.Daxxer || {};

(function () {
  const fallbackId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const URL_RE = /^https?:\/\/[^\s]+$/i;
  const PHONE_RE = /^[+0-9().\-\s#xX]+$/;
  const SYSTEM_TYPES = new Set(["unique_id", "created_time", "last_edited_time"]);

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
          if (!Number.isFinite(value)) errors.push({ code: "invalid_number", rowId: row.id, propId: property.id, value });
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

  function isIsoDate(value) {
    if (typeof value !== "string" || !DATE_RE.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
  }

  function isIsoTimestamp(value) {
    return typeof value === "string" && ISO_TIMESTAMP_RE.test(value) && Number.isFinite(Date.parse(value));
  }

  function scalarError(errors, code, row, property, value) {
    errors.push({ code, rowId: row.id, propId: property.id, value });
  }

  function normalizeTypedScalarCells(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const supported = new Set(["date", "date_range", "url", "email", "phone"]);
    const scalarProps = properties.filter((p) => p && p.id && supported.has(p.type));

    for (const row of rows) {
      if (!row || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) continue;
      for (const property of scalarProps) {
        const value = row.cells[property.id];
        if (value == null) continue;

        if (property.type === "date") {
          if (typeof value !== "string") {
            scalarError(errors, "invalid_date", row, property, value);
            continue;
          }
          const trimmed = value.trim();
          if (!trimmed) row.cells[property.id] = null;
          else if (isIsoDate(trimmed)) row.cells[property.id] = trimmed;
          else scalarError(errors, "invalid_date", row, property, value);
          continue;
        }

        if (property.type === "date_range") {
          let start;
          let end;
          if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
              row.cells[property.id] = null;
              continue;
            }
            start = trimmed;
            end = null;
          } else if (typeof value === "object" && !Array.isArray(value)) {
            start = typeof value.start === "string" ? value.start.trim() : "";
            end = value.end == null ? null : (typeof value.end === "string" ? value.end.trim() : value.end);
            if (end === "") end = null;
          } else {
            scalarError(errors, "invalid_date_range", row, property, value);
            continue;
          }

          if (!isIsoDate(start) || (end != null && (!isIsoDate(end) || end < start))) {
            scalarError(errors, "invalid_date_range", row, property, value);
          } else {
            row.cells[property.id] = { start, end };
          }
          continue;
        }

        if (typeof value !== "string") {
          scalarError(errors, `invalid_${property.type}`, row, property, value);
          continue;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          row.cells[property.id] = null;
          continue;
        }

        if (property.type === "url") {
          if (URL_RE.test(trimmed)) row.cells[property.id] = trimmed;
          else scalarError(errors, "invalid_url", row, property, value);
          continue;
        }

        if (property.type === "email") {
          if (EMAIL_RE.test(trimmed)) row.cells[property.id] = trimmed;
          else scalarError(errors, "invalid_email", row, property, value);
          continue;
        }

        if (property.type === "phone") {
          const digitCount = (trimmed.match(/\d/g) || []).length;
          if (PHONE_RE.test(trimmed) && digitCount >= 3) row.cells[property.id] = trimmed;
          else scalarError(errors, "invalid_phone", row, property, value);
        }
      }
    }

    return errors;
  }

  function normalizeRelationCells(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const rowIds = new Set(rows.filter((row) => row && row.id).map((row) => String(row.id)));
    const relationProps = properties.filter((p) => p && p.id && p.type === "relation");

    for (const property of relationProps) {
      if ((property.target || "self") !== "self") continue;
      for (const row of rows) {
        if (!row || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) continue;
        const value = row.cells[property.id];
        if (value == null) continue;
        if (!Array.isArray(value)) {
          scalarError(errors, "invalid_relation", row, property, value);
          continue;
        }
        let invalid = false;
        const seen = new Set();
        for (const targetId of value) {
          if (typeof targetId !== "string" || !targetId || seen.has(targetId)) {
            invalid = true;
            break;
          }
          seen.add(targetId);
          if (!rowIds.has(targetId)) {
            errors.push({ code: "dangling_relation", rowId: row.id, propId: property.id, targetId, value });
            invalid = true;
          }
        }
        if (invalid && !errors.some((error) => error.rowId === row.id && error.propId === property.id)) {
          scalarError(errors, "invalid_relation", row, property, value);
        }
      }
    }
    return errors;
  }

  function relationRows(state, property, row) {
    if (!property || property.type !== "relation" || (property.target || "self") !== "self") return [];
    const ids = row && row.cells && Array.isArray(row.cells[property.id]) ? row.cells[property.id] : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const map = new Map(rows.filter((candidate) => candidate && candidate.id).map((candidate) => [String(candidate.id), candidate]));
    return ids.map((id) => map.get(String(id))).filter(Boolean);
  }

  function uniqueIdForRow(row, property = {}) {
    if (!row || !row.id) return "";
    const prefix = typeof property.prefix === "string" ? property.prefix : "ID-";
    return `${prefix}${String(row.id)}`;
  }

  function systemValueFor(property, row) {
    if (!property || !row) return null;
    if (property.type === "unique_id") return uniqueIdForRow(row, property);
    if (property.type === "created_time" || property.type === "last_edited_time") {
      return row.cells && row.cells[property.id] != null ? row.cells[property.id] : null;
    }
    return null;
  }

  function normalizeSystemPropertyCells(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const timestampProps = properties.filter((p) => p && p.id && (p.type === "created_time" || p.type === "last_edited_time"));

    for (const row of rows) {
      if (!row || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) continue;
      for (const property of timestampProps) {
        const value = row.cells[property.id];
        if (value == null) continue;
        if (!isIsoTimestamp(value)) scalarError(errors, "invalid_system_time", row, property, value);
      }
    }
    return errors;
  }

  function comparableCells(row, systemPropertyIds) {
    if (!row || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) return "{}";
    const entries = Object.entries(row.cells)
      .filter(([key]) => !systemPropertyIds.has(key))
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }

  function applySystemMetadata(previousState, nextState, nowIso) {
    if (!isIsoTimestamp(nowIso)) throw new Error("applySystemMetadata requires an ISO UTC timestamp");
    const properties = Array.isArray(nextState && nextState.properties) ? nextState.properties : [];
    const rows = Array.isArray(nextState && nextState.rows) ? nextState.rows : [];
    const previousRows = new Map((Array.isArray(previousState && previousState.rows) ? previousState.rows : []).filter(Boolean).map((row) => [String(row.id), row]));
    const systemPropertyIds = new Set(properties.filter((p) => p && p.id && SYSTEM_TYPES.has(p.type)).map((p) => String(p.id)));
    const createdProps = properties.filter((p) => p && p.id && p.type === "created_time");
    const editedProps = properties.filter((p) => p && p.id && p.type === "last_edited_time");
    const touched = [];

    for (const row of rows) {
      if (!row || !row.id || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) continue;
      const prior = previousRows.get(String(row.id));
      const isNew = !prior;
      const changed = isNew || comparableCells(prior, systemPropertyIds) !== comparableCells(row, systemPropertyIds);
      if (!changed) continue;

      if (isNew) {
        for (const property of createdProps) {
          if (row.cells[property.id] == null) row.cells[property.id] = nowIso;
        }
      }
      for (const property of editedProps) row.cells[property.id] = nowIso;
      touched.push(String(row.id));
    }
    return touched;
  }

  function validateState(state) {
    const errors = [];
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    const views = Array.isArray(state && state.views) ? state.views : [];
    const rows = Array.isArray(state && state.rows) ? state.rows : [];

    for (const id of duplicateIds(properties)) errors.push({ code: "duplicate_property_id", id });
    for (const id of duplicateIds(views)) errors.push({ code: "duplicate_view_id", id });
    for (const id of duplicateIds(rows)) errors.push({ code: "duplicate_row_id", id });

    if (properties.filter((p) => p && p.type === "title").length !== 1) errors.push({ code: "title_property_count" });
    if (views.length === 0) errors.push({ code: "missing_view" });

    properties.forEach((p, index) => {
      if (!p || !p.id) errors.push({ code: "property_missing_id", index });
      if (!p || !p.type) errors.push({ code: "property_missing_type", index });
      if (p && p.type === "unique_id" && p.prefix != null && typeof p.prefix !== "string") errors.push({ code: "unique_id_invalid_prefix", index });
      if (p && p.type === "relation" && (p.target || "self") !== "self") errors.push({ code: "unsupported_relation_target", index, target: p.target });
    });
    views.forEach((v, index) => {
      if (!v || !v.id) errors.push({ code: "view_missing_id", index });
      if (!v || !v.type) errors.push({ code: "view_missing_type", index });
    });
    rows.forEach((r, index) => {
      if (!r || !r.id) errors.push({ code: "row_missing_id", index });
      if (!r || !r.cells || typeof r.cells !== "object" || Array.isArray(r.cells)) errors.push({ code: "row_invalid_cells", index });
    });

    return errors;
  }

  Daxxer.DatabaseModel = {
    normalizePage,
    normalizeNumberCells,
    normalizeTypedScalarCells,
    normalizeRelationCells,
    relationRows,
    normalizeSystemPropertyCells,
    applySystemMetadata,
    systemValueFor,
    uniqueIdForRow,
    validateState,
    duplicateIds,
    isIsoDate,
    isIsoTimestamp,
  };
})();
