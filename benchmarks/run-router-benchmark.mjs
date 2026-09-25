import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { routeModel } from "../lib/model-router.js";

const fixtures = JSON.parse(await readFile(new URL("./workloads.json", import.meta.url), "utf8"));
const rows = fixtures.map((fixture) => {
  const started = performance.now();
  const route = routeModel(fixture.input);
  return {
    fixture_id: fixture.id,
    domain: fixture.domain,
    routed_model: route.model,
    reasoning_effort: route.reasoning_effort,
    gate: route.gate,
    router_latency_ms: Number((performance.now() - started).toFixed(4)),
    expected_model_match: route.model === fixture.expected.model,
    expected_gate_match: route.gate === fixture.expected.gate,
  };
});

const result = {
  generated_at: new Date().toISOString(),
  mode: "router-only",
  fixture_count: rows.length,
  router_model_accuracy: rows.filter((row) => row.expected_model_match).length / rows.length,
  router_gate_accuracy: rows.filter((row) => row.expected_gate_match).length / rows.length,
  rows,
};

await writeFile(new URL("./results-router.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
