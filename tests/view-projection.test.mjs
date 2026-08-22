import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/view-projection.js", import.meta.url), "utf8");
const Daxxer = {};
vm.runInContext(source, vm.createContext({ window: { Daxxer }, Daxxer, structuredClone, Set, Map, String, Number, Boolean, Array, Object, JSON, Math }));
const Engine = Daxxer.ViewProjection;

const state = {
  properties: [
    { id: "title", name: "Name", type: "title" },
    { id: "status", name: "Status", type: "status", options: [{ id: "todo", name: "To do" }, { id: "done", name: "Done" }] },
    { id: "score", name: "Score", type: "number" },
    { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }] },
    { id: "date", name: "Date", type: "date" },
  ],
  rows: [
    { id: "r1", cells: { title: "Gamma", status: "todo", score: 3, tags: ["a"], date: "2026-08-22" } },
    { id: "r2", cells: { title: "Alpha", status: "done", score: 10, tags: ["b"], date: "2026-08-20" } },
    { id: "r3", cells: { title: "Beta", status: "todo", score: 7, tags: ["a", "b"], date: "2026-08-21" } },
  ],
};

test("nested filters support AND/OR deterministically", () => {
  const result = Engine.project(state, { type: "table", filter: { mode: "and", rules: [
    { prop: "status", op: "equals", value: "todo" },
    { mode: "or", rules: [{ prop: "score", op: "gte", value: 7 }, { prop: "title", op: "contains", value: "Gamma" }] },
  ] } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map((r) => r.id), ["r1", "r3"]);
});

test("legacy equality filter remains supported", () => {
  const result = Engine.project(state, { filter: { prop: "status", equals: "done" } });
  assert.deepEqual(result.rows.map((r) => r.id), ["r2"]);
});

test("multi-sort is stable and ordered", () => {
  const result = Engine.project(state, { sorts: [{ prop: "status", direction: "desc" }, { prop: "score", direction: "desc" }] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map((r) => r.id), ["r3", "r1", "r2"]);
});

test("search uses display labels and property values", () => {
  assert.deepEqual(Engine.project(state, { search: "beta" }).rows.map((r) => r.id), ["r2", "r3"]);
  assert.deepEqual(Engine.project(state, { search: "done" }).rows.map((r) => r.id), ["r2"]);
});

test("visible property order is view-local", () => {
  const result = Engine.project(state, { propertyOrder: ["date", "title", "score"], visibleProperties: ["title", "date"] });
  assert.deepEqual(result.properties.map((p) => p.id), ["date", "title"]);
});

test("invalid property and operator fail visibly without dropping rows", () => {
  const result = Engine.project(state, { filter: { prop: "missing", op: "explode", value: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.rows.length, state.rows.length);
  assert.ok(result.errors.some((e) => e.code === "filter_property"));
  assert.ok(result.errors.some((e) => e.code === "filter_operator"));
});

test("view creation derives bounded defaults", () => {
  const board = Engine.createView("board", state, "Flow");
  assert.equal(board.type, "board");
  assert.equal(board.groupBy, "status");
  const calendar = Engine.createView("calendar", state, "Dates");
  assert.equal(calendar.dateProperty, "date");
});

test("calendar date resolver uses configured date property", () => {
  const { property, date } = Engine.dateForRow(state, state.rows[0], { dateProperty: "date" });
  assert.equal(property.id, "date");
  assert.equal(date, "2026-08-22");
});