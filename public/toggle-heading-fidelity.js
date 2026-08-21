// Toggle-heading fidelity adapter. Reuses the persisted `toggle` primitive and
// bounded headingLevel metadata rather than introducing extra persistence types.
window.Daxxer = window.Daxxer || {};

(function () {
  const base = Daxxer.Editor && Daxxer.Editor.mount;
  const Command = Daxxer.BlockCommand;
  const Ops = Daxxer.BlockOps;
  if (!base || !Command || !Ops) return;

  let active = null;
  let lastEditable = null;

  function decorate(instance) {
    if (!instance || !instance.api || !instance.container.isConnected) return;
    Command.normalizeTree(instance.api.getBlocks());
    const blockMap = new Map();
    function walk(items) {
      (items || []).forEach((block) => {
        if (!block) return;
        blockMap.set(String(block.id), block);
        if (Array.isArray(block.children)) walk(block.children);
      });
    }
    walk(instance.api.getBlocks());

    instance.container.querySelectorAll('.block[data-id]').forEach((el) => {
      const block = blockMap.get(el.dataset.id);
      const head = el.querySelector(':scope > .block-content > .toggle-head');
      if (!head) return;
      head.classList.remove('toggle-heading-1', 'toggle-heading-2', 'toggle-heading-3');
      if (block && block.type === 'toggle' && [1, 2, 3].includes(block.headingLevel)) {
        head.classList.add(`toggle-heading-${block.headingLevel}`);
        const editable = head.querySelector('.editable');
        if (editable) editable.dataset.placeholder = `Heading ${block.headingLevel}`;
      }
    });
  }

  function currentInstance() {
    if (active && active.container.isConnected && lastEditable && active.container.contains(lastEditable)) return active;
    return active && active.container.isConnected ? active : null;
  }

  function remount(instance, focusId = null) {
    const blocks = instance.api.getBlocks();
    Command.normalizeTree(blocks);
    instance.page.blocks = blocks;
    if (instance.opts.onChange) instance.opts.onChange(blocks);
    instance.api = base(instance.container, instance.page, instance.opts);
    requestAnimationFrame(() => {
      decorate(instance);
      if (focusId) {
        const editable = instance.container.querySelector(`.block[data-id="${focusId}"] .editable`);
        if (editable) {
          editable.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editable);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
  }

  Daxxer.Editor.mount = function toggleHeadingMount(container, page, opts = {}) {
    Command.normalizeTree(page.blocks || []);
    const guardedOpts = {
      ...opts,
      onChange(blocks) {
        Command.normalizeTree(blocks);
        if (opts.onChange) opts.onChange(blocks);
      },
    };
    const instance = { container, page, opts: guardedOpts, api: null, observer: null };
    instance.api = base(container, page, guardedOpts);
    instance.observer = new MutationObserver(() => decorate(instance));
    instance.observer.observe(container, { childList: true, subtree: true });
    active = instance;
    requestAnimationFrame(() => decorate(instance));
    return instance.api;
  };

  document.addEventListener('focusin', (event) => {
    const editable = event.target.closest && event.target.closest('.editable');
    if (!editable) return;
    lastEditable = editable;
  }, true);

  document.addEventListener('click', (event) => {
    const item = event.target.closest && event.target.closest('#slashMenu [data-type^="toggle_heading"]');
    if (!item) return;
    const instance = currentInstance();
    if (!instance || !lastEditable || !instance.container.contains(lastEditable)) return;
    const blockEl = lastEditable.closest('.block[data-id]');
    if (!blockEl) return;
    const commandType = item.dataset.type;
    const blocks = instance.api.getBlocks();
    const result = Command.apply(blocks, blockEl.dataset.id, commandType);
    if (!result.changed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const slash = document.getElementById('slashMenu');
    if (slash) slash.hidden = true;
    remount(instance, result.id);
  }, true);
})();
