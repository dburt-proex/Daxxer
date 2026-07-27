# Daxxer

A block-based workspace **desktop app** — pages, a block editor, and typed databases. Themed white / blue / orange. Built on Electron (same tech as Notion), so it runs in its own native window with a taskbar icon.

**Storage (as of 2026-07-24):** this app used to persist to a flat `data/workspace.json` blob. It now persists to **DaxxerOS Local** (`../DaxxerOS_Local`) — every page and teamspace is a governed Markdown + YAML frontmatter record, indexed into SQLite, gated on creation, and archived (never hard-deleted) when you "delete" something in the UI. See `DaxxerOS_Local/CHANGELOG.md` and `daxxer/bridge.py` for what changed and why. `lib/store.js` now shells out to `python -m daxxer.bridge <op>` instead of reading/writing JSON directly — same function signatures, so nothing else in this app had to change.

Requires Python + `pip install -e .` run once inside `DaxxerOS_Local` (already done if you followed the original setup). Run `daxxer index` inside `DaxxerOS_Local` after pulling these changes, before launching the app, so the SQLite projection picks up the new schema and the seeded starter workspace.

## Run the desktop app

```bash
cd daxxer
npm install      # one-time: downloads Electron
npm start        # opens the Daxxer desktop window
```

## Build a double-clickable Daxxer.exe

```bash
npm run package
# → dist/Daxxer-win32-x64/Daxxer.exe
```

Copy that folder anywhere (or pin `Daxxer.exe` to the taskbar) and double-click to launch — no terminal needed. Your workspace data lives in the per-user app-data folder, so it persists across updates.

## Run as a plain web app (no Electron)

```bash
node server.js   # → http://localhost:4400  (zero dependencies)
```

## Features

**Block system (the core)**
- Block types: text, H1–H3, bulleted / numbered / to-do lists, toggle, quote, callout, divider, code.
- **Slash menu** (`/`) to insert or convert any block.
- **Markdown shortcuts**: `# ` → heading, `- ` → bullet, `1. ` → numbered, `[] ` → to-do, `> ` → quote, ` ``` ` → code.
- Enter splits a block; Backspace at the start merges or un-formats.
- To-do checkboxes, collapsible toggles with nested blocks, colored callouts.
- Hover gutter to **add** a block or open block actions (duplicate, turn-into, color, delete). **Drag** the handle to reorder.

**Databases**
- Table and Board views, switchable per database.
- Typed properties: title, select, status, multi-select, checkbox, text, number.
- Colored pills; create options inline by typing a new value.
- Add rows and properties; open any row in a peek panel to edit all fields.
- Drag cards between board columns to change their group.

**Workspace**
- Sidebar with teamspaces, nested page tree (expand/collapse), favorites, and recents.
- Breadcrumbs, page icons (emoji picker), page titles, favorites.
- Full-text **search** across titles, block text, and row titles (`Ctrl/⌘-K`).
- Create / delete / nest pages; databases and doc pages.

## Architecture

```
server.js         zero-dep node:http server + JSON API
lib/
  seed.js         starter workspace (teamspaces, pages, a database)
  store.js        atomic JSON store (data/workspace.json)
  search.js       workspace search
public/
  index.html      app shell
  styles.css      white / blue / orange theme
  icons.js        icons, block registry, tag colors, emoji set
  editor.js       block editor (slash menu, markdown, drag, toggles)
  database.js     table + board views, typed cells, row peek
  app.js          sidebar, routing, top bar, search, emoji picker
```

Data persists to `data/workspace.json`. Reset with `node lib/reset.js`.

## API

`GET /api/sidebar` · `GET /api/search?q=` · `POST /api/pages` ·
`GET|PUT|DELETE /api/pages/:id` · `POST /api/pages/:id/favorite` · `POST /api/teamspaces`
