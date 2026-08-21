import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/database-model.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, structuredClone, Math, Date });
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
  assert.equal(page.rows.length, 0);
});

test("normalization repairs missing row cells without deleting row fields", () => {
  const page = Model.normalizePage({
    properties: [{ id: "name", name: "Name", type: "title" }],
    views: [{ id: "table", name: "Table", type: "table" }],
    rows: [{ id: "r1", legacy: "keep" }],
  }, ids());
  assert.equal(Object.keys(page.rows[0].cells).length, 0);
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

test("number normalization converts numeric strings, preserves zero, and clears blanks", () => {
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "score", type: "number" }],
    rows: [
      { id: "r1", cells: { score: "42.5" } },
      { id: "r2", cells: { score: "0" } },
      { id: "r3", cells: { score: "   " } },
    ],
  };
  assert.equal(Model.normalizeNumberCells(state).length, 0);
  assert.equal(state.rows[0].cells.score, 42.5);
  assert.equal(state.rows[1].cells.score, 0);
  assert.equal(state.rows[2].cells.score, null);
});

test("number normalization reports invalid values without overwriting them", () => {
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "score", type: "number" }],
    rows: [{ id: "r1", cells: { score: "not-a-number" } }],
  };
  const errors = Model.normalizeNumberCells(state);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "invalid_number");
  assert.equal(errors[0].rowId, "r1");
  assert.equal(errors[0].propId, "score");
  assert.equal(state.rows[0].cells.score, "not-a-number");
});

test("date normalization validates calendar dates and preserves canonical ISO values", () => {
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "due", type: "date" }],
    rows: [
      { id: "r1", cells: { due: " 2028-02-29 " } },
      { id: "r2", cells: { due: "2027-02-29" } },
      { id: "r3", cells: { due: "   " } },
    ],
  };
  const errors = Model.normalizeTypedScalarCells(state);
  assert.equal(state.rows[0].cells.due, "2028-02-29");
  assert.equal(state.rows[2].cells.due, null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "invalid_date");
  assert.equal(errors[0].rowId, "r2");
  assert.equal(state.rows[1].cells.due, "2027-02-29");
});

test("date ranges normalize single dates and reject reversed ranges without overwriting them", () => {
  const reversed = { start: "2026-08-20", end: "2026-08-19" };
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "window", type: "date_range" }],
    rows: [
      { id: "r1", cells: { window: "2026-08-20" } },
      { id: "r2", cells: { window: { start: "2026-08-20", end: "2026-08-22" } } },
      { id: "r3", cells: { window: reversed } },
    ],
  };
  const errors = Model.normalizeTypedScalarCells(state);
  assert.equal(state.rows[0].cells.window.start, "2026-08-20");
  assert.equal(state.rows[0].cells.window.end, null);
  assert.equal(state.rows[1].cells.window.start, "2026-08-20");
  assert.equal(state.rows[1].cells.window.end, "2026-08-22");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "invalid_date_range");
  assert.equal(state.rows[2].cells.window, reversed);
});

test("url email and phone normalization trims valid scalar values and flags malformed values", () => {
  const state = {
    properties: [
      { id: "name", type: "title" }, { id: "site", type: "url" },
      { id: "mail", type: "email" }, { id: "phone", type: "phone" },
    ],
    rows: [
      { id: "ok", cells: { site: " https://example.com/a?b=1 ", mail: " drew@example.com ", phone: " +1 (507) 555-0123 " } },
      { id: "bad", cells: { site: "example.com", mail: "missing-at.example.com", phone: "call-me" } },
    ],
  };
  const errors = Model.normalizeTypedScalarCells(state);
  assert.equal(state.rows[0].cells.site, "https://example.com/a?b=1");
  assert.equal(state.rows[0].cells.mail, "drew@example.com");
  assert.equal(state.rows[0].cells.phone, "+1 (507) 555-0123");
  assert.deepEqual(new Set(errors.map((error) => error.code)), new Set(["invalid_url", "invalid_email", "invalid_phone"]));
  assert.equal(state.rows[1].cells.site, "example.com");
  assert.equal(state.rows[1].cells.mail, "missing-at.example.com");
  assert.equal(state.rows[1].cells.phone, "call-me");
});

test("unique IDs are deterministic projections of stable row IDs", () => {
  const row = { id: "r_alpha", cells: {} };
  assert.equal(Model.uniqueIdForRow(row, { type: "unique_id" }), "ID-r_alpha");
  assert.equal(Model.uniqueIdForRow(row, { type: "unique_id", prefix: "TASK-" }), "TASK-r_alpha");
  assert.equal(Model.systemValueFor({ type: "unique_id", prefix: "TASK-" }, row), "TASK-r_alpha");
});

test("system metadata stamps new rows and preserves created time across later edits", () => {
  const properties = [
    { id: "name", type: "title" }, { id: "created", type: "created_time" }, { id: "edited", type: "last_edited_time" },
  ];
  const previous = { properties, rows: [] };
  const next = { properties, rows: [{ id: "r1", cells: { name: "First" } }] };
  const firstTouched = Model.applySystemMetadata(previous, next, "2026-08-20T23:30:00.000Z");
  assert.equal(firstTouched.length, 1);
  assert.equal(firstTouched[0], "r1");
  assert.equal(next.rows[0].cells.created, "2026-08-20T23:30:00.000Z");
  assert.equal(next.rows[0].cells.edited, "2026-08-20T23:30:00.000Z");

  const persisted = structuredClone(next);
  next.rows[0].cells.name = "Changed";
  const secondTouched = Model.applySystemMetadata(persisted, next, "2026-08-20T23:31:00.000Z");
  assert.equal(secondTouched.length, 1);
  assert.equal(secondTouched[0], "r1");
  assert.equal(next.rows[0].cells.created, "2026-08-20T23:30:00.000Z");
  assert.equal(next.rows[0].cells.edited, "2026-08-20T23:31:00.000Z");
});

test("legacy rows do not receive fabricated created times", () => {
  const properties = [
    { id: "name", type: "title" }, { id: "created", type: "created_time" }, { id: "edited", type: "last_edited_time" },
  ];
  const previous = { properties, rows: [{ id: "legacy", cells: { name: "Old" } }] };
  const next = structuredClone(previous);
  next.rows[0].cells.name = "Old but edited";
  Model.applySystemMetadata(previous, next, "2026-08-20T23:32:00.000Z");
  assert.equal(next.rows[0].cells.created, undefined);
  assert.equal(next.rows[0].cells.edited, "2026-08-20T23:32:00.000Z");
});

test("system timestamp validation fails visibly without rewriting invalid legacy values", () => {
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "created", type: "created_time" }],
    rows: [{ id: "r1", cells: { name: "A", created: "yesterday" } }],
  };
  const errors = Model.normalizeSystemPropertyCells(state);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "invalid_system_time");
  assert.equal(state.rows[0].cells.created, "yesterday");
});

test("self relations resolve stable row IDs in declared order", () => {
  const relation = { id: "related", type: "relation", target: "self" };
  const state = {
    properties: [{ id: "name", type: "title" }, relation],
    rows: [
      { id: "r1", cells: { name: "One", related: ["r3", "r2"] } },
      { id: "r2", cells: { name: "Two" } },
      { id: "r3", cells: { name: "Three" } },
    ],
  };
  assert.equal(Model.normalizeRelationCells(state).length, 0);
  const related = Model.relationRows(state, relation, state.rows[0]);
  assert.equal(related.length, 2);
  assert.equal(related[0].id, "r3");
  assert.equal(related[1].id, "r2");
});

test("dangling relation IDs fail visibly and remain unchanged", () => {
  const original = ["r2", "missing"];
  const state = {
    properties: [{ id: "name", type: "title" }, { id: "related", type: "relation", target: "self" }],
    rows: [
      { id: "r1", cells: { related: original } },
      { id: "r2", cells: {} },
    ],
  };
  const errors = Model.normalizeRelationCells(state);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "dangling_relation");
  assert.equal(errors[0].targetId, "missing");
  assert.equal(state.rows[0].cells.related, original);
});

test("duplicate relation IDs and unsupported relation targets are rejected", () => {
  const state = {
    properties: [
      { id: "name", type: "title" },
      { id: "related", type: "relation", target: "self" },
      { id: "external", type: "relation", target: "database:other" },
    ],
    views: [{ id: "v1", type: "table" }],
    rows: [
      { id: "r1", cells: { related: ["r2", "r2"] } },
      { id: "r2", cells: {} },
    ],
  };
  const relationErrors = Model.normalizeRelationCells(state);
  assert.equal(relationErrors.length, 1);
  assert.equal(relationErrors[0].code, "invalid_relation");
  const structural = Model.validateState(state);
  assert.equal(structural.some((error) => error.code === "unsupported_relation_target"), true);
});

test("validation fails visibly on duplicate identifiers and multiple title properties", () => {
  const errors = Model.validateState({
    properties: [{ id: "p", type: "title" }, { id: "p", type: "title" }],
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
  assert.equal(Model.validateState(page).length, 0);
});
