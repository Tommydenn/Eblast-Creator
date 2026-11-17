/**
 * Checks what the list buttons do to the text in the box.
 *
 * This is the half that was missing. Turning lines into a list is DOM surgery
 * that only happens in a browser, and with nothing to run a browser in, the
 * first version of the feature shipped wrapping a whole story in one bullet:
 * body copy is usually stored as ONE paragraph carrying its own breaks, the
 * toggle worked a block at a time, and a block is not a line.
 *
 * So the editor is built here the way the real one builds it, a selection is
 * made over it the way a person makes one, the button is pressed, and what
 * would be saved is read back out.
 *
 *   npx tsx scripts/check-list-editing.ts
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const w = dom.window as any;
Object.assign(globalThis as any, {
  window: w,
  document: w.document,
  Node: w.Node,
  NodeFilter: w.NodeFilter,
  Range: w.Range,
  HTMLElement: w.HTMLElement,
  Element: w.Element,
  DocumentFragment: w.DocumentFragment,
});

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The body as it really arrives: one entry, three lines, blanks between. */
const REAL = ["Hello,<br><br>I hope you are well.<br><br>My name is Angie."];

async function main() {
  const { blocksToHtml, serializeBlocks, toggleList, queryListState } = await import(
    "@/lib/rich-text/inline-format"
  );

  const editor = (paras: string[]) => {
    const el = w.document.createElement("div");
    el.innerHTML = blocksToHtml(paras);
    w.document.body.appendChild(el);
    return el;
  };

  const findText = (root: any, needle: string) => {
    const walker = w.document.createTreeWalker(root, w.NodeFilter.SHOW_TEXT, null);
    let n: any;
    while ((n = walker.nextNode())) {
      const i = (n.nodeValue ?? "").indexOf(needle);
      if (i !== -1) return { node: n, start: i, end: i + needle.length };
    }
    throw new Error(`no text node holding ${JSON.stringify(needle)}`);
  };

  const select = (root: any, from: string, to = from) => {
    const a = findText(root, from);
    const b = findText(root, to);
    const r = w.document.createRange();
    r.setStart(a.node, a.start);
    r.setEnd(b.node, b.end);
    const sel = w.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  const caretIn = (root: any, text: string) => {
    const a = findText(root, text);
    const r = w.document.createRange();
    r.setStart(a.node, a.start + 1);
    r.collapse(true);
    const sel = w.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // ── 1. The bug that was reported ────────────────────────────────────────
  //
  // One paragraph, three lines. Choosing the last line must bullet that line
  // and nothing else — this is the case that used to swallow the whole story.
  {
    const el = editor(REAL);
    if (el.children.length !== 1) {
      fail(`the real body should build as one block, built as ${el.children.length}`);
    }
    select(el, "My name is Angie.");
    if (!toggleList(el, "ul")) fail("the bullet button did nothing");

    const out = serializeBlocks(el);
    const want = ["Hello,", "", "I hope you are well.", "", "<ul><li>My name is Angie.</li></ul>"];
    if (!same(out, want)) fail(`bulleting one line gave ${JSON.stringify(out)}`);
    if ((el.innerHTML.match(/<li/g) ?? []).length !== 1) {
      fail("bulleting one line made more than one bullet");
    }
    if (el.textContent?.includes("Hello,") !== true || !el.textContent?.includes("I hope you are well.")) {
      fail("bulleting one line lost the lines around it");
    }
  }

  // ── 2. Several lines, and the blank caught between them ─────────────────
  {
    const el = editor(REAL);
    select(el, "I hope you are well.", "My name is Angie.");
    toggleList(el, "ul");

    const out = serializeBlocks(el);
    const want = [
      "Hello,",
      "",
      "<ul><li>I hope you are well.</li></ul>",
      "<ul><li>My name is Angie.</li></ul>",
    ];
    if (!same(out, want)) fail(`bulleting two lines gave ${JSON.stringify(out)}`);
    if ((el.innerHTML.match(/<ul/g) ?? []).length !== 1) {
      fail("two chosen lines did not end up in one list");
    }
  }

  // ── 3. Pressing it again turns it off ───────────────────────────────────
  {
    const el = editor(REAL);
    select(el, "I hope you are well.", "My name is Angie.");
    toggleList(el, "ul");
    select(el, "I hope you are well.", "My name is Angie.");
    toggleList(el, "ul");

    const out = serializeBlocks(el);
    if (out.some((p) => /<li>/.test(p))) fail(`turning the list off left items behind: ${JSON.stringify(out)}`);
    if (!same(out, ["Hello,", "", "I hope you are well.", "My name is Angie."])) {
      fail(`turning the list off gave ${JSON.stringify(out)}`);
    }
  }

  // ── 4. A caret with nothing selected acts on the line it is in ──────────
  {
    const el = editor(REAL);
    caretIn(el, "I hope you are well.");
    toggleList(el, "ol");
    const out = serializeBlocks(el);
    if (!same(out, ["Hello,", "", "<ol><li>I hope you are well.</li></ol>", "", "My name is Angie."])) {
      fail(`a caret in the middle line gave ${JSON.stringify(out)}`);
    }
  }

  // ── 5. Bullets and numbers swap rather than nest ────────────────────────
  {
    const el = editor(REAL);
    select(el, "I hope you are well.", "My name is Angie.");
    toggleList(el, "ul");
    select(el, "I hope you are well.", "My name is Angie.");
    toggleList(el, "ol");

    const out = serializeBlocks(el);
    if (out.some((p) => /<ul>/.test(p))) fail("switching to numbers left bullets behind");
    if ((out.filter((p) => /<ol><li>/.test(p)) ?? []).length !== 2) {
      fail(`switching to numbers gave ${JSON.stringify(out)}`);
    }
    if ((el.innerHTML.match(/<ol/g) ?? []).length !== 1) fail("switching kinds made more than one list");
  }

  // ── 6. The formatting inside a line survives being bulleted ─────────────
  {
    const el = editor(['Plain.<br><br>Some <span style="font-weight: 700">bold</span> words.']);
    select(el, "Some ", " words.");
    toggleList(el, "ul");
    const out = serializeBlocks(el);
    const item = out.find((p) => /<li>/.test(p)) ?? "";
    if (!/font-weight: 700/.test(item)) fail(`bulleting a line dropped its formatting: ${JSON.stringify(item)}`);
    if (!/bold/.test(item)) fail("bulleting a line dropped its words");
  }

  // ── 7. The button lights up for the line the caret is in ────────────────
  {
    const el = editor(REAL);
    caretIn(el, "My name is Angie.");
    if (queryListState(el) !== null) fail("the button reads as on before anything is bulleted");
    toggleList(el, "ul");
    caretIn(el, "My name is Angie.");
    if (queryListState(el) !== "ul") fail("the bullet button does not read as on inside a bullet");
    caretIn(el, "Hello,");
    if (queryListState(el) !== null) fail("the bullet button reads as on outside the list");
  }

  // ── 8. A body already made of separate entries still works ──────────────
  {
    const el = editor(["One.", "", "Two.", "", "Three."]);
    select(el, "Two.", "Three.");
    toggleList(el, "ul");
    const out = serializeBlocks(el);
    if (!same(out, ["One.", "", "<ul><li>Two.</li></ul>", "<ul><li>Three.</li></ul>"])) {
      fail(`a body of separate entries gave ${JSON.stringify(out)}`);
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "\nChoosing one line of a one-paragraph body bullets that line and leaves the\n" +
    "rest alone. Choosing several makes one list and drops the blank between them.\n" +
    "Pressing again turns it off, a caret acts on its own line, bullets and numbers\n" +
    "swap rather than nest, formatting inside a line survives, and the button\n" +
    "reports what the caret is actually in.",
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
