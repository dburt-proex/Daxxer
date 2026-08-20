// Interaction fidelity layer. Preserves the existing persisted block schema and
// wraps the current editor with Notion-style block-selection and keyboard actions.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Editor && Daxxer.Editor.mount;
  const Ops = Daxxer.BlockOps;
  if (!base || !Ops) return;

  const uid = () => "b_" + Math.random().toString(36).slice(2, 9);

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

  Daxxer.Editor.mount = function fidelityMount(container, page, opts = {}) {
    let activeApi = base(container, page, opts);
    let selectedId = null;

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
      el.scrollIntoView({ block: "nearest" });
    }

    function visibleIds() {
      return Array.from(container.querySelectorAll(".block[data-id]"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.dataset.id);
    }

    function remount({ focusId = null, selectId = null } = {}) {
      const currentBlocks = blocks();
      page.blocks = currentBlocks;
      if (opts.onChange) opts.onChange(currentBlocks);
      activeApi = base(container, page, opts);
      requestAnimationFrame(() => {
        if (focusId) focusEditable(container, focusId);
        else if (selectId) select(selectId);
      });
    }

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
