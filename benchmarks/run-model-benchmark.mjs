import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { estimateTokenCostUsd, MODEL_IDS } from "../lib/model-router.js";

const cases = JSON.parse(await readFile(new URL("./model-workloads.json", import.meta.url), "utf8"));
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required. Live model benchmarking is an explicit paid API action.");

function scoreQuality(text, item) {
  const haystack = String(text || "").toLowerCase();
  const required = item.must_include || [];
  const forbidden = item.must_not_include || [];
  const requiredHits = required.filter((value) => haystack.includes(value.toLowerCase())).length;
  const forbiddenHits = forbidden.filter((value) => haystack.includes(value.toLowerCase())).length;
  const coverage = required.length ? requiredHits / required.length : 1;
  const penalty = forbidden.length ? forbiddenHits / forbidden.length : 0;
  return {
    score: Math.max(0, Number((coverage - penalty).toFixed(4))),
    required_hits: requiredHits,
    required_total: required.length,
    forbidden_hits: forbiddenHits,
    forbidden_total: forbidden.length,
  };
}

function outputText(body) {
  if (body.output_text) return body.output_text;
  return (body.output || []).flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");
}

async function callModel(model, item) {
  const effort = model === "astra" && item.effort === "none" ? "low" : item.effort;
  const started = performance.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      reasoning: { effort },
      input: [
        { role: "system", content: [{ type: "input_text", text: "Execute the bounded DAXXER benchmark task. Stay within supplied evidence. Be concise." }] },
        { role: "user", content: [{ type: "input_text", text: item.prompt }] }
      ]
    })
  });
  const latencyMs = performance.now() - started;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = outputText(body);
  const usage = body.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  return {
    latency_ms: Number(latencyMs.toFixed(1)),
    quality: scoreQuality(text, item),
    usage: { input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: outputTokens },
    cost_usd: Number(estimateTokenCostUsd({ model, input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: outputTokens }).toFixed(8)),
    output: text
  };
}

const rows = [];
for (const item of cases) {
  const row = { fixture_id: item.id, domain: item.domain, models: {} };
  for (const model of ["luna", "sol", "astra"]) {
    try {
      row.models[model] = await callModel(model, item);
    } catch (error) {
      row.models[model] = { error: String(error?.message || error) };
    }
  }
  rows.push(row);
}

function aggregate(model) {
  const valid = rows.map((row) => row.models[model]).filter((x) => x && !x.error);
  if (!valid.length) return { runs: 0 };
  return {
    runs: valid.length,
    mean_quality: Number((valid.reduce((sum, x) => sum + x.quality.score, 0) / valid.length).toFixed(4)),
    mean_latency_ms: Number((valid.reduce((sum, x) => sum + x.latency_ms, 0) / valid.length).toFixed(1)),
    total_cost_usd: Number(valid.reduce((sum, x) => sum + x.cost_usd, 0).toFixed(8))
  };
}

const result = {
  generated_at: new Date().toISOString(),
  corpus_version: "1.0",
  methodology: "Deterministic required/forbidden substring assertions over six bounded synthetic DAXXER workloads. This is a routing benchmark, not a general model benchmark.",
  aggregate: { luna: aggregate("luna"), sol: aggregate("sol"), astra: aggregate("astra") },
  rows
};

await writeFile(new URL("./results-live.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
