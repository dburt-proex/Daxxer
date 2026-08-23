import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalStore } from "../lib/local-store.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "daxxer-local-store-"));
  return { root, store: createLocalStore(root) };
}

test("fresh local workspace is blank and becomes usable without a bridge", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const initial = store.getSidebar();
  assert.equal(initial.pages.length, 0);
  assert.equal(initial.teamspaces.length, 0);
  assert.equal(initial.workspace.name, "Daxxer");

  const teamspace = store.createTeamspace("Crimson Studio", "◆");
  const page = store.createPage({ title: "Working notes", icon: "✦", teamspaceId: teamspace.id });
  assert.equal(page.title, "Working notes");
  assert.equal(page.teamspace.name, "Crimson Studio");
  assert.deepEqual(page.breadcrumb.map((crumb) => crumb.title), ["Working notes"]);

  const sidebar = store.getSidebar();
  assert.equal(sidebar.pages.length, 1);
  assert.equal(sidebar.recents[0].id, page.id);
});

test("local records persist blocks, search, duplicate, archive, and restore", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const parent = store.createPage({ title: "Research" });
  const child = store.createPage({ title: "RAG notes", parentId: parent.id });
  const updated = store.updatePage(child.id, {
    blocks: [{ id: "block-1", type: "toggle", schemaVersion: 1, text: "Crimson retrieval architecture", children: [
      { id: "block-child", type: "paragraph", schemaVersion: 1, text: "Nested durable block" },
    ] }],
  });
  assert.equal(updated.blocks[0].text, "Crimson retrieval architecture");
  assert.equal(store.searchGoverned("retrieval")[0].id, child.id);

  const duplicate = store.duplicatePage(child.id);
  assert.notEqual(duplicate.id, child.id);
  assert.notEqual(duplicate.blocks[0].id, "block-1");
  assert.notEqual(duplicate.blocks[0].children[0].id, "block-child");
  assert.equal(duplicate.blocks[0].text, "Crimson retrieval architecture");

  assert.equal(store.deletePage(parent.id), true);
  assert.equal(store.getSidebar().pages.length, 0);
  assert.equal(store.listArchived().length, 3);
  const restored = store.restorePage(parent.id);
  assert.equal(restored.ok, true);
  assert.equal(store.getPage(parent.id).title, "Research");
  assert.equal(store.getPage(child.id).title, "RAG notes");
  assert.equal(store.getPage(duplicate.id).title, "RAG notes copy");

  const audit = store.getAudit(child.id);
  assert.ok(audit.some((event) => event.action === "updated"));
  assert.equal(store.getGovernance().health.auditChain.ok, true);
});

test("a changed audit record is visible as a governance integrity failure", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  store.createPage({ title: "Immutable history" });
  const path = join(root, "audit.jsonl");
  const record = JSON.parse(readFileSync(path, "utf8").trim());
  record.action = "silently changed";
  writeFileSync(path, JSON.stringify(record) + "\n", "utf8");

  const health = store.getGovernance().health.auditChain;
  assert.equal(health.ok, false);
  assert.match(health.detail, /mismatch/i);
});

test("duplicating a database keeps internal relations inside the copied rows", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const database = store.createPage({ type: "database", title: "Linked work" });
  store.updatePage(database.id, {
    properties: [
      { id: "title", name: "Name", type: "title" },
      { id: "related", name: "Related", type: "relation", target: "self" },
    ],
    rows: [
      { id: "row-one", cells: { title: "One", related: ["row-two"] } },
      { id: "row-two", cells: { title: "Two", related: [] } },
    ],
  });

  const duplicate = store.duplicatePage(database.id);
  const copiedOne = duplicate.rows.find((row) => row.cells.title === "One");
  const copiedTwo = duplicate.rows.find((row) => row.cells.title === "Two");
  assert.notEqual(copiedOne.id, "row-one");
  assert.notEqual(copiedTwo.id, "row-two");
  assert.deepEqual(copiedOne.cells.related, [copiedTwo.id]);
});
