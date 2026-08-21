// Pure slash-command normalization. Command aliases may map to the same persisted
// block primitive with bounded metadata rather than expanding the persistence type set.
window.Daxxer = window.Daxxer || {};

(function () {
  function resolve(type) {
    const match = /^toggle_heading([123])$/.exec(type || "");
    if (match) return { type: "toggle", headingLevel: Number(match[1]) };
    return { type: type || "paragraph", headingLevel: null };
  }

  Daxxer.BlockCommand = { resolve };
})();
