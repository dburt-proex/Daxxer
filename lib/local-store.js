// Self-contained local workspace store.
//
// DaxxerOS Local remains the preferred governed backend when it is installed.
// This store gives the packaged desktop app a durable, zero-configuration
// fallback: workspace metadata, page records, archived records, and audit
// entries are all separate files under the user's Daxxer application data.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_VERSION = 1;
const MAX_TITLE = 512;
const MAX_AUDIT_EVENTS = 10000;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function isoNow() {
  return new Date().toISOString();
}

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_TITLE) || fallback;
}

function workspaceDefaults() {
  return {
    schemaVersion: SCHEMA_VERSION,
    workspace: { name: "Daxxer", user: { name: "Operator", initials: "O" } },
    teamspaces: [],
    recents: [],
  };
}

function pageSummary(page) {
  return {
    id: page.id,
    type: page.type,
    title: page.title,
    icon: page.icon,
    parentId: page.parentId || null,
    teamspaceId: page.teamspaceId || null,
    gate_status: page.gate_status || "ALLOW",
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function plainTextFromBlocks(blocks) {
  const output = [];
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.text === "string") output.push(item.text);
      if (Array.isArray(item.richText)) {
        for (const segment of item.richText) if (segment && typeof segment.text === "string") output.push(segment.text);
      }
      if (item.table && Array.isArray(item.table.rows)) {
        for (const row of item.table.rows) for (const cell of Array.isArray(row) ? row : []) output.push(String(cell || ""));
      }
      visit(item.children);
    }
  };
  visit(blocks);
  return output.join(" ");
}

function databaseText(page) {
  const properties = new Map((Array.isArray(page.properties) ? page.properties : []).map((p) => [p.id, p]));
  return (Array.isArray(page.rows) ? page.rows : []).map((row) => Object.entries(row && row.cells || {}).map(([id, value]) => {
    const property = properties.get(id);
    if (Array.isArray(value)) return value.join(" ");
    return `${property && property.name ? property.name : ""} ${value == null ? "" : value}`;
  }).join(" ")).join(" ");
}

function defaultDatabaseShape() {
  const titleProperty = { id: "title", name: "Name", type: "title" };
  return {
    properties: [titleProperty],
    views: [{ id: "view_table", name: "Table", type: "table" }],
    rows: [],
  };
}

function normalisePage(raw) {
  const now = isoNow();
  const type = raw && raw.type === "database" ? "database" : "page";
  const shape = type === "database" ? defaultDatabaseShape() : { blocks: [] };
  const page = {
    schemaVersion: SCHEMA_VERSION,
    id: raw && typeof raw.id === "string" ? raw.id : randomUUID(),
    type,
    title: safeText(raw && raw.title, "Untitled"),
    icon: typeof (raw && raw.icon) === "string" ? raw.icon.slice(0, 32) : (type === "database" ? "🗂️" : "📄"),
    parentId: typeof (raw && raw.parentId) === "string" ? raw.parentId : null,
    teamspaceId: typeof (raw && raw.teamspaceId) === "string" ? raw.teamspaceId : null,
    gate_status: ["ALLOW", "REVIEW", "HALT"].includes(String(raw && raw.gate_status || "").toUpperCase())
      ? String(raw.gate_status).toUpperCase() : "ALLOW",
    createdAt: raw && raw.createdAt || now,
    updatedAt: raw && raw.updatedAt || now,
    ...shape,
    ...clone(raw || {}),
  };
  page.schemaVersion = SCHEMA_VERSION;
  page.type = type;
  page.title = safeText(page.title, "Untitled");
  page.icon = typeof page.icon === "string" ? page.icon.slice(0, 32) : (type === "database" ? "🗂️" : "📄");
  page.parentId = typeof page.parentId === "string" ? page.parentId : null;
  page.teamspaceId = typeof page.teamspaceId === "string" ? page.teamspaceId : null;
  page.gate_status = ["ALLOW", "REVIEW", "HALT"].includes(String(page.gate_status).toUpperCase())
    ? String(page.gate_status).toUpperCase() : "ALLOW";
  page.blocks = Array.isArray(page.blocks) ? page.blocks : [];
  page.properties = Array.isArray(page.properties) ? page.properties : (type === "database" ? defaultDatabaseShape().properties : undefined);
  page.views = Array.isArray(page.views) ? page.views : (type === "database" ? defaultDatabaseShape().views : undefined);
  page.rows = Array.isArray(page.rows) ? page.rows : (type === "database" ? [] : undefined);
  return page;
}

export function createLocalStore(root) {
  if (!root || typeof root !== "string") throw new Error("Daxxer local data directory is required.");

  const metadataPath = join(root, "workspace.json");
  const activePath = join(root, "pages");
  const archivePath = join(root, "archive");
  const auditPath = join(root, "audit.jsonl");

  function ensure() {
    mkdirSync(root, { recursive: true });
    mkdirSync(activePath, { recursive: true });
    mkdirSync(archivePath, { recursive: true });
    if (!existsSync(metadataPath)) writeJSON(metadataPath, workspaceDefaults());
  }

  function writeJSON(path, value) {
    mkdirSync(join(path, ".."), { recursive: true });
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
    renameSync(temp, path);
  }

  function readJSON(path, fallback = null) {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
  }

  function metadata() {
    ensure();
    const stored = readJSON(metadataPath, {});
    const base = workspaceDefaults();
    const next = {
      ...base,
      ...stored,
      workspace: {
        ...base.workspace,
        ...(stored && stored.workspace || {}),
        user: { ...base.workspace.user, ...((stored && stored.workspace && stored.workspace.user) || {}) },
      },
      teamspaces: Array.isArray(stored && stored.teamspaces) ? stored.teamspaces.filter((item) => item && typeof item.id === "string") : [],
      recents: Array.isArray(stored && stored.recents) ? stored.recents.filter((id) => typeof id === "string") : [],
    };
    return next;
  }

  function saveMetadata(next) {
    writeJSON(metadataPath, next);
  }

  function recordPath(dir, id) {
    return join(dir, `${encodeURIComponent(id)}.json`);
  }

  function listFrom(dir) {
    ensure();
    const pages = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const value = readJSON(join(dir, entry.name));
      if (value && typeof value === "object" && typeof value.id === "string") pages.push(normalisePage(value));
    }
    return pages.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  }

  function getFrom(dir, id) {
    if (!id || typeof id !== "string") return null;
    const value = readJSON(recordPath(dir, id));
    return value && typeof value === "object" ? normalisePage(value) : null;
  }

  function writePage(dir, page) {
    writeJSON(recordPath(dir, page.id), normalisePage(page));
  }

  function removePage(dir, id) {
    const path = recordPath(dir, id);
    if (existsSync(path)) rmSync(path);
  }

  function events() {
    ensure();
    if (!existsSync(auditPath)) return [];
    const rows = readFileSync(auditPath, "utf8").split("\n").filter(Boolean);
    const parsed = [];
    for (const row of rows) {
      try { parsed.push(JSON.parse(row)); } catch { return [{ integrityError: "audit_log_invalid_json" }]; }
    }
    return parsed;
  }

  function eventHash(event) {
    const { hash, ...payload } = event;
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  function verifyAudit() {
    const all = events();
    let priorHash = null;
    for (let index = 0; index < all.length; index += 1) {
      const event = all[index];
      if (!event || event.integrityError || event.previousHash !== priorHash || event.hash !== eventHash(event)) {
        return { ok: false, detail: `Audit chain mismatch at event ${index + 1}.`, events: all.length };
      }
      priorHash = event.hash;
    }
    return { ok: true, detail: all.length ? "Local audit chain intact." : "No audit events yet.", events: all.length };
  }

  function appendAudit(objectId, action, page, reason = "") {
    const all = events();
    if (all.some((event) => event.integrityError) || all.length >= MAX_AUDIT_EVENTS) {
      throw new Error(all.length >= MAX_AUDIT_EVENTS ? "Audit log has reached its local safety limit." : "Audit log is corrupt; changes are blocked until it is repaired.");
    }
    const previousHash = all.length ? all[all.length - 1].hash : null;
    const event = {
      id: randomUUID(),
      objectId,
      objectType: page && page.type || "page",
      action,
      gate: page && page.gate_status || "ALLOW",
      actor: "Local operator",
      actorType: "human",
      timestamp: isoNow(),
      reason: reason || undefined,
      previousHash,
    };
    event.hash = eventHash(event);
    writeFileSync(auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
    return event;
  }

  function activePages() { return listFrom(activePath); }

  function descendants(id, pages) {
    const childMap = new Map();
    for (const page of pages) {
      if (!childMap.has(page.parentId)) childMap.set(page.parentId, []);
      childMap.get(page.parentId).push(page);
    }
    const output = [];
    const walk = (current) => {
      output.push(current);
      for (const child of childMap.get(current.id) || []) walk(child);
    };
    const source = pages.find((page) => page.id === id);
    if (source) walk(source);
    return output;
  }

  function getSidebar() {
    const meta = metadata();
    const pages = activePages();
    const ids = new Set(pages.map((page) => page.id));
    const favorites = pages.filter((page) => page.isFavorite === true).map((page) => page.id);
    const recents = meta.recents.filter((id) => ids.has(id)).map((id) => pageSummary(pages.find((page) => page.id === id)));
    return {
      workspace: clone(meta.workspace),
      teamspaces: clone(meta.teamspaces),
      pages: pages.map(pageSummary),
      favorites,
      recents,
    };
  }

  function getPage(id) {
    const page = getFrom(activePath, id);
    if (!page) return null;
    const pages = activePages();
    const byId = new Map(pages.map((item) => [item.id, item]));
    const trail = [];
    const seen = new Set([page.id]);
    let parent = page.parentId ? byId.get(page.parentId) : null;
    while (parent && !seen.has(parent.id)) {
      trail.unshift({ id: parent.id, title: parent.title, icon: parent.icon });
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : null;
    }
    const meta = metadata();
    return {
      ...clone(page),
      isFavorite: page.isFavorite === true,
      teamspace: meta.teamspaces.find((space) => space.id === page.teamspaceId) || null,
      breadcrumb: [...trail, { id: page.id, title: page.title, icon: page.icon }],
    };
  }

  function touchPage(id) {
    const page = getFrom(activePath, id);
    if (!page) return;
    const meta = metadata();
    meta.recents = [id, ...meta.recents.filter((item) => item !== id)].slice(0, 30);
    saveMetadata(meta);
  }

  function createPage(input = {}) {
    const now = isoNow();
    const page = normalisePage({
      id: randomUUID(),
      type: input.type,
      title: input.title || "Untitled",
      icon: input.icon,
      parentId: input.parentId,
      teamspaceId: input.teamspaceId,
      createdAt: now,
      updatedAt: now,
    });
    writePage(activePath, page);
    appendAudit(page.id, "created", page, "Created locally.");
    touchPage(page.id);
    return getPage(page.id);
  }

  function updatePage(id, patch = {}) {
    const page = getFrom(activePath, id);
    if (!page) return null;
    const allowed = ["title", "icon", "parentId", "teamspaceId", "blocks", "properties", "views", "rows", "description", "gate_status"];
    const next = clone(page);
    for (const key of allowed) if (Object.hasOwn(patch, key)) next[key] = clone(patch[key]);
    next.updatedAt = isoNow();
    const normalised = normalisePage(next);
    writePage(activePath, normalised);
    appendAudit(id, "updated", normalised, "Saved locally.");
    return getPage(id);
  }

  function cloneBlockTree(blocks) {
    return (Array.isArray(blocks) ? blocks : []).map((block) => {
      const next = clone(block || {});
      next.id = randomUUID();
      if (Array.isArray(next.children)) next.children = cloneBlockTree(next.children);
      return next;
    });
  }

  function cloneDatabaseRows(rows, properties) {
    const idMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, randomUUID()]));
    const relationIds = (Array.isArray(properties) ? properties : [])
      .filter((property) => property && property.type === "relation" && (property.target || "self") === "self")
      .map((property) => property.id);
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const next = clone(row || {});
      next.id = idMap.get(row.id) || randomUUID();
      next.cells = next.cells && typeof next.cells === "object" ? next.cells : {};
      for (const propertyId of relationIds) {
        if (!Array.isArray(next.cells[propertyId])) continue;
        next.cells[propertyId] = next.cells[propertyId].map((targetId) => idMap.get(targetId) || targetId);
      }
      return next;
    });
  }

  function duplicatePage(id) {
    const source = getFrom(activePath, id);
    if (!source) return null;
    const now = isoNow();
    const copy = normalisePage({
      ...clone(source),
      id: randomUUID(),
      title: `${source.title || "Untitled"} copy`,
      blocks: cloneBlockTree(source.blocks),
      rows: cloneDatabaseRows(source.rows, source.properties),
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
    });
    writePage(activePath, copy);
    appendAudit(copy.id, "duplicated", copy, `Duplicated from ${source.id}.`);
    touchPage(copy.id);
    return getPage(copy.id);
  }

  function deletePage(id) {
    const pages = activePages();
    const records = descendants(id, pages);
    if (!records.length) return false;
    for (const page of records) {
      const archived = { ...page, archivedAt: isoNow(), archivedReason: "Moved to Trash" };
      writePage(archivePath, archived);
      removePage(activePath, page.id);
      appendAudit(page.id, "archived", archived, "Moved to Trash.");
    }
    const meta = metadata();
    meta.recents = meta.recents.filter((item) => !records.some((page) => page.id === item));
    saveMetadata(meta);
    return true;
  }

  function toggleFavorite(id) {
    const page = getFrom(activePath, id);
    if (!page) return false;
    page.isFavorite = !page.isFavorite;
    page.updatedAt = isoNow();
    writePage(activePath, page);
    appendAudit(id, page.isFavorite ? "favorited" : "unfavorited", page, "Favorite changed locally.");
    return page.isFavorite;
  }

  function createTeamspace(name, icon) {
    const meta = metadata();
    const teamspace = {
      id: randomUUID(),
      name: safeText(name, "Untitled teamspace"),
      icon: typeof icon === "string" && icon.trim() ? icon.trim().slice(0, 32) : "📁",
      createdAt: isoNow(),
    };
    meta.teamspaces.push(teamspace);
    saveMetadata(meta);
    appendAudit(teamspace.id, "teamspace_created", { type: "teamspace", gate_status: "ALLOW" }, "Created locally.");
    return clone(teamspace);
  }

  function searchGoverned(query) {
    const needle = safeText(String(query || ""), "").toLocaleLowerCase();
    if (!needle) return [];
    return activePages().map((page) => {
      const content = [page.title, page.description || "", plainTextFromBlocks(page.blocks), databaseText(page)].join(" ");
      const index = content.toLocaleLowerCase().indexOf(needle);
      if (index < 0) return null;
      const from = Math.max(0, index - 70);
      const to = Math.min(content.length, index + needle.length + 120);
      return { id: page.id, title: page.title, icon: page.icon, type: page.type, snippet: content.slice(from, to).replace(/\s+/g, " ").trim() };
    }).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
  }

  function listArchived() {
    return listFrom(archivePath).map((page) => ({
      id: page.id,
      title: page.title,
      icon: page.icon,
      objectType: page.type === "database" ? "database" : "page",
      type: page.type,
      archivedAt: page.archivedAt || page.updatedAt,
      gate_status: page.gate_status || "ALLOW",
    })).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
  }

  function restorePage(id) {
    const records = descendants(id, listFrom(archivePath));
    if (!records.length) throw new Error("Archived record not found.");
    for (const page of records) {
      const restored = { ...page, updatedAt: isoNow() };
      delete restored.archivedAt;
      delete restored.archivedReason;
      writePage(activePath, restored);
      removePage(archivePath, page.id);
      appendAudit(page.id, "restored", restored, "Restored from Trash.");
    }
    touchPage(id);
    const root = records.find((record) => record.id === id);
    return { ok: true, gate: root.gate_status || "ALLOW", reasons: [] };
  }

  function getGovernance() {
    const pages = activePages();
    const queue = pages.filter((page) => page.gate_status !== "ALLOW").map((page) => ({
      id: page.id,
      object_type: page.type === "database" ? "database" : "page",
      title: page.title,
      icon: page.icon,
      gate_status: page.gate_status,
      risk_level: page.gate_status === "HALT" ? "high" : "medium",
      owner: "Local operator",
      updated_at: page.updatedAt,
    }));
    const allEvents = events();
    const integrity = verifyAudit();
    return {
      queue,
      counts: {
        halt: queue.filter((item) => item.gate_status === "HALT").length,
        review: queue.filter((item) => item.gate_status === "REVIEW").length,
        total: pages.length,
        unreviewedAi: 0,
      },
      health: {
        auditChain: integrity,
        index: { ok: true, detail: `${pages.length} active record${pages.length === 1 ? "" : "s"} indexed locally.` },
        schema: { ok: true, detail: `Local record schema v${SCHEMA_VERSION}.` },
      },
      recentEvents: allEvents.filter((event) => !event.integrityError).slice(-12).reverse(),
    };
  }

  function getAudit(id, limit = 100) {
    const count = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
    return events().filter((event) => event && event.objectId === id).slice(-count);
  }

  function reset() {
    // Intentional, explicit reset for the developer script only. It does not
    // run during desktop startup and keeps archive/audit deletion recoverable
    // only through an external backup, so callers must opt in.
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    ensure();
    return { pages: [], teamspaces: [] };
  }

  ensure();
  return {
    kind: "local",
    root,
    load: ensure,
    reset,
    getSidebar,
    getPage,
    touchPage,
    createPage,
    updatePage,
    duplicatePage,
    deletePage,
    toggleFavorite,
    createTeamspace,
    searchGoverned,
    listArchived,
    restorePage,
    getGovernance,
    getAudit,
  };
}
