// Seed workspace for Daxxer: teamspaces, doc pages made of blocks, and a
// typed database — mirroring the structure of a real workspace.

let _n = 0;
const uid = (p) => p + "_" + (++_n).toString(36) + Date.now().toString(36).slice(-4);

function block(type, text, extra = {}) {
  return { id: uid("b"), type, text: text || "", ...extra };
}

export function buildSeed() {
  _n = 0;
  const now = new Date().toISOString();

  // ---- Database: Master Products & Offers Catalog ----
  const propOffer = { id: "p_offer", name: "Offer", type: "title" };
  const propProject = { id: "p_project", name: "Project", type: "select",
    options: [
      { id: "o1", name: "Rochester Junk Removal", color: "gray" },
      { id: "o2", name: "Aevum", color: "gray" },
      { id: "o3", name: "PromptBP", color: "orange" },
      { id: "o4", name: "JobTap", color: "yellow" },
      { id: "o5", name: "Daxxer", color: "blue" },
    ] };
  const propType = { id: "p_type", name: "Type", type: "select",
    options: [
      { id: "t1", name: "Local Service", color: "orange" },
      { id: "t2", name: "Productized Service", color: "green" },
      { id: "t3", name: "Digital Product", color: "blue" },
      { id: "t4", name: "Software System", color: "purple" },
    ] };
  const propMaturity = { id: "p_mat", name: "Maturity", type: "status",
    options: [
      { id: "m1", name: "Idea", color: "gray" },
      { id: "m2", name: "Built", color: "purple" },
      { id: "m3", name: "Ready to Sell", color: "blue" },
      { id: "m4", name: "Live", color: "green" },
    ] };
  const propRevenue = { id: "p_rev", name: "Revenue Now", type: "checkbox" };

  const db = {
    id: "db_catalog",
    type: "database",
    icon: "💼",
    title: "Master Products & Offers Catalog",
    description:
      "Comprehensive inventory of Drew Burt's products, services, implementations, software systems, templates, content assets, and monetization opportunities.",
    parentId: null,
    teamspaceId: "ts_burt",
    properties: [propOffer, propProject, propType, propMaturity, propRevenue],
    views: [
      { id: "v_default", name: "Default view", type: "table" },
      { id: "v_all", name: "All Offers", type: "table" },
      { id: "v_rev", name: "Revenue Now", type: "table", filter: { prop: "p_rev", equals: true } },
      { id: "v_board", name: "By Maturity", type: "board", groupBy: "p_mat" },
      { id: "v_gallery", name: "Gallery", type: "table" },
    ],
    rows: [
      { id: uid("r"), cells: { p_offer: "Rochester Junk Removal — Full Load Service", p_project: "o1", p_type: "t1", p_mat: "m4", p_rev: true } },
      { id: uid("r"), cells: { p_offer: "Custom Notion AI Workspace Build", p_project: "o2", p_type: "t2", p_mat: "m3", p_rev: true } },
      { id: uid("r"), cells: { p_offer: "PromptBP: The Operator's Blueprint", p_project: "o3", p_type: "t3", p_mat: "m3", p_rev: false } },
      { id: uid("r"), cells: { p_offer: "JobTap Contractor Lead Pilot", p_project: "o4", p_type: "t2", p_mat: "m2", p_rev: true } },
      { id: uid("r"), cells: { p_offer: "Daxxer Workspace App", p_project: "o5", p_type: "t4", p_mat: "m2", p_rev: false } },
      { id: uid("r"), cells: { p_offer: "Agent Ops Retainer", p_project: "o2", p_type: "t2", p_mat: "m1", p_rev: false } },
    ],
    createdAt: now,
    updatedAt: now,
  };

  // ---- Doc pages ----
  const pProducts = {
    id: "pg_products", type: "page", icon: "💼", title: "Products & Offers",
    parentId: null, teamspaceId: "ts_burt",
    blocks: [
      block("callout", "This teamspace tracks every offer from idea to live revenue. Start in the catalog below.", { emoji: "💡", color: "blue" }),
      block("heading2", "How this works"),
      block("bulleted", "Every offer is a row in the Master Catalog."),
      block("bulleted", "Maturity moves Idea → Built → Ready to Sell → Live."),
      block("bulleted", "Flip \"Revenue Now\" for anything actively earning."),
      block("heading2", "This week"),
      block("todo", "Ship JobTap contractor lead pilot", { checked: false }),
      block("todo", "Package PromptBP as a paid download", { checked: true }),
      block("todo", "Write Daxxer landing page copy", { checked: false }),
      block("divider", ""),
      block("quote", "Storage is a commodity. The value moment is retrieval — and revenue."),
    ],
    createdAt: now, updatedAt: now,
  };

  const pProduction = {
    id: "pg_prod", type: "page", icon: "💰", title: "PRODUCTION",
    parentId: null, teamspaceId: "ts_burt",
    blocks: [
      block("heading1", "Production Pipeline"),
      block("paragraph", "Everything currently in build or shipping this quarter."),
      block("heading3", "In progress"),
      block("toggle", "Daxxer Workspace App", { color: "orange", children: [
        block("paragraph", "Block-based workspace clone. White/blue/orange theme."),
        block("todo", "Block editor with slash menu", { checked: true }),
        block("todo", "Database table + board views", { checked: true }),
        block("todo", "Ship v1", { checked: false }),
      ] }),
      block("toggle", "Content Engine", { children: [
        block("paragraph", "Repurposes long-form into channel-native posts."),
      ] }),
      block("code", "npm run build && npm run deploy", { lang: "bash" }),
    ],
    createdAt: now, updatedAt: now,
  };

  const pLanding = {
    id: "pg_landing", type: "page", icon: "🔥", title: "Agent Ops Landing Page — Copy",
    parentId: "pg_prod", teamspaceId: "ts_burt",
    blocks: [
      block("heading1", "Agent Ops"),
      block("heading2", "Ship AI systems that actually run your business."),
      block("paragraph", "We design, build, and govern the agent stack so you can focus on the work only you can do."),
      block("callout", "Booking 2 new build slots this month.", { emoji: "📅", color: "orange" }),
    ],
    createdAt: now, updatedAt: now,
  };

  const pAssets = {
    id: "pg_assets", type: "page", icon: "🗄️", title: "Asset Vault",
    parentId: null, teamspaceId: "ts_web",
    blocks: [
      block("heading2", "Brand assets"),
      block("bulleted", "Logos, color tokens, and type scale live here."),
      block("paragraph", "Daxxer palette: white background, blue #2563eb, orange #f97316."),
    ],
    createdAt: now, updatedAt: now,
  };

  const pMemory = {
    id: "pg_memory", type: "page", icon: "🧠", title: "Working memory",
    parentId: null, teamspaceId: "ts_mem",
    blocks: [
      block("heading2", "Notes I keep coming back to"),
      block("bulleted", "Save a debugging session by its symptom, not its cause."),
      block("bulleted", "Hybrid search beats pure vector search on small corpora."),
      block("bulleted", "Treat all retrieved context as untrusted input."),
    ],
    createdAt: now, updatedAt: now,
  };

  const pCasa = {
    id: "pg_casa", type: "page", icon: "🏠", title: "CASA — Governance model",
    parentId: null, teamspaceId: "ts_casa",
    blocks: [
      block("heading1", "CASA routing"),
      block("paragraph", "Every action is routed to one of three lanes before it runs."),
      block("callout", "ALLOW — reversible, low-risk, useful. Just do it.", { emoji: "✅", color: "green" }),
      block("callout", "REVIEW — external, financial, brand-sensitive. Confirm first.", { emoji: "⚠️", color: "orange" }),
      block("callout", "HALT — destructive, unsafe, credential-exposing. Refuse.", { emoji: "⛔", color: "red" }),
    ],
    createdAt: now, updatedAt: now,
  };

  const teamspaces = [
    { id: "ts_burt", name: "Burt & Co.", icon: "🅱️" },
    { id: "ts_web", name: "Web Design", icon: "🔻" },
    { id: "ts_casa", name: "CASA Dream Team", icon: "🏆" },
    { id: "ts_mem", name: "persistant memory", icon: "📈" },
  ];

  const pages = [db, pProducts, pProduction, pLanding, pAssets, pMemory, pCasa];

  return {
    workspace: { name: "Daxxer", user: { name: "Drew", initials: "D" } },
    teamspaces,
    pages,
    favorites: ["db_catalog", "pg_products"],
    recents: ["db_catalog", "pg_products", "pg_prod", "pg_landing"],
  };
}
