/**
 * Checks bulleted and numbered lists in the story body.
 *
 * Two things have to stay true at once. A body that has no list must render
 * exactly as it always did — one <p>, because that is what every eblast ever
 * sent contains and a list is the only reason to build it any other way. And
 * a body that does have one must come out as a real <ul>/<ol>, in the right
 * order, with the lines' own formatting intact.
 *
 * The split exists because a <ul> cannot live inside a <p>: email clients
 * close the paragraph early and the body loses its styling from that point on.
 * So the plain case keeps the <p> and only a body with a list is built as a
 * <div> of blocks.
 *
 * The editor half of this — toggling a list on and off in the contentEditable
 * — needs a browser DOM and so is not exercised here. What is checked is the
 * stored shape both sides agree on, and everything the renderer does with it.
 *
 *   npx tsx scripts/check-body-lists.ts
 */
import { buildEblastHtml } from "@/lib/render-email";
import { expandBodyLine, groupBodyLines, hasAnyList, makeListItem, parseBodyLine } from "@/lib/rich-text/list-blocks";
import { withParagraphSpacing } from "@/lib/extracted-flyer";

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

const community: any = {
  slug: "check-community",
  displayName: "Checkworth Senior Living",
  shortName: "Checkworth",
  brand: { primary: "#004D71", accent: "#CCAC77", background: "#FBF7EE", fontBody: "Nexa", fontHeadline: "Nexa" },
  address: { street: "1234 Oak St", city: "Green Bay", state: "WI", zip: "54301" },
  websiteUrl: "https://example.com",
  logos: [], trackingPhone: "9205551234", socials: {}, hubspot: {},
  senders: [{ id: "s1", name: "Dana Reed", email: "dana@example.com", title: null, isPrimary: true }],
};

const base: any = {
  subject: "s", previewText: "p", eyebrow: "", headline: "An Afternoon of Music",
  scriptSubheadline: "", eventDate: "Thursday, June 12", eventTime: "2:00 PM",
  storyEyebrow: "A Look Inside", storyScriptTitle: "", audienceHints: [],
  heroImageAlt: "", heroImageDescription: "",
  ctaEyebrow: "", ctaHeadline: "", ctaSubline: "", ctaButtonLabel: "Call", ctaButtonHref: "tel:1",
};

const render = (bodyParagraphs: string[]) =>
  buildEblastHtml({ ...base, bodyParagraphs }, community, {});

/** Just the body's own markup, from its opening tag to the matching close. */
function bodyBlock(html: string): string {
  const at = html.indexOf('data-field="bodyParagraphs"');
  if (at === -1) return "";
  const open = html.lastIndexOf("<", at);
  const isDiv = html.slice(open, at).startsWith("<div");
  const close = html.indexOf(isDiv ? "</div>" : "</p>", at);
  return html.slice(open, close + (isDiv ? 6 : 4));
}

// ── 1. The stored shape round-trips ────────────────────────────────────────
{
  for (const kind of ["ul", "ol"] as const) {
    const entry = makeListItem(kind, 'Pie and <span style="font-weight: 700">coffee</span>');
    const back = parseBodyLine(entry);
    if (back.kind !== kind) fail(`a ${kind} item did not read back as one`);
    if (back.html !== 'Pie and <span style="font-weight: 700">coffee</span>') {
      fail(`a ${kind} item lost its inline formatting on the way back: ${back.html}`);
    }
  }
  // An ordinary line is never mistaken for one, however it is written.
  for (const plain of [
    "Join us for pie.",
    '<span style="color: rgb(0,0,0)">Join us.</span>',
    "Bring <b>a friend</b>",
    "",
    "before <ul><li>one</li></ul>",
    "<ul>no items in here</ul>",
  ]) {
    if (parseBodyLine(plain).kind !== null) fail(`an ordinary line read as a list item: ${JSON.stringify(plain)}`);
  }

  // A refinement can hand back a whole list in one paragraph. Each item in it
  // becomes a line, rather than one item with a stray </li><li> in the words.
  const whole = expandBodyLine("<ul><li>one</li><li>two</li></ul>");
  if (whole.length !== 2 || whole.some((l) => l.kind !== "ul")) {
    fail(`a whole list in one entry expanded to ${JSON.stringify(whole)}`);
  }
  const wholeBlock = bodyBlock(render(["Before.", "<ol><li>first</li><li>second</li></ol>"]));
  if ((wholeBlock.match(/<li/g) ?? []).length !== 2) fail("a whole list in one entry did not render two items");
  if (!/<ol[\s>]/.test(wholeBlock)) fail("a whole list in one entry did not render as a list");
  if (/<\/li>[\s\S]*<li>/.test(wholeBlock.match(/<li[^>]*>([\s\S]*?)<\/li>/)?.[1] ?? "")) {
    fail("an item swallowed the one after it");
  }
}

// ── 2. Consecutive items of one kind become one list ───────────────────────
{
  const body = [
    "Here is what to expect:",
    makeListItem("ul", "Live music"),
    makeListItem("ul", "Fresh pie"),
    makeListItem("ol", "Arrive"),
    makeListItem("ol", "Sign in"),
    "See you there.",
  ];
  const groups = groupBodyLines(body);
  const shape = groups.map((g) => `${g.kind ?? "p"}:${g.items.length}`).join(" ");
  if (shape !== "p:1 ul:2 ol:2 p:1") fail(`lines grouped as "${shape}", expected "p:1 ul:2 ol:2 p:1"`);
}

// ── 3. A body with no list is the <p> it has always been ───────────────────
{
  const html = render(["Come spend the afternoon with us.", "There will be pie."]);
  const block = bodyBlock(html);
  if (!block.startsWith("<p ")) fail("a body with no list is no longer a <p>");
  if (/<ul|<ol|<li/i.test(block)) fail("a body with no list grew list markup");
  if (!block.includes("Come spend the afternoon with us.<br>There will be pie.")) {
    fail("a body with no list no longer joins its lines with <br>");
  }
  if ((html.match(/data-field="bodyParagraphs"/g) ?? []).length !== 1) {
    fail("the body is tagged more than once");
  }
  if (hasAnyList(["Come spend the afternoon with us.", "There will be pie."])) {
    fail("an ordinary body reports that it has a list");
  }
}

// ── 4. A body with a list renders a real list ──────────────────────────────
{
  const body = [
    "Here is what to expect:",
    makeListItem("ul", 'Live <span style="font-weight: 700">music</span>'),
    makeListItem("ul", "Fresh pie"),
    "Then, in order:",
    makeListItem("ol", "Arrive"),
    makeListItem("ol", "Sign in"),
  ];
  const block = bodyBlock(render(body));

  if (!block.startsWith("<div ")) fail("a body with a list is not a <div>, so the <ul> would sit inside a <p>");
  if (!/data-deletefield="block:bodyParagraphs"/.test(block)) fail("the body lost its hide tag when it grew a list");

  const items = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  if (items.length !== 4) fail(`expected 4 list items, found ${items.length}`);
  if (!items[0].includes('<span style="font-weight: 700">music</span>')) {
    fail("a list item lost the formatting inside it");
  }
  if ((block.match(/<ul[\s>]/g) ?? []).length !== 1) fail("the two bullets did not become one <ul>");
  if ((block.match(/<ol[\s>]/g) ?? []).length !== 1) fail("the two numbers did not become one <ol>");

  // Order is the whole point: the lines must come out as they went in.
  const order: string[] = [];
  for (const m of block.matchAll(/<(p|ul|ol)[\s>]/g)) order.push(m[1]);
  if (order.join(" ") !== "p ul p ol") fail(`blocks came out as "${order.join(" ")}", expected "p ul p ol"`);

  // Outlook has no list defaults of its own, so they are written out.
  for (const tag of ["ul", "ol"]) {
    const open = new RegExp(`<${tag} style="([^"]*)"`).exec(block)?.[1] ?? "";
    if (!/margin:/.test(open) || !/padding:/.test(open)) fail(`<${tag}> does not state its own margin and padding`);
    if (!/font-family:/.test(open)) fail(`<${tag}> does not carry the body's type`);
  }
  if (!/<li style="[^"]*font-family:/.test(block)) fail("<li> does not carry the body's type, which Outlook will not inherit");
}

// ── 5. One list on its own, and an empty item ──────────────────────────────
{
  const only = bodyBlock(render([makeListItem("ul", "Just the one bullet")]));
  if (!/<ul[\s>]/.test(only)) fail("a body that is nothing but a list did not render one");
  if (!only.includes("Just the one bullet")) fail("the only item lost its words");

  // An item being typed into is empty for a moment, and must still hold a line.
  const blank = bodyBlock(render([makeListItem("ul", "Something"), makeListItem("ul", "")]));
  if ((blank.match(/<li/g) ?? []).length !== 2) fail("an empty item disappeared instead of holding its line");
  if (!blank.includes("&nbsp;")) fail("an empty item has nothing to give it height");
}

// ── 6. A list item is sanitised like any other line ────────────────────────
{
  const block = bodyBlock(render([makeListItem("ul", '<script>alert(1)</script>Safe<img src=x onerror="bad()">')]));
  if (/<script/i.test(block)) fail("a script tag survived inside a list item");
  if (/onerror=/i.test(block)) fail("an event handler survived inside a list item");
  if (!block.includes("Safe")) fail("sanitising a list item threw away its words");
}

// ── 7. A hidden or empty body still behaves ────────────────────────────────
{
  const hidden = render([makeListItem("ul", "A bullet")]);
  const withHidden = buildEblastHtml(
    { ...base, bodyParagraphs: [makeListItem("ul", "A bullet")], hiddenBlocks: ["bodyParagraphs"] } as any,
    community, {},
  );
  if (!hidden.includes("A bullet")) fail("a list body did not render at all");
  if (withHidden.includes("A bullet")) fail("hiding the body left its list behind");
  if (hasAnyList([])) fail("an empty body reports that it has a list");
}

// ── 8. The AI's paragraph spacing leaves a list alone ──────────────────────
//
// Every generate and every refinement runs the body through this. It puts a
// blank line between written paragraphs, which is right for paragraphs and
// would pull a list apart into one-item lists with gaps between them.
{
  const body = [
    "Here is what to expect:",
    makeListItem("ul", "Live music"),
    makeListItem("ul", "Fresh pie"),
    "See you there.",
  ];
  const spaced = withParagraphSpacing(body);
  const shape = groupBodyLines(spaced).map((g) => `${g.kind ?? "p"}:${g.items.length}`).join(" ");
  if (shape !== "p:1 p:1 ul:2 p:1 p:1") {
    fail(`paragraph spacing reshaped a list: got "${shape}", expected "p:1 p:1 ul:2 p:1 p:1"`);
  }
  if ((render(spaced).match(/<ul[\s>]/g) ?? []).length !== 1) {
    fail("paragraph spacing broke one list into several");
  }
  // Still idempotent, and still spaces real paragraphs.
  if (JSON.stringify(withParagraphSpacing(spaced)) !== JSON.stringify(spaced)) {
    fail("paragraph spacing is no longer idempotent");
  }
  const plain = withParagraphSpacing(["One.", "Two."]);
  if (JSON.stringify(plain) !== JSON.stringify(["One.", "", "Two."])) {
    fail(`paragraph spacing stopped separating ordinary paragraphs: ${JSON.stringify(plain)}`);
  }
  // Two different kinds in a row are two lists, so they do get separated.
  const mixed = withParagraphSpacing([makeListItem("ul", "a"), makeListItem("ol", "b")]);
  if (mixed.length !== 3 || mixed[1] !== "") fail("a bullet running into a number was not separated");
}

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nA body with no list is still the single <p> it has always been, joined by <br>.\n" +
  "A body with one renders real <ul> and <ol> blocks in the order the lines were\n" +
  "written, consecutive items of a kind joined into one list, each carrying the\n" +
  "type and spacing Outlook will not supply. Items keep their inline formatting,\n" +
  "are sanitised like any other line, hold their height while empty, and go away\n" +
  "with the body when it is hidden.",
);
