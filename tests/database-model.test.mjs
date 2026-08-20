import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/database-model.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, structuredClone, Math });
vm.runInContext(source, context);
const Model = Daxxer.DatabaseModel;

const ids = () => {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
};

test("normalization adds only the minimum title property and table view", () => {
  const page = Model.normalizePage({ properties: [], views: [], rows: [] }, ids());
  assert.equal(page.properties.length, 1);
  assert.equal(page.properties[0].type, "title");
  assert.equal(page.views.length, 1);
  assert.equal(page.views[0].type, "table");
  assert.deepEqual(page.rows, []);
});

test("normalization repairs missing row cells without deleting row fields", () => {
  const page = Model.normalizePage({
    properties: [{ id: "name", name: "Name", type: "title" }],
    views: [{ id: "table", name: "Table", type: "table" }],
    rows: [{ id: "r1", legacy: "keep" }],
  }, ids());
  assert.deepEqual(page.rows[0].cells, {});
  assert.equal(page.rows[0].legacy, "keep");
});

test("unsafe board-first state falls back to a table view when no grouping property exists", () => {
  const page = Model.normalizePage({
    properties: [{ id: "name", name: "Name", type: "title" }],
    views: [{ id: "board", name: "Board", type: "board" }],
    rows: [],
  }, ids());
  assert.equal(page.views[0].type, "table");
  assert.equal(page.views.some((v) => v.type === "board"), true);
});

test("validation fails visibly on duplicate identifiers and multiple title properties", () => {
  const errors = Model.validateState({
    properties: [
      { id: "p", type: "title" },
      { id: "p", type: "title" },
    ],
    views: [{ id: "v", type: "table" }, { id: "v", type: "board" }],
    rows: [{ id: "r", cells: {} }, { id: "r", cells: {} }],
  });
  const codes = new Set(errors.map((e) => e.code));
  assert.equal(codes.has("duplicate_property_id"), true);
  assert.equal(codes.has("duplicate_view_id"), true);
  assert.equal(codes.has("duplicate_row_id"), true);
  assert.equal(codes.has("title_property_count"), true);
});

test("a normalized minimal database validates cleanly", () => {
  const page = Model.normalizePage({}, ids());
  assert.deepEqual(Model.validateState(page), []);
});
