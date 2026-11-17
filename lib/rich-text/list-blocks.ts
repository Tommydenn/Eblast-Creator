/**
 * Bulleted and numbered lists, as the body copy stores them.
 *
 * The body is a `string[]`, one entry per line, and has been since before
 * lists existed. A list item is one of those entries wearing its list tag:
 *
 *     "A plain line."
 *     "<ul><li>A bullet</li></ul>"
 *     "<ul><li>Another bullet</li></ul>"
 *     "<ol><li>The first step</li></ol>"
 *
 * One item per entry rather than a whole list in one, so a list stays a run of
 * ordinary lines: the serializer still emits one entry per line, moving a line
 * is still moving one entry, and an item keeps its own inline formatting.
 * Whoever draws it — the editor rebuilding its own DOM, or the email — joins
 * the consecutive ones back into a single list.
 *
 * It needs no new field and no second array kept in step by index, and no
 * draft written before lists existed has an entry that matches, so every one
 * of them reads exactly as it always did.
 *
 * Deliberately free of the DOM: the editor runs this in a browser and the
 * renderer runs it on a server, and the two must never disagree about what a
 * stored line means.
 */

export type ListKind = "ul" | "ol";

/** One stored line: a list item, or an ordinary line. */
export interface BodyLine {
  kind: ListKind | null;
  /** The line's own inline HTML, without the list wrapper. */
  html: string;
}

const WRAP = /^\s*<(ul|ol)>([\s\S]*)<\/\1>\s*$/i;
const ITEM = /<li[^>]*>([\s\S]*?)<\/li>/gi;

/**
 * Read a stored line, which is almost always one line.
 *
 * It can be more than one: the editor writes a single item per entry, but a
 * refinement can hand back a whole list in one paragraph, and reading that as
 * a single item would put a stray `</li><li>` in the middle of the words.
 * Every item it holds becomes a line of its own, which is the same thing the
 * editor would have written.
 */
export function expandBodyLine(entry: string): BodyLine[] {
  const wrap = WRAP.exec(entry ?? "");
  if (!wrap) return [{ kind: null, html: entry ?? "" }];
  const kind = wrap[1].toLowerCase() as ListKind;
  const items = [...wrap[2].matchAll(ITEM)].map((m) => m[1]);
  // A wrapper with nothing in it that looks like an item is not a list.
  return items.length ? items.map((html) => ({ kind, html })) : [{ kind: null, html: entry ?? "" }];
}

/** Read a stored line that is known to hold at most one. */
export function parseBodyLine(entry: string): BodyLine {
  const [first, ...rest] = expandBodyLine(entry);
  return rest.length ? { kind: null, html: entry ?? "" } : first;
}

/** Write a stored line back as a list item. */
export function makeListItem(kind: ListKind, inner: string): string {
  return `<${kind}><li>${inner}</li></${kind}>`;
}

/** Whether any line in a body is a list item — the renderer's fast path. */
export function hasAnyList(paras: readonly string[] | null | undefined): boolean {
  return !!paras?.some((p) => expandBodyLine(p)[0].kind !== null);
}

export interface BodyGroup {
  kind: ListKind | null;
  /** Inline HTML for each line in this group. */
  items: string[];
}

/**
 * The body as the things that get drawn: runs of consecutive items of one
 * kind become one list, and every other line stands alone.
 */
export function groupBodyLines(paras: readonly string[]): BodyGroup[] {
  const out: BodyGroup[] = [];
  for (const entry of paras) {
    for (const line of expandBodyLine(entry)) {
      const last = out[out.length - 1];
      if (line.kind && last && last.kind === line.kind) last.items.push(line.html);
      else out.push({ kind: line.kind, items: [line.html] });
    }
  }
  return out;
}
