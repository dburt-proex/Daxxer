import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/table-block.js", import.meta.url), "utf8");
const Daxxer = {};
vm.runInContext(source, vm.createContext({ window: { Daxxer }, Daxxer, Number, Math, Array }));
const Table = Daxxer.TableBlock;

function block(rows = 2, columns = 2) {
  const b = { id: "table_1", type: "table", text: "", richText: [], schemaVersion: 1, table: Table.create(rows, columns) };
  Table.syncBlock(b);
  return b;
}

test("table creation is bounded and structurally valid", () => {
  const table = Table.create(2, 3);
  assert.equal(table.columns, 3);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].length, 3);
  assert.equal(Table.validate(table).length, 0);
});

test("cell edits update the searchable text projection", () => {
  const b = block();
  assert.equal(Table.setCell(b, 0, 0, "Alpha").ok, true);
  assert.equal(Table.setCell(b, 1, 1, "Beta").ok, true);
  assert.equal(b.text, "Alpha\t\n\tBeta");
  assert.equal(b.richText[0].text, b.text);
});

test("row and column mutations preserve a rectangular table", () => {
  const b = block(1, 1);
  assert.equal(Table.addRow(b).ok, true);
  assert.equal(Table.addColumn(b).ok, true);
  assert.equal(b.table.rows.length, 2);
  assert.equal(b.table.columns, 2);
  assert.equal(b.table.rows.every((row) => row.length === 2), true);
  assert.equal(Table.removeRow(b, 1).ok, true);
  assert.equal(Table.removeColumn(b, 1).ok, true);
  assert.equal(b.table.rows.length, 1);
  assert.equal(b.table.columns, 1);
});

test("minimum size and hard limits fail closed", () => {
  const b = block(1, 1);
  assert.equal(Table.removeRow(b, 0).ok, false);
  assert.equal(Table.removeColumn(b, 0).ok, false);

  b.table = Table.create(Table.MAX_ROWS, 1);
  assert.equal(Table.addRow(b).ok, false);
  b.table = Table.create(1, Table.MAX_COLUMNS);
  assert.equal(Table.addColumn(b).ok, false);
});

test("malformed legacy tables fail visibly without being repaired or truncated", () => {
  const malformed = { columns: 2, rows: [["one"], ["two", 3]], headerRow: false, headerColumn: false };
  const snapshot = JSON.stringify(malformed);
  const errors = Table.validate(malformed);
  assert.equal(errors.some((error) => error.code === "table_row_width_invalid"), true);
  assert.equal(errors.some((error) => error.code === "table_cell_invalid"), true);
  assert.equal(JSON.stringify(malformed), snapshot);
});

test("header toggles are bounded to row and column", () => {
  const b = block();
  assert.equal(Table.toggleHeader(b, "row").ok, true);
  assert.equal(b.table.headerRow, true);
  assert.equal(Table.toggleHeader(b, "column").ok, true);
  assert.equal(b.table.headerColumn, true);
  assert.equal(Table.toggleHeader(b, "diagonal").ok, false);
});
