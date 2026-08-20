# Daxxer Notion-Fidelity Build

## Decision

Daxxer remains the implementation surface. Fidelity work proceeds in bounded increments that preserve the existing Electron + Node + DaxxerOS Local architecture until the serializer contract is available.

## Persistence gate

DaxxerOS Local is the governed source of truth. Its block serializer contract is not present in this repository, so persisted rich-text and new block-type shapes are gated by issue #11 until the serializer is inspected and round-trip tested.

Interaction work that stays inside the existing persisted block schema may continue.

## Phase map

1. **Editor interaction fidelity** — block selection, keyboard duplicate/move, toggle-safe indentation, selection deletion, geometry, regression tests.
2. **Rich text + full block grammar** — marks, links, mentions, colors, media, table, columns, synced blocks, child-page/database blocks. Persisted schema work is gated by #11; existing-schema interaction work is active.
3. **Database property parity** — dates, formulas, relations, rollups, people, files, URLs, buttons, IDs, place, metadata.
4. **View engine parity** — filters/sorts/groups plus table, board, timeline, calendar, list, gallery, chart, form, feed, map, dashboard.
5. **Layouts/templates/workflows** — page layouts, tabs/details panel, templates, sub-items/dependencies, local automations.
6. **Collaboration surfaces** — comments/discussions, mentions, sharing/permissions, inbox; real-time multi-user sync remains separately gated.
7. **Fidelity hardening** — visual regression, accessibility, performance, migration/restore tests, Electron packaging.

## Current keyboard contract

- `Esc`: select the current block.
- `Up/Down` while selected: move selection between visible blocks.
- `Left/Right` while a toggle block is selected: collapse/open the toggle.
- `Enter` while selected: return to editing.
- `Backspace/Delete` while selected: delete the block.
- `Backspace` at the start of a nested editable block: outdent it one level.
- `Ctrl/Cmd + D`: duplicate the current or selected block with recursively unique IDs.
- `Ctrl/Cmd + Shift + Up/Down`: reorder within the containing block array.
- `Tab`: indent into the immediately previous toggle when valid.
- `Shift + Tab`: outdent a nested block.
- `Ctrl/Cmd + Enter`: toggle a to-do checkbox or open/close a toggle block.

## Governance boundary

- No new external network behavior.
- No destructive storage migration.
- Existing archive/restore semantics remain unchanged.
- Existing page/block JSON remains backward compatible.
- Future persisted schema changes require serializer inspection, migration versioning, round-trip tests, and a recovery path.
