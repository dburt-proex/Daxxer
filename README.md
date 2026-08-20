# Daxxer

A governed, local-first block workspace desktop app — pages, a block editor, typed databases, and an Electron shell with Notion-fidelity interaction work underway.

## Storage authority

Daxxer no longer persists to the old flat `data/workspace.json` blob. The source of truth is **DaxxerOS Local** (`../DaxxerOS_Local` in development, or the configured `DAXXER_ROOT`) where pages and teamspaces are governed Markdown + YAML frontmatter records indexed into SQLite.

`lib/store.js` is a compatibility bridge: it shells out to `python -m daxxer.bridge <op>` while preserving the existing server/frontend function signatures. Deletes are recoverable archive operations rather than hard deletes.

Requires Python plus `pip install -e .` inside `DaxxerOS_Local`. Run `daxxer index` there after pulling schema-affecting changes before launching the app.

## Run the desktop app

```bash
cd Daxxer
npm install
npm start
```

## Build a double-clickable Daxxer.exe

```bash
npm run package
# → dist/Daxxer-win32-x64/Daxxer.exe
```

The packaged application resolves the governed store separately from the read-only app bundle. Override its location with `DAXXER_ROOT` when needed.

## Run as a plain web app

```bash
node server.js   # → http://localhost:4400
```

## Validation

```bash
npm test
npm run check
```

`npm run check` performs syntax validation for the server/editor fidelity scripts and runs the block-operation regression suite. It does not require Electron to launch.

## Features

### Block system

- Block types: text, H1–H3, bulleted / numbered / to-do lists, toggle, quote, callout, divider, code.
- Slash menu (`/`) to insert or convert supported blocks.
- Markdown shortcuts: `# ` → heading, `- ` → bullet, `1. ` → numbered, `[] ` → to-do, `> ` → quote, triple-backtick → code.
- Enter splits a block; Backspace at the start merges or un-formats.
- To-do checkboxes, collapsible toggles with nested blocks, colored callouts.
- Hover gutter to add a block or open block actions; drag the handle to reorder.

### Notion-fidelity interaction pass 1

- `Esc` selects the current block.
- Up/Down navigates selected blocks.
- Enter returns a selected block to editing.
- Delete/Backspace removes a selected block.
- `Ctrl/Cmd + D` duplicates a block with recursively unique nested IDs.
- `Ctrl/Cmd + Shift + Up/Down` reorders within the containing block array.
- Tab indents into the immediately previous toggle when valid; Shift+Tab outdents.
- `Ctrl/Cmd + Enter` activates to-do and toggle blocks.

See `docs/NOTION_FIDELITY_BUILD.md` for the phased parity program and persistence gates.

### Databases

- Table and Board views, switchable per database.
- Typed properties: title, select, status, multi-select, checkbox, text, number.
- Colored pills; create options inline by typing a new value.
- Add rows and properties; open any row in a peek panel to edit all fields.
- Drag cards between board columns to change their group.

### Workspace

- Sidebar with teamspaces, nested page tree, favorites, and recents.
- Breadcrumbs, page icons, page titles, favorites.
- Full-text search across titles, block text, and row titles (`Ctrl/⌘-K`).
- Create, archive, restore, and nest pages; databases and document pages.
- Governance, review queue, record history, and archive surfaces.

## Architecture

```text
server.js                 node:http server + JSON API
lib/
  store.js                governed DaxxerOS Local bridge
  search.js               workspace search
public/
  index.html              app shell
  styles.css              base application styles
  notion-fidelity.css     Notion-fidelity geometry/selection layer
  icons.js                icons, block registry, tag colors, emoji set
  block-ops.js            pure/tested block-tree mutation helpers
  editor.js               base block editor
  notion-fidelity.js      keyboard/selection fidelity adapter
  database.js             table + board views, typed cells, row peek
  governance.js           governance/archive/audit UI surface
  app.js                  sidebar, routing, top bar, search, emoji picker
```

## API

Core endpoints:

`GET /api/sidebar` · `GET /api/search?q=` · `POST /api/pages` ·
`GET|PUT|DELETE /api/pages/:id` · `POST /api/pages/:id/favorite` · `POST /api/teamspaces`

Governance endpoints:

`GET /api/governance` · `GET /api/archived` · `POST /api/pages/:id/restore` · `GET /api/pages/:id/audit`
