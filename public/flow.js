(() => {
  const byId = (id) => document.getElementById(id);
  const canvas = byId("flowCanvas");
  const runButton = byId("runButton");
  const input = byId("runInput");
  const runStatus = byId("runStatus");
  const runId = byId("runId");
  const approvalPanel = byId("approvalPanel");
  const approveButton = byId("approveButton");
  const rejectButton = byId("rejectButton");
  const nodeDetail = byId("nodeDetail");
  const receiptDetail = byId("receiptDetail");
  const toast = byId("toast");

  let workflow = null;
  let currentRun = null;
  let selectedNodeId = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  function gateClass(nodeResult) {
    const resolution = nodeResult?.gate?.resolution;
    const decision = resolution || nodeResult?.gate?.decision;
    if (decision === "ALLOW") return "allow";
    if (decision === "REVIEW") return "review";
    if (decision === "HALT") return "halt";
    return "";
  }

  function renderCanvas() {
    if (!workflow) return;
    canvas.innerHTML = "";
    workflow.nodes.forEach((node, index) => {
      const step = document.createElement("div");
      step.className = "flow-step";

      const result = currentRun?.nodes?.[node.id];
      const gate = gateClass(result);
      const button = document.createElement("button");
      button.className = "flow-node" + (gate ? " " + gate : "") + (selectedNodeId === node.id ? " active" : "");
      button.type = "button";
      button.dataset.nodeId = node.id;

      const top = document.createElement("div");
      top.className = "node-top";
      const title = document.createElement("div");
      title.className = "node-title";
      title.textContent = node.label;
      const badge = document.createElement("span");
      badge.className = "node-badge" + (gate ? " " + gate : "");
      badge.textContent = result?.gate?.resolution || result?.gate?.decision || result?.status || "IDLE";
      top.append(title, badge);

      const type = document.createElement("div");
      type.className = "node-type";
      type.textContent = node.type;

      button.append(top, type);
      button.addEventListener("click", () => {
        selectedNodeId = node.id;
        renderCanvas();
        renderSelectedNode();
      });

      step.append(button);

      if (node.id === "if") {
        const note = document.createElement("div");
        note.className = "branch-note";
        note.textContent = "TRUE → Approval · FALSE → Receipt (HALT)";
        step.append(note);
      }

      if (index < workflow.nodes.length - 1) {
        const connector = document.createElement("div");
        connector.className = "connector";
        step.append(connector);
      }
      canvas.append(step);
    });
  }

  function renderSelectedNode() {
    if (!selectedNodeId || !workflow) {
      nodeDetail.textContent = "Select a node to inspect its gate, input, output, and evidence refs.";
      return;
    }
    const definition = workflow.nodes.find((node) => node.id === selectedNodeId);
    const result = currentRun?.nodes?.[selectedNodeId] || null;
    nodeDetail.textContent = JSON.stringify({ definition, result }, null, 2);
  }

  function renderRun() {
    if (!currentRun) {
      runStatus.textContent = "Not started";
      runId.textContent = "—";
      approvalPanel.hidden = true;
      receiptDetail.textContent = "No receipt yet.";
      renderCanvas();
      renderSelectedNode();
      return;
    }

    runStatus.textContent = currentRun.status;
    runId.textContent = currentRun.id;
    runId.title = currentRun.id;
    approvalPanel.hidden = currentRun.status !== "REVIEW";
    approveButton.disabled = currentRun.status !== "REVIEW";
    rejectButton.disabled = currentRun.status !== "REVIEW";
    receiptDetail.textContent = currentRun.receipt ? JSON.stringify(currentRun.receipt, null, 2) : "No receipt yet.";
    renderCanvas();
    renderSelectedNode();
  }

  async function startRun() {
    let parsed;
    try {
      parsed = JSON.parse(input.value);
    } catch {
      showToast("Manual trigger input must be valid JSON.");
      return;
    }

    runButton.disabled = true;
    runButton.textContent = "Running…";
    try {
      currentRun = await api("/api/flow/runs", {
        method: "POST",
        body: JSON.stringify({ input: parsed }),
      });
      selectedNodeId = currentRun.currentNode;
      renderRun();
    } catch (error) {
      showToast(error.message);
    } finally {
      runButton.disabled = false;
      runButton.textContent = "Run workflow";
    }
  }

  async function resolveApproval(decision) {
    if (!currentRun) return;
    approveButton.disabled = true;
    rejectButton.disabled = true;
    try {
      currentRun = await api("/api/flow/runs/" + encodeURIComponent(currentRun.id) + "/approval", {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      selectedNodeId = currentRun.currentNode;
      renderRun();
    } catch (error) {
      showToast(error.message);
      approveButton.disabled = false;
      rejectButton.disabled = false;
    }
  }

  async function init() {
    try {
      workflow = await api("/api/flow/workflow");
      renderRun();
    } catch (error) {
      showToast(error.message);
      canvas.textContent = "Unable to load workflow definition.";
    }
  }

  runButton.addEventListener("click", startRun);
  approveButton.addEventListener("click", () => resolveApproval("approve"));
  rejectButton.addEventListener("click", () => resolveApproval("reject"));
  init();
})();
