import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/block-schema.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, structuredClone, Set, Number, Object, Array, String });
vm.runInContext(source, context);
const Schema = Daxxer.BlockSchema;

function ids(blocks) {
  const out = [];
  const walk = (items) => (items || []).forEach((block) => {
    if (block && block.id) out.push(block.id);
    if (block && Array.isArray(block.children)) walk(block.children);
  });
  walk(blocks);
  return out;
}

test("legacy nested block trees migrate additively without changing IDs or meaning", () => {
  const legacy = {
    id: "page_1",
    title: "Legacy",
    blocks: [
      { id: "b1", type: "paragraph", text: "Alpha" },
      { id: "b2", type: "toggle", text: "Parent", open: true, children: [
        { id: "b3", type: "todo", text: "Child", checked: false, customLegacyField: { keep: true } },
      ] },
    ],
  };
  const beforeIds = ids(legacy.blocks);
  const result = Schema.migratePage(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.toVersion, 1);
  assert.equal(result.page.contentSchemaVersion, undefined);
  assert.equal(result.page.blocks[0].schemaVersion, 1);
  assert.equal(result.page.blocks[1].schemaVersion, 1);
  assert.equal(result.page.blocks[1].children[0].schemaVersion, 1);
  assert.equal(result.page.blocks[0].richText[0].text, "Alpha");
  assert.equal(result.page.blocks[1].children[0].customLegacyField.keep, true);
  assert.deepEqual(ids(result.page.blocks), beforeIds);
  assert.equal(result.page.blocks[1].children[0].text, "Child");
});

test("rich text normalizes deterministically while text remains a legacy projection", () => {
  const page = {
    blocks: [{
      id: "b1", type: "paragraph", schemaVersion: 1, text: "stale", richText: [
        { text: "Bold", marks: { bold: true } },
        { text: " and ", marks: {} },
        { text: "link", marks: { italic: true }, href: "https://example.com", futureField: "preserve" },
      ],
    }],
  };
  const first = Schema.prepareForPersistence(page);
  const second = Schema.prepareForPersistence(first.page);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.page.blocks[0].schemaVersion, 1);
  assert.equal(first.page.blocks[0].text, "Bold and link");
  assert.equal(first.page.blocks[0].richText[2].futureField, "preserve");
  assert.equal(JSON.stringify(first.page), JSON.stringify(second.page));
});

test("downgrade removes only block-v1 fields and preserves IDs, nesting, unknown fields, and plain meaning", () => {
  const page = {
    blocks: [{
      id: "outer", type: "toggle", schemaVersion: 1, text: "Parent", unknownField: 7,
      richText: [{ text: "Par", marks: { bold: true } }, { text: "ent", marks: {} }],
      children: [{ id: "inner", type: "paragraph", schemaVersion: 1, text: "Child", richText: [{ text: "Child", marks: { underline: true } }] }],
    }],
  };
  const downgraded = Schema.downgradePage(page);
  assert.equal(downgraded.blocks[0].richText, undefined);
  assert.equal(downgraded.blocks[0].schemaVersion, undefined);
  assert.equal(downgraded.blocks[0].children[0].schemaVersion, undefined);
  assert.equal(downgraded.blocks[0].text, "Parent");
  assert.equal(downgraded.blocks[0].children[0].text, "Child");
  assert.equal(downgraded.blocks[0].unknownField, 7);
  assert.deepEqual(ids(downgraded.blocks), ["outer", "inner"]);
});

test("unknown block types survive and are surfaced as warnings instead of being deleted", () => {
  const page = { blocks: [{ id: "future", type: "future_widget", text: "Keep me", opaque: { x: 1 } }] };
  const result = Schema.migratePage(page);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "unknown_block_type");
  assert.equal(result.page.blocks[0].type, "future_widget");
  assert.equal(result.page.blocks[0].opaque.x, 1);
  assert.equal(result.page.blocks[0].schemaVersion, 1);
  assert.equal(result.page.blocks[0].text, "Keep me");
});

test("unsupported future block schema versions fail visibly and are not rewritten", () => {
  const page = { blocks: [{ id: "b", type: "paragraph", schemaVersion: 99, text: "future", opaque: true }] };
  const result = Schema.prepareForPersistence(page);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "block_schema_version_unsupported");
  assert.equal(result.page.blocks[0].schemaVersion, 99);
  assert.equal(result.page.blocks[0].text, "future");
  assert.equal(result.page.blocks[0].opaque, true);
});

test("invalid rich text fails visibly rather than silently coercing content", () => {
  const page = { blocks: [{ id: "b", type: "paragraph", schemaVersion: 1, text: "safe", richText: [{ text: 123, marks: {} }] }] };
  const result = Schema.prepareForPersistence(page);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "rich_text_text_invalid");
  assert.equal(result.page.blocks[0].text, "safe");
});
