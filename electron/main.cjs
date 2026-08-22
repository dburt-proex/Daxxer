// Daxxer desktop shell. Boots the loopback-only Daxxer server and opens it in
// a sandboxed Electron renderer. Workspace data and runtime state live in the
// per-user app-data directory, never inside the application bundle.

const { app, BrowserWindow, shell, Menu, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

app.setAppUserModelId("Daxxer");
process.env.DAXXER_DATA_DIR = app.getPath("userData");

function logBoot(msg) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "boot.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}
process.on("uncaughtException", (e) => logBoot("UNCAUGHT: " + (e && e.stack ? e.stack : e)));
process.on("unhandledRejection", (e) => logBoot("UNHANDLED: " + (e && e.stack ? e.stack : e)));

let mainWindow = null;
let serverInfo = null;
const statePath = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    const width = Number(parsed.width); const height = Number(parsed.height);
    return {
      width: Number.isFinite(width) && width >= 720 ? width : 1320,
      height: Number.isFinite(height) && height >= 480 ? height : 880,
      x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : undefined,
      y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : undefined,
      maximized: parsed.maximized === true,
    };
  } catch { return { width: 1320, height: 880, maximized: false }; }
}

function writeWindowState(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }, null, 2));
  } catch (e) { logBoot("WINDOW STATE WRITE FAILED: " + e.message); }
}

async function boot() {
  if (!serverInfo) {
    const serverUrl = pathToFileURL(path.join(__dirname, "..", "server.js")).href;
    const { startServer } = await import(serverUrl);
    serverInfo = await startServer(0);
  }
  return serverInfo.port;
}

function isLocalAppUrl(raw) {
  try {
    const url = new URL(raw);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return url.protocol === "http:" && localHost && serverInfo && Number(url.port) === Number(serverInfo.port);
  } catch { return false; }
}

async function createWindow() {
  const port = await boot();
  await session.defaultSession.clearCache();
  const saved = readWindowState();
  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x === undefined ? {} : { x: saved.x }),
    ...(saved.y === undefined ? {} : { y: saved.y }),
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#ffffff",
    title: "Daxxer",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalAppUrl(url)) return { action: "allow" };
    shell.openExternal(url).catch((e) => logBoot("EXTERNAL OPEN FAILED: " + e.message));
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url).catch((e) => logBoot("NAVIGATION OPEN FAILED: " + e.message));
  });

  mainWindow.once("ready-to-show", () => {
    if (saved.maximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on("close", () => writeWindowState(mainWindow));
  mainWindow.on("closed", () => (mainWindow = null));
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function buildMenu() {
  const template = [
    {
      label: "Daxxer",
      submenu: [
        { role: "reload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ] },
    { label: "View", submenu: [
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopServer() {
  if (!serverInfo || !serverInfo.server) return;
  try { serverInfo.server.close(); } catch (e) { logBoot("SERVER CLOSE FAILED: " + e.message); }
  serverInfo = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      await createWindow();
      logBoot("window created OK");
    } catch (err) {
      logBoot("BOOT FAILED: " + (err && err.stack ? err.stack : err));
      dialog.showErrorBox("Daxxer failed to start", String(err && err.message ? err.message : err));
      app.quit();
    }
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("before-quit", () => { writeWindowState(); stopServer(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
