// Daxxer block editor: versioned rich-text blocks, slash menu, markdown
// shortcuts, checkboxes, toggles, callouts, code, and drag-to-reorder.
window.Daxxer = window.Daxxer || {};

(function () {
  const I = () => Daxxer.ICONS;
  const uid = () => "b_" + Math.random().toString(36).slice(2, 9);

  function Editor(container, page, opts = {}) {
    const Schema = Daxxer.BlockSchema;
    const RT = Daxxer.RichText;
    const migration = Schema ? Schema.migratePage(page) : { ok: true, page: structuredClone(page || {}), errors: [], warnings: [] };

    if (!migration.ok || !RT) {
      container.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "editor-schema-error";
      panel.style.cssText = "margin:16px 0;padding:14px 16px;border:1px solid rgba(235,87,87,.35);border-radius:8px;background:rgba(235,87,87,.06);font-size:13px;line-height:1.5";
      panel.innerHTML = `<strong>Page content needs review</strong><div style="margin-top:4px;color:var(--text-dim)">${!RT ? "Rich-text engine is unavailable." : migration.errors.map((error) => error.code).join(" · ")}</div><div style="margin-top:5px;color:var(--text-mute)">Daxxer stopped editing rather than rewriting unsupported content.</div>`;
      container.appendChild(panel);
      return { getBlocks: () => structuredClone((page && page.blocks) || []), errors: migration.errors || [{ code: "rich_text_engine_missing" }] };
    }

    let blocks = structuredClone(migration.page.blocks || []);
    if (blocks.length === 0) blocks = [newBlock("paragraph", "")];
    let saveTimer = null;
    let pendingFocus = null; // { id, pos }

    function newBlock(type = "paragraph", text = "") {
      return { id: uid(), type, schemaVersion: 1, text, richText: RT.fromText(text) };
    }

    function segmentsFor(block) {
      return Array.isArray(block.richText) ? RT.compact(block.richText) : RT.fromText(block.text || "");
    }

    function syncBlock(block, segments) {
      block.richText = RT.compact(segments);
      block.text = RT.plainText(block.richText);
      block.schemaVersion = 1;
      return block.richText;
    }

    function showSaveError(errors) {
      let banner = container.querySelector(".editor-save-error");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "editor-save-error";
        banner.style.cssText = "position:sticky;top:4px;z-index:20;margin:4px 0 8px;padding:8px 10px;border-radius:6px;background:rgba(235,87,87,.10);color:var(--text);font-size:12px";
        container.prepend(banner);
      }
      banner.textContent = `Save blocked: ${(errors || []).map((error) => error.code).join(" · ") || "invalid content"}`;
    }

    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const prepared = Schema ? Schema.prepareForPersistence({ blocks }) : { ok: true, page: { blocks } };
        if (!prepared.ok) { showSaveError(prepared.errors); return; }
        blocks = prepared.page.blocks;
        const banner = container.querySelector(".editor-save-error"); if (banner) banner.remove();
        if (opts.onChange) opts.onChange(blocks);
      }, 450);
    }

    // ---------- block-array helpers (supports nesting via toggle.children) ----------
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

    // ---------- selection/caret helpers ----------
    function selectionOffsets(el) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return { start: 0, end: 0 };
      const range = sel.getRangeAt(0);
      if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return { start: 0, end: 0 };
      const beforeStart = range.cloneRange();
      beforeStart.selectNodeContents(el);
      beforeStart.setEnd(range.startContainer, range.startOffset);
      const beforeEnd = range.cloneRange();
      beforeEnd.selectNodeContents(el);
      beforeEnd.setEnd(range.endContainer, range.endOffset);
      return { start: beforeStart.toString().length, end: beforeEnd.toString().length };
    }

    function caretOffset(el) { return selectionOffsets(el).end; }

    function pointAtOffset(el, wanted) {
      const target = Math.max(0, Math.min(Number(wanted) || 0, el.textContent.length));
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node;
      let last = null;
      while ((node = walker.nextNode())) {
        last = node;
        const next = offset + node.nodeValue.length;
        if (target <= next) return { node, offset: target - offset };
        offset = next;
      }
      if (last) return { node: last, offset: last.nodeValue.length };
      return { node: el, offset: 0 };
    }

    function setSelection(el, start, end = start) {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      const a = pointAtOffset(el, start === "start" ? 0 : start === "end" ? el.textContent.length : start);
      const b = pointAtOffset(el, end === "start" ? 0 : end === "end" ? el.textContent.length : end);
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function setCaret(el, pos) {
      const len = el.textContent.length;
      const offset = pos === "start" ? 0 : pos === "end" ? len : Math.min(Number(pos) || 0, len);
      setSelection(el, offset, offset);
    }

    function focusBlock(id, pos) {
      const el = container.querySelector(`[data-id="${id}"] .editable`);
      if (el) setCaret(el, pos === undefined ? "end" : pos);
    }

    // ---------- rich text DOM projection ----------
    function renderRichText(ed, segments) {
      ed.innerHTML = "";
      for (const segment of RT.compact(segments)) {
        const span = document.createElement("span");
        span.dataset.rt = "1";
        if (segment.marks && segment.marks.bold) { span.dataset.bold = "1"; span.style.fontWeight = "700"; }
        if (segment.marks && segment.marks.italic) { span.dataset.italic = "1"; span.style.fontStyle = "italic"; }
        if (segment.marks && segment.marks.underline) { span.dataset.underline = "1"; span.style.textDecoration = "underline"; }
        if (segment.marks && segment.marks.strike) { span.dataset.strike = "1"; span.style.textDecoration = span.style.textDecoration ? span.style.textDecoration + " line-through" : "line-through"; }
        if (segment.marks && segment.marks.code) {
          span.dataset.code = "1";
          span.style.fontFamily = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
          span.style.fontSize = ".9em";
          span.style.background = "var(--hover)";
          span.style.borderRadius = "4px";
          span.style.padding = "1px 3px";
        }
        if (segment.marks && segment.marks.color) { span.dataset.color = segment.marks.color; span.style.color = segment.marks.color; }
        if (segment.marks && segment.marks.background) { span.dataset.background = segment.marks.background; span.style.backgroundColor = segment.marks.background; }
        if (segment.href) { span.dataset.href = segment.href; span.style.textDecoration = span.style.textDecoration ? span.style.textDecoration + " underline" : "underline"; span.style.cursor = "text"; span.title = segment.href; }
        span.textContent = segment.text;
        ed.appendChild(span);
      }
    }

    function segmentsFromEditable(ed) {
      const out = [];
      function walk(node, inherited) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.nodeValue) out.push({ text: node.nodeValue, marks: { ...(inherited.marks || {}) }, href: inherited.href || null });
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === "BR") { out.push({ text: "\n", marks: { ...(inherited.marks || {}) }, href: inherited.href || null }); return; }
        const marks = { ...(inherited.marks || {}) };
        const d = node.dataset || {};
        if (d.bold === "1") marks.bold = true;
        if (d.italic === "1") marks.italic = true;
        if (d.underline === "1") marks.underline = true;
        if (d.strike === "1") marks.strike = true;
        if (d.code === "1") marks.code = true;
        if (d.color) marks.color = d.color;
        if (d.background) marks.background = d.background;
        const href = d.href || inherited.href || null;
        node.childNodes.forEach((child) => walk(child, { marks, href }));
      }
      ed.childNodes.forEach((child) => walk(child, { marks: {}, href: null }));
      return RT.compact(out);
    }

    function syncFromEditable(ed, block) { return syncBlock(block, segmentsFromEditable(ed)); }

    function applyFormatting(ed, block, kind) {
      syncFromEditable(ed, block);
      const { start, end } = selectionOffsets(ed);
      if (end <= start) return false;
      let result;
      if (kind === "link") {
        const current = RT.slice(block.richText, start, end);
        const existing = current.find((segment) => segment.href)?.href || "";
        const href = prompt("Link URL (leave blank to remove):", existing);
        if (href === null) return false;
        const trimmed = href.trim();
        if (trimmed && !/^(https?:\/\/|mailto:)/i.test(trimmed)) {
          alert("Use an http://, https://, or mailto: link.");
          return false;
        }
        result = RT.applyLink(block.richText, start, end, trimmed || null);
      } else result = RT.toggleMark(block.richText, start, end, kind);
      if (!result || !result.ok) return false;
      syncBlock(block, result.segments);
      renderRichText(ed, block.richText);
      setSelection(ed, start, end);
      save();
      return true;
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
      renderRichText(ed, segmentsFor(block));
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
        content.append(lang, makeEditable(block, ""));
      } else if (block.type === "toggle") {
        const head = document.createElement("div"); head.className = "toggle-head";
        const arrow = document.createElement("div"); arrow.className = "toggle-arrow"; arrow.innerHTML = I().chevron;
        arrow.onclick = () => { block.open = block.open === false ? true : false; save(); render(); };
        head.append(arrow, makeEditable(block, "Toggle"));
        content.appendChild(head);
        const kids = document.createElement("div"); kids.className = "toggle-children";
        block.children = block.children || [];
        block.children.forEach((cb, ci) => kids.appendChild(renderBlock(cb, block.children, ci)));
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
      const nb = newBlock(type || "paragraph", "");
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
      if (type === "divider") syncBlock(block, []);
      pendingFocus = { id: block.id, pos: "end" };
      save(); render();
      if (type === "divider") insertAfter(block.id, "paragraph", true);
    }

    const MARKERS = {
      "#": "heading1", "##": "heading2", "###": "heading3",
      "-": "bulleted", "*": "bulleted", "1.": "numbered",
      "[]": "todo", "[ ]": "todo", ">": "quote", '"': "quote", "```": "code",
    };

    function tryMarker(block, el) {
      syncFromEditable(el, block);
      const off = caretOffset(el);
      const before = block.text.slice(0, off);
      if (MARKERS[before]) {
        block.type = MARKERS[before];
        syncBlock(block, RT.slice(block.richText, off, RT.length(block.richText)));
        if (block.type === "todo") block.checked = false;
        pendingFocus = { id: block.id, pos: "start" };
        save(); render();
        return true;
      }
      return false;
    }

    function bindEditable(ed, block) {
      ed.addEventListener("input", () => {
        syncFromEditable(ed, block);
        save();
      });

      ed.addEventListener("keydown", (e) => {
        const selection = selectionOffsets(ed);
        const off = selection.end;
        const atStart = selection.start === 0 && selection.end === 0;
        const atEnd = selection.start === ed.textContent.length && selection.end === ed.textContent.length;
        const mod = e.ctrlKey || e.metaKey;

        if (mod && !e.altKey) {
          const key = e.key.toLowerCase();
          let mark = null;
          if (key === "b" && !e.shiftKey) mark = "bold";
          else if (key === "i" && !e.shiftKey) mark = "italic";
          else if (key === "u" && !e.shiftKey) mark = "underline";
          else if (key === "x" && e.shiftKey) mark = "strike";
          else if (e.key === "`") mark = "code";
          if (mark) { e.preventDefault(); applyFormatting(ed, block, mark); return; }
          if (key === "k" && !e.shiftKey) { e.preventDefault(); applyFormatting(ed, block, "link"); return; }
        }

        if (e.key === "/") setTimeout(() => openSlashMenu(ed, block), 0);

        if (e.key === " ") {
          if (tryMarker(block, ed)) { e.preventDefault(); return; }
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const loc = locate(block.id);
          if (!loc) return;
          syncFromEditable(ed, block);
          let { start, end } = selectionOffsets(ed);
          if (end > start) {
            syncBlock(block, RT.replaceRange(block.richText, start, end, ""));
            end = start;
          }
          if (["bulleted", "numbered", "todo", "quote"].includes(block.type) && block.text === "") {
            block.type = "paragraph"; block.checked = undefined;
            pendingFocus = { id: block.id, pos: "start" }; save(); render(); return;
          }
          const [before, after] = RT.split(block.richText, start);
          syncBlock(block, before);
          let newType = "paragraph";
          if (["bulleted", "numbered", "todo"].includes(block.type)) newType = block.type;
          const nb = newBlock(newType, "");
          syncBlock(nb, after);
          if (newType === "todo") nb.checked = false;
          loc.arr.splice(loc.index + 1, 0, nb);
          pendingFocus = { id: nb.id, pos: "start" };
          save(); render();
          return;
        }

        if (e.key === "Backspace" && atStart) {
          syncFromEditable(ed, block);
          if (block.type !== "paragraph" && block.type !== "code") {
            e.preventDefault();
            block.type = "paragraph"; block.checked = undefined; block.color = undefined;
            pendingFocus = { id: block.id, pos: "start" }; save(); render();
            return;
          }
          const loc = locate(block.id);
          if (loc && loc.index > 0) {
            e.preventDefault();
            const prev = loc.arr[loc.index - 1];
            if (prev.type === "divider") { loc.arr.splice(loc.index - 1, 1); save(); render(); pendingFocus = { id: block.id, pos: "start" }; render(); return; }
            const mergePos = RT.length(segmentsFor(prev));
            syncBlock(prev, RT.concat(segmentsFor(prev), segmentsFor(block)));
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
        syncFromEditable(ed, block);
        const text = (e.clipboardData || window.clipboardData).getData("text/plain");
        const { start, end } = selectionOffsets(ed);
        const style = RT.styleAt(block.richText, start);
        syncBlock(block, RT.replaceRange(block.richText, start, end, text, style));
        renderRichText(ed, block.richText);
        setCaret(ed, start + text.length);
        save();
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
        menu.querySelectorAll(".slash-item").forEach((it) => (it.onclick = () => choose(it.dataset.type)));
      }
      function place() {
        menu.hidden = false;
        menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 340) + "px";
        menu.style.left = rect.left + "px";
      }
      function choose(type) {
        syncFromEditable(ed, block);
        const si = block.text.lastIndexOf("/");
        if (si >= 0) syncBlock(block, RT.slice(block.richText, 0, si));
        close();
        convertTypeInline(block, type);
      }
      function convertTypeInline(target, type) {
        if (type === "divider") { target.type = "paragraph"; convertType(target, "divider"); return; }
        target.type = type;
        if (type === "todo") target.checked = false;
        if (type === "toggle") { target.open = true; target.children = target.children || []; }
        if (type === "callout") target.color = target.color || "blue";
        pendingFocus = { id: target.id, pos: "end" };
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
        if (act === "del" && loc) { loc.arr.splice(loc.index, 1); if (!blocks.length) blocks.push(newBlock("paragraph", "")); }
        else if (act === "dup" && loc) { loc.arr.splice(loc.index + 1, 0, { ...structuredClone(block), id: uid() }); }
        else if (act === "turn-todo") { block.type = "todo"; block.checked = false; }
        else if (act === "turn-h2") { block.type = "heading2"; }
        else if (act === "turn-text") { block.type = "paragraph"; block.checked = undefined; }
        close(); save(); render();
      }));
      menu.querySelectorAll(".menu-swatch").forEach((sw) => (sw.onclick = () => { block.color = sw.dataset.color; close(); save(); render(); }));
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
    }

    // ---------- drag to reorder ----------
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
        const toNow = locate(block.id);
        const idx = toNow.index + (after ? 1 : 0);
        toNow.arr.splice(idx, 0, moved);
        dragId = null; save(); render();
      });
    }

    render();
    return { getBlocks: () => blocks, warnings: migration.warnings || [] };
  }

  Daxxer.Editor = { mount: (container, page, opts) => Editor(container, page, opts) };
})();
