// Workspace search. Delegates to the governed DaxxerOS Local store (SQLite
// FTS5 over the real Markdown records) instead of scanning an in-memory JSON
// blob. Same export shape as before, so server.js needed no changes.
import { searchGoverned } from "./store.js";

export function search(query) {
  return searchGoverned(query);
}
