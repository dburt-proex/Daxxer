// Daxxer — zero-dependency Node server. Serves the SPA and a JSON API.
//   node server.js   → http://localhost:4400
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as store from "./lib/store.js";
import { search } from "./lib/search.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = process.env.PORT || 4400;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const sendJSON = (res, status, obj) => {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 8_000_000) reject(new Error("too large")); });
    req.on("end", () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end("Forbidden"); return; }
  if (!existsSync(filePath)) {
    const html = await readFile(join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": MIME[".html"] }); res.end(html); return;
  }
  try {
    const buf = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream", "cache-control": "no-store, must-revalidate" });
    res.end(buf);
  } catch { res.writeHead(500).end("read error"); }
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method;
  try {
    if (pathname === "/api/sidebar" && method === "GET") return sendJSON(res, 200, store.getSidebar());

    if (pathname === "/api/search" && method === "GET")
      return sendJSON(res, 200, { results: search(searchParams.get("q") || "") });

    // ---- Governance surface (no equivalent in the pre-DaxxerOS store) ----
    if (pathname === "/api/governance" && method === "GET")
      return sendJSON(res, 200, store.getGovernance());

    if (pathname === "/api/archived" && method === "GET")
      return sendJSON(res, 200, { items: store.listArchived() });

    const restore = pathname.match(/^\/api\/pages\/([^/]+)\/restore$/);
    if (restore && method === "POST")
      return sendJSON(res, 200, store.restorePage(decodeURIComponent(restore[1])));

    const auditPath = pathname.match(/^\/api\/pages\/([^/]+)\/audit$/);
    if (auditPath && method === "GET")
      return sendJSON(res, 200, { events: store.getAudit(decodeURIComponent(auditPath[1])) });

    if (pathname === "/api/pages" && method === "POST") {
      const body = await readBody(req);
      return sendJSON(res, 201, store.createPage(body));
    }

    const m = pathname.match(/^\/api\/pages\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === "GET") {
        const p = store.getPage(id);
        if (!p) return sendJSON(res, 404, { error: "not found" });
        store.touchPage(id);
        return sendJSON(res, 200, p);
      }
      if (method === "PUT" || method === "PATCH") {
        const body = await readBody(req);
        const p = store.updatePage(id, body);
        return sendJSON(res, p ? 200 : 404, p || { error: "not found" });
      }
      if (method === "DELETE") return sendJSON(res, 200, { ok: store.deletePage(id) });
    }

    const fav = pathname.match(/^\/api\/pages\/([^/]+)\/favorite$/);
    if (fav && method === "POST") return sendJSON(res, 200, { favorite: store.toggleFavorite(decodeURIComponent(fav[1])) });

    if (pathname === "/api/teamspaces" && method === "POST") {
      const body = await readBody(req);
      return sendJSON(res, 201, store.createTeamspace(body.name, body.icon));
    }

    return sendJSON(res, 404, { error: "unknown endpoint" });
  } catch (err) {
    return sendJSON(res, 500, { error: String(err && err.message ? err.message : err) });
  }
}

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
      return serveStatic(req, res, url.pathname);
    });
    server.listen(port, "127.0.0.1", () => {
      store.load();
      const actual = server.address().port;
      console.log(`\n  Daxxer running → http://localhost:${actual}\n`);
      resolve({ server, port: actual });
    });
  });
}

// Only auto-start when run directly (node server.js), not when imported by Electron.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) startServer();
