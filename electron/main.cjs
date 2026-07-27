// Daxxer desktop shell (Electron main process).
// Boots the embedded Daxxer server on a private port and opens it in a native
// window. Data is stored in the OS per-user app-data folder so it persists
// across updates and works from a read-only app bundle.

const { app, BrowserWindow, shell, Menu, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

// Boot log for diagnosing startup issues: %APPDATA%/daxxer/boot.log
function logBoot(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "boot.log"),
      new Date().toISOString() + " " + msg + "\n");
  } catch {}
}
process.on("uncaughtException", (e) => logBoot("UNCAUGHT: " + (e && e.stack ? e.stack : e)));
process.on("unhandledRejection", (e) => logBoot("UNHANDLED: " + (e && e.stack ? e.stack : e)));

// Persist workspace data outside the (read-only) app bundle.
process.env.DAXXER_DATA_DIR = app.getPath("userData");

let mainWindow = null;
let serverInfo = null;

async function boot() {
  if (!serverInfo) {
    const serverUrl = pathToFileURL(path.join(__dirname, "..", "server.js")).href;
    const { startServer } = await import(serverUrl);
    serverInfo = await startServer(0); // 0 = pick a free port
  }
  return serverInfo.port;
}

async function createWindow() {
  const port = await boot();
  // Hard-disable HTTP cache: prevents Chromium from ever serving a stale
  // renderer (JS/CSS/HTML) from a previous launch or version.
  await session.defaultSession.clearCache();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#ffffff",
    title: "Daxxer",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Open external links in the system browser, keep app links in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.on("closed", () => (mainWindow = null));
}

// A minimal, native-feeling app menu.
function buildMenu() {
  const template = [
    {
      label: "Daxxer",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
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

// Single-instance: focus existing window instead of opening a second one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
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

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
