// Interaction fidelity layer. Preserves the existing persisted block schema and
// wraps the current editor with Notion-style block-selection and keyboard actions.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Editor && Daxxer.Editor.mount;
  const Ops = Daxxer.BlockOps;
  if (!base || !Ops) return;

  const uid = () => "b_" + Math.random().toString(36).slice(2, 9);
  let activeContext = null;

  function findBlockEl(target) {
    return target && target.closest ? target.closest(".block[data-id]") : null;
  }

  function focusEditable(container, id, atEnd = true) {
    const el = container.querySelector(`.block[data-id="${id}"] .editable`);
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!atEnd);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function caretAtStart(el) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer)) return false;
    const before = range.cloneRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length === 0;
  }

  // The legacy editor's drag-handle context menu predates BlockOps and cloned
  // only the root id. A toggle duplicate therefore reused child ids. Intercept
  // that one action and route it through the recursive rekeying helper.
  document.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest && e.target.closest(".gutter-drag");
    if (!handle || !activeContext || !activeContext.container.contains(handle)) return;
    const blockEl = findBlockEl(handle);
    activeContext.contextBlockId = blockEl ? blockEl.dataset.id : null;
  }, true);

  document.addEventListener("click", (e) => {
    const duplicateAction = e.target.closest && e.target.closest('#ctxMenu [data-act="dup"]');
    if (!duplicateAction || !activeContext || !activeContext.contextBlockId) return;
    const result = Ops.duplicate(activeContext.getBlocks(), activeContext.contextBlockId, uid);
    if (!result.changed) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const menu = document.getElementById("ctxMenu");
    if (menu) menu.hidden = true;
    activeContext.remount({ focusId: result.id });
  }, true);

  Daxxer.Editor.mount = function fidelityMount(container, page, opts = {}) {
    let activeApi = base(container, page, opts);
    let selectedId = null;

    // Block-selection mode needs to retain keyboard ownership after an editable
    // blurs on Escape. A programmatically-focusable host keeps Arrow/Delete/Enter
    // events inside this editor instance rather than letting them fall through to body.
    container.tabIndex = -1;
    container.style.outline = "none";

    function blocks() { return activeApi.getBlocks(); }

    function clearSelection() {
      selectedId = null;
      container.querySelectorAll(".block.is-selected").forEach((el) => el.classList.remove("is-selected"));
    }

    function select(id) {
      clearSelection();
      const el = container.querySelector(`.block[data-id="${id}"]`);
      if (!el) return;
      selectedId = id;
      el.classList.add("is-selected");
      container.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }

    function visibleIds() {
      return Array.from(container.querySelectorAll(".block[data-id]"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.dataset.id);
    }

    function remount({ focusId = null, focusAtStart = false, selectId = null } = {}) {
      const currentBlocks = blocks();
      page.blocks = currentBlocks;
      if (opts.onChange) opts.onChange(currentBlocks);
      activeApi = base(container, page, opts);
      requestAnimationFrame(() => {
        if (focusId) focusEditable(container, focusId, !focusAtStart);
        else if (selectId) select(selectId);
      });
    }

    activeContext = {
      container,
      contextBlockId: null,
      getBlocks: blocks,
      remount,
    };

    function currentIdFromEvent(e) {
      const blockEl = findBlockEl(e.target);
      return blockEl ? blockEl.dataset.id : selectedId;
    }

    function handleMutation(result, mode = "focus") {
      if (!result || !result.changed) return false;
      remount(mode === "select" ? { selectId: result.id || selectedId } : { focusId: result.id || selectedId });
      return true;
    }

    container.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".editable")) clearSelection();
    }, true);

    container.addEventListener("keydown", (e) => {
      const editable = e.target.closest && e.target.closest(".editable");
      const id = currentIdFromEvent(e);
      const modifier = e.metaKey || e.ctrlKey;

      if (editable && e.key === "Escape" && id) {
        e.preventDefault(); e.stopImmediatePropagation();
        editable.blur(); select(id); return;
      }

      if (selectedId && !editable) {
        const ids = visibleIds();
        const pos = ids.indexOf(selectedId);
        if (e.key === "Escape") { e.preventDefault(); clearSelection(); return; }
        if (e.key === "Enter") { e.preventDefault(); focusEditable(container, selectedId); clearSelection(); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = e.key === "ArrowUp" ? pos - 1 : pos + 1;
          if (ids[next]) select(ids[next]);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const result = Ops.setToggleOpen(blocks(), selectedId, e.key === "ArrowRight");
          if (result.changed) {
            e.preventDefault();
            e.stopImmediatePropagation();
            remount({ selectId: selectedId });
          }
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault(); e.stopImmediatePropagation();
          const nextId = ids[pos + 1] || ids[pos - 1] || null;
          Ops.remove(blocks(), selectedId, uid);
          remount(nextId ? { selectId: nextId } : {});
          return;
        }
      }

      if (!id) return;

      if (modifier && e.key.toLowerCase() === "d") {
        e.preventDefault(); e.stopImmediatePropagation();
        const result = Ops.duplicate(blocks(), id, uid);
        handleMutation(result, selectedId ? "select" : "focus");
        return;
      }

      if (modifier && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault(); e.stopImmediatePropagation();
        const result = Ops.move(blocks(), id, e.key === "ArrowUp" ? -1 : 1);
        handleMutation(result, selectedId ? "select" : "focus");
        return;
      }

      if (editable && e.key === "Backspace" && caretAtStart(editable)) {
        const loc = Ops.locate(id, blocks());
        if (loc && loc.parent) {
          const result = Ops.outdent(blocks(), id);
          if (result.changed) {
            e.preventDefault();
            e.stopImmediatePropagation();
            remount({ focusId: id, focusAtStart: true });
            return;
          }
        }
      }

      if (editable && e.key === "Tab") {
        const result = e.shiftKey ? Ops.outdent(blocks(), id) : Ops.indentIntoToggle(blocks(), id);
        if (result.changed) {
          e.preventDefault(); e.stopImmediatePropagation();
          handleMutation(result, "focus");
        }
        return;
      }

      if (editable && modifier && e.key === "Enter") {
        const loc = Ops.locate(id, blocks());
        if (!loc) return;
        if (loc.block.type === "todo") {
          e.preventDefault(); e.stopImmediatePropagation();
          loc.block.checked = !loc.block.checked;
          remount({ focusId: id });
        } else if (loc.block.type === "toggle") {
          e.preventDefault(); e.stopImmediatePropagation();
          loc.block.open = loc.block.open === false;
          remount({ focusId: id });
        }
      }
    }, true);

    return {
      getBlocks: () => activeApi.getBlocks(),
      selectBlock: select,
      clearBlockSelection: clearSelection,
    };
  };
})();
