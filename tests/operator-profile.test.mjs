import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../public/operator-profile.js", import.meta.url), "utf8");
const data = new Map();
const localStorage = { getItem:k => data.get(k) || null, setItem:(k,v) => data.set(k,v) };
const Daxxer = {};
const document = { addEventListener() {} }; const window = { Daxxer, addEventListener() {} };
vm.runInContext(source, vm.createContext({ window, Daxxer, document, localStorage, location:{hash:""}, structuredClone, Map, Set, Object, Array, String, Number, JSON, Date, Math }));
const P = Daxxer.OperatorProfile;

test("profile normalization drops unbounded/invalid counters", () => {
  const p = P.normalize({ counters: { views: { table: 4, bad: -2, nope: "x" } } });
  assert.equal(p.counters.views.table, 4); assert.equal(p.counters.views.bad, undefined); assert.equal(p.counters.views.nope, undefined);
});

test("recording produces deterministic suggestions only after threshold", () => {
  for (let i=0;i<8;i++) P.record("view", "calendar");
  const s = P.suggestions(); assert.equal(s[0].id, "default-view:calendar");
  P.decide(s[0].id, false); assert.equal(P.suggestions().some((x) => x.id === s[0].id), false);
});

test("preferences are bounded to declared keys", () => {
  assert.equal(P.setPreference("theme", "dark").ok, true);
  assert.equal(P.setPreference("secret", "x").ok, false);
});