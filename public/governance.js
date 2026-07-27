// Daxxer governance surface.
//
// Everything in this file exists only because records are governed. The block
// editor and databases would work identically without it — this is the layer
// that makes the ALLOW/REVIEW/HALT gate, the tamper-evident audit chain, and
// the archive visible in the product instead of only in the CLI.
//
// Three surfaces: Review Queue (what is waiting on a human), Trash (what was
// archived, and how to bring it back), and the per-page Audit trail.
window.Daxxer = window.Daxxer || {};

(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const api = async (path, opts) => {
    const res = await fetch("/api" + path, {
      headers: { "content-type": "application/json" }, ...opts,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
    return res.json();
  };

  // Relative time without pulling in a date library.
  function ago(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const secs = Math.max(0, (Date.now() - then) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  // A gate is not decoration — it is the state of the record. Rendered
  // consistently everywhere so it reads the same in a list, a header, or a log.
  function gateBadge(gate, opts = {}) {
    const g = String(gate || "ALLOW").toUpperCase();
    const label = opts.long
      ? { ALLOW: "Allowed", REVIEW: "Needs review", HALT: "Halted" }[g] || g
      : g;
    return `<span class="gate gate-${g.toLowerCase()}" title="${esc(gateTitle(g))}">${esc(label)}</span>`;
  }

  function gateTitle(g) {
    return {
      ALLOW: "Reversible and low-risk. Committed without a human gate.",
      REVIEW: "Waiting on a human decision before it is treated as settled.",
      HALT: "Blocked. Resolve the underlying condition — a HALT is not overridable.",
    }[g] || g;
  }

  Daxxer.gateBadge = gateBadge;

  // ================= REVIEW QUEUE =================

  async function renderReviewQueue(container, { openPage, onNeedsSidebar }) {
    container.innerHTML = `<div class="gov-loading">Loading governance state…</div>`;
    let data;
    try {
      data = await api("/governance");
    } catch (err) {
      container.innerHTML = `<div class="gov-error">Could not read governance state: ${esc(err.message)}</div>`;
      return;
    }

    const { queue, counts, health, recentEvents } = data;
    const wrap = document.createElement("div");
    wrap.className = "gov-view";

    wrap.innerHTML = `
      <div class="gov-head">
        <h1>Review queue</h1>
        <p class="gov-sub">Records whose state is not settled. A HALT blocks until its
        condition is resolved; a REVIEW is waiting on your decision.</p>
      </div>
      <div class="gov-stats">
        <div class="gov-stat ${counts.halt ? "is-halt" : ""}">
          <div class="gov-stat-n">${counts.halt}</div><div class="gov-stat-l">Halted</div></div>
        <div class="gov-stat ${counts.review ? "is-review" : ""}">
          <div class="gov-stat-n">${counts.review}</div><div class="gov-stat-l">Needs review</div></div>
        <div class="gov-stat"><div class="gov-stat-n">${counts.total}</div>
          <div class="gov-stat-l">Active records</div></div>
        <div class="gov-stat ${counts.unreviewedAi ? "is-review" : ""}">
          <div class="gov-stat-n">${counts.unreviewedAi}</div>
          <div class="gov-stat-l">Unreviewed AI</div></div>
      </div>
      <div class="gov-health" id="govHealth"></div>
      <section class="gov-section">
        <div class="gov-section-title">Waiting on you</div>
        <div class="gov-list" id="govQueue"></div>
      </section>
      <section class="gov-section">
        <div class="gov-section-title">Recent activity</div>
        <div class="gov-log" id="govLog"></div>
      </section>
    `;
    container.innerHTML = "";
    container.appendChild(wrap);

    // ---- health strip: the three things that decide whether any of this is trustworthy
    const healthEl = wrap.querySelector("#govHealth");
    const rows = [
      ["Audit chain", health.auditChain],
      ["Index", health.index],
      ["Schema", health.schema],
    ];
    healthEl.innerHTML = rows.map(([label, h]) => `
      <div class="gov-health-item ${h.ok ? "ok" : "bad"}">
        <span class="gov-dot"></span>
        <span class="gov-health-l">${esc(label)}</span>
        <span class="gov-health-d">${esc(h.detail)}</span>
      </div>`).join("");

    // ---- the queue itself
    const queueEl = wrap.querySelector("#govQueue");
    if (!queue.length) {
      queueEl.innerHTML = `<div class="gov-empty">Nothing is waiting on a decision. Everything
        active is in an ALLOW state.</div>`;
    } else {
      queue.forEach((item) => {
        const row = document.createElement("div");
        row.className = "gov-row";
        const isPage = item.object_type === "page";
        row.innerHTML = `
          <span class="gov-row-icon">${esc(item.icon || (isPage ? "📄" : "•"))}</span>
          <span class="gov-row-main">
            <span class="gov-row-title">${esc(item.title || "Untitled")}</span>
            <span class="gov-row-meta">${esc(item.object_type)}${
              item.risk_level && item.risk_level !== "low" ? ` · risk: ${esc(item.risk_level)}` : ""
            }${item.owner ? ` · ${esc(item.owner)}` : ""} · ${esc(ago(item.updated_at))}</span>
          </span>
          ${gateBadge(item.gate_status)}
          <span class="gov-row-actions">
            ${isPage ? `<button class="gov-btn" data-open="${esc(item.id)}">Open</button>` : ""}
            <button class="gov-btn ghost" data-audit="${esc(item.id)}">History</button>
          </span>
        `;
        queueEl.appendChild(row);
      });
      queueEl.onclick = (e) => {
        const open = e.target.closest("[data-open]");
        if (open && openPage) return openPage(open.getAttribute("data-open"));
        const aud = e.target.closest("[data-audit]");
        if (aud) return openAuditPanel(aud.getAttribute("data-audit"));
      };
    }

    // ---- recent audit events
    const logEl = wrap.querySelector("#govLog");
    if (!recentEvents.length) {
      logEl.innerHTML = `<div class="gov-empty">No activity recorded yet.</div>`;
    } else {
      logEl.innerHTML = recentEvents.map((e) => `
        <div class="gov-ev">
          ${gateBadge(e.gate)}
          <span class="gov-ev-action">${esc(String(e.action || "").replace(/_/g, " "))}</span>
          <span class="gov-ev-actor">${esc(e.actor || "")}</span>
          <span class="gov-ev-time">${esc(ago(e.timestamp))}</span>
        </div>`).join("");
    }

    if (onNeedsSidebar) onNeedsSidebar();
  }

  // ================= TRASH =================

  async function renderTrash(container, { openPage, reloadSidebar, toast }) {
    container.innerHTML = `<div class="gov-loading">Loading archive…</div>`;
    let items;
    try {
      items = (await api("/archived")).items;
    } catch (err) {
      container.innerHTML = `<div class="gov-error">Could not read the archive: ${esc(err.message)}</div>`;
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "gov-view";
    wrap.innerHTML = `
      <div class="gov-head">
        <h1>Trash</h1>
        <p class="gov-sub">Deleting in Daxxer archives instead of destroying. Every record
        below still exists on disk as a Markdown file and can be restored — the removal
        itself was logged to the audit trail.</p>
      </div>
      <div class="gov-list" id="trashList"></div>
    `;
    container.innerHTML = "";
    container.appendChild(wrap);

    const list = wrap.querySelector("#trashList");
    if (!items.length) {
      list.innerHTML = `<div class="gov-empty">Trash is empty.</div>`;
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "gov-row";
      row.innerHTML = `
        <span class="gov-row-icon">${esc(item.icon || "📄")}</span>
        <span class="gov-row-main">
          <span class="gov-row-title">${esc(item.title || "Untitled")}</span>
          <span class="gov-row-meta">${esc(item.objectType)}${
            item.type && item.type !== item.objectType ? ` · ${esc(item.type)}` : ""
          } · archived ${esc(ago(item.archivedAt))}</span>
        </span>
        <span class="gov-row-actions">
          <button class="gov-btn" data-restore="${esc(item.id)}">Restore</button>
          <button class="gov-btn ghost" data-audit="${esc(item.id)}">History</button>
        </span>
      `;
      list.appendChild(row);
    });

    list.onclick = async (e) => {
      const aud = e.target.closest("[data-audit]");
      if (aud) return openAuditPanel(aud.getAttribute("data-audit"));
      const btn = e.target.closest("[data-restore]");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Restoring…";
      try {
        const r = await api(`/pages/${btn.getAttribute("data-restore")}/restore`, { method: "POST" });
        if (toast) {
          toast(r.gate && r.gate !== "ALLOW"
            ? `Restored — now ${r.gate}: ${(r.reasons || []).join("; ") || "needs review"}`
            : "Restored.");
        }
        if (reloadSidebar) await reloadSidebar();
        renderTrash(container, { openPage, reloadSidebar, toast });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Restore";
        if (toast) toast("Could not restore: " + err.message);
      }
    };
  }

  // ================= AUDIT PANEL =================

  async function openAuditPanel(objectId) {
    document.querySelectorAll(".audit-overlay").forEach((n) => n.remove());
    const overlay = document.createElement("div");
    overlay.className = "overlay audit-overlay";
    overlay.innerHTML = `
      <div class="audit-modal">
        <div class="audit-head">
          <div>
            <div class="audit-title">Record history</div>
            <div class="audit-sub">Every state change, and the gate it passed through.</div>
          </div>
          <button class="s-close" data-close>✕</button>
        </div>
        <div class="audit-body"><div class="gov-loading">Loading…</div></div>
        <div class="audit-foot">
          <span class="audit-verify" id="auditVerify">Checking chain integrity…</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-close]")) overlay.remove();
    });

    const body = overlay.querySelector(".audit-body");
    try {
      const { events } = await api(`/pages/${objectId}/audit`);
      if (!events.length) {
        body.innerHTML = `<div class="gov-empty">No recorded history for this record.</div>`;
      } else {
        body.innerHTML = events.slice().reverse().map((e) => `
          <div class="audit-ev">
            <div class="audit-ev-dot ${esc(String(e.gate || "").toLowerCase())}"></div>
            <div class="audit-ev-body">
              <div class="audit-ev-top">
                <span class="audit-ev-action">${esc(String(e.action || "").replace(/_/g, " "))}</span>
                ${gateBadge(e.gate)}
              </div>
              <div class="audit-ev-meta">${esc(e.actor || "")}${
                e.actorType && e.actorType !== "human" ? ` (${esc(e.actorType)})` : ""
              } · ${esc(new Date(e.timestamp).toLocaleString())}</div>
              ${e.reason ? `<div class="audit-ev-reason">${esc(e.reason)}</div>` : ""}
            </div>
          </div>`).join("");
      }
      // The chain claim is only worth showing if it is actually checked.
      const gov = await api("/governance");
      const chain = gov.health.auditChain;
      const v = overlay.querySelector("#auditVerify");
      v.className = "audit-verify " + (chain.ok ? "ok" : "bad");
      v.textContent = chain.ok
        ? `Tamper-evident chain verified — ${chain.events} events, intact.`
        : `Chain problem: ${chain.detail}`;
    } catch (err) {
      body.innerHTML = `<div class="gov-error">Could not load history: ${esc(err.message)}</div>`;
    }
  }

  Daxxer.Governance = {
    renderReviewQueue,
    renderTrash,
    openAuditPanel,
    gateBadge,
    ago,
  };
})();
