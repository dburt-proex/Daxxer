import { reset } from "./store.js";
const db = reset();
console.log(`Reseeded Daxxer: ${db.pages.length} pages, ${db.teamspaces.length} teamspaces.`);
