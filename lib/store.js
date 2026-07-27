// Daxxer store -- now a thin bridge to the governed DaxxerOS Local Markdown
// store instead of a flat JSON blob.
//
// Every function here keeps its ORIGINAL signature and return shape so
// server.js and the entire public/ frontend need zero changes. Underneath,
// each call shells out to `python -m daxxer.bridge <op>` (daxxer/bridge.py),
// which reads/writes real governed Markdown+YAML records, gates creation,
// and turns "delete" into a recoverable archive instead of a hard delete.
//
// Root of the governed store this app persists to. Override with DAXXER_ROOT.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolving this is not as simple as "../DaxxerOS_Local". When packaged by
// electron-packager, __dirname is inside the app bundle
// (dist/Daxxer/resources/app/lib), and DaxxerOS_Local is deliberately NOT
// bundled -- the governed store is user data, it must not be duplicated into a
// read-only app bundle where edits would be lost on every repackage. So try the
// dev-mode sibling first, then the canonical install location.
function resolveRoot() {
  const candidates = [
    process.env.DAXXER_ROOT,
    join(__dirname, "..", "DaxxerOS_Local"),               // dev mode (npm start)
    join(homedir(), "Daxxer", "DaxxerOS_Local"),           // packaged, default install
    join(__dirname, "..", "..", "..", "..", "DaxxerOS_Local"), // packaged, beside dist/
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, "91_SCHEMAS", "objects.yaml"))) return c;
  }
  throw new Error(
    "Could not locate the DaxxerOS Local governed store. Looked in:\n  " +
    candidates.join("\n  ") +
    "\nSet the DAXXER_ROOT environment variable to its full path."
  );
}

const DAXXER_ROOT = resolveRoot();
const PYTHON_BIN = process.env.DAXXER_PYTHON || (process.platform === "win32" ? "python" : "python3");

function callBridge(op, args = {}) {
  const res = spawnSync(PYTHON_BIN, ["-m", "daxxer.bridge", op], {
    cwd: DAXXER_ROOT,
    input: JSON.stringify(args ?? {}),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (res.error) {
    throw new Error(
      `Daxxer bridge could not start ('${PYTHON_BIN} -m daxxer.bridge ${op}' in ${DAXXER_ROOT}): ` +
      `${res.error.message}. Is Python + 'pip install -e .' done in DaxxerOS_Local?`
    );
  }
  const stdout = (res.stdout || "").trim();
  if (!stdout) {
    throw new Error(
      `Daxxer bridge produced no output for op '${op}' (exit ${res.status}). stderr: ${res.stderr || "(empty)"}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Daxxer bridge returned non-JSON for op '${op}': ${stdout.slice(0, 500)}`);
  }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const err = new Error(parsed.error);
    err.halted = !!parsed.halted;
    throw err;
  }
  return parsed;
}

// load()/reset() no longer own an in-memory blob -- every call goes straight
// to the governed store. Kept as no-ops so nothing that imports this module
// needs to change.
export function load() { return null; }
export function reset() { throw new Error("reset() is disabled: workspace data now lives in " +
  `governed Markdown records under ${DAXXER_ROOT}. Archive or edit records individually, or use ` +
  "the daxxer CLI (daxxer archive <id> --reason ...) instead of a full reset."); }

// ---- Sidebar tree ----
export function getSidebar() {
  return callBridge("sidebar", {});
}

export function getPage(id) {
  return callBridge("get_page", { id });
}

export function touchPage(_id) {
  // Recency is now derived from updated_at in the index, not a separate
  // recents list to maintain -- nothing to persist here.
}

export function createPage({ title, icon, parentId, teamspaceId, type }) {
  return callBridge("create_page", { title, icon, parentId, teamspaceId, type });
}

export function updatePage(id, patch) {
  return callBridge("update_page", { id, patch });
}

export function deletePage(id) {
  // Soft delete: routes through the governance gate and archives the record
  // (and its descendants) instead of destroying it. Recoverable via
  // `daxxer view` against 16_WORKSPACE, or by clearing archive_flag by hand.
  const result = callBridge("delete_page", { id });
  return !!(result && result.ok);
}

export function toggleFavorite(id) {
  const result = callBridge("toggle_favorite", { id });
  return !!(result && result.favorite);
}

export function createTeamspace(name, icon) {
  return callBridge("create_teamspace", { name, icon });
}

// Not part of the original store.js contract, but useful: exposes the
// FTS5-backed search directly from the store layer if a future caller wants
// server-side search instead of (or alongside) lib/search.js's in-memory scan.
export function searchGoverned(query) {
  const result = callBridge("search", { query });
  return (result && result.results) || [];
}

// ---- Governance surface -------------------------------------------------
// These have no equivalent in the old JSON store: they only exist because the
// records are governed. They are what makes the gate, the audit chain, and the
// archive visible in the product instead of only in the CLI.

export function listArchived() {
  const result = callBridge("archived", {});
  return (result && result.items) || [];
}

export function restorePage(id) {
  return callBridge("restore_page", { id });
}

export function getGovernance() {
  return callBridge("governance", {});
}

export function getAudit(id, limit) {
  const result = callBridge("audit_for", { id, limit });
  return (result && result.events) || [];
}
