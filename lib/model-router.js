const MODEL_IDS = Object.freeze({ luna: "gpt-6-luna", sol: "gpt-6-sol", astra: "gpt-6-astra" });
const MODEL_PRICING_USD_PER_MTOK = Object.freeze({
  luna: { input: 0.10, cachedInput: 0.01, output: 0.50 },
  sol: { input: 2.00, cachedInput: 0.20, output: 10.00 },
  astra: { input: 10.00, cachedInput: 1.00, output: 50.00 },
});

const AUTHORITIES = new Set(["read", "research", "draft", "write", "modify", "merge", "publish", "deploy", "delete", "permissions", "spend", "external_action"]);
const REVIEW_AUTHORITIES = new Set(["merge", "publish", "deploy", "delete", "permissions", "spend", "external_action"]);
const DIMENSIONS = ["complexity", "ambiguity", "consequence", "verification_difficulty", "scope", "volume"];
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];

function assertInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("router input must be an object");
  for (const key of DIMENSIONS) {
    if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 2) throw new RangeError(`${key} must be an integer from 0 to 2`);
  }
  if (!AUTHORITIES.has(input.authority)) throw new RangeError("authority is invalid");
  if (!Number.isInteger(input.prior_failures) || input.prior_failures < 0) throw new RangeError("prior_failures must be a non-negative integer");
  for (const key of ["external_effect", "security_critical", "destructive_action", "target_verified", "evidence_available"]) {
    if (typeof input[key] !== "boolean") throw new TypeError(`${key} must be boolean`);
  }
}

function cognitiveScore(input) {
  return (2 * input.complexity)
    + (2 * input.ambiguity)
    + (2 * input.verification_difficulty)
    + input.scope
    + input.consequence
    + (Math.min(input.prior_failures, 2) * 2)
    + (input.security_critical ? 3 : 0);
}

function chooseModel(input, score) {
  const forcedAstra = (input.security_critical && input.consequence === 2)
    || (input.scope === 2 && input.consequence === 2)
    || (input.verification_difficulty === 2 && input.consequence === 2)
    || input.prior_failures >= 2;
  if (forcedAstra || score >= 14) return "astra";
  if (score >= 5 || input.complexity >= 1 || input.ambiguity >= 1) return "sol";
  return "luna";
}

function chooseEffort(model, score, input) {
  if (model === "luna") {
    if (score <= 1 && input.complexity === 0 && input.ambiguity === 0) return "none";
    if (score <= 3) return "low";
    return "medium";
  }
  if (model === "sol") {
    if (score <= 5) return "low";
    if (score <= 8) return "medium";
    if (score <= 10) return "high";
    if (score <= 12) return "xhigh";
    return "max";
  }
  if (score <= 14) return "low";
  if (score <= 16) return "medium";
  if (score <= 18) return "high";
  if (score <= 20) return "xhigh";
  return "max";
}

function chooseGate(input) {
  const reasons = [];
  if (!input.evidence_available && (input.consequence === 2 || input.security_critical)) {
    return { gate: "HALT", reasons: ["Required evidence is unavailable for a consequential or security-critical task."] };
  }
  if (input.destructive_action && !input.target_verified) {
    return { gate: "HALT", reasons: ["Destructive action target is not independently verified."] };
  }
  if (input.external_effect) reasons.push("Task has an external effect.");
  if (REVIEW_AUTHORITIES.has(input.authority)) reasons.push(`Authority level ${input.authority} requires owner review.`);
  if (reasons.length) return { gate: "REVIEW", reasons };
  return { gate: "ALLOW", reasons: ["Task is bounded within currently authorized, non-consequential execution scope."] };
}

function evidenceRequirements(input) {
  const required = ["execution_result"];
  if (input.verification_difficulty > 0 || input.consequence > 0) required.push("verification_receipt");
  if (input.security_critical) required.push("security_evidence");
  if (input.external_effect) required.push("external_action_receipt");
  if (input.authority === "spend") required.push("cost_receipt");
  return required;
}

function escalationConditions(model, input) {
  const conditions = ["acceptance_criteria_failed", "material_scope_expansion", "material_evidence_conflict"];
  if (model === "luna") conditions.push("complex_reasoning_required", "nontrivial_ambiguity_detected");
  if (model === "sol") conditions.push("cross_system_high_consequence_decision", "repeated_verification_failure");
  if (input.security_critical) conditions.push("unresolved_security_uncertainty");
  return [...new Set(conditions)];
}

export function routeModel(input) {
  assertInput(input);
  const score = cognitiveScore(input);
  const model = chooseModel(input, score);
  const reasoning_effort = chooseEffort(model, score, input);
  const { gate, reasons } = chooseGate(input);
  return {
    model,
    model_id: MODEL_IDS[model],
    reasoning_effort,
    cognitive_score: score,
    gate,
    authority: input.authority,
    gate_reasons: reasons,
    escalation_conditions: escalationConditions(model, input),
    evidence_requirements: evidenceRequirements(input),
  };
}

export function estimateTokenCostUsd({ model, input_tokens = 0, cached_input_tokens = 0, output_tokens = 0 }) {
  if (!MODEL_PRICING_USD_PER_MTOK[model]) throw new RangeError("model is invalid");
  for (const [key, value] of Object.entries({ input_tokens, cached_input_tokens, output_tokens })) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${key} must be a non-negative number`);
  }
  const prices = MODEL_PRICING_USD_PER_MTOK[model];
  const uncached = Math.max(0, input_tokens - cached_input_tokens);
  return ((uncached * prices.input) + (cached_input_tokens * prices.cachedInput) + (output_tokens * prices.output)) / 1_000_000;
}

export { AUTHORITIES, DIMENSIONS, EFFORTS, MODEL_IDS, MODEL_PRICING_USD_PER_MTOK };
