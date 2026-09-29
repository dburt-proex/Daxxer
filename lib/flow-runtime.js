import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = "0.1";
const RUN_ID = /^[a-f0-9-]{36}$/i;
const SECRET_KEY = /(authorization|cookie|credential|password|secret|token|api[_-]?key)/i;
const FINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "HALTED"]);

export const FLOW_WORKFLOW = Object.freeze({
  id: "daxxer-flow-spine-v0-1",
  version: 1,
  name: "DAXXER Flow executable spine",
  nodes: [
    { id: "manual", type: "manual_trigger", label: "Manual Trigger", config: {} },
    { id: "transform", type: "transform", label: "Transform", config: { field: "score", cast: "number" } },
    { id: "if", type: "if", label: "IF", config: { field: "score", operator: ">=", value: 70 } },
    { id: "approval", type: "approval", label: "Approval", config: { binding: "exact_action" } },
    { id: "receipt", type: "execution_receipt", label: "Execution Receipt", config: {} },
  ],
  edges: [
    { from: "manual", to: "transform" },
    { from: "transform", to: "if" },
    { from: "if", to: "approval", when: "true" },
    { from: "if", to: "receipt", when: "false" },
    { from: "approval", to: "receipt" },
  ],
});

const isoNow = () => new Date().toISOString();

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  return value;
}

function ensureObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Flow input must be a JSON object");
  return redact(clone(input));
}

function gate(decision, reasons, extra = {}) {
  return { decision, reasons: Array.isArray(reasons) ? reasons : [reasons], policyVersion: "daxxer-flow-v0.1", ...extra };
}

function nodeRecord({ nodeId, type, status, gateDecision, input, output, reason, startedAt = isoNow(), completedAt = isoNow(), proposedAction, approvalBinding }) {
  const record = {
    nodeId,
    type,
    status,
    gate: gateDecision,
    startedAt,
    completedAt: status === "REVIEW" ? null : completedAt,
    input: redact(input ?? null),
    output: redact(output ?? null),
    inputRef: digest(redact(input ?? null)),
    outputRef: digest(redact(output ?? null)),
  };
  if (reason) record.reason = reason;
  if (proposedAction) record.proposedAction = redact(proposedAction);
  if (approvalBinding) record.approvalBinding = approvalBinding;
  return record;
}

export class FlowRuntime {
  constructor({ dataDir, eventSpine = null } = {}) {
    if (!dataDir) throw new Error("FlowRuntime requires a dataDir");
    this.rootDir = join(dataDir, "flow");
    this.runsDir = join(this.rootDir, "runs");
    this.eventSpine = eventSpine;
  }

  workflowDefinition() {
    return clone(FLOW_WORKFLOW);
  }

  async start(input = {}) {
    const createdAt = isoNow();
    const run = {
      schemaVersion: VERSION,
      id: randomUUID(),
      workflowId: FLOW_WORKFLOW.id,
      workflowVersion: FLOW_WORKFLOW.version,
      status: "RUNNING",
      currentNode: "manual",
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      context: ensureObject(input),
      nodes: {},
      receipt: null,
    };

    run.nodes.manual = nodeRecord({
      nodeId: "manual",
      type: "manual_trigger",
      status: "SUCCEEDED",
      gateDecision: gate("ALLOW", "Manual invocation is explicitly initiated by the operator."),
      input: run.context,
      output: run.context,
    });
    await this.persist(run);

    const transformStartedAt = isoNow();
    const numericScore = Number(run.context.score);
    if (!Number.isFinite(numericScore)) {
      run.nodes.transform = nodeRecord({
        nodeId: "transform",
        type: "transform",
        status: "FAILED",
        gateDecision: gate("ALLOW", "Deterministic local transform is within the v0.1 execution boundary."),
        input: run.context,
        output: null,
        reason: "score must be numeric",
        startedAt: transformStartedAt,
      });
      return this.finalize(run, "FAILED", "transform_invalid_score");
    }

    run.context = { ...run.context, score: numericScore, normalized: true };
    run.currentNode = "transform";
    run.nodes.transform = nodeRecord({
      nodeId: "transform",
      type: "transform",
      status: "SUCCEEDED",
      gateDecision: gate("ALLOW", "Deterministic local transform is within the v0.1 execution boundary."),
      input: input,
      output: run.context,
      startedAt: transformStartedAt,
    });
    await this.persist(run);

    const condition = numericScore >= 70;
    run.currentNode = "if";
    run.nodes.if = nodeRecord({
      nodeId: "if",
      type: "if",
      status: condition ? "SUCCEEDED" : "HALTED",
      gateDecision: condition
        ? gate("ALLOW", "Condition passed: score is at least 70.")
        : gate("HALT", "Condition failed: score is below 70."),
      input: run.context,
      output: { condition, score: numericScore, threshold: 70 },
    });
    await this.persist(run);

    if (!condition) return this.finalize(run, "HALTED", "if_condition_failed");

    const proposedAction = {
      action: "continue_flow",
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      runId: run.id,
      fromNode: "approval",
      toNode: "receipt",
      contextRef: digest(run.context),
    };
    const approvalBinding = digest(proposedAction);
    run.currentNode = "approval";
    run.status = "REVIEW";
    run.nodes.approval = nodeRecord({
      nodeId: "approval",
      type: "approval",
      status: "REVIEW",
      gateDecision: gate("REVIEW", "Explicit human approval is required before the workflow may continue.", { requiredAction: "approve_or_reject" }),
      input: run.context,
      output: { proposedAction },
      proposedAction,
      approvalBinding,
    });
    await this.persist(run);
    return clone(run);
  }

  async getRun(runId) {
    this.assertRunId(runId);
    try {
      const raw = await readFile(join(this.runsDir, runId + ".json"), "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async resolveApproval(runId, decision) {
    const normalizedDecision = String(decision || "").toLowerCase();
    if (!["approve", "reject"].includes(normalizedDecision)) throw new Error("Approval decision must be approve or reject");

    const run = await this.getRun(runId);
    if (!run) throw new Error("Flow run not found");
    if (run.status !== "REVIEW" || run.currentNode !== "approval" || run.nodes?.approval?.status !== "REVIEW") {
      throw new Error("Flow run is not awaiting approval");
    }

    const approval = run.nodes.approval;
    if (digest(approval.proposedAction) !== approval.approvalBinding) {
      throw new Error("Approval binding mismatch; the proposed action changed after review was requested");
    }

    const approved = normalizedDecision === "approve";
    approval.status = approved ? "SUCCEEDED" : "HALTED";
    approval.completedAt = isoNow();
    approval.gate = {
      ...approval.gate,
      resolution: approved ? "ALLOW" : "HALT",
      resolvedAt: approval.completedAt,
      resolutionReason: approved ? "Operator approved the exact bound action." : "Operator rejected the exact bound action.",
    };
    run.status = approved ? "RUNNING" : "HALTED";
    run.updatedAt = isoNow();
    await this.persist(run);

    return this.finalize(run, approved ? "SUCCEEDED" : "HALTED", approved ? "approved" : "approval_rejected");
  }

  async finalize(run, finalStatus, terminalReason) {
    if (!FINAL_STATUSES.has(finalStatus)) throw new Error("Invalid terminal Flow status");
    if (run.receipt && FINAL_STATUSES.has(run.status)) return clone(run);

    const completedAt = isoNow();
    const receipt = {
      schemaVersion: VERSION,
      id: "flow_receipt_" + run.id,
      kind: "flow_execution_receipt",
      runId: run.id,
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      status: finalStatus,
      terminalReason,
      startedAt: run.createdAt,
      completedAt,
      contextRef: digest(run.context),
      nodeResults: Object.values(run.nodes).map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        status: node.status,
        gate: node.gate,
        inputRef: node.inputRef,
        outputRef: node.outputRef,
      })),
    };

    run.currentNode = "receipt";
    run.status = finalStatus;
    run.completedAt = completedAt;
    run.updatedAt = completedAt;
    run.receipt = receipt;
    run.nodes.receipt = nodeRecord({
      nodeId: "receipt",
      type: "execution_receipt",
      status: "SUCCEEDED",
      gateDecision: gate("ALLOW", "Receipt generation is a local evidence write."),
      input: { runId: run.id, status: finalStatus },
      output: { receiptId: receipt.id, status: finalStatus, contextRef: receipt.contextRef },
      startedAt: completedAt,
      completedAt,
    });

    if (this.eventSpine) await this.eventSpine.recordExecutionReceipt(receipt);
    await this.persist(run);
    return clone(run);
  }

  async persist(run) {
    await mkdir(this.runsDir, { recursive: true });
    run.updatedAt = isoNow();
    const target = join(this.runsDir, run.id + ".json");
    const temporary = target + ".tmp";
    await writeFile(temporary, JSON.stringify(run, null, 2) + "\n", "utf8");
    await rename(temporary, target);
  }

  assertRunId(runId) {
    if (!RUN_ID.test(String(runId || ""))) throw new Error("Invalid Flow run id");
  }
}

export function createFlowRuntime(options) {
  return new FlowRuntime(options);
}
