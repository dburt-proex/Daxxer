import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/rich-text.js", import.meta.url), "utf8");
const Daxxer = {};
const context = vm.createContext({ window: { Daxxer }, Daxxer, structuredClone, Set, Number, Object, Array, String, JSON, Infinity });
vm.runInContext(source, context);
const RT = Daxxer.RichText;

const rich = [
  { text: "Hello", marks: { bold: true }, href: null },
  { text: " world", marks: {}, href: null },
];

test("split preserves formatting on both sides", () => {
  const [left, right] = RT.split(rich, 3);
  assert.equal(RT.plainText(left), "Hel");
  assert.equal(RT.plainText(right), "lo world");
  assert.equal(left[0].marks.bold, true);
  assert.equal(right[0].marks.bold, true);
});

test("concat compacts adjacent identical styles", () => {
  const joined = RT.concat(
    [{ text: "A", marks: { italic: true }, href: null }],
    [{ text: "B", marks: { italic: true }, href: null }],
  );
  assert.equal(joined.length, 1);
  assert.equal(joined[0].text, "AB");
});

test("toggle mark affects only the selected range", () => {
  const sourceSegments = RT.fromText("abcdef");
  const marked = RT.toggleMark(sourceSegments, 1, 5, "bold");
  assert.equal(marked.ok, true);
  assert.equal(RT.plainText(marked.segments), "abcdef");
  assert.equal(marked.segments.length, 3);
  assert.equal(marked.segments[0].text, "a");
  assert.equal(marked.segments[1].text, "bcde");
  assert.equal(marked.segments[1].marks.bold, true);
  assert.equal(marked.segments[2].text, "f");
  const unmarked = RT.toggleMark(marked.segments, 1, 5, "bold");
  assert.equal(unmarked.segments.length, 1);
  assert.equal(unmarked.segments[0].text, "abcdef");
});

test("links preserve existing marks and can be removed", () => {
  const linked = RT.applyLink(rich, 0, 5, "https://example.com");
  assert.equal(linked.ok, true);
  assert.equal(linked.segments[0].href, "https://example.com");
  assert.equal(linked.segments[0].marks.bold, true);
  const removed = RT.applyLink(linked.segments, 0, 5, null);
  assert.equal(removed.ok, true);
  assert.equal(removed.segments[0].href, null);
  assert.equal(removed.segments[0].marks.bold, true);
});

test("replaceRange inherits the requested insertion style", () => {
  const replaced = RT.replaceRange(rich, 5, 6, "-", { marks: { code: true }, href: null });
  assert.equal(RT.plainText(replaced), "Hello-world");
  const codeSegment = replaced.find((segment) => segment.text === "-");
  assert.equal(codeSegment.marks.code, true);
});

test("unsupported marks fail without mutation", () => {
  const result = RT.applyMark(rich, 0, 5, "blink", true);
  assert.equal(result.ok, false);
  assert.equal(result.error, "unsupported_mark");
  assert.equal(RT.plainText(result.segments), "Hello world");
});
