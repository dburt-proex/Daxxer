import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/block-command.js", import.meta.url), "utf8");
const Daxxer = {};
vm.runInContext(source, vm.createContext({ window: { Daxxer }, Daxxer, Number }));
const Command = Daxxer.BlockCommand;

test("toggle heading aliases reuse persisted toggle type", () => {
  for (const level of [1, 2, 3]) {
    const resolved = Command.resolve(`toggle_heading${level}`);
    assert.equal(resolved.type, "toggle");
    assert.equal(resolved.headingLevel, level);
  }
});

test("ordinary block commands pass through without heading metadata", () => {
  const resolved = Command.resolve("quote");
  assert.equal(resolved.type, "quote");
  assert.equal(resolved.headingLevel, null);
});
