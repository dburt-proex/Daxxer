// Deterministic database view projection engine. Pure state in -> projection out.
window.Daxxer = window.Daxxer || {};

(function () {
  const MAX_FILTER_DEPTH = 6;
  const MAX_FILTER_RULES = 64;
  const MAX_SORTS = 8;
  const VALID_VIEW_TYPES = new Set(["table", "board", "list", "calendar", "gallery"]);
  const OPS = new Set([
    "equals", "not_equals", "contains", "not_contains", "empty", "not_empty",
    "gt", "gte", "lt", "lte", "before", "after", "includes",
  ]);

  function clone(value) { return structuredClone(value); }
  function properties(state) { return Array.isArray(state && state.properties) ? state.properties : []; }
  function rows(state) { return Array.isArray(state && state.rows) ? state.rows : []; }
  function propByKey(state, key) {
    return properties(state).find((p) => p && (String(p.id) === String(key) || p.name === key)) || null;
  }
  function titleProperty(state) { return properties(state).find((p) => p && p.type === "title") || properties(state)[0] || null; }
  function optionName(property, id) {
    const option = property && Array.isArray(property.options)
      ? property.options.find((candidate) => candidate && String(candidate.id) === String(id))
      : null;
    return option ? String(option.name || "") : String(id == null ? "" : id);
  }
  function rawValue(state, row, property) {
    if (!property || !row) return null;
    if (["unique_id", "created_time", "last_edited_time"].includes(property.type) && Daxxer.DatabaseModel) {
      return Daxxer.DatabaseModel.systemValueFor(property, row);
    }
    return row.cells && Object.prototype.hasOwnProperty.call(row.cells, property.id) ? row.cells[property.id] : null;
  }
  function displayValue(state, row, property) {
    const value = rawValue(state, row, property);
    if (value == null) return "";
    if (property && (property.type === "select" || property.type === "status")) return optionName(property, value);
    if (property && property.type === "multi_select") return Array.isArray(value) ? value.map((id) => optionName(property, id)).join(", ") : "";
    if (property && property.type === "relation") {
      if (!Array.isArray(value)) return "";
      const tp = titleProperty(state);
      const map = new Map(rows(state).filter((r) => r && r.id).map((r) => [String(r.id), r]));
      return value.map((id) => {
        const related = map.get(String(id));
        return related && tp ? String(rawValue(state, related, tp) || "Untitled") : String(id);
      }).join(", ");
    }
    if (property && property.type === "place" && Daxxer.DatabaseModel && Daxxer.DatabaseModel.placeLabel) return Daxxer.DatabaseModel.placeLabel(value);
    if (property && property.type === "date_range" && value && typeof value === "object") return value.end ? `${value.start || ""} → ${value.end}` : String(value.start || "");
    if (Array.isArray(value)) return value.map((item) => item == null ? "" : String(item)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  function isEmpty(value) {
    if (value == null || value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }
  function primitive(value) {
    if (value == null) return null;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof value.start === "string") return value.start;
    return String(value);
  }
  function compare(a, b) {
    const av = primitive(a); const bv = primitive(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    if (typeof av === "boolean" && typeof bv === "boolean") return Number(av) - Number(bv);
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  }

  function normalizeLegacyFilter(filter) {
    if (!filter) return null;
    if (filter.prop && Object.prototype.hasOwnProperty.call(filter, "equals")) {
      return { mode: "and", rules: [{ prop: filter.prop, op: "equals", value: filter.equals }] };
    }
    return filter;
  }

  function validateFilterNode(state, node, path, errors, stats, depth = 0) {
    if (node == null) return;
    if (depth > MAX_FILTER_DEPTH) { errors.push({ code: "filter_depth", path }); return; }
    if (!node || typeof node !== "object" || Array.isArray(node)) { errors.push({ code: "filter_node", path }); return; }
    if (Array.isArray(node.rules)) {
      const mode = String(node.mode || "and").toLowerCase();
      if (!new Set(["and", "or"]).has(mode)) errors.push({ code: "filter_mode", path, value: node.mode });
      for (let i = 0; i < node.rules.length; i += 1) {
        stats.rules += 1;
        if (stats.rules > MAX_FILTER_RULES) { errors.push({ code: "filter_rule_limit", path }); return; }
        validateFilterNode(state, node.rules[i], `${path}.rules[${i}]`, errors, stats, depth + 1);
      }
      return;
    }
    if (!node.prop || !propByKey(state, node.prop)) errors.push({ code: "filter_property", path, prop: node.prop });
    if (!OPS.has(String(node.op || "equals"))) errors.push({ code: "filter_operator", path, op: node.op });
  }

  function ruleMatches(state, row, rule) {
    const property = propByKey(state, rule.prop);
    const raw = rawValue(state, row, property);
    const displayed = displayValue(state, row, property);
    const op = String(rule.op || "equals");
    const expected = rule.value;
    if (op === "empty") return isEmpty(raw);
    if (op === "not_empty") return !isEmpty(raw);
    if (op === "includes") {
      if (Array.isArray(raw)) return raw.map(String).includes(String(expected)) || displayed.toLowerCase().includes(String(expected || "").toLowerCase());
      return displayed.toLowerCase().includes(String(expected || "").toLowerCase());
    }
    if (op === "contains" || op === "not_contains") {
      const match = displayed.toLowerCase().includes(String(expected == null ? "" : expected).toLowerCase());
      return op === "contains" ? match : !match;
    }
    if (op === "equals" || op === "not_equals") {
      const match = Array.isArray(raw)
        ? raw.map(String).includes(String(expected))
        : String(primitive(raw) == null ? "" : primitive(raw)) === String(expected == null ? "" : expected);
      return op === "equals" ? match : !match;
    }
    const c = compare(raw, expected);
    if (op === "gt" || op === "after") return c > 0;
    if (op === "gte") return c >= 0;
    if (op === "lt" || op === "before") return c < 0;
    if (op === "lte") return c <= 0;
    return false;
  }

  function filterMatches(state, row, node) {
    if (!node) return true;
    if (Array.isArray(node.rules)) {
      const mode = String(node.mode || "and").toLowerCase();
      const results = node.rules.map((child) => filterMatches(state, row, child));
      return mode === "or" ? results.some(Boolean) : results.every(Boolean);
    }
    return ruleMatches(state, row, node);
  }

  function validateSorts(state, sorts, errors) {
    if (sorts == null) return;
    if (!Array.isArray(sorts)) { errors.push({ code: "sorts_not_array" }); return; }
    if (sorts.length > MAX_SORTS) errors.push({ code: "sort_limit", limit: MAX_SORTS });
    sorts.slice(0, MAX_SORTS).forEach((sort, index) => {
      if (!sort || typeof sort !== "object") { errors.push({ code: "sort_invalid", index }); return; }
      if (!sort.prop || !propByKey(state, sort.prop)) errors.push({ code: "sort_property", index, prop: sort.prop });
      if (!new Set(["asc", "desc"]).has(String(sort.direction || "asc"))) errors.push({ code: "sort_direction", index, direction: sort.direction });
    });
  }

  function normalizedPropertyOrder(state, view) {
    const all = properties(state).filter((p) => p && p.id);
    const map = new Map(all.map((p) => [String(p.id), p]));
    const configured = Array.isArray(view && view.propertyOrder) ? view.propertyOrder.map(String) : [];
    const ordered = configured.map((id) => map.get(id)).filter(Boolean);
    for (const p of all) if (!configured.includes(String(p.id))) ordered.push(p);
    const visible = Array.isArray(view && view.visibleProperties) ? new Set(view.visibleProperties.map(String)) : null;
    return visible ? ordered.filter((p) => visible.has(String(p.id))) : ordered;
  }

  function rowSearchText(state, row, projectedProperties) {
    return projectedProperties.map((property) => displayValue(state, row, property)).join(" \n").toLowerCase();
  }

  function project(state, view = {}) {
    const sourceRows = rows(state);
    const errors = [];
    const filter = normalizeLegacyFilter(view.filter);
    validateFilterNode(state, filter, "filter", errors, { rules: 0 }, 0);
    validateSorts(state, view.sorts, errors);
    if (view.type && !VALID_VIEW_TYPES.has(view.type)) errors.push({ code: "view_type", type: view.type });
    const projectedProperties = normalizedPropertyOrder(state, view);
    if (errors.length) return { ok: false, errors, rows: sourceRows.slice(), properties: projectedProperties };

    let result = sourceRows.filter((row) => filterMatches(state, row, filter));
    const query = String(view.search || "").trim().toLowerCase();
    if (query) result = result.filter((row) => rowSearchText(state, row, projectedProperties.length ? projectedProperties : properties(state)).includes(query));

    const sorts = Array.isArray(view.sorts) ? view.sorts.slice(0, MAX_SORTS) : [];
    if (sorts.length) {
      const originalIndex = new Map(sourceRows.map((row, index) => [row && row.id, index]));
      result = result.slice().sort((a, b) => {
        for (const sort of sorts) {
          const property = propByKey(state, sort.prop);
          const c = compare(rawValue(state, a, property), rawValue(state, b, property));
          if (c) return String(sort.direction || "asc") === "desc" ? -c : c;
        }
        return (originalIndex.get(a && a.id) || 0) - (originalIndex.get(b && b.id) || 0);
      });
    }
    return { ok: true, errors: [], rows: result, properties: projectedProperties };
  }

  function createView(type, state, name) {
    const normalizedType = VALID_VIEW_TYPES.has(type) ? type : "table";
    const id = `v_${Math.random().toString(36).slice(2, 9)}`;
    const view = { id, name: name || normalizedType[0].toUpperCase() + normalizedType.slice(1), type: normalizedType, filter: null, sorts: [], search: "" };
    if (normalizedType === "board") {
      const group = properties(state).find((p) => p && (p.type === "status" || p.type === "select"));
      if (group) view.groupBy = group.id;
    }
    if (normalizedType === "calendar") {
      const date = properties(state).find((p) => p && (p.type === "date" || p.type === "date_range"));
      if (date) view.dateProperty = date.id;
    }
    return view;
  }

  function dateForRow(state, row, view) {
    const property = propByKey(state, view && view.dateProperty) || properties(state).find((p) => p && (p.type === "date" || p.type === "date_range"));
    if (!property) return { property: null, date: null };
    const value = rawValue(state, row, property);
    const date = property.type === "date_range" && value && typeof value === "object" ? value.start : value;
    return { property, date: typeof date === "string" ? date : null };
  }

  Daxxer.ViewProjection = {
    MAX_FILTER_DEPTH, MAX_FILTER_RULES, MAX_SORTS, VALID_VIEW_TYPES: [...VALID_VIEW_TYPES],
    propByKey, titleProperty, rawValue, displayValue, normalizeLegacyFilter,
    project, createView, dateForRow,
  };
})();