// Daxxer persistence boundary.
//
// A governed DaxxerOS Local install is still preferred when present. The
// packaged desktop app now has a durable local fallback so a fresh install is
// usable without an adjacent development checkout or a Python bridge.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createLocalStore } from "./local-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = process.env.DAXXER_PYTHON || (process.platform === "win32" ? "python" : "python3");

function resolveBridgeRoot() {
  if (process.env.DAXXER_ROOT) {
    if (existsSync(join(process.env.DAXXER_ROOT, "91_SCHEMAS", "objects.yaml"))) return process.env.DAXXER_ROOT;
    throw new Error(`DAXXER_ROOT is set but does not contain 91_SCHEMAS/objects.yaml: ${process.env.DAXXER_ROOT}`);
  }
  const candidates = [
    join(__dirname, "..", "DaxxerOS_Local"),
    join(homedir(), "Daxxer", "DaxxerOS_Local"),
    join(__dirname, "..", "..", "..", "..", "DaxxerOS_Local"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(join(candidate, "91_SCHEMAS", "objects.yaml"))) || null;
}

const DAXXER_ROOT = resolveBridgeRoot();
const LOCAL_ROOT = join(process.env.DAXXER_DATA_DIR || join(homedir(), ".daxxer"), "workspace");
const local = createLocalStore(LOCAL_ROOT);

function callBridge(op, args = {}) {
  const res = spawnSync(PYTHON_BIN, ["-m", "daxxer.bridge", op], {
    cwd: DAXXER_ROOT,
    input: JSON.stringify(args ?? {}),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error) {
    throw new Error(`Daxxer bridge could not start ('${PYTHON_BIN} -m daxxer.bridge ${op}' in ${DAXXER_ROOT}): ${res.error.message}`);
  }
  const stdout = (res.stdout || "").trim();
  if (!stdout) throw new Error(`Daxxer bridge produced no output for '${op}' (exit ${res.status}). ${res.stderr || ""}`.trim());
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error(`Daxxer bridge returned non-JSON for '${op}'.`); }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const err = new Error(parsed.error);
    err.halted = !!parsed.halted;
    throw err;
  }
  return parsed;
}

const useBridge = () => !!DAXXER_ROOT;

function cloneBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    const next = structuredClone(block || {});
    next.id = randomUUID();
    if (Array.isArray(next.children)) next.children = cloneBlocks(next.children);
    return next;
  });
}

function cloneRows(rows, properties) {
  const source = Array.isArray(rows) ? rows : [];
  const idMap = new Map(source.map((row) => [row.id, randomUUID()]));
  const relationIds = (Array.isArray(properties) ? properties : [])
    .filter((property) => property && property.type === "relation" && (property.target || "self") === "self")
    .map((property) => property.id);
  return source.map((row) => {
    const next = structuredClone(row || {});
    next.id = idMap.get(row.id) || randomUUID();
    next.cells = next.cells && typeof next.cells === "object" ? next.cells : {};
    for (const propertyId of relationIds) {
      if (Array.isArray(next.cells[propertyId])) next.cells[propertyId] = next.cells[propertyId].map((targetId) => idMap.get(targetId) || targetId);
    }
    return next;
  });
}

export function load() { return useBridge() ? null : local.load(); }
export function reset() {
  if (useBridge()) {
    throw new Error(`reset() is disabled for DaxxerOS Local records under ${DAXXER_ROOT}. Archive records individually instead.`);
  }
  return local.reset();
}

export function getSidebar() { return useBridge() ? callBridge("sidebar", {}) : local.getSidebar(); }
export function getPage(id) { return useBridge() ? callBridge("get_page", { id }) : local.getPage(id); }
export function touchPage(id) { return useBridge() ? undefined : local.touchPage(id); }
export function createPage(input) { return useBridge() ? callBridge("create_page", input) : local.createPage(input); }
export function updatePage(id, patch) { return useBridge() ? callBridge("update_page", { id, patch }) : local.updatePage(id, patch); }
export function deletePage(id) {
  if (!useBridge()) return local.deletePage(id);
  const result = callBridge("delete_page", { id });
  return !!(result && result.ok);
}
export function toggleFavorite(id) {
  if (!useBridge()) return local.toggleFavorite(id);
  const result = callBridge("toggle_favorite", { id });
  return !!(result && result.favorite);
}
export function createTeamspace(name, icon) { return useBridge() ? callBridge("create_teamspace", { name, icon }) : local.createTeamspace(name, icon); }
export function searchGoverned(query) {
  if (!useBridge()) return local.searchGoverned(query);
  const result = callBridge("search", { query });
  return (result && result.results) || [];
}
export function listArchived() {
  if (!useBridge()) return local.listArchived();
  const result = callBridge("archived", {});
  return (result && result.items) || [];
}
export function restorePage(id) { return useBridge() ? callBridge("restore_page", { id }) : local.restorePage(id); }
export function getGovernance() { return useBridge() ? callBridge("governance", {}) : local.getGovernance(); }
export function getAudit(id, limit) {
  if (!useBridge()) return local.getAudit(id, limit);
  const result = callBridge("audit_for", { id, limit });
  return (result && result.events) || [];
}

// Bridge versions before duplicate support remain safe: compose the existing
// create + update operations rather than leaving a fake UI control in place.
export function duplicatePage(id) {
  if (!useBridge()) return local.duplicatePage(id);
  const source = getPage(id);
  if (!source) return null;
  const duplicate = createPage({
    title: `${source.title || "Untitled"} copy`, icon: source.icon,
    parentId: source.parentId, teamspaceId: source.teamspaceId, type: source.type,
  });
  return updatePage(duplicate.id, {
    blocks: cloneBlocks(source.blocks), properties: source.properties || [], views: source.views || [], rows: cloneRows(source.rows, source.properties),
    description: source.description, gate_status: source.gate_status || "ALLOW",
  });
}

export const backend = useBridge() ? "daxxer-os" : "local";
