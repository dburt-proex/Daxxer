// Daxxer app shell: sidebar tree, routing, top bar, search, emoji picker.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const I = () => Daxxer.ICONS;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const api = async (path, opts) => {
    const res = await fetch("/api" + path, { headers: { "content-type": "application/json" }, ...opts });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
    return res.json();
  };

  const state = { sidebar: null, currentId: null, expanded: new Set(JSON.parse(localStorage.getItem("dx_expanded") || "[]")) };

  function toast(msg) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2000); }

  // ---- Universal overlay/popover dismissal (covers dynamically-created ones) ----
  function closeAllPopovers() { $$(".popover").forEach((p) => (p.hidden = true)); document.querySelectorAll("#optPop").forEach((p) => p.remove()); }
  function closeAllOverlays() {
    $$(".overlay").forEach((o) => { if (o.id) o.hidden = true; else o.remove(); });
    closeAllPopovers();
  }
  Daxxer.closeAll = closeAllOverlays;

  // ---- Global error boundary: one thrown error must never freeze the app ----
  window.addEventListener("error", (ev) => { try { console.error("[Daxxer]", ev.error || ev.message); toast("Something hiccuped — the app is still usable."); } catch {} });
  window.addEventListener("unhandledrejection", (ev) => { try { console.error("[Daxxer]", ev.reason); } catch {} });
  // Escape ALWAYS closes every overlay/popover, even ones added later (capture phase).
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllOverlays(); }, true);
  // Clicking any overlay backdrop (including dynamic modals) closes it.
  document.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("overlay")) { if (t.id) t.hidden = true; else t.remove(); }
  }, true);
  const saveExpanded = () => localStorage.setItem("dx_expanded", JSON.stringify([...state.expanded]));

  // ================= SIDEBAR =================
  async function loadSidebar() {
    state.sidebar = await api("/sidebar");
    $(".ws-name").textContent = state.sidebar.workspace.name;
    $(".ws-logo").textContent = state.sidebar.workspace.name[0];
    renderSidebar();
  }

  function childrenOf(parentId, teamspaceId) {
    return state.sidebar.pages.filter((p) =>
      p.parentId === parentId && (teamspaceId === undefined || p.teamspaceId === teamspaceId));
  }

  function treeRow(page, depth) {
    const kids = childrenOf(page.id);
    const isOpen = state.expanded.has(page.id);
    const row = document.createElement("div");
    const wrap = document.createElement("div");

    const r = document.createElement("div");
    r.className = "tree-row" + (page.id === state.currentId ? " active" : "") + (isOpen ? " open" : "");
    r.style.paddingLeft = 6 + depth * 12 + "px";
    r.innerHTML = `
      <span class="tree-toggle ${kids.length ? "" : "leaf"}">${I().chevron}</span>
      <span class="tree-ico">${page.icon || (page.type === "database" ? "🗂️" : "📄")}</span>
      <span class="tree-label">${esc(page.title || "Untitled")}</span>
      <span class="tree-actions">
        <button data-act="add" title="Add inside">${I().plus}</button>
        <button data-act="menu" title="More">${I().drag}</button>
      </span>`;
    r.querySelector(".tree-toggle").onclick = (e) => {
      e.stopPropagation();
      if (!kids.length) return;
      if (isOpen) state.expanded.delete(page.id); else state.expanded.add(page.id);
      saveExpanded(); renderSidebar();
    };
    r.onclick = () => openPage(page.id);
    r.querySelector('[data-act="add"]').onclick = async (e) => {
      e.stopPropagation();
      const np = await api("/pages", { method: "POST", body: JSON.stringify({ parentId: page.id, teamspaceId: page.teamspaceId, title: "Untitled" }) });
      state.expanded.add(page.id); saveExpanded();
      await loadSidebar(); openPage(np.id);
    };
    r.querySelector('[data-act="menu"]').onclick = (e) => { e.stopPropagation(); openPageMenu(page, e.currentTarget); };
    wrap.appendChild(r);

    if (isOpen && kids.length) {
      const c = document.createElement("div"); c.className = "tree-children";
      kids.forEach((k) => c.appendChild(treeRow(k, depth + 1)));
      wrap.appendChild(c);
    }
    row.appendChild(wrap);
    return row;
  }

  function renderSidebar() {
    // favorites
    const favList = $("#favList");
    const favs = state.sidebar.favorites.map((id) => state.sidebar.pages.find((p) => p.id === id)).filter(Boolean);
    $("#favSection").style.display = favs.length ? "" : "none";
    favList.innerHTML = "";
    favs.forEach((p) => favList.appendChild(favRow(p)));

    // teamspaces
    const tl = $("#teamspaceList"); tl.innerHTML = "";
    state.sidebar.teamspaces.forEach((ts) => {
      const head = document.createElement("div");
      head.className = "tree-row";
      head.innerHTML = `<span class="tree-toggle ${state.expanded.has(ts.id) ? "open" : ""}">${I().chevron}</span>
        <span class="tree-ico">${ts.icon || "📁"}</span><span class="tree-label" style="font-weight:500">${esc(ts.name)}</span>
        <span class="tree-actions"><button data-act="add">${I().plus}</button></span>`;
      const open = state.expanded.has(ts.id);
      if (open) head.classList.add("open");
      head.querySelector(".tree-toggle").onclick = () => { if (open) state.expanded.delete(ts.id); else state.expanded.add(ts.id); saveExpanded(); renderSidebar(); };
      head.querySelector('[data-act="add"]').onclick = async (e) => {
        e.stopPropagation();
        const np = await api("/pages", { method: "POST", body: JSON.stringify({ teamspaceId: ts.id, title: "Untitled" }) });
        state.expanded.add(ts.id); saveExpanded(); await loadSidebar(); openPage(np.id);
      };
      tl.appendChild(head);
      if (open) {
        const c = document.createElement("div"); c.className = "tree-children";
        childrenOf(null, ts.id).forEach((p) => c.appendChild(treeRow(p, 0)));
        if (!childrenOf(null, ts.id).length) c.innerHTML = `<div style="padding:4px 10px;color:var(--text-mute);font-size:13px">No pages inside</div>`;
        tl.appendChild(c);
      }
    });

    // private (pages with no teamspace) — usually none in seed
    const pl = $("#privateList"); pl.innerHTML = "";
    const priv = state.sidebar.pages.filter((p) => !p.teamspaceId && !p.parentId);
    $(".sb-section:has(#privateList)")?.style && ($(".sb-section:has(#privateList)").style.display = priv.length ? "" : "none");
    priv.forEach((p) => pl.appendChild(treeRow(p, 0)));
  }

  function favRow(p) {
    const r = document.createElement("div");
    r.className = "tree-row" + (p.id === state.currentId ? " active" : "");
    r.innerHTML = `<span class="tree-toggle leaf">${I().chevron}</span><span class="tree-ico">${p.icon || "📄"}</span><span class="tree-label">${esc(p.title)}</span>`;
    r.onclick = () => openPage(p.id);
    return r;
  }

  function openPageMenu(page, anchor) {
    const menu = $("#ctxMenu");
    const rect = anchor.getBoundingClientRect();
    menu.innerHTML = `<div class="menu-list">
      <div class="menu-item" data-act="fav">${I().page}${state.sidebar.favorites.includes(page.id) ? "Remove from favorites" : "Add to favorites"}</div>
      <div class="menu-item" data-act="add">${I().plus}Add page inside</div>
      <div class="menu-item" data-act="dup">${I().duplicate}Duplicate</div>
      <div class="menu-sep"></div>
      <div class="menu-item danger" data-act="del">${I().trash}Delete</div>
    </div>`;
    menu.hidden = false;
    menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 220) + "px";
    menu.style.left = Math.min(rect.left, window.innerWidth - 210) + "px";
    const close = () => { menu.hidden = true; document.removeEventListener("click", onDoc, true); };
    const onDoc = (e) => { if (!menu.contains(e.target)) close(); };
    menu.querySelectorAll("[data-act]").forEach((it) => (it.onclick = async () => {
      const act = it.dataset.act; close();
      if (act === "fav") { await api(`/pages/${page.id}/favorite`, { method: "POST" }); await loadSidebar(); }
      else if (act === "add") { const np = await api("/pages", { method: "POST", body: JSON.stringify({ parentId: page.id, teamspaceId: page.teamspaceId }) }); state.expanded.add(page.id); saveExpanded(); await loadSidebar(); openPage(np.id); }
      else if (act === "dup") { toast("Duplicate is a demo action"); }
      else if (act === "del") {
        if (confirm(`Move "${page.title}" and everything inside it to Trash?\n\n`
          + `Nothing is destroyed — the records stay on disk and can be restored from Trash.`)) {
          await api(`/pages/${page.id}`, { method: "DELETE" });
          await loadSidebar();
          if (state.currentId === page.id) { const first = state.sidebar.pages[0]; if (first) openPage(first.id); else $("#pageContainer").innerHTML = ""; }
          toast("Deleted");
        }
      }
    }));
    setTimeout(() => document.addEventListener("click", onDoc, true), 0);
  }

  // ================= HOME DASHBOARD =================
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Still up";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  // ---- Governance surfaces (Review queue / Trash) ----
  // Both reset the same topbar chrome a page would own, so navigating between
  // a page and a governance view never leaves a stale breadcrumb or gate badge.
  function resetChrome(icon, label) {
    state.currentId = null;
    location.hash = "";
    $("#breadcrumb").innerHTML = `<span class="crumb"><span>${icon}</span><span>${esc(label)}</span></span>`;
    $("#favBtn").classList.remove("on");
    $("#pageGate").innerHTML = "";
  }

  function openReviewQueue() {
    resetChrome("🛡️", "Review queue");
    Daxxer.Governance.renderReviewQueue($("#pageContainer"), {
      openPage,
      onNeedsSidebar: refreshReviewCount,
    });
  }

  function openTrash() {
    resetChrome("🗑️", "Trash");
    Daxxer.Governance.renderTrash($("#pageContainer"), {
      openPage,
      reloadSidebar: loadSidebar,
      toast,
    });
  }

  // The sidebar badge is the ambient signal that something needs a decision --
  // without it the review queue is a page nobody remembers to visit.
  async function refreshReviewCount() {
    try {
      const gov = await api("/governance");
      const n = (gov.counts.review || 0) + (gov.counts.halt || 0);
      const el = $("#reviewCount");
      if (!el) return;
      el.textContent = String(n);
      el.hidden = n === 0;
      el.classList.toggle("has-halt", (gov.counts.halt || 0) > 0);
    } catch { /* a failed count must never block the app */ }
  }

  function openHome() {
    state.currentId = null;
    location.hash = "";
    $("#pageGate").innerHTML = "";
    // reset topbar chrome so it doesn't show a stale page's breadcrumb
    $("#breadcrumb").innerHTML = `<span class="crumb"><span>🏠</span><span>Home</span></span>`;
    $("#favBtn").classList.remove("on");

    const c = $("#pageContainer");
    c.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "home-view";
    const user = state.sidebar.workspace.user;
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    // Hero
    const hero = document.createElement("div");
    hero.className = "home-hero";
    hero.innerHTML = `
      <div class="home-date">${esc(dateStr)}</div>
      <h1 class="home-greet">${esc(greeting())}, ${esc(user.name)}</h1>
    `;
    wrap.appendChild(hero);

    // Quick actions
    const qa = document.createElement("div");
    qa.className = "home-quick";
    qa.innerHTML = `
      <button class="home-quick-btn" data-act="new">${I().plus}<span>New page</span></button>
      <button class="home-quick-btn" data-act="search">${I().text}<span>Search</span></button>
      <button class="home-quick-btn" data-act="db">${I().database}<span>Open catalog</span></button>
    `;
    wrap.appendChild(qa);

    // Recents
    const rec = document.createElement("section");
    rec.className = "home-section";
    rec.innerHTML = `<div class="home-section-title">Recently visited</div>`;
    const recGrid = document.createElement("div");
    recGrid.className = "home-cards";
    const recents = (state.sidebar.recents || []).slice(0, 6);
    if (recents.length === 0) {
      recGrid.innerHTML = `<div class="home-empty">No recent pages yet.</div>`;
    } else {
      recents.forEach((r) => {
        const card = document.createElement("button");
        card.className = "home-card";
        card.innerHTML = `<div class="home-card-icon">${r.icon || "📄"}</div><div class="home-card-title">${esc(r.title)}</div><div class="home-card-type">${r.type === "database" ? "Database" : "Page"}</div>`;
        card.onclick = () => openPage(r.id);
        recGrid.appendChild(card);
      });
    }
    rec.appendChild(recGrid);
    wrap.appendChild(rec);

    // Favorites
    const favs = (state.sidebar.favorites || []).map((id) => state.sidebar.pages.find((p) => p.id === id)).filter(Boolean);
    if (favs.length) {
      const fs = document.createElement("section");
      fs.className = "home-section";
      fs.innerHTML = `<div class="home-section-title">Favorites</div>`;
      const grid = document.createElement("div"); grid.className = "home-cards";
      favs.forEach((p) => {
        const card = document.createElement("button");
        card.className = "home-card";
        card.innerHTML = `<div class="home-card-icon">${p.icon || "📄"}</div><div class="home-card-title">${esc(p.title)}</div><div class="home-card-type">${p.type === "database" ? "Database" : "Page"}</div>`;
        card.onclick = () => openPage(p.id);
        grid.appendChild(card);
      });
      fs.appendChild(grid);
      wrap.appendChild(fs);
    }

    // Teamspaces overview
    const ts = document.createElement("section");
    ts.className = "home-section";
    ts.innerHTML = `<div class="home-section-title">Your teamspaces</div>`;
    const tsGrid = document.createElement("div"); tsGrid.className = "home-cards";
    state.sidebar.teamspaces.forEach((t) => {
      const count = state.sidebar.pages.filter((p) => p.teamspaceId === t.id).length;
      const card = document.createElement("button");
      card.className = "home-card";
      card.innerHTML = `<div class="home-card-icon">${t.icon || "📁"}</div><div class="home-card-title">${esc(t.name)}</div><div class="home-card-type">${count} page${count === 1 ? "" : "s"}</div>`;
      card.onclick = () => {
        state.expanded.add(t.id); saveExpanded();
        const first = state.sidebar.pages.find((p) => p.teamspaceId === t.id);
        if (first) openPage(first.id); else renderSidebar();
      };
      tsGrid.appendChild(card);
    });
    ts.appendChild(tsGrid);
    wrap.appendChild(ts);

    c.appendChild(wrap);

    // wire quick actions
    qa.querySelector('[data-act="new"]').onclick = async () => {
      const tspace = state.sidebar.teamspaces[0];
      const np = await api("/pages", { method: "POST", body: JSON.stringify({ teamspaceId: tspace && tspace.id, title: "Untitled" }) });
      await loadSidebar(); openPage(np.id);
    };
    qa.querySelector('[data-act="search"]').onclick = openSearch;
    qa.querySelector('[data-act="db"]').onclick = () => {
      const db = state.sidebar.pages.find((p) => p.type === "database");
      if (db) openPage(db.id);
    };

    renderSidebar();
  }

  // ================= PAGE =================
  async function openPage(id) {
    state.currentId = id;
    location.hash = "/page/" + id;
    const page = await api("/pages/" + id);
    renderBreadcrumb(page);
    // Surface the record's gate wherever the record is. A governance state that
    // only appears in a dedicated screen is a state people forget exists.
    const gateEl = $("#pageGate");
    if (gateEl) {
      gateEl.innerHTML = page.gate_status && page.gate_status !== "ALLOW"
        ? Daxxer.Governance.gateBadge(page.gate_status, { long: true })
        : "";
      gateEl.onclick = () => Daxxer.Governance.openAuditPanel(id);
    }
    $("#favBtn").classList.toggle("on", page.isFavorite);
    renderPage(page);
    renderSidebar();
  }

  function renderBreadcrumb(page) {
    const bc = $("#breadcrumb"); bc.innerHTML = "";
    const crumbs = page.teamspace ? [{ id: null, title: page.teamspace.name, icon: page.teamspace.icon }, ...page.breadcrumb] : page.breadcrumb;
    crumbs.forEach((c, i) => {
      if (i > 0) { const sep = document.createElement("span"); sep.className = "crumb-sep"; sep.textContent = "/"; bc.appendChild(sep); }
      const el = document.createElement("span"); el.className = "crumb";
      el.innerHTML = `<span>${c.icon || ""}</span><span>${esc(c.title)}</span>`;
      if (c.id) el.onclick = () => openPage(c.id);
      bc.appendChild(el);
    });
  }

  function renderPage(page) {
    const c = $("#pageContainer");
    c.innerHTML = "";

    const icon = document.createElement("div");
    icon.className = "page-icon-lg";
    icon.textContent = page.icon || "📄";
    icon.onclick = () => Daxxer.pickEmoji(icon, async (e) => { icon.textContent = e; await api("/pages/" + page.id, { method: "PUT", body: JSON.stringify({ icon: e }) }); loadSidebar(); });
    c.appendChild(icon);

    const title = document.createElement("input");
    title.className = "page-title-input";
    title.value = page.title || "";
    title.placeholder = "Untitled";
    let tTimer;
    title.oninput = () => { clearTimeout(tTimer); tTimer = setTimeout(async () => { await api("/pages/" + page.id, { method: "PUT", body: JSON.stringify({ title: title.value }) }); const p = state.sidebar.pages.find((x) => x.id === page.id); if (p) p.title = title.value; renderSidebar(); renderBreadcrumb({ ...page, title: title.value }); }, 400); };
    title.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const first = c.querySelector(".editable, .ct-text"); if (first) first.focus(); } };
    c.appendChild(title);

    if (page.type === "database") {
      if (page.description) {
        const d = document.createElement("p"); d.className = "page-desc"; d.textContent = page.description; c.appendChild(d);
      }
      const dbc = document.createElement("div");
      c.appendChild(dbc);
      Daxxer.Database.mount(dbc, page, {
        onChange: (st) => api("/pages/" + page.id, { method: "PUT", body: JSON.stringify({ properties: st.properties, views: st.views, rows: st.rows }) }),
      });
    } else {
      const ec = document.createElement("div");
      c.appendChild(ec);
      Daxxer.Editor.mount(ec, page, {
        onChange: (blocks) => api("/pages/" + page.id, { method: "PUT", body: JSON.stringify({ blocks }) }),
      });
    }
  }

  // ================= EMOJI PICKER =================
  Daxxer.pickEmoji = function (anchor, cb) {
    const pop = $("#emojiPicker");
    const rect = anchor.getBoundingClientRect();
    function paint(filter = "") {
      const items = Daxxer.EMOJIS; // simple; no keyword search dataset
      pop.innerHTML = `<div class="emoji-grid">
        <input class="emoji-search" placeholder="Filter emoji…" />
        <div class="emoji-items">${items.map((e) => `<button data-e="${e}">${e}</button>`).join("")}</div>
        <div class="menu-sep"></div>
        <div style="display:flex;justify-content:space-between;padding:2px 2px 0"><button class="tb-btn" data-random>Random</button><button class="tb-btn" data-remove>Remove</button></div>
      </div>`;
      pop.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => { cb(b.dataset.e); close(); }));
      pop.querySelector("[data-random]").onclick = () => { cb(Daxxer.EMOJIS[Math.floor(Math.random() * Daxxer.EMOJIS.length)]); close(); };
      pop.querySelector("[data-remove]").onclick = () => { cb("📄"); close(); };
      pop.querySelector(".emoji-search").focus();
    }
    function close() { pop.hidden = true; document.removeEventListener("click", onDoc, true); }
    function onDoc(e) { if (!pop.contains(e.target) && e.target !== anchor) close(); }
    pop.hidden = false;
    pop.style.top = Math.min(rect.bottom + 6, window.innerHeight - 340) + "px";
    pop.style.left = Math.min(rect.left, window.innerWidth - 340) + "px";
    paint();
    setTimeout(() => document.addEventListener("click", onDoc, true), 0);
  };

  // ================= SEARCH =================
  let searchTimer;
  function closeAllOverlays() {
    $$(".overlay").forEach((o) => { o.hidden = true; });
    $$(".popover").forEach((p) => { p.hidden = true; });
    const si = $("#searchInput"); if (si) si.value = "";
    const sr = $("#searchResults"); if (sr) sr.innerHTML = `<div class="s-hint">Search pages, blocks, and database rows.</div>`;
  }
  function openSearch() {
    const ov = $("#searchOverlay");
    ov.hidden = false;
    ov.style.display = ""; // undo any leftover inline hiding
    setTimeout(() => $("#searchInput").focus(), 40);
  }
  // Expose escape hatch on window: user can always run `window.daxxerClose()` in devtools.
  window.daxxerClose = closeAllOverlays;
  async function runSearch(q) {
    const box = $("#searchResults");
    if (!q.trim()) { box.innerHTML = `<div class="s-hint">Search pages, blocks, and database rows.</div>`; return; }
    const { results } = await api("/search?q=" + encodeURIComponent(q));
    if (!results.length) { box.innerHTML = `<div class="s-hint">No results for "${esc(q)}".</div>`; return; }
    box.innerHTML = results.map((r) => `
      <div class="s-result" data-id="${r.id}">
        <div class="s-result-ico">${r.icon || "📄"}</div>
        <div class="s-result-main"><div class="s-result-title">${esc(r.title)}</div>${r.snippet ? `<div class="s-result-snip">${esc(r.snippet)}</div>` : ""}</div>
      </div>`).join("");
    $$(".s-result", box).forEach((el) => (el.onclick = () => { $("#searchOverlay").hidden = true; openPage(el.dataset.id); }));
  }

  // ================= WIRING =================
  function wire() {
    $("#searchOpen").onclick = openSearch;
    $("#searchClose").onclick = closeAllOverlays;
    $("#searchInput").oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(e.target.value), 140); };
    $("#searchInput").onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); closeAllOverlays(); } };
    $("#homeLink").onclick = () => openHome();
    $("#reviewLink").onclick = () => openReviewQueue();
    $("#trashLink").onclick = () => openTrash();
    $("#historyBtn").onclick = () => {
      if (!state.currentId) return toast("Open a page to see its history.");
      Daxxer.Governance.openAuditPanel(state.currentId);
    };
    $("#moreBtn").onclick = (e) => { if (state.currentId) { const p = state.sidebar.pages.find((x) => x.id === state.currentId); if (p) openPageMenu(p, e.currentTarget); } };
    $("#favBtn").onclick = async () => { if (!state.currentId) return; await api(`/pages/${state.currentId}/favorite`, { method: "POST" }); await loadSidebar(); openPage(state.currentId); };
    $("#newPageBtn").onclick = async () => {
      const ts = state.sidebar.teamspaces[0];
      const np = await api("/pages", { method: "POST", body: JSON.stringify({ teamspaceId: ts && ts.id, title: "Untitled" }) });
      await loadSidebar(); openPage(np.id);
    };
    $("#collapseBtn").onclick = () => { $("#sidebar").classList.add("collapsed"); $("#expandBtn").hidden = false; };
    $("#expandBtn").onclick = () => { $("#sidebar").classList.remove("collapsed"); $("#expandBtn").hidden = true; };
    $("#wsSwitcher").onclick = () => toast("Workspace: Daxxer");

    // ANY click on an overlay backdrop closes it. Modal content stops propagation itself if needed.
    $$(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o) closeAllOverlays(); }));
    // ESC anywhere always closes overlays.
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "k") { e.preventDefault(); return openSearch(); }
      if (e.key === "Escape") { e.preventDefault(); return closeAllOverlays(); }

      // Quick capture: one keystroke from anywhere to a new page, cursor in the
      // title. Capture friction is what decides whether a system gets used.
      if (mod && e.key.toLowerCase() === "n" && !e.shiftKey) { e.preventDefault(); return quickCapture(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "r") { e.preventDefault(); return openReviewQueue(); }
      if (mod && e.key === "/") { e.preventDefault(); return showShortcuts(); }

      // Single-key navigation, only when not typing.
      if (!typing && !mod && e.key === "g") {
        state._gPrefix = true;
        setTimeout(() => { state._gPrefix = false; }, 700);
        return;
      }
      if (!typing && !mod && state._gPrefix) {
        state._gPrefix = false;
        if (e.key === "h") { e.preventDefault(); return openHome(); }
        if (e.key === "r") { e.preventDefault(); return openReviewQueue(); }
        if (e.key === "t") { e.preventDefault(); return openTrash(); }
      }
    }, true);
  }

  // Creates a page in the current teamspace and drops the cursor in the title.
  async function quickCapture() {
    try {
      const current = state.currentId
        ? state.sidebar.pages.find((p) => p.id === state.currentId)
        : null;
      const tsId = (current && current.teamspaceId)
        || (state.sidebar.teamspaces[0] && state.sidebar.teamspaces[0].id);
      const np = await api("/pages", {
        method: "POST",
        body: JSON.stringify({ teamspaceId: tsId, title: "" }),
      });
      await loadSidebar();
      await openPage(np.id);
      const title = $("#pageContainer .page-title-input");
      if (title) { title.focus(); title.select && title.select(); }
      toast("New page — start typing");
    } catch (err) {
      toast("Could not create page: " + err.message);
    }
  }

  function showShortcuts() {
    document.querySelectorAll(".sc-overlay").forEach((n) => n.remove());
    const rows = [
      ["Ctrl/⌘ K", "Search"],
      ["Ctrl/⌘ N", "New page"],
      ["Ctrl/⌘ ⇧ R", "Review queue"],
      ["g then h", "Go home"],
      ["g then r", "Go to review queue"],
      ["g then t", "Go to trash"],
      ["Ctrl/⌘ /", "This help"],
      ["Esc", "Close anything"],
    ];
    const o = document.createElement("div");
    o.className = "overlay sc-overlay";
    o.innerHTML = `<div class="sc-modal">
      <div class="sc-title">Keyboard shortcuts</div>
      <div class="sc-list">${rows.map(([k, d]) =>
        `<div class="sc-row"><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join("")}</div>
    </div>`;
    document.body.appendChild(o);
    o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
  }

  // ================= BOOT =================
  async function boot() {
    // Bulletproof: force-hide every overlay / popover on startup, no matter what.
    $$(".overlay").forEach((o) => { o.hidden = true; o.style.display = "none"; });
    $$(".popover").forEach((p) => { p.hidden = true; p.style.display = "none"; });
    // Reset overlays' display once they've been hidden, so the CSS class controls them again.
    setTimeout(() => {
      $$(".overlay, .popover").forEach((el) => { el.style.display = ""; });
    }, 0);
    wire();
    await loadSidebar();
    refreshReviewCount();
    const m = location.hash.match(/\/page\/(.+)$/);
    if (m && m[1]) { openPage(m[1]); return; }
    // Default landing: the Home dashboard.
    openHome();
  }
  boot().catch((e) => { document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">Failed to start Daxxer: ${esc(e.message)}<br><br>Run <code>node server.js</code> in the daxxer folder.</div>`; });
})();
