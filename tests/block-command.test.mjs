import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/block-command.js", import.meta.url), "utf8");
const Daxxer = {};
vm.runInContext(source, vm.createContext({ window: { Daxxer }, Daxxer, Number, Array }));
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

test("applying a toggle heading command preserves the block id and initializes toggle state", () => {
  const blocks = [{ id: "b1", type: "paragraph", text: "Section" }];
  const result = Command.apply(blocks, "b1", "toggle_heading2");
  assert.equal(result.changed, true);
  assert.equal(blocks[0].id, "b1");
  assert.equal(blocks[0].type, "toggle");
  assert.equal(blocks[0].headingLevel, 2);
  assert.equal(blocks[0].open, true);
  assert.equal(Array.isArray(blocks[0].children), true);
});

test("normalization removes stale heading metadata from non-toggle blocks and rejects invalid levels", () => {
  const blocks = [
    { id: "a", type: "paragraph", headingLevel: 1 },
    { id: "b", type: "toggle", headingLevel: 9, children: [{ id: "c", type: "heading2", headingLevel: 2 }] },
    { id: "d", type: "toggle", headingLevel: "3" },
  ];
  Command.normalizeTree(blocks);
  assert.equal(blocks[0].headingLevel, undefined);
  assert.equal(blocks[1].headingLevel, undefined);
  assert.equal(blocks[1].children[0].headingLevel, undefined);
  assert.equal(blocks[2].headingLevel, 3);
  assert.equal(Array.isArray(blocks[2].children), true);
});
