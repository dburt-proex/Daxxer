import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/block-ops.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, structuredClone });
vm.runInContext(source, context);
const Ops = Daxxer.BlockOps;

const ids = () => {
  let n = 0;
  return () => `x_${++n}`;
};

function collectIds(blocks, out = []) {
  for (const block of blocks) {
    out.push(block.id);
    if (Array.isArray(block.children)) collectIds(block.children, out);
  }
  return out;
}

test("locate finds nested blocks and parent", () => {
  const blocks = [{ id: "a", type: "toggle", children: [{ id: "b", type: "paragraph", text: "x" }] }];
  const found = Ops.locate("b", blocks);
  assert.equal(found.block.id, "b");
  assert.equal(found.parent.id, "a");
});

test("duplicate recursively rekeys every descendant id", () => {
  const blocks = [{
    id: "a",
    type: "toggle",
    children: [{
      id: "b",
      type: "toggle",
      children: [{ id: "c", type: "paragraph", text: "deep" }],
    }],
  }];
  const originalIds = new Set(collectIds(blocks));
  const result = Ops.duplicate(blocks, "a", ids());
  assert.equal(result.changed, true);
  assert.equal(blocks.length, 2);

  const duplicateIds = collectIds([blocks[1]]);
  assert.equal(new Set(duplicateIds).size, duplicateIds.length);
  for (const id of duplicateIds) assert.equal(originalIds.has(id), false);
});

test("move reorders only within the containing array", () => {
  const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(Ops.move(blocks, "b", -1).changed, true);
  assert.deepEqual(blocks.map((b) => b.id), ["b", "a", "c"]);
  assert.equal(Ops.move(blocks, "b", -1).changed, false);
});

test("indent is allowed only into the previous toggle and outdent reverses it", () => {
  const blocks = [{ id: "t", type: "toggle", children: [] }, { id: "p", type: "paragraph" }];
  assert.equal(Ops.indentIntoToggle(blocks, "p").changed, true);
  assert.deepEqual(blocks.map((b) => b.id), ["t"]);
  assert.equal(blocks[0].children[0].id, "p");
  assert.equal(Ops.outdent(blocks, "p").changed, true);
  assert.deepEqual(blocks.map((b) => b.id), ["t", "p"]);
});

test("toggle open state changes only when target is a toggle and state differs", () => {
  const blocks = [
    { id: "t", type: "toggle", open: true, children: [] },
    { id: "p", type: "paragraph", text: "x" },
  ];
  assert.equal(Ops.setToggleOpen(blocks, "t", false).changed, true);
  assert.equal(blocks[0].open, false);
  assert.equal(Ops.setToggleOpen(blocks, "t", false).changed, false);
  assert.equal(Ops.setToggleOpen(blocks, "p", true).changed, false);
});

test("remove never leaves the page with zero top-level blocks", () => {
  const blocks = [{ id: "only", type: "paragraph", text: "" }];
  const makeId = ids();
  assert.equal(Ops.remove(blocks, "only", makeId).changed, true);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.match(blocks[0].id, /^x_/);
});
