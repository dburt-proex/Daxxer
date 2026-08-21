// Simple-table fidelity adapter. Table UI is projected over the versioned block
// tree; mutations are validated by TableBlock and persisted through BlockSchema.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Editor && Daxxer.Editor.mount;
  const Table = Daxxer.TableBlock;
  const Schema = Daxxer.BlockSchema;
  const Ops = Daxxer.BlockOps;
  if (!base || !Table || !Schema || !Ops) return;

  let active = null;
  let lastFocusedBlockId = null;

  function walk(items, fn) {
    (items || []).forEach((block) => {
      if (!block) return;
      fn(block);
      if (Array.isArray(block.children)) walk(block.children, fn);
    });
  }

  function tableBlocks(blocks) {
    const out = [];
    walk(blocks, (block) => { if (block.type === "table") out.push(block); });
    return out;
  }

  function persist(instance) {
    clearTimeout(instance.saveTimer);
    instance.saveTimer = setTimeout(() => {
      const blocks = instance.api.getBlocks();
      for (const block of tableBlocks(blocks)) {
        const synced = Table.syncBlock(block);
        if (!synced.ok) {
          decorate(instance, true);
          return;
        }
      }
      const prepared = Schema.prepareForPersistence({ blocks });
      if (!prepared.ok) return;
      if (instance.opts.onChange) instance.opts.onChange(prepared.page.blocks);
    }, 300);
  }

  function focusCell(instance, blockId, row, column) {
    requestAnimationFrame(() => {
      const target = instance.container.querySelector(`.block[data-id="${blockId}"] [data-table-row="${row}"][data-table-column="${column}"]`);
      if (target) target.focus();
    });
  }

  function renderTable(instance, block, content) {
    const errors = Table.validate(block.table);
    content.innerHTML = "";
    content.dataset.tableProjection = "1";

    if (errors.length) {
      const panel = document.createElement("div");
      panel.className = "simple-table-error";
      panel.textContent = `Table needs repair: ${errors.map((error) => error.code).join(" · ")}`;
      content.appendChild(panel);
      return;
    }

    Table.syncBlock(block);
    const wrap = document.createElement("div");
    wrap.className = "simple-table-block";
    const controls = document.createElement("div");
    controls.className = "simple-table-controls";
    controls.innerHTML = `
      <button type="button" data-table-action="row">+ Row</button>
      <button type="button" data-table-action="column">+ Column</button>
      <button type="button" data-table-action="header-row" aria-pressed="${!!block.table.headerRow}">Header row</button>
      <button type="button" data-table-action="header-column" aria-pressed="${!!block.table.headerColumn}">Header column</button>`;
    wrap.appendChild(controls);

    const scroller = document.createElement("div");
    scroller.className = "simple-table-scroll";
    const tableEl = document.createElement("table");
    tableEl.className = "simple-table";
    const tbody = document.createElement("tbody");

    block.table.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((value, columnIndex) => {
        const cell = document.createElement(block.table.headerRow && rowIndex === 0 ? "th" : "td");
        if (block.table.headerColumn && columnIndex === 0) cell.classList.add("is-header-column");
        const editor = document.createElement("div");
        editor.className = "simple-table-cell-editor";
        editor.contentEditable = "true";
        editor.spellcheck = true;
        editor.dataset.tableRow = String(rowIndex);
        editor.dataset.tableColumn = String(columnIndex);
        editor.textContent = value;
        editor.addEventListener("focus", () => { lastFocusedBlockId = block.id; });
        editor.addEventListener("input", () => {
          const result = Table.setCell(block, rowIndex, columnIndex, editor.textContent || "");
          if (result.ok) persist(instance);
        });
        editor.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            editor.blur();
            if (instance.api.selectBlock) instance.api.selectBlock(block.id);
            return;
          }
          if (event.key !== "Tab" && event.key !== "Enter") return;
          event.preventDefault();
          const backward = event.key === "Tab" && event.shiftKey;
          let nextRow = rowIndex;
          let nextColumn = columnIndex + (backward ? -1 : 1);
          if (event.key === "Enter") { nextRow = rowIndex + (event.shiftKey ? -1 : 1); nextColumn = columnIndex; }
          if (nextColumn >= block.table.columns) { nextColumn = 0; nextRow += 1; }
          if (nextColumn < 0) { nextColumn = block.table.columns - 1; nextRow -= 1; }
          if (nextRow >= block.table.rows.length && event.key === "Tab" && !backward) {
            if (Table.addRow(block).ok) { persist(instance); decorate(instance, true); focusCell(instance, block.id, block.table.rows.length - 1, 0); }
            return;
          }
          if (nextRow >= 0 && nextRow < block.table.rows.length) focusCell(instance, block.id, nextRow, nextColumn);
        });
        cell.appendChild(editor);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
    scroller.appendChild(tableEl);
    wrap.appendChild(scroller);
    content.appendChild(wrap);

    controls.querySelector('[data-table-action="row"]').onclick = () => {
      const result = Table.addRow(block);
      if (result.ok) { persist(instance); decorate(instance, true); focusCell(instance, block.id, block.table.rows.length - 1, 0); }
    };
    controls.querySelector('[data-table-action="column"]').onclick = () => {
      const result = Table.addColumn(block);
      if (result.ok) { persist(instance); decorate(instance, true); focusCell(instance, block.id, 0, block.table.columns - 1); }
    };
    controls.querySelector('[data-table-action="header-row"]').onclick = () => {
      if (Table.toggleHeader(block, "row").ok) { persist(instance); decorate(instance, true); }
    };
    controls.querySelector('[data-table-action="header-column"]').onclick = () => {
      if (Table.toggleHeader(block, "column").ok) { persist(instance); decorate(instance, true); }
    };
  }

  function decorate(instance, force = false) {
    if (!instance || !instance.api || !instance.container.isConnected) return;
    const map = new Map();
    walk(instance.api.getBlocks(), (block) => map.set(String(block.id), block));
    instance.container.querySelectorAll('.block[data-type="table"][data-id]').forEach((el) => {
      const block = map.get(el.dataset.id);
      const content = el.querySelector(':scope > .block-content');
      if (!block || !content) return;
      if (!force && content.dataset.tableProjection === "1") return;
      renderTable(instance, block, content);
    });
  }

  function remount(instance, focusId = null) {
    const blocks = instance.api.getBlocks();
    const prepared = Schema.prepareForPersistence({ blocks });
    if (!prepared.ok) return;
    instance.page.blocks = prepared.page.blocks;
    if (instance.opts.onChange) instance.opts.onChange(instance.page.blocks);
    instance.api = base(instance.container, instance.page, instance.opts);
    requestAnimationFrame(() => {
      decorate(instance, true);
      if (focusId) focusCell(instance, focusId, 0, 0);
    });
  }

  Daxxer.Editor.mount = function tableBlockMount(container, page, opts = {}) {
    const instance = { container, page, opts, api: null, observer: null, saveTimer: null };
    instance.api = base(container, page, opts);
    instance.observer = new MutationObserver(() => decorate(instance));
    instance.observer.observe(container, { childList: true, subtree: true });
    active = instance;
    requestAnimationFrame(() => decorate(instance, true));
    return instance.api;
  };

  document.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest && event.target.closest(".simple-table-cell-editor");
    if (!cell || !active || !active.container.contains(cell)) return;
    if (active.api.clearBlockSelection) active.api.clearBlockSelection();
  }, true);

  document.addEventListener("click", (event) => {
    const item = event.target.closest && event.target.closest('#slashMenu [data-type="table_block"]');
    if (!item || !active || !active.container.isConnected) return;
    const focused = document.activeElement && active.container.contains(document.activeElement) ? document.activeElement : null;
    const blockEl = (focused && focused.closest && focused.closest('.block[data-id]')) || (lastFocusedBlockId && active.container.querySelector(`.block[data-id="${lastFocusedBlockId}"]`));
    if (!blockEl) return;
    const loc = Ops.locate(blockEl.dataset.id, active.api.getBlocks());
    if (!loc) return;
    const currentText = String(loc.block.text || "").trim();
    if (currentText || (Array.isArray(loc.block.children) && loc.block.children.length)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("Create a table from an empty block so existing content is not discarded.");
      return;
    }
    loc.block.type = "table";
    loc.block.table = Table.create(2, 2);
    loc.block.text = "";
    loc.block.richText = [];
    loc.block.schemaVersion = 1;
    delete loc.block.children;
    delete loc.block.headingLevel;
    event.preventDefault();
    event.stopImmediatePropagation();
    const slash = document.getElementById("slashMenu"); if (slash) slash.hidden = true;
    remount(active, loc.block.id);
  }, true);
})();
