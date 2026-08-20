# Daxxer Notion-Fidelity Build

## Decision

Daxxer remains the implementation surface. The first fidelity increment preserves the existing Electron + Node + DaxxerOS Local architecture and changes only editor interaction behavior and presentation.

## Why this increment is bounded

DaxxerOS Local is the governed source of truth. Its block serializer contract is not present in this repository, so this pass does not introduce a new persisted rich-text or block-type schema. That expansion is gated until the serializer is inspected and round-trip tested.

## Phase map

1. **Editor interaction fidelity** — block selection, keyboard duplicate/move, toggle-safe indentation, selection deletion, geometry, regression tests.
2. **Rich text + full block grammar** — marks, links, mentions, colors, media, table, columns, synced blocks, child-page/database blocks.
3. **Database property parity** — dates, formulas, relations, rollups, people, files, URLs, buttons, IDs, place, metadata.
4. **View engine parity** — filters/sorts/groups plus table, board, timeline, calendar, list, gallery, chart, form, feed, map, dashboard.
5. **Layouts/templates/workflows** — page layouts, tabs/details panel, templates, sub-items/dependencies, local automations.
6. **Collaboration surfaces** — comments/discussions, mentions, sharing/permissions, inbox; real-time multi-user sync remains separately gated.
7. **Fidelity hardening** — visual regression, accessibility, performance, migration/restore tests, Electron packaging.

## Pass-1 keyboard contract

- `Esc`: select the current block.
- `Up/Down` while selected: move selection between visible blocks.
- `Enter` while selected: return to editing.
- `Backspace/Delete` while selected: delete the block.
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
