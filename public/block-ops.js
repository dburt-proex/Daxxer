// Pure block-tree mutation helpers used by the Notion-fidelity editor layer.
window.Daxxer = window.Daxxer || {};

(function () {
  function locate(id, arr, parent = null) {
    for (let i = 0; i < arr.length; i++) {
      const block = arr[i];
      if (block.id === id) return { block, arr, index: i, parent };
      if (Array.isArray(block.children) && block.children.length) {
        const nested = locate(id, block.children, block);
        if (nested) return nested;
      }
    }
    return null;
  }

  function cloneWithNewIds(block, makeId) {
    const clone = structuredClone(block);
    function rekey(node) {
      node.id = makeId();
      if (Array.isArray(node.children)) node.children.forEach(rekey);
    }
    rekey(clone);
    return clone;
  }

  function duplicate(blocks, id, makeId) {
    const loc = locate(id, blocks);
    if (!loc) return { changed: false };
    const clone = cloneWithNewIds(loc.block, makeId);
    loc.arr.splice(loc.index + 1, 0, clone);
    return { changed: true, id: clone.id };
  }

  function move(blocks, id, delta) {
    const loc = locate(id, blocks);
    if (!loc || !delta) return { changed: false };
    const nextIndex = loc.index + delta;
    if (nextIndex < 0 || nextIndex >= loc.arr.length) return { changed: false };
    const [item] = loc.arr.splice(loc.index, 1);
    loc.arr.splice(nextIndex, 0, item);
    return { changed: true, id };
  }

  function indentIntoToggle(blocks, id) {
    const loc = locate(id, blocks);
    if (!loc || loc.index === 0) return { changed: false };
    const previous = loc.arr[loc.index - 1];
    if (previous.type !== "toggle") return { changed: false };
    previous.children = Array.isArray(previous.children) ? previous.children : [];
    const [item] = loc.arr.splice(loc.index, 1);
    previous.children.push(item);
    previous.open = true;
    return { changed: true, id };
  }

  function outdent(blocks, id) {
    const loc = locate(id, blocks);
    if (!loc || !loc.parent) return { changed: false };
    const parentLoc = locate(loc.parent.id, blocks);
    if (!parentLoc) return { changed: false };
    const [item] = loc.arr.splice(loc.index, 1);
    parentLoc.arr.splice(parentLoc.index + 1, 0, item);
    return { changed: true, id };
  }

  function remove(blocks, id, makeId) {
    const loc = locate(id, blocks);
    if (!loc) return { changed: false };
    loc.arr.splice(loc.index, 1);
    if (blocks.length === 0) blocks.push({ id: makeId(), type: "paragraph", text: "" });
    return { changed: true };
  }

  Daxxer.BlockOps = { locate, cloneWithNewIds, duplicate, move, indentIntoToggle, outdent, remove };
})();
