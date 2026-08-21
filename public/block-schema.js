// Versioned, non-destructive block content contract for Daxxer pages.
// v1 is additive over the legacy {id,type,text,...,children} shape so old pages
// remain readable and downgrade can preserve meaning + IDs.
window.Daxxer = window.Daxxer || {};

(function () {
  const CURRENT_VERSION = 1;
  const KNOWN_BLOCK_TYPES = new Set([
    "paragraph", "heading1", "heading2", "heading3", "bulleted", "numbered",
    "todo", "toggle", "quote", "callout", "divider", "code",
  ]);
  const BOOLEAN_MARKS = ["bold", "italic", "underline", "strike", "code"];

  function clone(value) {
    return structuredClone(value);
  }

  function plainText(richText) {
    if (!Array.isArray(richText)) return "";
    return richText.map((segment) => segment && typeof segment.text === "string" ? segment.text : "").join("");
  }

  function cleanMarks(marks) {
    if (marks == null) return {};
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) return null;
    const out = {};
    for (const key of BOOLEAN_MARKS) {
      if (marks[key] === true) out[key] = true;
      else if (marks[key] != null && marks[key] !== false) return null;
    }
    for (const key of ["color", "background"]) {
      if (marks[key] == null || marks[key] === "") continue;
      if (typeof marks[key] !== "string") return null;
      out[key] = marks[key];
    }
    return out;
  }

  function normalizeRichText(value) {
    if (value == null) return { ok: true, value: [] };
    if (!Array.isArray(value)) return { ok: false, error: "rich_text_not_array" };
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      const segment = value[i];
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
        return { ok: false, error: "rich_text_segment_invalid", index: i };
      }
      if (typeof segment.text !== "string") return { ok: false, error: "rich_text_text_invalid", index: i };
      const marks = cleanMarks(segment.marks);
      if (marks == null) return { ok: false, error: "rich_text_marks_invalid", index: i };
      if (segment.href != null && typeof segment.href !== "string") {
        return { ok: false, error: "rich_text_href_invalid", index: i };
      }
      // Preserve unknown segment fields for forward compatibility.
      out.push({ ...segment, text: segment.text, marks, href: segment.href || null });
    }
    return { ok: true, value: out };
  }

  function migrateBlock(block, path, errors, warnings) {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      errors.push({ code: "block_invalid", path });
      return block;
    }
    const next = { ...clone(block) };
    if (typeof next.id !== "string" || !next.id) errors.push({ code: "block_missing_id", path });
    if (typeof next.type !== "string" || !next.type) errors.push({ code: "block_missing_type", path, id: next.id });
    else if (!KNOWN_BLOCK_TYPES.has(next.type)) warnings.push({ code: "unknown_block_type", path, id: next.id, type: next.type });

    const hasRichText = Object.prototype.hasOwnProperty.call(next, "richText");
    if (hasRichText) {
      const normalized = normalizeRichText(next.richText);
      if (!normalized.ok) {
        errors.push({ code: normalized.error, path, id: next.id, index: normalized.index });
      } else {
        next.richText = normalized.value;
        // text remains the backward-compatible plain-text projection.
        next.text = plainText(normalized.value);
      }
    } else {
      const legacyText = next.text == null ? "" : String(next.text);
      next.text = legacyText;
      next.richText = legacyText ? [{ text: legacyText, marks: {}, href: null }] : [];
    }

    if (next.children != null) {
      if (!Array.isArray(next.children)) errors.push({ code: "block_children_invalid", path, id: next.id });
      else next.children = next.children.map((child, index) => migrateBlock(child, `${path}.children[${index}]`, errors, warnings));
    }
    return next;
  }

  function migratePage(page) {
    const source = clone(page || {});
    const version = source.contentSchemaVersion == null ? 0 : Number(source.contentSchemaVersion);
    if (!Number.isInteger(version) || version < 0) {
      return { ok: false, errors: [{ code: "content_schema_version_invalid", value: source.contentSchemaVersion }], warnings: [], page: source };
    }
    if (version > CURRENT_VERSION) {
      return { ok: false, errors: [{ code: "content_schema_version_unsupported", value: version, supported: CURRENT_VERSION }], warnings: [], page: source };
    }

    const errors = [];
    const warnings = [];
    if (source.blocks != null && !Array.isArray(source.blocks)) {
      errors.push({ code: "page_blocks_invalid" });
    } else {
      source.blocks = (source.blocks || []).map((block, index) => migrateBlock(block, `blocks[${index}]`, errors, warnings));
    }
    source.contentSchemaVersion = CURRENT_VERSION;
    return { ok: errors.length === 0, errors, warnings, page: source, fromVersion: version, toVersion: CURRENT_VERSION };
  }

  function downgradeBlock(block) {
    if (!block || typeof block !== "object" || Array.isArray(block)) return block;
    const next = { ...clone(block) };
    if (Array.isArray(next.richText)) next.text = plainText(next.richText);
    delete next.richText;
    if (Array.isArray(next.children)) next.children = next.children.map(downgradeBlock);
    return next;
  }

  function downgradePage(page) {
    const next = clone(page || {});
    if (Array.isArray(next.blocks)) next.blocks = next.blocks.map(downgradeBlock);
    delete next.contentSchemaVersion;
    return next;
  }

  function prepareForPersistence(page) {
    const result = migratePage(page);
    if (!result.ok) return result;
    // Unknown block types/fields are preserved and surfaced as warnings rather than dropped.
    return result;
  }

  Daxxer.BlockSchema = {
    CURRENT_VERSION,
    migratePage,
    downgradePage,
    prepareForPersistence,
    normalizeRichText,
    plainText,
  };
})();
