import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/formula-engine.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, Math });
vm.runInContext(source, context);
const Engine = Daxxer.FormulaEngine;

test("formula arithmetic respects precedence", () => {
  const result = Engine.evaluate("1 + 2 * 3 - 4 / 2");
  assert.equal(result.ok, true);
  assert.equal(result.value, 5);
});

test("formula property access is provided only through the bounded resolver", () => {
  const values = { Hours: 5, Rate: 12.5 };
  const result = Engine.evaluate('prop("Hours") * prop("Rate")', {
    getProperty: (key) => values[key],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 62.5);
});

test("if is lazy so an unused invalid branch is not evaluated", () => {
  const result = Engine.evaluate('if(false, 1 / 0, concat(upper("ok"), "!"))');
  assert.equal(result.ok, true);
  assert.equal(result.value, "OK!");
});

test("formula builtins remain deterministic", () => {
  const result = Engine.evaluate('round(abs(-12.345), 2) + length(lower("ABC"))');
  assert.equal(result.ok, true);
  assert.equal(result.value, 15.35);
});

test("division by zero is a visible formula error", () => {
  const result = Engine.evaluate("10 / 0");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "formula_divide_by_zero");
});

test("unknown functions and bare identifiers are rejected", () => {
  const unknown = Engine.evaluate("fetch(\"https://example.com\")");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "formula_function");

  const bare = Engine.evaluate("globalThis");
  assert.equal(bare.ok, false);
  assert.equal(bare.error.code, "formula_identifier");
});

test("javascript member access and statements cannot enter the grammar", () => {
  const member = Engine.evaluate("globalThis.process.exit(1)");
  assert.equal(member.ok, false);

  const statement = Engine.evaluate("1; 2");
  assert.equal(statement.ok, false);
  assert.equal(statement.error.code, "formula_token");
});

test("formula expressions have bounded size", () => {
  const result = Engine.evaluate("1".repeat(2050));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "formula_too_long");
});
