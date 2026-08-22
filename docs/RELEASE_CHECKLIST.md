# Daxxer Desktop Release Checklist

## Automated gate

- `npm ci`
- `npm run check`
- Windows `npm run package`
- packaged `dist/Daxxer-win32-x64/Daxxer.exe` exists
- repository Test workflow green
- DiffWall is not HALT
- ecosystem classification workflow green when applicable

## Packaged-app smoke scenarios

1. Launch packaged app from outside the repository checkout.
2. Create a page, rich-text marks, toggle heading, simple table, and database; close and reopen; content survives.
3. Restart the app; Daxxer locates the same per-user DaxxerOS Local data without a development path dependency.
4. Open one database in Table, Board, List, Calendar, and Gallery; all views show the same stable row IDs/source data.
5. Apply view-local search, filter, multi-sort, and property visibility; switching views does not duplicate or rewrite source rows.
6. Drag a Calendar item; only the configured date/date-range property changes.
7. Delete a page to Trash, restore it, and verify page/block IDs and content remain intact.
8. Open an external link; it opens in the system browser rather than navigating the Daxxer renderer away from the loopback app origin.
9. Start a second Daxxer process; the existing window is restored/focused rather than creating a competing writer.
10. Inspect `%APPDATA%/daxxer/boot.log`; no uncaught startup/runtime exception is present for the smoke run.

## Release hold conditions

- persisted data loss or stable-ID mutation;
- serializer/source-of-truth authority mismatch;
- packaged app requires repository/development paths;
- external navigation escapes the loopback-origin boundary;
- newly invalid typed database values persist silently;
- a projected view mutates unrelated source fields;
- DiffWall returns HALT;
- packaged app crashes or cannot recover its local workspace.

## Evidence receipt

Record release commit, Test workflow run, DiffWall route, Windows package workflow run/artifact, known residual risks, and any manually executed smoke scenarios.