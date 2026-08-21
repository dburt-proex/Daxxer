// Deterministic rollups over validated relation IDs. Derived values are never persisted.
window.Daxxer = window.Daxxer || {};

(function () {
  const ALLOWED = new Set(["count", "sum", "average", "min", "max", "unique", "earliest", "latest"]);

  function fail(code, message) {
    return { ok: false, error: { code, message } };
  }

  function propertyByKey(state, key) {
    const properties = Array.isArray(state && state.properties) ? state.properties : [];
    return properties.find((property) => property && (property.id === key || property.name === key));
  }

  function numericValues(values) {
    const output = [];
    for (const value of values) {
      if (value == null || value === "") continue;
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number)) return null;
      output.push(number);
    }
    return output;
  }

  function uniqueValues(values) {
    const seen = new Set();
    const output = [];
    for (const value of values) {
      if (value == null || value === "") continue;
      const key = typeof value === "object" ? `object:${JSON.stringify(value)}` : `${typeof value}:${String(value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(value);
    }
    return output;
  }

  function dateValues(values) {
    const output = [];
    for (const value of values) {
      if (value == null || value === "") continue;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
      output.push(value);
    }
    return output;
  }

  function aggregate(values, aggregation, relatedCount = values.length) {
    if (!ALLOWED.has(aggregation)) return fail("rollup_aggregation", `Unsupported rollup aggregation '${aggregation}'.`);
    if (aggregation === "count") return { ok: true, value: relatedCount };
    if (aggregation === "unique") return { ok: true, value: uniqueValues(values) };
    if (aggregation === "earliest" || aggregation === "latest") {
      const dates = dateValues(values);
      if (dates == null) return fail("rollup_date", `${aggregation} requires date/time string values.`);
      if (!dates.length) return { ok: true, value: null };
      dates.sort((a, b) => Date.parse(a) - Date.parse(b));
      return { ok: true, value: aggregation === "earliest" ? dates[0] : dates[dates.length - 1] };
    }

    const numbers = numericValues(values);
    if (numbers == null) return fail("rollup_number", `${aggregation} requires numeric values.`);
    if (!numbers.length) return { ok: true, value: aggregation === "sum" ? 0 : null };
    if (aggregation === "sum") return { ok: true, value: numbers.reduce((sum, value) => sum + value, 0) };
    if (aggregation === "average") return { ok: true, value: numbers.reduce((sum, value) => sum + value, 0) / numbers.length };
    if (aggregation === "min") return { ok: true, value: Math.min(...numbers) };
    if (aggregation === "max") return { ok: true, value: Math.max(...numbers) };
    return fail("rollup_aggregation", `Unsupported rollup aggregation '${aggregation}'.`);
  }

  function evaluate(property, state, row, options = {}) {
    if (!property || property.type !== "rollup") return fail("rollup_property", "Rollup property configuration is missing.");
    const relation = propertyByKey(state, property.relation);
    if (!relation || relation.type !== "relation") return fail("rollup_relation", "Rollup must reference a relation property.");
    if ((relation.target || "self") !== "self") return fail("rollup_relation_target", "Only self-database relations are currently supported.");
    const targetProperty = propertyByKey(state, property.property);
    if (!targetProperty) return fail("rollup_target_property", "Rollup target property does not exist.");
    const aggregation = property.aggregation || "count";
    if (!ALLOWED.has(aggregation)) return fail("rollup_aggregation", `Unsupported rollup aggregation '${aggregation}'.`);

    const ids = row && row.cells ? row.cells[relation.id] : null;
    if (ids == null) return aggregate([], aggregation, 0);
    if (!Array.isArray(ids)) return fail("rollup_relation_value", "Relation value must be an array of stable row IDs.");

    const rows = Array.isArray(state && state.rows) ? state.rows : [];
    const rowMap = new Map(rows.filter((candidate) => candidate && candidate.id).map((candidate) => [String(candidate.id), candidate]));
    const targets = [];
    for (const id of ids) {
      const target = rowMap.get(String(id));
      if (!target) return fail("rollup_dangling_relation", `Related row '${id}' no longer exists.`);
      targets.push(target);
    }

    if (aggregation === "count") return { ok: true, value: targets.length };
    const values = [];
    for (const target of targets) {
      if (typeof options.getValue === "function") {
        const result = options.getValue(target, targetProperty);
        if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "ok")) {
          if (!result.ok) return fail("rollup_dependency", result.error && result.error.message ? result.error.message : "Rollup dependency failed.");
          values.push(result.value);
        } else values.push(result);
      } else {
        values.push(target && target.cells ? (target.cells[targetProperty.id] ?? null) : null);
      }
    }
    return aggregate(values, aggregation, targets.length);
  }

  Daxxer.RollupEngine = { evaluate, aggregate, propertyByKey, ALLOWED };
})();
