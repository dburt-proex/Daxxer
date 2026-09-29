import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventSpine } from "../lib/event-spine.js";
import { createFlowRuntime } from "../lib/flow-runtime.js";

async function harness() {
  const dataDir = await mkdtemp(join(tmpdir(), "daxxer-flow-"));
  const eventSpine = createEventSpine({ dataDir });
  const runtime = createFlowRuntime({ dataDir, eventSpine });
  return { dataDir, eventSpine, runtime };
}

test("Flow spine pauses at REVIEW and persists exact approval binding", async () => {
  const { dataDir, runtime } = await harness();
  const run = await runtime.start({ company: "Acme", score: "85", token: "do-not-log" });

  assert.equal(run.status, "REVIEW");
  assert.equal(run.currentNode, "approval");
  assert.equal(run.nodes.manual.gate.decision, "ALLOW");
  assert.equal(run.nodes.transform.output.score, 85);
  assert.equal(run.nodes.if.gate.decision, "ALLOW");
  assert.equal(run.nodes.approval.gate.decision, "REVIEW");
  assert.equal(run.context.token, "[REDACTED]");
  assert.match(run.nodes.approval.approvalBinding, /^[a-f0-9]{64}$/);

  const restarted = createFlowRuntime({ dataDir });
  const restored = await restarted.getRun(run.id);
  assert.equal(restored.status, "REVIEW");
  assert.equal(restored.nodes.approval.approvalBinding, run.nodes.approval.approvalBinding);
});

test("approved run resumes only the bound action and emits an Event Spine receipt", async () => {
  const { eventSpine, runtime } = await harness();
  const pending = await runtime.start({ company: "Acme", score: 91 });
  const completed = await runtime.resolveApproval(pending.id, "approve");

  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.nodes.approval.gate.resolution, "ALLOW");
  assert.equal(completed.nodes.receipt.status, "SUCCEEDED");
  assert.equal(completed.receipt.kind, "flow_execution_receipt");
  assert.equal(completed.receipt.status, "SUCCEEDED");

  await eventSpine.load();
  const receipts = eventSpine.entries.filter((entry) => entry.record.kind === "execution_receipt");
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].record.value.id, completed.receipt.id);

  await eventSpine.recordExecutionReceipt(completed.receipt);
  assert.equal(eventSpine.entries.filter((entry) => entry.record.kind === "execution_receipt").length, 1);
  assert.equal(eventSpine.status().ledger.valid, true);
});

test("rejected approval routes the run to HALT and still emits a terminal receipt", async () => {
  const { runtime } = await harness();
  const pending = await runtime.start({ score: 75 });
  const completed = await runtime.resolveApproval(pending.id, "reject");

  assert.equal(completed.status, "HALTED");
  assert.equal(completed.nodes.approval.gate.resolution, "HALT");
  assert.equal(completed.receipt.terminalReason, "approval_rejected");
  assert.equal(completed.nodes.receipt.status, "SUCCEEDED");
});

test("failed IF condition HALTs before approval and records the reason", async () => {
  const { runtime } = await harness();
  const completed = await runtime.start({ score: 69 });

  assert.equal(completed.status, "HALTED");
  assert.equal(completed.nodes.if.gate.decision, "HALT");
  assert.equal(completed.nodes.approval, undefined);
  assert.equal(completed.receipt.terminalReason, "if_condition_failed");
  assert.equal(completed.nodes.receipt.status, "SUCCEEDED");
});

test("tampering with a persisted proposed action invalidates the approval binding", async () => {
  const { dataDir, runtime } = await harness();
  const pending = await runtime.start({ score: 88 });
  const runPath = join(dataDir, "flow", "runs", pending.id + ".json");
  const persisted = JSON.parse(await readFile(runPath, "utf8"));
  persisted.nodes.approval.proposedAction.contextRef = "tampered";
  await writeFile(runPath, JSON.stringify(persisted, null, 2), "utf8");

  await assert.rejects(
    () => runtime.resolveApproval(pending.id, "approve"),
    /Approval binding mismatch/
  );
});

test("tampering with persisted context also invalidates the approval binding", async () => {
  const { dataDir, runtime } = await harness();
  const pending = await runtime.start({ score: 88, company: "Acme" });
  const runPath = join(dataDir, "flow", "runs", pending.id + ".json");
  const persisted = JSON.parse(await readFile(runPath, "utf8"));
  persisted.context.score = 99;
  await writeFile(runPath, JSON.stringify(persisted, null, 2), "utf8");

  await assert.rejects(
    () => runtime.resolveApproval(pending.id, "approve"),
    /Approval binding mismatch/
  );
});

test("invalid transform input fails closed with an execution receipt", async () => {
  const { runtime } = await harness();
  const completed = await runtime.start({ score: "not-a-number" });

  assert.equal(completed.status, "FAILED");
  assert.equal(completed.nodes.transform.status, "FAILED");
  assert.equal(completed.receipt.terminalReason, "transform_invalid_score");
  assert.equal(completed.nodes.receipt.status, "SUCCEEDED");
});
