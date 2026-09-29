import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = "0.2";
const RUN_ID = /^[a-f0-9-]{36}$/i;
const SECRET_KEY = /(authorization|cookie|credential|password|secret|token|api[_-]?key)/i;
const FINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "HALTED"]);
const ALLOWED_OPERATORS = new Set([">=", ">", "<=", "<", "==", "!="]);

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

const REQUIRED_NODE_TYPES = new Map(FLOW_WORKFLOW.nodes.map((node) => [node.id, node.type]));
const REQUIRED_EDGES = FLOW_WORKFLOW.edges.map((edge) => JSON.stringify(edge)).sort();
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

function ensureField(value, label) {
  const field = String(value || "").trim();
  if (!field || field.length > 80 || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field)) {
    throw new Error(label + " must be a simple field name");
  }
  return field;
}

function compare(actual, operator, expected) {
  if (operator === ">=") return actual >= expected;
  if (operator === ">") return actual > expected;
  if (operator === "<=") return actual <= expected;
  if (operator === "<") return actual < expected;
  if (operator === "==") return actual === expected;
  if (operator === "!=") return actual !== expected;
  throw new Error("Unsupported IF operator");
}

function gate(decision, reasons, extra = {}) {
  return { decision, reasons: Array.isArray(reasons) ? reasons : [reasons], policyVersion: "daxxer-flow-v0.2", ...extra };
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
    this.workflowPath = join(this.rootDir, "workflow.json");
    this.eventSpine = eventSpine;
  }

  async workflowDefinition() {
    try {
      const raw = await readFile(this.workflowPath, "utf8");
      return this.validateWorkflow(JSON.parse(raw));
    } catch (error) {
      if (error.code === "ENOENT") return clone(FLOW_WORKFLOW);
      throw error;
    }
  }

  async saveWorkflow(candidate) {
    const current = await this.workflowDefinition();
    const validated = this.validateWorkflow(candidate);
    validated.id = FLOW_WORKFLOW.id;
    validated.name = FLOW_WORKFLOW.name;
    validated.version = current.version + 1;
    await mkdir(this.rootDir, { recursive: true });
    const temporary = this.workflowPath + ".tmp";
    await writeFile(temporary, JSON.stringify(validated, null, 2) + "\n", "utf8");
    await rename(temporary, this.workflowPath);
    return clone(validated);
  }

  validateWorkflow(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Workflow must be a JSON object");
    if (!Array.isArray(candidate.nodes) || candidate.nodes.length !== FLOW_WORKFLOW.nodes.length) {
      throw new Error("DAXXER Flow v0.2 requires the fixed five-node spine");
    }
    if (!Array.isArray(candidate.edges) || candidate.edges.length !== FLOW_WORKFLOW.edges.length) {
      throw new Error("DAXXER Flow v0.2 requires the fixed spine topology");
    }

    const nodesById = new Map();
    for (const node of candidate.nodes) {
      if (!node || typeof node !== "object" || nodesById.has(node.id)) throw new Error("Workflow contains an invalid or duplicate node");
      const expectedType = REQUIRED_NODE_TYPES.get(node.id);
      if (!expectedType || node.type !== expectedType) throw new Error("Workflow node ids and types are fixed in v0.2");
      nodesById.set(node.id, node);
    }
    if (nodesById.size !== REQUIRED_NODE_TYPES.size) throw new Error("Workflow is missing a required node");

    const edges = candidate.edges.map((edge) => JSON.stringify(edge)).sort();
    if (JSON.stringify(edges) !== JSON.stringify(REQUIRED_EDGES)) throw new Error("Workflow topology is fixed in v0.2");

    const transform = nodesById.get("transform");
    const transformField = ensureField(transform.config?.field, "Transform field");
    if ((transform.config?.cast || "number") !== "number") throw new Error("Transform cast must remain number in v0.2");

    const condition = nodesById.get("if");
    const conditionField = ensureField(condition.config?.field, "IF field");
    const operator = String(condition.config?.operator || "");
    if (!ALLOWED_OPERATORS.has(operator)) throw new Error("Unsupported IF operator");
    const threshold = Number(condition.config?.value);
    if (!Number.isFinite(threshold)) throw new Error("IF value must be numeric");

    const approval = nodesById.get("approval");
    if ((approval.config?.binding || "") !== "exact_action") throw new Error("Approval binding must remain exact_action");

    const cleanNodes = FLOW_WORKFLOW.nodes.map((defaultNode) => {
      const node = nodesById.get(defaultNode.id);
      const base = { id: defaultNode.id, type: defaultNode.type, label: defaultNode.label };
      if (node.id === "transform") return { ...base, config: { field: transformField, cast: "number" } };
      if (node.id === "if") return { ...base, config: { field: conditionField, operator, value: threshold } };
      if (node.id === "approval") return { ...base, config: { binding: "exact_action" } };
      return { ...base, config: {} };
    });

    return {
      id: FLOW_WORKFLOW.id,
      version: Number.isInteger(candidate.version) && candidate.version > 0 ? candidate.version : 1,
      name: FLOW_WORKFLOW.name,
      nodes: cleanNodes,
      edges: clone(FLOW_WORKFLOW.edges),
    };
  }

  async start(input = {}) {
    const workflow = await this.workflowDefinition();
    const transformConfig = workflow.nodes.find((node) => node.id === "transform").config;
    const ifConfig = workflow.nodes.find((node) => node.id === "if").config;
    const createdAt = isoNow();
    const run = {
      schemaVersion: VERSION,
      id: randomUUID(),
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      workflowSnapshot: workflow,
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
    const rawTransformValue = run.context[transformConfig.field];
    const numericValue = Number(rawTransformValue);
    if (!Number.isFinite(numericValue)) {
      run.nodes.transform = nodeRecord({
        nodeId: "transform",
        type: "transform",
        status: "FAILED",
        gateDecision: gate("ALLOW", "Deterministic local transform is within the v0.2 execution boundary."),
        input: run.context,
        output: null,
        reason: transformConfig.field + " must be numeric",
        startedAt: transformStartedAt,
      });
      return this.finalize(run, "FAILED", "transform_invalid_number");
    }

    run.context = { ...run.context, [transformConfig.field]: numericValue, normalized: true };
    run.currentNode = "transform";
    run.nodes.transform = nodeRecord({
      nodeId: "transform",
      type: "transform",
      status: "SUCCEEDED",
      gateDecision: gate("ALLOW", "Deterministic local transform is within the v0.2 execution boundary."),
      input,
      output: run.context,
      startedAt: transformStartedAt,
    });
    await this.persist(run);

    const actual = Number(run.context[ifConfig.field]);
    if (!Number.isFinite(actual)) {
      run.currentNode = "if";
      run.nodes.if = nodeRecord({
        nodeId: "if",
        type: "if",
        status: "FAILED",
        gateDecision: gate("HALT", "IF field is not numeric after deterministic transform."),
        input: run.context,
        output: { condition: false, field: ifConfig.field, actual: run.context[ifConfig.field], operator: ifConfig.operator, expected: ifConfig.value },
        reason: ifConfig.field + " must be numeric",
      });
      await this.persist(run);
      return this.finalize(run, "FAILED", "if_invalid_number");
    }

    const conditionPassed = compare(actual, ifConfig.operator, ifConfig.value);
    const comparisonText = ifConfig.field + " " + ifConfig.operator + " " + ifConfig.value;
    run.currentNode = "if";
    run.nodes.if = nodeRecord({
      nodeId: "if",
      type: "if",
      status: conditionPassed ? "SUCCEEDED" : "HALTED",
      gateDecision: conditionPassed
        ? gate("ALLOW", "Condition passed: " + comparisonText + ".")
        : gate("HALT", "Condition failed: " + comparisonText + "."),
      input: run.context,
      output: { condition: conditionPassed, field: ifConfig.field, actual, operator: ifConfig.operator, expected: ifConfig.value },
    });
    await this.persist(run);

    if (!conditionPassed) return this.finalize(run, "HALTED", "if_condition_failed");

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
    const actionMatches = digest(approval.proposedAction) === approval.approvalBinding;
    const contextMatches = approval.proposedAction?.contextRef === digest(run.context);
    if (!actionMatches || !contextMatches) {
      throw new Error("Approval binding mismatch; the proposed action or bound context changed after review was requested");
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
