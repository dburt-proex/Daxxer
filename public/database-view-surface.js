// Database view UI adapter. Reuses guarded Table/Board editing and projects
// List/Calendar/Gallery over the same canonical state through ViewProjection.
window.Daxxer = window.Daxxer || {};
(function () {
  const base = Daxxer.Database && Daxxer.Database.mount;
  const Engine = Daxxer.ViewProjection;
  const Model = Daxxer.DatabaseModel;
  if (!base || !Engine || !Model) return;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const TYPES = ["table","board","list","calendar","gallery"];
  const errorKey = (error) => `${error.rowId || ""}|${error.propId || ""}|${error.code || ""}`;
  const errorValue = (value) => {
    if (value && typeof value === "object") { try { return JSON.stringify(value); } catch (_) {} }
    return String(value);
  };
  function typedErrors(state) {
    return [
      ...Model.normalizeNumberCells(state),
      ...Model.normalizeTypedScalarCells(state),
      ...Model.normalizePlaceCells(state),
      ...Model.normalizeRelationCells(state),
      ...Model.normalizeSystemPropertyCells(state),
    ];
  }

  Daxxer.Database.mount = function projectedMount(container, page, opts = {}) {
    const host = document.createElement("div"); host.className = "dv-host"; container.innerHTML = ""; container.appendChild(host);
    let api = base(host, page, opts);
    let state = api && api.getState ? api.getState() : Model.normalizePage(page);
    let lastPersisted = structuredClone(state);
    let toleratedInvalid = new Map(typedErrors(structuredClone(state)).map((error) => [errorKey(error), errorValue(error.value)]));
    let decorating = false;
    let observer;
    const calendarMonth = new Map();

    const titleProp = () => Engine.titleProperty(state);
    const title = (row) => { const p = titleProp(); return p ? String(Engine.rawValue(state,row,p) || "Untitled") : "Untitled"; };
    const currentView = () => {
      state = api && api.getState ? api.getState() : state;
      const tabs = [...host.querySelectorAll(".db-view-tab:not(.db-view-add)")];
      const index = Math.max(0, tabs.findIndex((tab) => tab.classList.contains("active")));
      return state.views[index] || state.views[0];
    };
    const persist = () => {
      const structural = Model.validateState(state);
      if (structural.length) return { ok:false, errors:structural };
      Model.applySystemMetadata(lastPersisted, state, new Date().toISOString());
      const errors = typedErrors(state);
      const newlyInvalid = errors.filter((error) => {
        const prior = toleratedInvalid.get(errorKey(error));
        return prior === undefined || prior !== errorValue(error.value);
      });
      if (newlyInvalid.length) return { ok:false, errors:newlyInvalid };
      toleratedInvalid = new Map(errors.map((error) => [errorKey(error), errorValue(error.value)]));
      if (opts.onChange) opts.onChange(state);
      lastPersisted = structuredClone(state);
      return { ok:true, errors:[] };
    };
    const replaceBody = (node) => { const old = host.querySelector(".db-table-wrap,.db-board,.dv-custom-view"); if (old) old.replaceWith(node); else host.appendChild(node); };

    function controls(view, projection) {
      host.querySelector(".dv-controls")?.remove();
      const bar = host.querySelector(".db-views"); if (!bar) return;
      const el = document.createElement("div"); el.className = "dv-controls";
      el.innerHTML = `<div class="dv-search"><span>⌕</span><input placeholder="Search view" value="${esc(view.search || "")}" /></div><button data-c="filter">Filter</button><button data-c="sort">Sort</button><button data-c="props">Properties</button><span class="dv-count">${projection.rows.length} ${projection.rows.length===1?"item":"items"}</span>`;
      bar.after(el);
      let timer; el.querySelector("input").oninput = (e) => { clearTimeout(timer); timer=setTimeout(()=>{ view.search=e.target.value; persist(); decorate(); },180); };
      el.querySelector('[data-c="filter"]').onclick = () => {
        const prop = prompt("Filter property name or ID (blank clears):", view.filter?.rules?.[0]?.prop || view.filter?.prop || "");
        if (prop === null) return; if (!prop.trim()) view.filter=null; else { const op=prompt("Operator: equals, contains, not_equals, empty, not_empty, gt, gte, lt, lte, before, after, includes", view.filter?.rules?.[0]?.op || "equals"); if (op===null) return; const value=["empty","not_empty"].includes(op)?"":prompt("Filter value:", String(view.filter?.rules?.[0]?.value ?? "")); if (value===null) return; view.filter={mode:"and",rules:[{prop:prop.trim(),op:op.trim(),value}]}; } persist(); decorate();
      };
      el.querySelector('[data-c="sort"]').onclick = () => {
        const spec=prompt("Sorts as property:asc, property:desc (comma separated; blank clears):", (view.sorts||[]).map(s=>`${s.prop}:${s.direction}`).join(", "));
        if(spec===null)return; view.sorts=spec.trim()?spec.split(",").map(s=>{const [prop,direction]=s.trim().split(":");return {prop,direction:direction==="desc"?"desc":"asc"};}):[]; persist(); decorate();
      };
      el.querySelector('[data-c="props"]').onclick = () => {
        const spec=prompt("Visible property names/IDs in order (comma separated; blank = all):", Array.isArray(view.visibleProperties)?view.visibleProperties.join(", "):"");
        if(spec===null)return; const ids=spec.split(",").map(x=>x.trim()).filter(Boolean).map(key=>Engine.propByKey(state,key)?.id).filter(Boolean); view.visibleProperties=ids.length?ids:null; view.propertyOrder=ids.length?ids:null; persist(); decorate();
      };
    }

    function tableProjection(projection) {
      const allowed=new Set(projection.rows.map(r=>String(r.id))), order=new Map(projection.rows.map((r,i)=>[String(r.id),i]));
      const tbody=host.querySelector(".db-table tbody"); if(!tbody)return;
      const tableRows=[...tbody.querySelectorAll("tr.db-row")]; tableRows.forEach(tr=>tr.hidden=!allowed.has(String(tr.dataset.row)));
      const add=tbody.querySelector(".db-add-row"); tableRows.filter(r=>!r.hidden).sort((a,b)=>order.get(String(a.dataset.row))-order.get(String(b.dataset.row))).forEach(r=>tbody.insertBefore(r,add));
      const visible=new Set(projection.properties.map(p=>String(p.id))); host.querySelectorAll(".db-cell[data-prop]").forEach(cell=>cell.hidden=!visible.has(String(cell.dataset.prop)));
      const headers=[...host.querySelectorAll(".db-table thead th")]; state.properties.forEach((p,i)=>{if(headers[i])headers[i].hidden=!visible.has(String(p.id));});
      const count=host.querySelector(".db-footer-count"); if(count)count.textContent=`${projection.rows.length} ${projection.rows.length===1?"row":"rows"}`;
    }
    function boardProjection(projection) {
      const allowed=new Set(projection.rows.map(r=>String(r.id))), order=new Map(projection.rows.map((r,i)=>[String(r.id),i]));
      host.querySelectorAll(".board-col").forEach(col=>{const cards=[...col.querySelectorAll(".board-card")]; cards.forEach(c=>c.hidden=!allowed.has(String(c.dataset.row))); const add=col.querySelector(".board-add"); cards.filter(c=>!c.hidden).sort((a,b)=>order.get(String(a.dataset.row))-order.get(String(b.dataset.row))).forEach(c=>col.insertBefore(c,add)); const n=col.querySelector(".board-col-head .count"); if(n)n.textContent=cards.filter(c=>!c.hidden).length;});
    }
    function editableTitle(row, className="dv-title-edit") { const div=document.createElement("div"); div.className=className; div.contentEditable="true"; div.textContent=title(row); div.onblur=()=>{const p=titleProp(); if(p){const before=row.cells[p.id];row.cells[p.id]=div.textContent.trim();const result=persist();if(!result.ok){row.cells[p.id]=before;div.textContent=title(row);}}}; div.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();div.blur();}}; return div; }
    function listView(projection) {
      const wrap=document.createElement("div"); wrap.className="dv-custom-view dv-list"; const extras=projection.properties.filter(p=>p.type!=="title").slice(0,4);
      projection.rows.forEach(row=>{const item=document.createElement("div");item.className="dv-list-item";item.innerHTML='<div class="dv-list-icon">◫</div><div class="dv-list-main"></div>';const main=item.querySelector(".dv-list-main");main.appendChild(editableTitle(row));const meta=document.createElement("div");meta.className="dv-list-meta";meta.innerHTML=extras.map(p=>`<span><b>${esc(p.name)}</b> ${esc(Engine.displayValue(state,row,p))}</span>`).join("");main.appendChild(meta);wrap.appendChild(item);}); if(!projection.rows.length)wrap.innerHTML='<div class="dv-empty">No items match this view.</div>'; replaceBody(wrap);
    }
    function galleryView(projection) {
      const wrap=document.createElement("div");wrap.className="dv-custom-view dv-gallery";const extras=projection.properties.filter(p=>p.type!=="title").slice(0,3);
      projection.rows.forEach(row=>{const card=document.createElement("article");card.className="dv-gallery-card";card.innerHTML=`<div class="dv-card-cover">${esc(title(row).slice(0,1).toUpperCase()||"•")}</div><div class="dv-card-body"></div>`;const body=card.querySelector(".dv-card-body");body.appendChild(editableTitle(row));body.insertAdjacentHTML("beforeend",extras.map(p=>`<div class="dv-card-prop"><span>${esc(p.name)}</span><b>${esc(Engine.displayValue(state,row,p))}</b></div>`).join(""));wrap.appendChild(card);});if(!projection.rows.length)wrap.innerHTML='<div class="dv-empty">No items match this view.</div>';replaceBody(wrap);
    }
    function calendarView(view, projection) {
      const first=projection.rows.map(r=>Engine.dateForRow(state,r,view).date).find(Boolean); let cursor=calendarMonth.get(view.id) || (first?new Date(first+"T12:00:00"):new Date()); cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1);calendarMonth.set(view.id,cursor);
      const wrap=document.createElement("div");wrap.className="dv-custom-view dv-calendar";const top=document.createElement("div");top.className="dv-cal-top";top.innerHTML=`<button data-p>‹</button><strong>${cursor.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong><button data-t>Today</button><button data-n>›</button>`;wrap.appendChild(top);top.querySelector("[data-p]").onclick=()=>{calendarMonth.set(view.id,new Date(cursor.getFullYear(),cursor.getMonth()-1,1));calendarView(view,projection);};top.querySelector("[data-n]").onclick=()=>{calendarMonth.set(view.id,new Date(cursor.getFullYear(),cursor.getMonth()+1,1));calendarView(view,projection);};top.querySelector("[data-t]").onclick=()=>{calendarMonth.set(view.id,new Date());calendarView(view,projection);};
      const grid=document.createElement("div");grid.className="dv-cal-grid";["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(x=>{const h=document.createElement("div");h.className="dv-cal-head";h.textContent=x;grid.appendChild(h);});const start=new Date(cursor.getFullYear(),cursor.getMonth(),1-cursor.getDay());
      for(let i=0;i<42;i++){const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const cell=document.createElement("div");cell.className="dv-cal-day"+(d.getMonth()!==cursor.getMonth()?" muted":"");cell.dataset.date=iso;cell.innerHTML=`<div class="dv-cal-date">${d.getDate()}</div><div class="dv-cal-items"></div>`;const items=cell.querySelector(".dv-cal-items");projection.rows.forEach(row=>{const info=Engine.dateForRow(state,row,view);if(info.date!==iso)return;const chip=document.createElement("div");chip.className="dv-cal-chip";chip.draggable=true;chip.textContent=title(row);chip.dataset.row=row.id;chip.ondragstart=e=>e.dataTransfer.setData("text/plain",row.id);items.appendChild(chip);});cell.ondragover=e=>e.preventDefault();cell.ondrop=e=>{e.preventDefault();const row=state.rows.find(r=>String(r.id)===e.dataTransfer.getData("text/plain"));const info=row&&Engine.dateForRow(state,row,view);if(!row||!info.property)return;const prior=structuredClone(row.cells[info.property.id]);if(info.property.type==="date_range"){const old=row.cells[info.property.id];row.cells[info.property.id]={start:iso,end:old&&old.end&&old.end>=iso?old.end:null};}else row.cells[info.property.id]=iso;const result=persist();if(!result.ok)row.cells[info.property.id]=prior;decorate();};grid.appendChild(cell);}wrap.appendChild(grid);replaceBody(wrap);
    }

    function decorate() {
      if(decorating)return;decorating=true;observer?.disconnect();
      try{const view=currentView();if(!view)return;const projection=Engine.project(state,view);controls(view,projection);if(!projection.ok){let e=host.querySelector(".dv-error");if(!e){e=document.createElement("div");e.className="dv-error";host.querySelector(".dv-controls")?.after(e);}e.textContent=`Invalid view configuration: ${projection.errors.map(x=>x.code).join(" · ")}`;return;}host.querySelector(".dv-error")?.remove();const tabs=[...host.querySelectorAll(".db-view-tab:not(.db-view-add)")];tabs.forEach((tab,i)=>{const v=state.views[i];if(v){tab.dataset.viewType=v.type;tab.title=`${v.name} · ${v.type}`;}});if(view.type==="board")boardProjection(projection);else if(view.type==="list")listView(projection);else if(view.type==="calendar")calendarView(view,projection);else if(view.type==="gallery")galleryView(projection);else tableProjection(projection);}finally{decorating=false;observe();}
    }
    function addView() { const type=(prompt(`View type: ${TYPES.join(", ")}`,"table")||"").trim();if(!TYPES.includes(type))return;const name=prompt("View name:",type[0].toUpperCase()+type.slice(1));if(!name)return;const v=Engine.createView(type,state,name);state.views.push(v);const result=persist();if(!result.ok){state.views=state.views.filter((candidate)=>candidate!==v);return;}host.innerHTML="";api=base(host,state,opts);observe();requestAnimationFrame(()=>{const tabs=[...host.querySelectorAll(".db-view-tab:not(.db-view-add)")];tabs[tabs.length-1]?.click();decorate();}); }
    function capture(e){const add=e.target.closest&&e.target.closest(".db-view-add");if(add&&host.contains(add)){e.preventDefault();e.stopImmediatePropagation();addView();return;}if(e.target.closest&&e.target.closest(".db-view-tab"))setTimeout(decorate,0);}
    function observe(){if(!observer)observer=new MutationObserver(()=>{if(!decorating)requestAnimationFrame(decorate);});observer.disconnect();observer.observe(host,{childList:true,subtree:true});}
    host.addEventListener("click",capture,true);observe();requestAnimationFrame(decorate);
    return {getState:()=>api&&api.getState?api.getState():state};
  };
})();