// Selection-scoped rich-text toolbar. It owns no page data: boolean/link commands
// are delegated to the editor keyboard contract, while bounded color/background
// marks are projected into the editable DOM and then normalized by editor input.
window.Daxxer = window.Daxxer || {};

(function () {
  const COLORS = [
    ["Default", "var(--text)"],
    ["Gray", "#787774"],
    ["Brown", "#9f6b53"],
    ["Orange", "#d9730d"],
    ["Yellow", "#cb912f"],
    ["Green", "#448361"],
    ["Blue", "#337ea9"],
    ["Purple", "#9065b0"],
    ["Pink", "#c14c8a"],
    ["Red", "#d44c47"],
  ];
  const BACKGROUNDS = [
    ["None", "transparent"],
    ["Gray", "rgba(120,119,116,.16)"],
    ["Brown", "rgba(159,107,83,.16)"],
    ["Orange", "rgba(217,115,13,.16)"],
    ["Yellow", "rgba(203,145,47,.18)"],
    ["Green", "rgba(68,131,97,.16)"],
    ["Blue", "rgba(51,126,169,.16)"],
    ["Purple", "rgba(144,101,176,.16)"],
    ["Pink", "rgba(193,76,138,.16)"],
    ["Red", "rgba(212,76,71,.16)"],
  ];

  let toolbar = null;
  let palette = null;
  let activeEditable = null;
  let savedRange = null;
  let paletteOpen = false;

  function ensureToolbar() {
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.className = "rt-toolbar";
    toolbar.hidden = true;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text formatting");
    toolbar.innerHTML = `
      <button type="button" data-rt-cmd="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button type="button" data-rt-cmd="italic" title="Italic (Ctrl+I)"><em>I</em></button>
      <button type="button" data-rt-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <button type="button" data-rt-cmd="strike" title="Strikethrough (Ctrl+Shift+X)"><s>S</s></button>
      <button type="button" data-rt-cmd="code" title="Inline code (Ctrl+\`)"><span class="rt-code-label">&lt;/&gt;</span></button>
      <span class="rt-divider"></span>
      <button type="button" data-rt-cmd="link" title="Link (Ctrl+K)">↗</button>
      <button type="button" data-rt-palette title="Text and background color"><span class="rt-color-label">A</span><span class="rt-caret">⌄</span></button>
    `;
    palette = document.createElement("div");
    palette.className = "rt-palette";
    palette.hidden = true;
    palette.setAttribute("role", "menu");
    document.body.append(toolbar, palette);

    toolbar.addEventListener("mousedown", (event) => event.preventDefault());
    palette.addEventListener("mousedown", (event) => event.preventDefault());

    toolbar.querySelectorAll("[data-rt-cmd]").forEach((button) => {
      button.addEventListener("click", () => {
        restoreSelection();
        const command = button.dataset.rtCmd;
        if (!activeEditable) return;
        const detail = command === "strike"
          ? { key: "X", shiftKey: true }
          : command === "code"
            ? { key: "`" }
            : { key: command === "link" ? "k" : command[0] };
        activeEditable.dispatchEvent(new KeyboardEvent("keydown", {
          key: detail.key,
          ctrlKey: true,
          metaKey: false,
          shiftKey: !!detail.shiftKey,
          bubbles: true,
          cancelable: true,
        }));
        if (command !== "link") rememberCurrentSelection();
      });
    });

    toolbar.querySelector("[data-rt-palette]").addEventListener("click", () => {
      paletteOpen = !paletteOpen;
      if (paletteOpen) paintPalette(); else palette.hidden = true;
    });

    document.addEventListener("pointerdown", (event) => {
      if (!toolbar || toolbar.hidden) return;
      if (toolbar.contains(event.target) || palette.contains(event.target)) return;
      hide();
    }, true);
    return toolbar;
  }

  function paletteSection(title, values, kind) {
    return `<div class="rt-palette-title">${title}</div><div class="rt-palette-grid">${values.map(([name, value]) =>
      `<button type="button" data-rt-style="${kind}" data-value="${value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;")}" title="${name}"><span class="rt-swatch" style="${kind === "color" ? `color:${value}` : `background:${value}`}">${kind === "color" ? "A" : ""}</span><span>${name}</span></button>`
    ).join("")}</div>`;
  }

  function paintPalette() {
    if (!palette || !toolbar) return;
    palette.innerHTML = paletteSection("Text color", COLORS, "color") + paletteSection("Background", BACKGROUNDS, "background");
    palette.hidden = false;
    const rect = toolbar.getBoundingClientRect();
    palette.style.left = Math.min(rect.right - 232, window.innerWidth - 244) + "px";
    palette.style.top = Math.min(rect.bottom + 6, window.innerHeight - palette.offsetHeight - 10) + "px";
    palette.querySelectorAll("[data-rt-style]").forEach((button) => {
      button.addEventListener("click", () => {
        applyRangeStyle(button.dataset.rtStyle, button.dataset.value);
        paletteOpen = false;
        palette.hidden = true;
      });
    });
  }

  function selectionEditable(range) {
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    const editable = start && start.closest ? start.closest(".editable") : null;
    if (!editable || !end || !editable.contains(end)) return null;
    if (!document.getElementById("pageContainer")?.contains(editable)) return null;
    return editable;
  }

  function rememberCurrentSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const editable = selectionEditable(range);
    if (!editable) return false;
    activeEditable = editable;
    savedRange = range.cloneRange();
    return true;
  }

  function restoreSelection() {
    if (!activeEditable || !savedRange || !activeEditable.isConnected) return false;
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(savedRange.cloneRange());
    return true;
  }

  function applyRangeStyle(kind, value) {
    if (!restoreSelection() || !activeEditable) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!activeEditable.contains(range.startContainer) || !activeEditable.contains(range.endContainer)) return;

    const wrapper = document.createElement("span");
    if (kind === "color") {
      wrapper.dataset.color = value;
      wrapper.style.color = value;
    } else if (kind === "background") {
      wrapper.dataset.background = value;
      wrapper.style.backgroundColor = value;
    } else return;

    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
    const next = document.createRange();
    next.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(next);
    savedRange = next.cloneRange();
    activeEditable.dispatchEvent(new Event("input", { bubbles: true }));
    position();
  }

  function position() {
    if (!toolbar || !savedRange || !activeEditable || !activeEditable.isConnected) return hide();
    const rect = savedRange.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return hide();
    toolbar.hidden = false;
    const width = toolbar.offsetWidth || 300;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    const above = rect.top - toolbar.offsetHeight - 8;
    toolbar.style.left = left + "px";
    toolbar.style.top = (above > 8 ? above : rect.bottom + 8) + "px";
  }

  function hide() {
    if (toolbar) toolbar.hidden = true;
    if (palette) palette.hidden = true;
    paletteOpen = false;
    activeEditable = null;
    savedRange = null;
  }

  document.addEventListener("selectionchange", () => {
    ensureToolbar();
    if (!rememberCurrentSelection()) {
      if (!paletteOpen) hide();
      return;
    }
    if (!paletteOpen) position();
  });

  window.addEventListener("resize", () => { if (toolbar && !toolbar.hidden) position(); });
  document.addEventListener("scroll", () => { if (toolbar && !toolbar.hidden && !paletteOpen) position(); }, true);

  Daxxer.RichTextToolbar = { hide };
})();
