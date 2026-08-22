import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const library = JSON.parse(fs.readFileSync(new URL("../personas/library.json", import.meta.url), "utf8"));
const requiredArrays = ["cognitivePosture", "strengths", "failureModes", "countermeasures", "decisionRights", "forbidden", "escalateWhen"];

test("persona library has unique versioned identities", () => {
  assert.equal(library.schemaVersion, 1);
  assert.ok(Array.isArray(library.personas) && library.personas.length >= 8);
  const ids = library.personas.map((persona) => persona.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("warden.governance-review"));
  assert.ok(ids.includes("sentinel.qa-redteam"));
  assert.ok(ids.includes("mirror.persona-systems"));
});

test("every persona is an operational contract rather than style-only prose", () => {
  for (const persona of library.personas) {
    assert.match(persona.id, /^[a-z0-9-]+\.[a-z0-9-]+$/);
    assert.ok(persona.name && persona.role && persona.mission && persona.evidenceStandard);
    for (const key of requiredArrays) {
      assert.ok(Array.isArray(persona[key]) && persona[key].length > 0, `${persona.id} missing ${key}`);
    }
  }
});

test("governance and QA roles remain distinct", () => {
  const warden = library.personas.find((persona) => persona.id === "warden.governance-review");
  const sentinel = library.personas.find((persona) => persona.id === "sentinel.qa-redteam");
  assert.notEqual(warden.role, sentinel.role);
  assert.ok(warden.forbidden.some((rule) => rule.includes("HALT")));
  assert.ok(sentinel.evidenceStandard.includes("failing fixture"));
});
