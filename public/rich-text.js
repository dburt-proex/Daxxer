// Pure rich-text segment operations used by the editor. No DOM or persistence I/O.
window.Daxxer = window.Daxxer || {};

(function () {
  const MARKS = new Set(["bold", "italic", "underline", "strike", "code"]);
  const STYLE_MARKS = new Set(["color", "background"]);

  function cloneSegments(segments) {
    return structuredClone(Array.isArray(segments) ? segments : []);
  }

  function plainText(segments) {
    return cloneSegments(segments).map((segment) => typeof segment.text === "string" ? segment.text : "").join("");
  }

  function signature(segment) {
    const marks = segment && segment.marks && typeof segment.marks === "object" ? segment.marks : {};
    const ordered = Object.keys(marks).sort().map((key) => [key, marks[key]]);
    return JSON.stringify([ordered, segment && segment.href ? segment.href : null]);
  }

  function compact(segments) {
    const out = [];
    for (const raw of cloneSegments(segments)) {
      if (!raw || typeof raw.text !== "string" || raw.text === "") continue;
      const segment = { ...raw, marks: raw.marks && typeof raw.marks === "object" && !Array.isArray(raw.marks) ? { ...raw.marks } : {}, href: raw.href || null };
      const prev = out[out.length - 1];
      if (prev && signature(prev) === signature(segment)) prev.text += segment.text;
      else out.push(segment);
    }
    return out;
  }

  function fromText(text) {
    const value = text == null ? "" : String(text);
    return value ? [{ text: value, marks: {}, href: null }] : [];
  }

  function length(segments) { return plainText(segments).length; }

  function slice(segments, start = 0, end = Infinity) {
    const source = compact(segments);
    const total = length(source);
    const a = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, total));
    const b = Math.max(a, Math.min(Number.isFinite(end) ? end : total, total));
    const out = [];
    let offset = 0;
    for (const segment of source) {
      const next = offset + segment.text.length;
      const left = Math.max(a, offset);
      const right = Math.min(b, next);
      if (right > left) out.push({ ...segment, text: segment.text.slice(left - offset, right - offset), marks: { ...(segment.marks || {}) } });
      offset = next;
      if (offset >= b) break;
    }
    return compact(out);
  }

  function split(segments, offset) {
    const total = length(segments);
    const point = Math.max(0, Math.min(Number(offset) || 0, total));
    return [slice(segments, 0, point), slice(segments, point, total)];
  }

  function concat(left, right) { return compact([...cloneSegments(left), ...cloneSegments(right)]); }

  function selectedSegments(segments, start, end) { return slice(segments, start, end); }

  function selectionHasMark(segments, start, end, mark) {
    if (!MARKS.has(mark) || end <= start) return false;
    const selected = selectedSegments(segments, start, end);
    return selected.length > 0 && selected.every((segment) => segment.marks && segment.marks[mark] === true);
  }

  function applyMark(segments, start, end, mark, value) {
    if (!MARKS.has(mark)) return { ok: false, error: "unsupported_mark", segments: compact(segments) };
    const total = length(segments);
    const a = Math.max(0, Math.min(start, total));
    const b = Math.max(a, Math.min(end, total));
    if (a === b) return { ok: true, segments: compact(segments) };
    const before = slice(segments, 0, a);
    const selected = slice(segments, a, b).map((segment) => {
      const marks = { ...(segment.marks || {}) };
      if (value) marks[mark] = true; else delete marks[mark];
      return { ...segment, marks };
    });
    const after = slice(segments, b, total);
    return { ok: true, segments: concat(concat(before, selected), after) };
  }

  function toggleMark(segments, start, end, mark) {
    return applyMark(segments, start, end, mark, !selectionHasMark(segments, start, end, mark));
  }

  function applyStyle(segments, start, end, key, value) {
    if (!STYLE_MARKS.has(key)) return { ok: false, error: "unsupported_style_mark", segments: compact(segments) };
    if (value != null && typeof value !== "string") return { ok: false, error: "invalid_style_value", segments: compact(segments) };
    const total = length(segments);
    const a = Math.max(0, Math.min(start, total));
    const b = Math.max(a, Math.min(end, total));
    if (a === b) return { ok: false, error: "empty_selection", segments: compact(segments) };
    const before = slice(segments, 0, a);
    const selected = slice(segments, a, b).map((segment) => {
      const marks = { ...(segment.marks || {}) };
      if (value) marks[key] = value; else delete marks[key];
      return { ...segment, marks };
    });
    const after = slice(segments, b, total);
    return { ok: true, segments: concat(concat(before, selected), after) };
  }

  function applyLink(segments, start, end, href) {
    const total = length(segments);
    const a = Math.max(0, Math.min(start, total));
    const b = Math.max(a, Math.min(end, total));
    if (a === b) return { ok: false, error: "empty_selection", segments: compact(segments) };
    if (href != null && typeof href !== "string") return { ok: false, error: "invalid_href", segments: compact(segments) };
    const before = slice(segments, 0, a);
    const selected = slice(segments, a, b).map((segment) => ({ ...segment, href: href || null }));
    const after = slice(segments, b, total);
    return { ok: true, segments: concat(concat(before, selected), after) };
  }

  function replaceRange(segments, start, end, replacement, inherit = null) {
    const total = length(segments);
    const a = Math.max(0, Math.min(start, total));
    const b = Math.max(a, Math.min(end, total));
    const before = slice(segments, 0, a);
    const after = slice(segments, b, total);
    const middle = typeof replacement === "string"
      ? (replacement ? [{ text: replacement, marks: inherit && inherit.marks ? { ...inherit.marks } : {}, href: inherit && inherit.href ? inherit.href : null }] : [])
      : cloneSegments(replacement);
    return concat(concat(before, middle), after);
  }

  function styleAt(segments, offset) {
    const source = compact(segments);
    if (!source.length) return { marks: {}, href: null };
    const target = Math.max(0, Math.min(offset, length(source)));
    let pos = 0;
    for (const segment of source) {
      const next = pos + segment.text.length;
      if (target <= next) return { marks: { ...(segment.marks || {}) }, href: segment.href || null };
      pos = next;
    }
    const last = source[source.length - 1];
    return { marks: { ...(last.marks || {}) }, href: last.href || null };
  }

  Daxxer.RichText = {
    plainText, compact, fromText, length, slice, split, concat,
    selectionHasMark, applyMark, toggleMark, applyStyle, applyLink, replaceRange, styleAt,
  };
})();
