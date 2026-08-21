import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/rollup-engine.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, Date, Math, Map, Set, JSON, Number, String, Array, Object });
vm.runInContext(source, context);
const Engine = Daxxer.RollupEngine;

function stateFixture() {
  return {
    properties: [
      { id: "name", name: "Name", type: "title" },
      { id: "related", name: "Related", type: "relation", target: "self" },
      { id: "score", name: "Score", type: "number" },
      { id: "due", name: "Due", type: "date" },
    ],
    rows: [
      { id: "r1", cells: { name: "One", related: ["r2", "r3"] } },
      { id: "r2", cells: { name: "Two", score: 10, due: "2026-08-22" } },
      { id: "r3", cells: { name: "Three", score: 20, due: "2026-08-21" } },
    ],
  };
}

test("rollup count uses relation cardinality", () => {
  const state = stateFixture();
  const result = Engine.evaluate({ type: "rollup", relation: "related", property: "score", aggregation: "count" }, state, state.rows[0]);
  assert.equal(result.ok, true);
  assert.equal(result.value, 2);
});

test("rollup numeric aggregates are deterministic", () => {
  const state = stateFixture();
  for (const [aggregation, expected] of [["sum", 30], ["average", 15], ["min", 10], ["max", 20]]) {
    const result = Engine.evaluate({ type: "rollup", relation: "related", property: "score", aggregation }, state, state.rows[0]);
    assert.equal(result.ok, true);
    assert.equal(result.value, expected);
  }
});

test("rollup earliest and latest compare date/time values", () => {
  const state = stateFixture();
  const earliest = Engine.evaluate({ type: "rollup", relation: "related", property: "due", aggregation: "earliest" }, state, state.rows[0]);
  const latest = Engine.evaluate({ type: "rollup", relation: "related", property: "due", aggregation: "latest" }, state, state.rows[0]);
  assert.equal(earliest.ok, true);
  assert.equal(earliest.value, "2026-08-21");
  assert.equal(latest.ok, true);
  assert.equal(latest.value, "2026-08-22");
});

test("rollup unique preserves first-seen values", () => {
  const result = Engine.aggregate(["a", "b", "a", null, "b"], "unique");
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 2);
  assert.equal(result.value[0], "a");
  assert.equal(result.value[1], "b");
});

test("rollup can consume derived values through a bounded resolver", () => {
  const state = stateFixture();
  const result = Engine.evaluate({ type: "rollup", relation: "related", property: "score", aggregation: "sum" }, state, state.rows[0], {
    getValue: (row, property) => ({ ok: true, value: row.cells[property.id] * 2 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 60);
});

test("dangling relation targets fail visibly", () => {
  const state = stateFixture();
  state.rows[0].cells.related.push("missing");
  const result = Engine.evaluate({ type: "rollup", relation: "related", property: "score", aggregation: "sum" }, state, state.rows[0]);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "rollup_dangling_relation");
});

test("invalid rollup configuration is rejected", () => {
  const state = stateFixture();
  const badRelation = Engine.evaluate({ type: "rollup", relation: "score", property: "score", aggregation: "sum" }, state, state.rows[0]);
  assert.equal(badRelation.ok, false);
  assert.equal(badRelation.error.code, "rollup_relation");

  const badAggregation = Engine.evaluate({ type: "rollup", relation: "related", property: "score", aggregation: "execute" }, state, state.rows[0]);
  assert.equal(badAggregation.ok, false);
  assert.equal(badAggregation.error.code, "rollup_aggregation");
});
