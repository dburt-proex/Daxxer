// Deterministic local operator profile. Stores behavioral counters/preferences only;
// never page contents. Suggestions require explicit operator acceptance.
window.Daxxer = window.Daxxer || {};

(function () {
  const KEY = "daxxer.operatorProfile.v1";
  const VERSION = 1;
  const MAX_KEYS = 80;
  const DEFAULT = {
    schemaVersion: VERSION,
    preferences: { theme: "system", density: "comfortable", pageWidth: "normal" },
    counters: { commands: {}, views: {}, blockTypes: {}, pages: {} },
    acceptedSuggestions: [],
    dismissedSuggestions: [],
    updatedAt: null,
  };

  function clone(value) { return structuredClone(value); }
  function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function boundedCounterMap(value) {
    const entries = Object.entries(safeObject(value)).filter(([key, count]) => key && Number.isFinite(Number(count)) && Number(count) >= 0).slice(0, MAX_KEYS);
    return Object.fromEntries(entries.map(([key, count]) => [key, Math.floor(Number(count))]));
  }
  function normalize(value) {
    const source = safeObject(value); const next = clone(DEFAULT);
    next.preferences = { ...next.preferences, ...safeObject(source.preferences) };
    next.counters = {
      commands: boundedCounterMap(source.counters && source.counters.commands),
      views: boundedCounterMap(source.counters && source.counters.views),
      blockTypes: boundedCounterMap(source.counters && source.counters.blockTypes),
      pages: boundedCounterMap(source.counters && source.counters.pages),
    };
    next.acceptedSuggestions = Array.isArray(source.acceptedSuggestions) ? source.acceptedSuggestions.filter((x) => typeof x === "string").slice(-50) : [];
    next.dismissedSuggestions = Array.isArray(source.dismissedSuggestions) ? source.dismissedSuggestions.filter((x) => typeof x === "string").slice(-50) : [];
    next.updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : null;
    return next;
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { return clone(DEFAULT); }
  }
  function save(profile) {
    const next = normalize(profile); next.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }
  function increment(map, key) {
    if (!key) return;
    const normalizedKey = String(key).slice(0, 120);
    if (!Object.prototype.hasOwnProperty.call(map, normalizedKey) && Object.keys(map).length >= MAX_KEYS) return;
    map[normalizedKey] = (Number(map[normalizedKey]) || 0) + 1;
  }
  function record(kind, key) {
    const profile = load();
    if (kind === "command") increment(profile.counters.commands, key);
    else if (kind === "view") increment(profile.counters.views, key);
    else if (kind === "block") increment(profile.counters.blockTypes, key);
    else if (kind === "page") increment(profile.counters.pages, key);
    return save(profile);
  }
  function suggestions(profile = load()) {
    const out = [];
    const topView = Object.entries(profile.counters.views).sort((a,b) => b[1]-a[1])[0];
    if (topView && topView[1] >= 8) out.push({ id: `default-view:${topView[0]}`, kind: "defaultView", value: topView[0], reason: `Used ${topView[0]} view ${topView[1]} times.` });
    const topBlock = Object.entries(profile.counters.blockTypes).sort((a,b) => b[1]-a[1])[0];
    if (topBlock && topBlock[1] >= 12) out.push({ id: `template-block:${topBlock[0]}`, kind: "templateHint", value: topBlock[0], reason: `Created ${topBlock[0]} blocks ${topBlock[1]} times.` });
    const dismissed = new Set(profile.dismissedSuggestions); const accepted = new Set(profile.acceptedSuggestions);
    return out.filter((item) => !dismissed.has(item.id) && !accepted.has(item.id));
  }
  function decide(id, accepted) {
    const profile = load(); const target = accepted ? profile.acceptedSuggestions : profile.dismissedSuggestions;
    if (!target.includes(id)) target.push(id); return save(profile);
  }
  function setPreference(key, value) {
    if (!new Set(["theme", "density", "pageWidth"]).has(key)) return { ok:false, error:"unsupported_preference" };
    const profile = load(); profile.preferences[key] = String(value); return { ok:true, profile: save(profile) };
  }

  function wirePassiveEvents() {
    document.addEventListener("click", (event) => {
      const view = event.target.closest && event.target.closest(".db-view-tab[data-view-type]"); if (view) record("view", view.dataset.viewType);
      const slash = event.target.closest && event.target.closest("#slashMenu [data-type]"); if (slash) record("block", slash.dataset.type);
      const command = event.target.closest && event.target.closest("[data-act], [data-dv]"); if (command) record("command", command.dataset.act || command.dataset.dv);
    }, true);
    window.addEventListener("hashchange", () => { const match = location.hash.match(/\/page\/([^/?#]+)/); if (match) record("page", decodeURIComponent(match[1])); });
  }

  Daxxer.OperatorProfile = { KEY, VERSION, normalize, load, save, record, suggestions, decide, setPreference };
  if (typeof document !== "undefined") wirePassiveEvents();
})();