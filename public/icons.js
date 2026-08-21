// Shared icons, block-type registry, tag colors, and the emoji set.
window.Daxxer = window.Daxxer || {};

Daxxer.ICONS = {
  text: '<svg viewBox="0 0 24 24"><path d="M5 5h14M5 5v3M12 5v14M9 19h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  h1: '<svg viewBox="0 0 24 24"><path d="M4 6v12M12 6v12M4 12h8M17 9l3-1v10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  h2: '<svg viewBox="0 0 24 24"><path d="M4 6v12M11 6v12M4 12h7M16 9a2.5 2.5 0 0 1 4 2c0 2-4 3-4 6h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  h3: '<svg viewBox="0 0 24 24"><path d="M4 6v12M11 6v12M4 12h7M16 8h4l-2.5 3.5A2.3 2.3 0 1 1 15 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bullet: '<svg viewBox="0 0 24 24"><circle cx="5" cy="7" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="17" r="1.4"/><path d="M10 7h10M10 12h10M10 17h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  numbered: '<svg viewBox="0 0 24 24"><path d="M4 6h1v4M10 7h10M10 12h10M10 17h10M4 14h2l-2 3h2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  todo: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 12l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  toggle: '<svg viewBox="0 0 24 24"><path d="M8 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quote: '<svg viewBox="0 0 24 24"><path d="M6 7H4v6h4V9M18 7h-2v6h4V9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  callout: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3zM9 20h6M10 22h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  divider: '<svg viewBox="0 0 24 24"><path d="M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  database: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 9h16M4 14h16M10 4v16" stroke="currentColor" stroke-width="1.4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M8 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  drag: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  duplicate: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  table: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h18M9 5v14" stroke="currentColor" stroke-width="1.4"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="4" width="5" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="17" y="4" width="4" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

Daxxer.BLOCK_TYPES = [
  { type: "paragraph", name: "Text", desc: "Just start writing plain text.", icon: "text", group: "Basic" },
  { type: "heading1", name: "Heading 1", desc: "Big section heading.", icon: "h1", group: "Basic" },
  { type: "heading2", name: "Heading 2", desc: "Medium section heading.", icon: "h2", group: "Basic" },
  { type: "heading3", name: "Heading 3", desc: "Small section heading.", icon: "h3", group: "Basic" },
  { type: "toggle_heading1", name: "Toggle heading 1", desc: "Large collapsible section heading.", icon: "h1", group: "Basic" },
  { type: "toggle_heading2", name: "Toggle heading 2", desc: "Medium collapsible section heading.", icon: "h2", group: "Basic" },
  { type: "toggle_heading3", name: "Toggle heading 3", desc: "Small collapsible section heading.", icon: "h3", group: "Basic" },
  { type: "bulleted", name: "Bulleted list", desc: "Simple bulleted list.", icon: "bullet", group: "Basic" },
  { type: "numbered", name: "Numbered list", desc: "List with numbering.", icon: "numbered", group: "Basic" },
  { type: "todo", name: "To-do list", desc: "Track tasks with a checkbox.", icon: "todo", group: "Basic" },
  { type: "toggle", name: "Toggle list", desc: "Collapsible content.", icon: "toggle", group: "Basic" },
  { type: "quote", name: "Quote", desc: "Capture a quote.", icon: "quote", group: "Basic" },
  { type: "callout", name: "Callout", desc: "Make writing stand out.", icon: "callout", group: "Basic" },
  { type: "divider", name: "Divider", desc: "Visually divide blocks.", icon: "divider", group: "Basic" },
  { type: "code", name: "Code", desc: "Capture a code snippet.", icon: "code", group: "Media" },
];

Daxxer.TAG_COLORS = ["gray", "blue", "orange", "green", "yellow", "purple", "red", "pink"];
Daxxer.SWATCH = {
  gray: "#eceef1", blue: "#e3edfd", orange: "#ffe9d6", green: "#dcf5e6",
  yellow: "#fdf1cf", purple: "#efe6fc", red: "#fde3e1", pink: "#fce4f1",
};

Daxxer.EMOJIS = "📄 📝 📕 📗 📘 📙 📚 📖 🗂️ 📁 📂 🗃️ 🗄️ 📊 📈 📉 💼 💰 💵 💳 🏦 🎯 🚀 🔥 ⭐ ✨ 💡 🧠 🧩 ⚙️ 🛠️ 🔧 🔨 🧰 🖥️ 💻 ⌨️ 🖱️ 📱 🔌 🔋 🌐 🔗 📡 🛰️ ✅ ☑️ 📌 📍 🏷️ 🔖 📎 ✏️ 🖊️ 🖍️ 🎨 🖌️ 🏠 🏢 🏭 🏗️ 🧱 🅱️ 🔻 🔺 🏆 🥇 🎖️ 👑 🦄 🐝 🐙 🦋 🌱 🌿 🍀 🌻 🌊 ⚡ ❄️ 🔮".split(" ");

Daxxer.optName = (prop, id) => { const o = (prop.options || []).find((x) => x.id === id); return o ? o.name : ""; };
Daxxer.optColor = (prop, id) => { const o = (prop.options || []).find((x) => x.id === id); return o ? o.color : "gray"; };
