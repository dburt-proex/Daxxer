import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { routeModel, estimateTokenCostUsd } from "../lib/model-router.js";

const fixtures = JSON.parse(await readFile(new URL("../benchmarks/workloads.json", import.meta.url), "utf8"));

test("representative DAXXER routing fixtures match expected model and gate", () => {
  for (const fixture of fixtures) {
    const result = routeModel(fixture.input);
    assert.equal(result.model, fixture.expected.model, `${fixture.id}: model`);
    assert.equal(result.gate, fixture.expected.gate, `${fixture.id}: gate`);
  }
});

test("model escalation never expands authority", () => {
  const base = {
    task_type: "authority_invariant", complexity: 0, ambiguity: 0, consequence: 0,
    verification_difficulty: 0, scope: 0, volume: 0, authority: "read",
    external_effect: false, security_critical: false, destructive_action: false,
    target_verified: true, evidence_available: true, prior_failures: 0,
  };
  const luna = routeModel(base);
  const sol = routeModel({ ...base, complexity: 1, ambiguity: 1 });
  const astra = routeModel({ ...base, complexity: 2, ambiguity: 2, consequence: 2, verification_difficulty: 2, scope: 2, security_critical: true });
  assert.equal(luna.model, "luna");
  assert.equal(sol.model, "sol");
  assert.equal(astra.model, "astra");
  assert.equal(luna.authority, "read");
  assert.equal(sol.authority, "read");
  assert.equal(astra.authority, "read");
});

test("consequential external authority requires review regardless of model", () => {
  const result = routeModel({
    task_type: "send", complexity: 0, ambiguity: 0, consequence: 0, verification_difficulty: 0,
    scope: 0, volume: 2, authority: "external_action", external_effect: true,
    security_critical: false, destructive_action: false, target_verified: true,
    evidence_available: true, prior_failures: 0,
  });
  assert.equal(result.model, "luna");
  assert.equal(result.gate, "REVIEW");
});

test("unverified destructive actions halt", () => {
  const result = routeModel({
    task_type: "delete", complexity: 0, ambiguity: 0, consequence: 0, verification_difficulty: 0,
    scope: 0, volume: 0, authority: "delete", external_effect: true, security_critical: false,
    destructive_action: true, target_verified: false, evidence_available: true, prior_failures: 0,
  });
  assert.equal(result.gate, "HALT");
});

test("token cost calculator uses current GPT-6 list prices", () => {
  assert.equal(estimateTokenCostUsd({ model: "luna", input_tokens: 1_000_000, output_tokens: 1_000_000 }), 0.6);
  assert.equal(estimateTokenCostUsd({ model: "sol", input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12);
  assert.equal(estimateTokenCostUsd({ model: "astra", input_tokens: 1_000_000, output_tokens: 1_000_000 }), 60);
  assert.equal(estimateTokenCostUsd({ model: "sol", input_tokens: 1_000_000, cached_input_tokens: 500_000, output_tokens: 0 }), 1.1);
});

test("invalid dimension values fail closed", () => {
  assert.throws(() => routeModel({
    task_type: "bad", complexity: 3, ambiguity: 0, consequence: 0, verification_difficulty: 0,
    scope: 0, volume: 0, authority: "read", external_effect: false, security_critical: false,
    destructive_action: false, target_verified: true, evidence_available: true, prior_failures: 0,
  }), /complexity/);
});
