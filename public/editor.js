// Daxxer block editor. Plain-text blocks with types, slash menu, markdown
// shortcuts, checkboxes, toggles, callouts, code, and drag-to-reorder.
window.Daxxer = window.Daxxer || {};

(function () {
  const I = () => Daxxer.ICONS;
  const uid = () => "b_" + Math.random().toString(36).slice(2, 9);

  function Editor(container, page, opts = {}) {
    let blocks = structuredClone(page.blocks || []);
    if (blocks.length === 0) blocks = [{ id: uid(), type: "paragraph", text: "" }];
    let saveTimer = null;
    let pendingFocus = null; // { id, pos }

    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => opts.onChange && opts.onChange(blocks), 450);
    }

    // ---------- block-array helpers (supports nesting via toggle.children) ----------
    // Find a block + its containing array + index, searching recursively.
    function locate(id, arr = blocks, parent = null) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return { block: arr[i], arr, index: i, parent };
        if (arr[i].children) {
          const r = locate(id, arr[i].children, arr[i]);
          if (r) return r;
        }
      }
      return null;
    }

    // ---------- caret helpers ----------
    function caretOffset(el) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return 0;
      const range = sel.getRangeAt(0);
      const pre = range.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.endContainer, range.endOffset);
      return pre.toString().length;
    }
    function setCaret(el, pos) {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      const node = el.firstChild || el;
      const len = el.textContent.length;
      let offset = pos === "start" ? 0 : pos === "end" ? len : Math.min(pos, len);
      if (el.firstChild) range.setStart(el.firstChild, offset);
      else range.setStart(el, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function focusBlock(id, pos) {
      const el = container.querySelector(`[data-id="${id}"] .editable`);
      if (el) setCaret(el, pos === undefined ? "end" : pos);
    }

    // ---------- rendering ----------
    function numberFor(arr, index) {
      let n = 1;
      for (let i = index - 1; i >= 0; i--) {
        if (arr[i].type === "numbered") n++;
        else break;
      }
      return n;
    }

    function makeEditable(block, placeholder) {
      const ed = document.createElement("div");
      ed.className = "editable";
      ed.contentEditable = "true";
      ed.spellcheck = true;
      ed.dataset.placeholder = placeholder || "";
      ed.textContent = block.text || "";
      bindEditable(ed, block);
      return ed;
    }

    function renderBlock(block, arr, index) {
      const el = document.createElement("div");
      el.className = "block";
      el.dataset.id = block.id;
      el.dataset.type = block.type;
      if (block.type === "todo" && block.checked) el.classList.add("done");
      if (block.type === "toggle" && block.open !== false) el.classList.add("open");
      if (block.type === "callout") el.classList.add("callout-" + (block.color || "blue"));

      // gutter (add + drag)
      const gutter = document.createElement("div");
      gutter.className = "block-gutter";
      const addBtn = document.createElement("button");
      addBtn.className = "gutter-btn"; addBtn.innerHTML = I().plus;
      addBtn.title = "Add block below";
      addBtn.onclick = (e) => { e.stopPropagation(); insertAfter(block.id, "paragraph", true); };
      const dragBtn = document.createElement("button");
      dragBtn.className = "gutter-btn gutter-drag"; dragBtn.innerHTML = I().drag;
      dragBtn.title = "Drag to move · click for actions";
      dragBtn.onclick = (e) => { e.stopPropagation(); openBlockMenu(block, dragBtn); };
      wireDrag(el, dragBtn, block);
      gutter.append(addBtn, dragBtn);
      el.appendChild(gutter);

      const content = document.createElement("div");
      content.className = "block-content";

      if (block.type === "divider") {
        const hr = document.createElement("hr");
        content.appendChild(hr);
      } else if (block.type === "todo") {
        const chk = document.createElement("div");
        chk.className = "todo-check" + (block.checked ? " checked" : "");
        chk.innerHTML = block.checked ? I().check : "";
        chk.onclick = () => { block.checked = !block.checked; save(); render(); };
        content.append(chk, makeEditable(block, "To-do"));
      } else if (block.type === "bulleted") {
        const m = document.createElement("div"); m.className = "list-marker";
        content.append(m, makeEditable(block, "List"));
      } else if (block.type === "numbered") {
        const m = document.createElement("div"); m.className = "numbered-marker";
        m.textContent = numberFor(arr, index) + ".";
        content.append(m, makeEditable(block, "List"));
      } else if (block.type === "callout") {
        const emo = document.createElement("div");
        emo.className = "callout-emoji"; emo.textContent = block.emoji || "💡";
        emo.onclick = () => Daxxer.pickEmoji(emo, (e) => { block.emoji = e; save(); render(); });
        content.append(emo, makeEditable(block, "Type something…"));
      } else if (block.type === "code") {
        const lang = document.createElement("div");
        lang.className = "code-lang"; lang.textContent = block.lang || "code";
        const ed = makeEditable(block, "");
        content.append(lang, ed);
      } else if (block.type === "toggle") {
        const head = document.createElement("div"); head.className = "toggle-head";
        const arrow = document.createElement("div"); arrow.className = "toggle-arrow"; arrow.innerHTML = I().chevron;
        arrow.onclick = () => { block.open = block.open === false ? true : false; save(); render(); };
        head.append(arrow, makeEditable(block, "Toggle"));
        content.appendChild(head);
        const kids = document.createElement("div"); kids.className = "toggle-children";
        block.children = block.children || [];
        block.children.forEach((cb, ci) => kids.appendChild(renderBlock(cb, block.children, ci)));
        const addKid = document.createElement("div");
        addKid.className = "editable"; addKid.style.color = "var(--text-mute)"; addKid.style.fontSize = "14px";
        addKid.style.cursor = "text"; addKid.textContent = "";
        content.appendChild(kids);
      } else {
        const ph = block.type === "heading1" ? "Heading 1" : block.type === "heading2" ? "Heading 2"
          : block.type === "heading3" ? "Heading 3" : block.type === "quote" ? "Empty quote" : "Type '/' for commands";
        content.appendChild(makeEditable(block, ph));
      }

      el.appendChild(content);
      return el;
    }

    function render() {
      container.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "blocks";
      blocks.forEach((b, i) => wrap.appendChild(renderBlock(b, blocks, i)));
      container.appendChild(wrap);
      if (pendingFocus) { focusBlock(pendingFocus.id, pendingFocus.pos); pendingFocus = null; }
    }

    // ---------- editing operations ----------
    function insertAfter(id, type, focusNew, openSlash) {
      const loc = locate(id);
      if (!loc) return;
      const nb = { id: uid(), type: type || "paragraph", text: "" };
      loc.arr.splice(loc.index + 1, 0, nb);
      pendingFocus = { id: nb.id, pos: "start" };
      save(); render();
      if (openSlash) { const el = container.querySelector(`[data-id="${nb.id}"] .editable`); if (el) openSlashMenu(el, nb); }
    }

    function convertType(block, type) {
      block.type = type;
      if (type === "todo") block.checked = false;
      if (type === "toggle") { block.open = true; block.children = block.children || []; }
      if (type === "callout") block.color = block.color || "blue";
      if (type === "divider") { block.text = ""; }
      pendingFocus = { id: block.id, pos: "end" };
      save(); render();
      if (type === "divider") insertAfter(block.id, "paragraph", true);
    }

    // markdown block shortcuts, checked when space is pressed at line start
    const MARKERS = {
      "#": "heading1", "##": "heading2", "###": "heading3",
      "-": "bulleted", "*": "bulleted", "1.": "numbered",
      "[]": "todo", "[ ]": "todo", ">": "quote", '"': "quote", "```": "code",
    };
    function tryMarker(block, el) {
      const text = el.textContent;
      const off = caretOffset(el);
      const before = text.slice(0, off);
      if (MARKERS[before]) {
        block.type = MARKERS[before];
        block.text = text.slice(off);
        if (block.type === "todo") block.checked = false;
        pendingFocus = { id: block.id, pos: "start" };
        save(); render();
        return true;
      }
      return false;
    }

    function bindEditable(ed, block) {
      ed.addEventListener("input", () => {
        block.text = ed.textContent;
        save();
      });

      ed.addEventListener("keydown", (e) => {
        const off = caretOffset(ed);
        const atStart = off === 0;
        const atEnd = off === ed.textContent.length;

        // slash menu
        if (e.key === "/") {
          setTimeout(() => openSlashMenu(ed, block), 0);
        }

        if (e.key === " ") {
          if (tryMarker(block, ed)) { e.preventDefault(); return; }
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const loc = locate(block.id);
          if (!loc) return;
          // empty list/todo/quote → exit to paragraph
          if (["bulleted", "numbered", "todo", "quote"].includes(block.type) && ed.textContent === "") {
            block.type = "paragraph"; block.checked = undefined;
            pendingFocus = { id: block.id, pos: "start" }; save(); render(); return;
          }
          const text = ed.textContent;
          const before = text.slice(0, off);
          const after = text.slice(off);
          block.text = before;
          let newType = "paragraph";
          if (["bulleted", "numbered", "todo"].includes(block.type)) newType = block.type;
          const nb = { id: uid(), type: newType, text: after };
          if (newType === "todo") nb.checked = false;
          loc.arr.splice(loc.index + 1, 0, nb);
          pendingFocus = { id: nb.id, pos: "start" };
          save(); render();
          return;
        }

        if (e.key === "Backspace" && atStart) {
          // convert formatted block back to paragraph first
          if (block.type !== "paragraph" && block.type !== "code") {
            e.preventDefault();
            block.type = "paragraph"; block.checked = undefined; block.color = undefined;
            pendingFocus = { id: block.id, pos: "start" }; save(); render();
            return;
          }
          // merge into previous sibling
          const loc = locate(block.id);
          if (loc && loc.index > 0) {
            e.preventDefault();
            const prev = loc.arr[loc.index - 1];
            if (prev.type === "divider") { loc.arr.splice(loc.index - 1, 1); save(); render(); pendingFocus = { id: block.id, pos: "start" }; render(); return; }
            const mergePos = prev.text.length;
            prev.text = prev.text + block.text;
            loc.arr.splice(loc.index, 1);
            pendingFocus = { id: prev.id, pos: mergePos };
            save(); render();
            return;
          }
        }

        if (e.key === "ArrowUp" && atStart) {
          const el = ed.closest(".block");
          const prev = el && el.previousElementSibling;
          if (prev) { const p = prev.querySelector(".editable"); if (p) { e.preventDefault(); setCaret(p, "end"); } }
        }
        if (e.key === "ArrowDown" && atEnd) {
          const el = ed.closest(".block");
          const next = el && el.nextElementSibling;
          if (next) { const n = next.querySelector(".editable"); if (n) { e.preventDefault(); setCaret(n, "start"); } }
        }

        if (e.key === "Tab") { e.preventDefault(); }
      });

      ed.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text/plain");
        document.execCommand("insertText", false, text);
      });
    }

    // ---------- slash menu ----------
    function openSlashMenu(ed, block) {
      const menu = document.getElementById("slashMenu");
      const rect = ed.getBoundingClientRect();
      let filter = "";
      let sel = 0;

      function items() {
        return Daxxer.BLOCK_TYPES.filter((t) =>
          !filter || t.name.toLowerCase().includes(filter) || t.type.includes(filter));
      }
      function paint() {
        const list = items();
        sel = Math.max(0, Math.min(sel, list.length - 1));
        let html = '<div class="slash-list">';
        let group = "";
        list.forEach((t, i) => {
          if (t.group !== group) { group = t.group; html += `<div class="slash-group">${group}</div>`; }
          html += `<div class="slash-item ${i === sel ? "sel" : ""}" data-type="${t.type}">
            <div class="slash-ico">${Daxxer.ICONS[t.icon]}</div>
            <div class="slash-main"><div class="slash-name">${t.name}</div><div class="slash-desc">${t.desc}</div></div></div>`;
        });
        if (!list.length) html += '<div class="s-hint">No matching blocks</div>';
        html += "</div>";
        menu.innerHTML = html;
        menu.querySelectorAll(".slash-item").forEach((it, i) =>
          (it.onclick = () => choose(it.dataset.type)));
      }
      function place() {
        menu.hidden = false;
        menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 340) + "px";
        menu.style.left = rect.left + "px";
      }
      function choose(type) {
        // strip the "/filter" the user typed
        const txt = ed.textContent;
        const si = txt.lastIndexOf("/");
        if (si >= 0) { block.text = txt.slice(0, si); }
        close();
        convertTypeInline(block, type);
      }
      function convertTypeInline(block, type) {
        if (type === "divider") { block.type = "paragraph"; convertType(block, "divider"); return; }
        block.type = type;
        if (type === "todo") block.checked = false;
        if (type === "toggle") { block.open = true; block.children = block.children || []; }
        if (type === "callout") block.color = block.color || "blue";
        pendingFocus = { id: block.id, pos: "end" };
        save(); render();
      }
      function onKey(e) {
        if (menu.hidden) return;
        if (e.key === "ArrowDown") { e.preventDefault(); sel++; paint(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel--; paint(); }
        else if (e.key === "Enter") { e.preventDefault(); const list = items(); if (list[sel]) choose(list[sel].type); }
        else if (e.key === "Escape") { close(); }
        else {
          setTimeout(() => {
            const txt = ed.textContent;
            const si = txt.lastIndexOf("/");
            filter = si >= 0 ? txt.slice(si + 1).toLowerCase() : "";
            if (si < 0) { close(); return; }
            sel = 0; paint();
          }, 0);
        }
      }
      function close() {
        menu.hidden = true;
        ed.removeEventListener("keydown", onKey, true);
        document.removeEventListener("click", onDoc, true);
      }
      function onDoc(e) { if (!menu.contains(e.target) && e.target !== ed) close(); }

      paint(); place();
      ed.addEventListener("keydown", onKey, true);
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
    }

    // ---------- block context menu ----------
    function openBlockMenu(block, anchor) {
      const menu = document.getElementById("ctxMenu");
      const rect = anchor.getBoundingClientRect();
      const colorRow = block.type === "callout"
        ? `<div class="menu-swatches">${["blue","orange","green","red","gray"].map((c) => `<div class="menu-swatch" data-color="${c}" style="background:${Daxxer.SWATCH[c] || "#eee"}"></div>`).join("")}</div><div class="menu-sep"></div>`
        : "";
      menu.innerHTML = `<div class="menu-list">
        <div class="menu-item" data-act="dup">${I().duplicate}Duplicate</div>
        ${colorRow}
        <div class="menu-item" data-act="turn-todo">${I().todo}Turn into to-do</div>
        <div class="menu-item" data-act="turn-h2">${I().h2}Turn into heading</div>
        <div class="menu-item" data-act="turn-text">${I().text}Turn into text</div>
        <div class="menu-sep"></div>
        <div class="menu-item danger" data-act="del">${I().trash}Delete</div>
      </div>`;
      menu.hidden = false;
      menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 300) + "px";
      menu.style.left = rect.left + "px";
      const close = () => { menu.hidden = true; document.removeEventListener("click", onDoc, true); };
      const onDoc = (e) => { if (!menu.contains(e.target)) close(); };
      menu.querySelectorAll("[data-act]").forEach((it) => (it.onclick = () => {
        const act = it.dataset.act;
        const loc = locate(block.id);
        if (act === "del" && loc) { loc.arr.splice(loc.index, 1); if (!blocks.length) blocks.push({ id: uid(), type: "paragraph", text: "" }); }
        else if (act === "dup" && loc) { loc.arr.splice(loc.index + 1, 0, { ...structuredClone(block), id: uid() }); }
        else if (act === "turn-todo") { block.type = "todo"; block.checked = false; }
        else if (act === "turn-h2") { block.type = "heading2"; }
        else if (act === "turn-text") { block.type = "paragraph"; block.checked = undefined; }
        close(); save(); render();
      }));
      menu.querySelectorAll(".menu-swatch").forEach((sw) => (sw.onclick = () => { block.color = sw.dataset.color; close(); save(); render(); }));
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
    }

    // ---------- drag to reorder (top level) ----------
    let dragId = null;
    function wireDrag(el, handle, block) {
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", (e) => {
        dragId = block.id; el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setDragImage(el, 20, 12);
      });
      handle.addEventListener("dragend", () => { dragId = null; el.classList.remove("dragging"); container.querySelectorAll(".block").forEach((b) => b.classList.remove("drop-before", "drop-after")); });
      el.addEventListener("dragover", (e) => {
        if (!dragId || dragId === block.id) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        container.querySelectorAll(".block").forEach((b) => b.classList.remove("drop-before", "drop-after"));
        el.classList.add(after ? "drop-after" : "drop-before");
      });
      el.addEventListener("drop", (e) => {
        if (!dragId || dragId === block.id) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const from = locate(dragId);
        const to = locate(block.id);
        if (!from || !to) return;
        const [moved] = from.arr.splice(from.index, 1);
        const toNow = locate(block.id); // recompute after splice
        let idx = toNow.index + (after ? 1 : 0);
        toNow.arr.splice(idx, 0, moved);
        dragId = null; save(); render();
      });
    }

    render();
    return { getBlocks: () => blocks };
  }

  Daxxer.Editor = { mount: (container, page, opts) => Editor(container, page, opts) };
})();
