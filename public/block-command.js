// Pure slash-command normalization. Command aliases may map to the same persisted
// block primitive with bounded metadata rather than expanding the persistence type set.
window.Daxxer = window.Daxxer || {};

(function () {
  function resolve(type) {
    const match = /^toggle_heading([123])$/.exec(type || "");
    if (match) return { type: "toggle", headingLevel: Number(match[1]) };
    return { type: type || "paragraph", headingLevel: null };
  }

  function locate(id, items) {
    for (const block of items || []) {
      if (block && block.id === id) return block;
      const nested = block && Array.isArray(block.children) ? locate(id, block.children) : null;
      if (nested) return nested;
    }
    return null;
  }

  function normalizeBlock(block) {
    if (!block || typeof block !== "object") return block;
    if (block.type === "toggle") {
      const level = Number(block.headingLevel);
      if ([1, 2, 3].includes(level)) block.headingLevel = level;
      else delete block.headingLevel;
      block.children = Array.isArray(block.children) ? block.children : [];
    } else delete block.headingLevel;
    if (Array.isArray(block.children)) block.children.forEach(normalizeBlock);
    return block;
  }

  function normalizeTree(blocks) {
    (blocks || []).forEach(normalizeBlock);
    return blocks;
  }

  function apply(blocks, id, commandType) {
    const block = locate(id, blocks);
    if (!block) return { changed: false };
    const command = resolve(commandType);
    block.type = command.type;
    if (command.type === "toggle") {
      block.open = true;
      block.children = Array.isArray(block.children) ? block.children : [];
      if (command.headingLevel) block.headingLevel = command.headingLevel;
      else delete block.headingLevel;
    } else delete block.headingLevel;
    return { changed: true, id, type: block.type, headingLevel: block.headingLevel || null };
  }

  Daxxer.BlockCommand = { resolve, normalizeTree, apply };
})();
