// Daxxer databases: table + board views with typed, colored properties.
window.Daxxer = window.Daxxer || {};

(function () {
  const I = () => Daxxer.ICONS;
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SYSTEM_TYPES = new Set(["unique_id", "created_time", "last_edited_time"]);

  function Database(container, page, opts = {}) {
    const state = {
      properties: structuredClone(page.properties || []),
      views: structuredClone(page.views || [{ id: "v1", name: "Table", type: "table" }]),
      rows: structuredClone(page.rows || []),
    };
    let activeView = state.views[0].id;
    let saveTimer = null;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => opts.onChange && opts.onChange(state), 350); };
    const saveNow = () => opts.onChange && opts.onChange(state);

    const prop = (id) => state.properties.find((p) => p.id === id);
    const titleProp = () => state.properties.find((p) => p.type === "title") || state.properties[0];
    const rowTitle = (row) => String((row && row.cells && row.cells[titleProp().id]) || "Untitled");

    function view() { return state.views.find((v) => v.id === activeView) || state.views[0]; }
    function visibleRows() {
      const v = view();
      let rows = state.rows;
      if (v.filter) rows = rows.filter((r) => r.cells[v.filter.prop] === v.filter.equals);
      return rows;
    }

    function formulaResult(property, row, stack = new Set()) {
      const Engine = Daxxer.FormulaEngine;
      if (!Engine) return { ok: false, error: { code: "formula_engine_missing", message: "Formula engine is unavailable." } };
      if (stack.has(property.id)) return { ok: false, error: { code: "formula_cycle", message: `Formula cycle detected at '${property.name || property.id}'.` } };
      const nextStack = new Set(stack);
      nextStack.add(property.id);
      return Engine.evaluate(property.expression || "", {
        getProperty(key) {
          const dependency = state.properties.find((candidate) => candidate && (candidate.id === key || candidate.name === key));
          if (!dependency) throw new Engine.FormulaError("formula_property", `Unknown property '${key}'.`);
          if (dependency.type === "formula") {
            const nested = formulaResult(dependency, row, nextStack);
            if (!nested.ok) throw new Engine.FormulaError(nested.error.code || "formula_evaluation", nested.error.message || "Nested formula failed.");
            return nested.value;
          }
          if (SYSTEM_TYPES.has(dependency.type) && Daxxer.DatabaseModel) return Daxxer.DatabaseModel.systemValueFor(dependency, row);
          return row && row.cells ? (row.cells[dependency.id] ?? null) : null;
        },
      });
    }

    function displayFormula(result) {
      if (!result.ok) return { text: "⚠ Formula", title: result.error.message || result.error.code || "Formula error", error: true };
      const value = result.value;
      if (value == null) return { text: "", title: "", error: false };
      if (Array.isArray(value)) return { text: value.join(", "), title: "", error: false };
      if (typeof value === "object") return { text: JSON.stringify(value), title: "", error: false };
      return { text: String(value), title: "", error: false };
    }

    function pill(name, color, isStatus) {
      return `<span class="pill ${isStatus ? "status" : ""} pill-${color || "gray"}">${esc(name)}</span>`;
    }

    function closePopovers() {
      document.querySelectorAll("#optPop,#relationPop").forEach((p) => p.remove());
    }

    function positionPopover(pop, anchor, maxHeight = 320) {
      const rect = anchor.getBoundingClientRect();
      pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - maxHeight) + "px";
      pop.style.left = Math.min(rect.left, window.innerWidth - 280) + "px";
    }

    function openOptionPicker(anchor, p, row) {
      closePopovers();
      const multi = p.type === "multi_select";
      const pop = document.createElement("div"); pop.className = "popover"; pop.id = "optPop";
      const current = row.cells[p.id];
      const selected = multi ? (Array.isArray(current) ? current : []) : current;

      function paint(filter = "") {
        const opts = (p.options || []).filter((o) => o.name.toLowerCase().includes(filter.toLowerCase()));
        let html = `<div class="menu-list" style="min-width:220px"><input class="emoji-search" id="optSearch" placeholder="Search or create…" style="margin-bottom:6px" /><div style="max-height:240px;overflow:auto">`;
        opts.forEach((o) => {
          const on = multi ? selected.includes(o.id) : selected === o.id;
          html += `<div class="menu-item" data-opt="${o.id}">${pill(o.name, o.color, p.type === "status")}<span style="margin-left:auto">${on ? I().check : ""}</span></div>`;
        });
        if (filter && !opts.some((o) => o.name.toLowerCase() === filter.toLowerCase())) html += `<div class="menu-item" data-create="${esc(filter)}"><span class="pill pill-blue">Create "${esc(filter)}"</span></div>`;
        html += `</div></div>`;
        pop.innerHTML = html;
        const s = pop.querySelector("#optSearch"); s.value = filter; s.focus(); s.oninput = () => paint(s.value);
        s.onkeydown = (e) => { if (e.key === "Enter" && s.value.trim()) { const ex = (p.options||[]).find(o=>o.name.toLowerCase()===s.value.trim().toLowerCase()); if (ex) pick(ex.id); else create(s.value.trim()); } };
        pop.querySelectorAll("[data-opt]").forEach((it) => (it.onclick = () => pick(it.dataset.opt)));
        pop.querySelectorAll("[data-create]").forEach((it) => (it.onclick = () => create(it.dataset.create)));
      }
      function create(name) {
        const colors = Daxxer.TAG_COLORS;
        const o = { id: uid("o"), name, color: colors[(p.options || []).length % colors.length] };
        p.options = p.options || []; p.options.push(o); pick(o.id);
      }
      function pick(id) {
        if (multi) {
          let arr = Array.isArray(row.cells[p.id]) ? row.cells[p.id].slice() : [];
          arr = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
          row.cells[p.id] = arr; saveNow(); rerender();
          const cell = container.querySelector(`[data-row="${row.id}"][data-prop="${p.id}"]`); if (cell) openOptionPicker(cell, p, row);
        } else {
          row.cells[p.id] = row.cells[p.id] === id ? null : id; saveNow(); closePopovers(); rerender();
        }
      }
      document.body.appendChild(pop); positionPopover(pop, anchor); paint();
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
      function onDoc(e) { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { closePopovers(); document.removeEventListener("click", onDoc, true); } }
    }

    function openRelationPicker(anchor, p, row) {
      closePopovers();
      const pop = document.createElement("div"); pop.className = "popover"; pop.id = "relationPop";
      function paint(filter = "") {
        const selected = new Set(Array.isArray(row.cells[p.id]) ? row.cells[p.id] : []);
        const candidates = state.rows.filter((candidate) => rowTitle(candidate).toLowerCase().includes(filter.toLowerCase()));
        let html = `<div class="menu-list" style="min-width:250px"><input class="emoji-search" id="relationSearch" placeholder="Search pages…" style="margin-bottom:6px" /><div style="max-height:260px;overflow:auto">`;
        candidates.forEach((candidate) => {
          html += `<div class="menu-item" data-relation-row="${esc(candidate.id)}"><span style="display:inline-flex">${I().page}</span><span>${esc(rowTitle(candidate))}</span><span style="margin-left:auto">${selected.has(candidate.id) ? I().check : ""}</span></div>`;
        });
        if (!candidates.length) html += `<div style="padding:8px;color:var(--text-mute);font-size:12px">No matching pages</div>`;
        html += `</div></div>`;
        pop.innerHTML = html;
        const search = pop.querySelector("#relationSearch"); search.value = filter; search.focus(); search.oninput = () => paint(search.value);
        pop.querySelectorAll("[data-relation-row]").forEach((item) => {
          item.onclick = (event) => {
            event.stopPropagation();
            const targetId = item.dataset.relationRow;
            let next = Array.isArray(row.cells[p.id]) ? row.cells[p.id].slice() : [];
            next = next.includes(targetId) ? next.filter((id) => id !== targetId) : [...next, targetId];
            row.cells[p.id] = next; saveNow(); rerender();
            const replacement = container.querySelector(`[data-row="${row.id}"][data-prop="${p.id}"]`); if (replacement) openRelationPicker(replacement, p, row);
          };
        });
      }
      document.body.appendChild(pop); positionPopover(pop, anchor, 360); paint();
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
      function onDoc(e) { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { closePopovers(); document.removeEventListener("click", onDoc, true); } }
    }

    function renderCell(p, row) {
      const v = row.cells[p.id];
      if (p.type === "title") return `<div class="cell-title-link"><span>${I().page}</span><span class="ct-text" contenteditable="true" data-edit="title">${esc(v || "")}</span><button class="open-page" data-open="${row.id}">${I().database}Open</button></div>`;
      if (p.type === "checkbox") return `<div class="db-check ${v ? "on" : ""}" data-toggle="1">${v ? I().check : ""}</div>`;
      if (p.type === "select" || p.type === "status") return v ? pill(Daxxer.optName(p, v), Daxxer.optColor(p, v), p.type === "status") : `<span style="color:var(--text-mute)">＋</span>`;
      if (p.type === "multi_select") {
        const arr = Array.isArray(v) ? v : [];
        return arr.length ? `<div class="db-cell-tags">${arr.map((id) => pill(Daxxer.optName(p, id), Daxxer.optColor(p, id))).join("")}</div>` : `<span style="color:var(--text-mute)">＋</span>`;
      }
      if (p.type === "relation") {
        const related = Daxxer.DatabaseModel && Daxxer.DatabaseModel.relationRows ? Daxxer.DatabaseModel.relationRows(state, p, row) : [];
        return related.length ? `<div class="db-cell-tags">${related.map((target) => pill(rowTitle(target), "gray")).join("")}</div>` : `<span style="color:var(--text-mute)">＋ Add page</span>`;
      }
      if (p.type === "formula") {
        const display = displayFormula(formulaResult(p, row));
        return `<span data-formula="1" title="${esc(display.title)}" style="color:${display.error ? "var(--tag-red)" : "var(--text-dim)"};font-size:12px">${esc(display.text)}</span>`;
      }
      if (SYSTEM_TYPES.has(p.type)) {
        const raw = Daxxer.DatabaseModel && Daxxer.DatabaseModel.systemValueFor ? Daxxer.DatabaseModel.systemValueFor(p, row) : v;
        return `<span data-system="1" style="color:var(--text-dim);font-size:12px">${esc(raw || "")}</span>`;
      }
      return `<span class="ct-text" contenteditable="true" data-edit="text">${esc(v || "")}</span>`;
    }

    function wireCell(cell, p, row) {
      if (SYSTEM_TYPES.has(p.type) || p.type === "formula") return;
      if (p.type === "relation") cell.onclick = () => openRelationPicker(cell, p, row);
      else if (p.type === "select" || p.type === "status" || p.type === "multi_select") cell.onclick = () => openOptionPicker(cell, p, row);
      else if (p.type === "checkbox") {
        const box = cell.querySelector(".db-check"); if (box) box.onclick = () => { row.cells[p.id] = !row.cells[p.id]; saveNow(); rerender(); };
      } else {
        const t = cell.querySelector('[data-edit]');
        if (t) {
          t.onblur = () => { row.cells[p.id] = t.textContent; save(); };
          t.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); t.blur(); } };
        }
        const open = cell.querySelector("[data-open]"); if (open) open.onclick = (e) => { e.stopPropagation(); openRow(row); };
      }
    }

    function renderTable() {
      const rows = visibleRows();
      const table = document.createElement("table"); table.className = "db-table";
      const thead = document.createElement("thead"); const htr = document.createElement("tr");
      state.properties.forEach((p) => { const th = document.createElement("th"); th.innerHTML = `<div class="db-th-inner">${typeIcon(p.type)}<span>${esc(p.name)}</span></div>`; htr.appendChild(th); });
      const thAdd = document.createElement("th"); thAdd.innerHTML = `<div class="db-th-inner th-add" title="Add property">${I().plus}</div>`; thAdd.querySelector(".db-th-inner").onclick = addProperty; htr.appendChild(thAdd); thead.appendChild(htr); table.appendChild(thead);
      const tbody = document.createElement("tbody");
      rows.forEach((row) => {
        const tr = document.createElement("tr"); tr.className = "db-row"; tr.dataset.row = row.id;
        state.properties.forEach((p) => { const td = document.createElement("td"); td.className = "db-cell" + (p.type === "title" ? " cell-title" : ""); td.dataset.row = row.id; td.dataset.prop = p.id; td.innerHTML = renderCell(p, row); wireCell(td, p, row); tr.appendChild(td); });
        tr.appendChild(document.createElement("td")); tbody.appendChild(tr);
      });
      const addTr = document.createElement("tr"); addTr.className = "db-add-row"; const addTd = document.createElement("td"); addTd.colSpan = state.properties.length + 1; addTd.innerHTML = `<button>${I().plus}New</button>`; addTd.querySelector("button").onclick = addRow; addTr.appendChild(addTd); tbody.appendChild(addTr); table.appendChild(tbody);
      const wrap = document.createElement("div"); wrap.className = "db-table-wrap"; wrap.appendChild(table); const count = document.createElement("div"); count.className = "db-footer-count"; count.textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"}`; wrap.appendChild(count); return wrap;
    }

    function renderBoard() {
      const v = view(); const gp = prop(v.groupBy) || state.properties.find((p) => p.type === "status" || p.type === "select");
      const board = document.createElement("div"); board.className = "db-board"; const cols = [...(gp.options || []), { id: "__none", name: "No " + gp.name, color: "gray" }];
      cols.forEach((opt) => {
        const rows = state.rows.filter((r) => (r.cells[gp.id] || "__none") === opt.id); const col = document.createElement("div"); col.className = "board-col"; col.dataset.opt = opt.id;
        col.innerHTML = `<div class="board-col-head">${pill(opt.name, opt.color, gp.type === "status")}<span class="count">${rows.length}</span></div>`;
        rows.forEach((row) => {
          const card = document.createElement("div"); card.className = "board-card"; card.dataset.row = row.id; card.draggable = true;
          const tags = state.properties.filter((p) => (p.type === "select" || p.type === "multi_select") && p.id !== gp.id).map((p) => { const cv = row.cells[p.id]; if (!cv) return ""; if (Array.isArray(cv)) return cv.map((id) => pill(Daxxer.optName(p, id), Daxxer.optColor(p, id))).join(""); return pill(Daxxer.optName(p, cv), Daxxer.optColor(p, cv)); }).join("");
          card.innerHTML = `<div class="bc-title">${esc(rowTitle(row))}</div>${tags ? `<div class="bc-tags">${tags}</div>` : ""}`; card.onclick = () => openRow(row);
          card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", row.id); card.style.opacity = "0.4"; }); card.addEventListener("dragend", () => (card.style.opacity = "1")); col.appendChild(card);
        });
        const add = document.createElement("button"); add.className = "board-add"; add.innerHTML = `${I().plus}New`; add.onclick = () => { const r = { id: uid("r"), cells: { [titleProp().id]: "Untitled", [gp.id]: opt.id === "__none" ? null : opt.id } }; state.rows.push(r); saveNow(); rerender(); }; col.appendChild(add);
        col.addEventListener("dragover", (e) => e.preventDefault()); col.addEventListener("drop", (e) => { e.preventDefault(); const rid = e.dataTransfer.getData("text/plain"); const row = state.rows.find((r) => r.id === rid); if (row) { row.cells[gp.id] = opt.id === "__none" ? null : opt.id; saveNow(); rerender(); } }); board.appendChild(col);
      });
      return board;
    }

    function openRow(row) {
      const ov = document.createElement("div"); ov.className = "overlay"; ov.style.padding = "70px 20px"; const modal = document.createElement("div"); modal.style.cssText = "width:100%;max-width:640px;background:#fff;border-radius:12px;box-shadow:0 16px 50px rgba(15,20,35,0.28);overflow:hidden;max-height:80vh;display:flex;flex-direction:column";
      const body = document.createElement("div"); body.style.cssText = "padding:28px 40px;overflow:auto"; const tp = titleProp(); body.innerHTML = `<input class="page-title-input" style="font-size:30px" value="${esc(row.cells[tp.id] || "")}" data-title />`;
      const props = document.createElement("div"); props.style.marginTop = "12px";
      state.properties.filter((p) => p.type !== "title").forEach((p) => { const line = document.createElement("div"); line.style.cssText = "display:flex;align-items:center;gap:12px;padding:6px 0;font-size:14px"; line.innerHTML = `<div style="width:150px;color:var(--text-dim);display:flex;align-items:center;gap:7px">${typeIcon(p.type)}${esc(p.name)}</div>`; const val = document.createElement("div"); val.style.cssText = "flex:1;cursor:pointer"; val.className = "row-prop-val"; val.dataset.row = row.id; val.dataset.prop = p.id; val.innerHTML = renderCell(p, row); wireCell(val, p, row); line.appendChild(val); props.appendChild(line); });
      body.appendChild(props); modal.appendChild(body); ov.appendChild(modal); document.body.appendChild(ov); const ti = body.querySelector("[data-title]"); ti.oninput = () => { row.cells[tp.id] = ti.value; save(); }; ov.onclick = (e) => { if (e.target === ov) { ov.remove(); rerender(); } };
    }

    function addRow() {
      const r = { id: uid("r"), cells: {} }; r.cells[titleProp().id] = ""; const v = view(); if (v.filter) r.cells[v.filter.prop] = v.filter.equals; state.rows.push(r); saveNow(); rerender(); setTimeout(() => { const el = container.querySelector(`[data-row="${r.id}"] .ct-text`); if (el) el.focus(); }, 0);
    }

    function addProperty() {
      const name = prompt("Property name:", "New property"); if (!name) return;
      const type = (prompt("Type: text, select, status, multi_select, checkbox, number, date, date_range, url, email, phone, relation, formula, unique_id, created_time, last_edited_time", "select") || "select").trim();
      const p = { id: uid("p"), name, type };
      if (["select", "status", "multi_select"].includes(type)) p.options = [];
      if (type === "relation") p.target = "self";
      if (type === "formula") p.expression = prompt('Formula (example: prop("Hours") * prop("Rate")):', "") || "";
      if (type === "unique_id") p.prefix = (prompt("Unique ID prefix:", "ID-") || "ID-");
      state.properties.push(p); saveNow(); rerender();
    }

    function typeIcon(t) {
      const map = { title: I().text, text: I().text, select: I().bullet, status: I().toggle, multi_select: I().bullet, checkbox: I().todo, number: I().numbered, date: I().database, date_range: I().database, url: I().text, email: I().text, phone: I().text, relation: I().database, formula: I().numbered, unique_id: I().numbered, created_time: I().database, last_edited_time: I().database };
      return `<span style="display:inline-flex">${map[t] || I().text}</span>`;
    }

    function renderViewsBar() {
      const bar = document.createElement("div"); bar.className = "db-views";
      state.views.forEach((v) => { const tab = document.createElement("button"); tab.className = "db-view-tab" + (v.id === activeView ? " active" : ""); tab.innerHTML = `${v.type === "board" ? I().board : I().table}<span>${esc(v.name)}</span>`; tab.onclick = () => { activeView = v.id; rerender(); }; bar.appendChild(tab); });
      const addView = document.createElement("button"); addView.className = "db-view-tab db-view-add"; addView.innerHTML = I().plus; addView.onclick = () => { const name = prompt("View name:", "New view"); if (!name) return; const type = (prompt("Type: table or board", "table") || "table").trim(); const nv = { id: uid("v"), name, type }; if (type === "board") nv.groupBy = (state.properties.find((p) => p.type === "status" || p.type === "select") || {}).id; state.views.push(nv); activeView = nv.id; saveNow(); rerender(); }; bar.appendChild(addView);
      const toolbar = document.createElement("div"); toolbar.className = "db-toolbar"; toolbar.innerHTML = `<button class="icon-btn" title="Filter"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><button class="icon-btn" title="Sort"><svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="icon-btn" title="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button><button class="db-new-btn"><span class="dn-main">New</span><span class="dn-caret">${I().chevron}</span></button>`; toolbar.querySelector(".dn-main").onclick = addRow; bar.appendChild(toolbar); return bar;
    }

    function rerender() {
      closePopovers(); container.innerHTML = ""; container.appendChild(renderViewsBar()); const v = view(); container.appendChild(v.type === "board" ? renderBoard() : renderTable());
    }

    rerender();
    return { getState: () => state };
  }

  Daxxer.Database = { mount: (container, page, opts) => Database(container, page, opts) };
})();
