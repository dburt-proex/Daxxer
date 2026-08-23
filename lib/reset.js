import { reset } from "./store.js";
const db = reset();
console.log(`Reset Daxxer to a blank workspace: ${db.pages.length} pages, ${db.teamspaces.length} teamspaces.`);
