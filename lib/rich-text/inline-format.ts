// Inline rich-text formatting engine.
//
// A dependency-free replacement for document.execCommand. Every operation works
// on the browser Selection/Range API directly and produces clean, email-safe
// inline HTML: bold/italic/underline plus color, font-family and font-size, all
// expressed as inline <span style="…"> (email clients ignore classes, so inline
// styles are the only portable option).
//
// Design invariants that make this reliable where execCommand was not:
//   1. Formatting is represented ONLY as inline styles on <span>. No <font>,
//      no CSS classes, no contenteditable-specific cruft.
//   2. Detection/toggle reads the *effective* style by walking the ancestor
//      chain (so it also understands legacy <b>/<strong>/<i>/<em>/<u> and AI-
//      returned markup) — never the browser's computed style, which would be
//      polluted by the field's own CSS.
//   3. Serialization re-derives clean HTML from the live DOM by collecting text
//      runs, so accumulated browser cruft never reaches storage, and identical
//      adjacent runs are merged deterministically.
//
// The functions here are pure DOM utilities — the React layer wires them to
// events and selection. Nothing here touches React.

export type ToggleType = "bold" | "italic" | "underline";

export type FormatCommand =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "color"; value: string } // "" resets to inherited default
  | { type: "fontFamily"; value: string } // "" resets
  | { type: "fontSize"; value: number } // px
  | { type: "clear" };

export interface StyleObj {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: number; // px
}

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  fontFamily: string | null;
  fontSize: number | null;
}

interface Run {
  text: string;
  style: StyleObj;
}

// ── style <-> string ──────────────────────────────────────────────────────────

// Fixed property order so identical styles always stringify identically —
// this is what lets us merge adjacent runs by string equality.
function styleToString(s: StyleObj): string {
  const parts: string[] = [];
  if (s.fontFamily) parts.push(`font-family: ${s.fontFamily}`);
  if (s.fontSize) parts.push(`font-size: ${s.fontSize}px`);
  if (s.bold) parts.push(`font-weight: 700`);
  if (s.italic) parts.push(`font-style: italic`);
  if (s.underline) parts.push(`text-decoration: underline`);
  if (s.color) parts.push(`color: ${s.color}`);
  return parts.join("; ");
}

function isEmptyStyle(s: StyleObj): boolean {
  return !s.bold && !s.italic && !s.underline && !s.color && !s.fontFamily && !s.fontSize;
}

function stylesEqual(a: StyleObj, b: StyleObj): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.color ?? "") === (b.color ?? "") &&
    (a.fontFamily ?? "") === (b.fontFamily ?? "") &&
    (a.fontSize ?? 0) === (b.fontSize ?? 0)
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Escape a value going into a double-quoted attribute. Critical for the style
// attribute: multi-word font-family values come back from the browser wrapped
// in double quotes (e.g. font-family: "Times New Roman"), which would otherwise
// break out of style="…" and corrupt the span.
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ── reading effective style from the DOM ───────────────────────────────────────

// Extract whatever formatting a single element declares — via semantic tag or
// inline style. Returns only the properties this element sets (others undefined).
function readStyleFromEl(el: HTMLElement): StyleObj {
  const o: StyleObj = {};
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") o.bold = true;
  if (tag === "I" || tag === "EM") o.italic = true;
  if (tag === "U") o.underline = true;

  const st = el.style;
  if (st.fontWeight) {
    const n = parseInt(st.fontWeight, 10);
    if (st.fontWeight === "bold" || (!isNaN(n) && n >= 600)) o.bold = true;
    else if (st.fontWeight === "normal" || (!isNaN(n) && n < 600)) o.bold = false;
  }
  if (st.fontStyle) {
    if (st.fontStyle === "italic" || st.fontStyle === "oblique") o.italic = true;
    else if (st.fontStyle === "normal") o.italic = false;
  }
  const deco = st.textDecorationLine || st.textDecoration;
  if (deco) {
    if (deco.includes("underline")) o.underline = true;
    else if (deco === "none") o.underline = false;
  }
  if (st.color) o.color = st.color;
  if (st.fontFamily) o.fontFamily = st.fontFamily;
  if (st.fontSize) {
    const px = parseFloat(st.fontSize);
    if (!isNaN(px)) o.fontSize = Math.round(px);
  }
  return o;
}

// The effective style for a node, walking ancestors up to (excluding) `stopAt`.
// Nearest declaration wins. `stopAt` is the field/block container whose own CSS
// we intentionally ignore. A boolean explicitly set to false (e.g. an inner
// span with font-weight:normal) correctly cancels an outer bold.
function effectiveFormat(node: Node, stopAt: Element): StyleObj {
  const acc: StyleObj = {};
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  while (el && el !== stopAt) {
    const s = readStyleFromEl(el);
    if (acc.bold === undefined && s.bold !== undefined) acc.bold = s.bold;
    if (acc.italic === undefined && s.italic !== undefined) acc.italic = s.italic;
    if (acc.underline === undefined && s.underline !== undefined) acc.underline = s.underline;
    if (acc.color === undefined && s.color !== undefined) acc.color = s.color;
    if (acc.fontFamily === undefined && s.fontFamily !== undefined) acc.fontFamily = s.fontFamily;
    if (acc.fontSize === undefined && s.fontSize !== undefined) acc.fontSize = s.fontSize;
    el = el.parentElement;
  }
  // Drop explicit-false booleans — absence means "not formatted".
  return {
    bold: acc.bold || undefined,
    italic: acc.italic || undefined,
    underline: acc.underline || undefined,
    color: acc.color,
    fontFamily: acc.fontFamily,
    fontSize: acc.fontSize,
  };
}

// ── run collection & serialization ─────────────────────────────────────────────

// Walk every text node under `container`, tag each with its effective style, and
// merge adjacent runs that share a style. Non-breaking spaces become regular
// spaces so typing a space in an empty field never stores a literal &nbsp;.
function collectRuns(container: Element, stopAt: Element): Run[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const runs: Run[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = (n.nodeValue || "").replace(/ /g, " ");
    if (text === "") continue;
    runs.push({ text, style: effectiveFormat(n, stopAt) });
  }
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && stylesEqual(last.style, r.style)) last.text += r.text;
    else merged.push({ text: r.text, style: { ...r.style } });
  }
  return merged;
}

function runsToHtml(runs: Run[]): string {
  return runs
    .filter((r) => r.text !== "")
    .map((r) => {
      const style = styleToString(r.style);
      return style ? `<span style="${escAttr(style)}">${esc(r.text)}</span>` : esc(r.text);
    })
    .join("");
}

function trimEnds(runs: Run[]): Run[] {
  if (runs.length === 0) return runs;
  runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s+/, "") };
  const li = runs.length - 1;
  runs[li] = { ...runs[li], text: runs[li].text.replace(/\s+$/, "") };
  return runs.filter((r) => r.text !== "");
}

/** Serialize a single-line field to clean inline HTML. Never mutates the DOM. */
export function serializeInline(root: Element): string {
  return runsToHtml(trimEnds(collectRuns(root, root)));
}

/** Serialize a multi-paragraph body (one <div> per paragraph) to a string[]. */
export function serializeBlocks(root: Element): string[] {
  const divs = Array.from(root.children).filter((c) => c.tagName === "DIV") as HTMLElement[];
  let blocks: string[];
  if (divs.length === 0) {
    blocks = [serializeInline(root)];
  } else {
    blocks = divs.map((d) => runsToHtml(trimEnds(collectRuns(d, d))));
  }
  const nonEmpty = blocks.filter((b) => b !== "" && b !== "<br>");
  return nonEmpty.length ? nonEmpty : [""];
}

/** Normalize arbitrary/legacy HTML into canonical inline HTML (flat spans). */
export function normalizeInlineHtml(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html ?? "";
  return serializeInline(d);
}

/** Build the multi-paragraph editor's initial HTML from paragraph strings. */
export function blocksToHtml(paras: string[]): string {
  const list = paras.length ? paras : [""];
  return list
    .map((p) => {
      const inner = normalizeInlineHtml(p);
      return `<div>${inner || "<br>"}</div>`;
    })
    .join("");
}

// ── selection helpers ──────────────────────────────────────────────────────────

// Split boundary text nodes so the range starts and ends exactly on node edges.
// Handles the same-node case (selection within one text node) explicitly, which
// is where naive implementations corrupt offsets.
function splitBoundaries(range: Range): void {
  const sc = range.startContainer;
  const so = range.startOffset;
  const ec = range.endContainer;
  const eo = range.endOffset;

  if (sc === ec && sc.nodeType === Node.TEXT_NODE) {
    const t = sc as Text;
    if (eo < t.length) t.splitText(eo);
    if (so > 0) {
      const mid = t.splitText(so); // mid = [so, eo)
      range.setStart(mid, 0);
      range.setEnd(mid, mid.length);
    } else {
      range.setStart(t, 0);
      range.setEnd(t, t.length);
    }
    return;
  }

  if (ec.nodeType === Node.TEXT_NODE) {
    const t = ec as Text;
    if (eo > 0 && eo < t.length) {
      t.splitText(eo);
      range.setEnd(t, t.length);
    }
  }
  if (sc.nodeType === Node.TEXT_NODE) {
    const t = sc as Text;
    if (so > 0 && so < t.length) {
      const after = t.splitText(so);
      range.setStart(after, 0);
    }
  }
}

function textNodesInRange(root: Element, range: Range): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const out: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.length === 0) continue;
    const nr = document.createRange();
    nr.selectNodeContents(t);
    // Keep t if it is fully within range: range.start <= t.start && t.end <= range.end
    if (
      range.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, nr) >= 0
    ) {
      out.push(t);
    }
  }
  return out;
}

// Ensure a text node lives inside its own dedicated <span> we can style.
function ownSpanFor(textNode: Text, root: Element): HTMLElement {
  const p = textNode.parentElement;
  if (p && p !== root && p.tagName === "SPAN" && p.childNodes.length === 1) {
    return p; // already a dedicated wrapper — reuse it
  }
  const span = document.createElement("span");
  textNode.replaceWith(span);
  span.appendChild(textNode);
  return span;
}

function applyToSpan(span: HTMLElement, cmd: FormatCommand, removing: boolean): void {
  switch (cmd.type) {
    case "bold":
      span.style.fontWeight = removing ? "" : "700";
      break;
    case "italic":
      span.style.fontStyle = removing ? "" : "italic";
      break;
    case "underline":
      span.style.textDecoration = removing ? "" : "underline";
      break;
    case "color":
      if (cmd.value) span.style.color = cmd.value;
      else span.style.removeProperty("color");
      break;
    case "fontFamily":
      if (cmd.value) span.style.fontFamily = cmd.value;
      else span.style.removeProperty("font-family");
      break;
    case "fontSize":
      span.style.fontSize = `${cmd.value}px`;
      break;
    case "clear":
      span.removeAttribute("style");
      break;
  }
}

/**
 * Apply a formatting command to the current selection inside `root`.
 * Returns true if it did something. Toggle commands (bold/italic/underline)
 * turn OFF when the entire selection already has that format.
 *
 * The selection is preserved across the operation, so the user can chain
 * multiple toolbar actions on the same selection.
 */
export function applyFormat(root: HTMLElement, cmd: FormatCommand, explicitRange?: Range): boolean {
  const sel = window.getSelection();
  if (!sel) return false;

  if (explicitRange) {
    sel.removeAllRanges();
    sel.addRange(explicitRange);
  }
  if (sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return false;
  if (!root.contains(range.commonAncestorContainer)) return false;

  splitBoundaries(range);
  const nodes = textNodesInRange(root, range);
  if (nodes.length === 0) return false;

  let removing = false;
  if (cmd.type === "bold" || cmd.type === "italic" || cmd.type === "underline") {
    const key = cmd.type;
    removing = nodes.every((n) => !!effectiveFormat(n, root)[key]);
  } else if (cmd.type === "clear") {
    removing = true;
  }

  for (const n of nodes) {
    const span = ownSpanFor(n, root);
    applyToSpan(span, cmd, removing);
  }

  // Restore the selection across the same text (nodes are still valid — we
  // wrapped them, never replaced the text). Deterministic serialization on
  // blur/input merges the resulting spans.
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const nr = document.createRange();
  nr.setStart(first, 0);
  nr.setEnd(last, last.length);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}

/** Read the formatting state of the current selection for toolbar highlighting. */
export function queryFormatState(root: HTMLElement, pending?: StyleObj | null): FormatState {
  const empty: FormatState = {
    bold: false,
    italic: false,
    underline: false,
    color: null,
    fontFamily: null,
    fontSize: null,
  };
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return empty;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return empty;

  if (range.collapsed) {
    const base = effectiveFormat(range.startContainer, root);
    return {
      bold: pending?.bold ?? !!base.bold,
      italic: pending?.italic ?? !!base.italic,
      underline: pending?.underline ?? !!base.underline,
      color: base.color ?? null,
      fontFamily: base.fontFamily ?? null,
      fontSize: base.fontSize ?? null,
    };
  }

  const nodes = textNodesInRange(root, range);
  if (nodes.length === 0) return empty;
  const styles = nodes.map((n) => effectiveFormat(n, root));
  const commonStr = <T>(pick: (s: StyleObj) => T): T | null => {
    const first = pick(styles[0]);
    return styles.every((s) => pick(s) === first) ? first : null;
  };
  return {
    bold: styles.every((s) => !!s.bold),
    italic: styles.every((s) => !!s.italic),
    underline: styles.every((s) => !!s.underline),
    color: commonStr((s) => s.color ?? null),
    fontFamily: commonStr((s) => s.fontFamily ?? null),
    fontSize: commonStr((s) => s.fontSize ?? null),
  };
}

// ── pending marks (collapsed caret) ─────────────────────────────────────────────
// Google-Docs behavior: click Bold with nothing selected, then type — the new
// text is bold. Pending marks live per-editor and are consumed on the next
// character insert, then cleared when the caret moves or the field blurs.

const PENDING = new WeakMap<Element, StyleObj>();

export function getPending(root: Element): StyleObj | null {
  return PENDING.get(root) ?? null;
}

export function setPendingToggle(root: HTMLElement, type: ToggleType): StyleObj {
  const current = queryFormatState(root, PENDING.get(root) ?? null);
  const p = { ...(PENDING.get(root) ?? {}) };
  p[type] = !current[type];
  PENDING.set(root, p);
  return p;
}

export function clearPending(root: Element): void {
  PENDING.delete(root);
}

/**
 * Insert text at the collapsed caret honoring pending marks. Returns true if it
 * handled the insert (caller should preventDefault). Only used while pending
 * marks exist — normal typing is left entirely to the browser.
 */
export function insertTextWithPending(root: HTMLElement, text: string): boolean {
  const pending = PENDING.get(root);
  if (!pending) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

  const base =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? effectiveFormat(range.startContainer, root)
      : {};
  const style: StyleObj = { ...base };
  if (pending.bold !== undefined) style.bold = pending.bold;
  if (pending.italic !== undefined) style.italic = pending.italic;
  if (pending.underline !== undefined) style.underline = pending.underline;

  const node = document.createTextNode(text);
  if (isEmptyStyle(style)) {
    range.insertNode(node);
  } else {
    const span = document.createElement("span");
    span.setAttribute("style", styleToString(style));
    span.appendChild(node);
    range.insertNode(span);
  }
  const nr = document.createRange();
  nr.setStart(node, node.length);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  return true;
}
