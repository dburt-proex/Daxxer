(() => {
  const byId = (id) => document.getElementById(id);
  const canvas = byId("flowCanvas");
  const runButton = byId("runButton");
  const saveButton = byId("saveButton");
  const reloadButton = byId("reloadButton");
  const saveState = byId("saveState");
  const input = byId("runInput");
  const runStatus = byId("runStatus");
  const runId = byId("runId");
  const approvalPanel = byId("approvalPanel");
  const approveButton = byId("approveButton");
  const rejectButton = byId("rejectButton");
  const configEditor = byId("configEditor");
  const nodeDetail = byId("nodeDetail");
  const receiptDetail = byId("receiptDetail");
  const toast = byId("toast");

  let workflow = null;
  let currentRun = null;
  let selectedNodeId = null;
  let dirty = false;

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

  function markDirty() {
    dirty = true;
    saveState.textContent = "Unsaved changes";
    saveState.classList.add("dirty");
    saveButton.disabled = false;
    runButton.disabled = true;
  }

  function markSaved() {
    dirty = false;
    saveState.textContent = workflow ? "Saved v" + workflow.version : "Saved";
    saveState.classList.remove("dirty");
    saveButton.disabled = true;
    runButton.disabled = false;
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

      const meta = document.createElement("div");
      meta.className = "node-meta";
      const type = document.createElement("span");
      type.className = "node-type";
      type.textContent = node.type;
      const config = document.createElement("span");
      config.className = "node-config-summary";
      if (node.id === "transform") config.textContent = node.config.field + " → " + node.config.cast;
      if (node.id === "if") config.textContent = node.config.field + " " + node.config.operator + " " + node.config.value;
      if (node.id === "approval") config.textContent = node.config.binding;
      meta.append(type);
      if (config.textContent) meta.append(config);

      button.append(top, meta);
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

  function addField(label, control) {
    const wrapper = document.createElement("label");
    wrapper.className = "config-field";
    const title = document.createElement("span");
    title.textContent = label;
    wrapper.append(title, control);
    configEditor.append(wrapper);
  }

  function textInput(value, onChange) {
    const control = document.createElement("input");
    control.type = "text";
    control.value = value;
    control.addEventListener("input", () => onChange(control.value));
    return control;
  }

  function numberInput(value, onChange) {
    const control = document.createElement("input");
    control.type = "number";
    control.step = "any";
    control.value = value;
    control.addEventListener("input", () => onChange(control.value));
    return control;
  }

  function selectInput(value, options, onChange, disabled = false) {
    const control = document.createElement("select");
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = optionValue === value;
      control.append(option);
    });
    control.disabled = disabled;
    control.addEventListener("change", () => onChange(control.value));
    return control;
  }

  function renderConfigEditor(definition) {
    configEditor.innerHTML = "";
    if (!definition) {
      const empty = document.createElement("div");
      empty.className = "config-empty";
      empty.textContent = "Select a node to edit its deterministic configuration.";
      configEditor.append(empty);
      return;
    }

    if (definition.id === "transform") {
      addField("Source field", textInput(definition.config.field, (value) => {
        definition.config.field = value;
        markDirty();
        renderCanvas();
      }));
      addField("Cast", selectInput(definition.config.cast, ["number"], () => {}, true));
      return;
    }

    if (definition.id === "if") {
      addField("Field", textInput(definition.config.field, (value) => {
        definition.config.field = value;
        markDirty();
        renderCanvas();
      }));
      addField("Operator", selectInput(definition.config.operator, [">=", ">", "<=", "<", "==", "!="], (value) => {
        definition.config.operator = value;
        markDirty();
        renderCanvas();
      }));
      addField("Value", numberInput(definition.config.value, (value) => {
        definition.config.value = value === "" ? "" : Number(value);
        markDirty();
        renderCanvas();
      }));
      return;
    }

    const locked = document.createElement("div");
    locked.className = "config-empty";
    locked.textContent = definition.id === "approval"
      ? "Approval binding is locked to exact_action in v0.2."
      : "This node has no editable configuration in v0.2.";
    configEditor.append(locked);
  }

  function renderSelectedNode() {
    if (!selectedNodeId || !workflow) {
      renderConfigEditor(null);
      nodeDetail.textContent = "Select a node to inspect its gate, input, output, and evidence refs.";
      return;
    }
    const definition = workflow.nodes.find((node) => node.id === selectedNodeId);
    const result = currentRun?.nodes?.[selectedNodeId] || null;
    renderConfigEditor(definition);
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

    runStatus.textContent = currentRun.status + " · workflow v" + currentRun.workflowVersion;
    runId.textContent = currentRun.id;
    runId.title = currentRun.id;
    approvalPanel.hidden = currentRun.status !== "REVIEW";
    approveButton.disabled = currentRun.status !== "REVIEW";
    rejectButton.disabled = currentRun.status !== "REVIEW";
    receiptDetail.textContent = currentRun.receipt ? JSON.stringify(currentRun.receipt, null, 2) : "No receipt yet.";
    renderCanvas();
    renderSelectedNode();
  }

  async function loadWorkflow({ notify = false } = {}) {
    reloadButton.disabled = true;
    try {
      workflow = await api("/api/flow/workflow");
      currentRun = null;
      if (!workflow.nodes.some((node) => node.id === selectedNodeId)) selectedNodeId = "transform";
      markSaved();
      renderRun();
      if (notify) showToast("Reloaded saved workflow v" + workflow.version + ".");
    } finally {
      reloadButton.disabled = false;
    }
  }

  async function saveWorkflow() {
    if (!workflow || !dirty) return;
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      workflow = await api("/api/flow/workflow", {
        method: "PUT",
        body: JSON.stringify({ workflow }),
      });
      markSaved();
      renderCanvas();
      renderSelectedNode();
      showToast("Workflow saved as v" + workflow.version + ".");
    } catch (error) {
      saveButton.disabled = false;
      showToast(error.message);
    } finally {
      saveButton.textContent = "Save workflow";
    }
  }

  async function startRun() {
    if (dirty) {
      showToast("Save workflow changes before running.");
      return;
    }

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
      runButton.disabled = dirty;
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
      await loadWorkflow();
    } catch (error) {
      showToast(error.message);
      canvas.textContent = "Unable to load workflow definition.";
      saveState.textContent = "Load failed";
    }
  }

  runButton.addEventListener("click", startRun);
  saveButton.addEventListener("click", saveWorkflow);
  reloadButton.addEventListener("click", () => loadWorkflow({ notify: true }).catch((error) => showToast(error.message)));
  approveButton.addEventListener("click", () => resolveApproval("approve"));
  rejectButton.addEventListener("click", () => resolveApproval("reject"));
  init();
})();
