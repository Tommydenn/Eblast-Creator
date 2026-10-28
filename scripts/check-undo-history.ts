/**
 * Checks how edits are grouped into undo steps.
 *
 * Typing records a step on every keystroke, so without grouping undo would
 * walk back a letter at a time. The rule is that a run of changes to the same
 * thing, with no real pause, is one step — and that moving to something else,
 * or stopping for a moment, starts a new one.
 *
 * The rule is reproduced here and exercised against a typed sentence, because
 * the real one lives inside a React provider that cannot be run on its own.
 * If the two drift this check is worthless, so the rule is short enough to
 * read beside DraftContext's pushHistory and see that they match.
 *
 *   npx tsx scripts/check-undo-history.ts
 */

const COALESCE_MS = 700;
const LIMIT = 100;

/** pushHistory, as DraftContext implements it. */
function makeHistory() {
  const stack: string[] = [];
  let last: { key: string; at: number } | null = null;
  return {
    stack,
    push(key: string, at: number, before: string) {
      if (last && last.key === key && at - last.at < COALESCE_MS) {
        last = { key, at };
        return;
      }
      last = { key, at };
      stack.push(before);
      while (stack.length > LIMIT) stack.shift();
    },
    /** Undo and redo both clear it, so the next edit starts a fresh step. */
    breakRun() { last = null; },
  };
}

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// ── Typing one word is one step ────────────────────────────────────────────
{
  const h = makeHistory();
  let at = 0;
  let text = "";
  for (const ch of "Oktoberfest") {
    h.push("headline", at, text);
    text += ch;
    at += 80; // a brisk but ordinary typing speed
  }
  if (h.stack.length !== 1) fail(`typing one word made ${h.stack.length} steps, expected 1`);
  if (h.stack[0] !== "") fail(`the step should hold the text from before typing, got ${JSON.stringify(h.stack[0])}`);
}

// ── A pause starts a new step ──────────────────────────────────────────────
{
  const h = makeHistory();
  h.push("headline", 0, "");
  h.push("headline", 300, "Okt");
  h.push("headline", 2000, "Oktoberfest");
  if (h.stack.length !== 2) fail(`a pause mid-word made ${h.stack.length} steps, expected 2`);
}

// ── Moving to another field starts a new step ──────────────────────────────
{
  const h = makeHistory();
  h.push("headline", 0, "a");
  h.push("bodyParagraphs", 50, "b");
  h.push("headline", 100, "c");
  if (h.stack.length !== 3) fail(`switching fields made ${h.stack.length} steps, expected 3`);
}

// ── A colour change is its own step, even straight after typing ────────────
{
  const h = makeHistory();
  h.push("headline", 0, "before typing");
  h.push("headline", 80, "b");
  h.push("heroBgColor", 120, "before the colour");
  if (h.stack.length !== 2) fail(`a colour change after typing made ${h.stack.length} steps, expected 2`);
  if (h.stack[1] !== "before the colour") fail("the colour step does not hold the state from before it");
}

// ── Undo breaks the run, so the next keystroke is its own step ─────────────
{
  const h = makeHistory();
  h.push("headline", 0, "a");
  h.breakRun();
  h.push("headline", 50, "b");
  if (h.stack.length !== 2) fail(`typing straight after an undo made ${h.stack.length} steps, expected 2`);
}

// ── The stack stops growing ────────────────────────────────────────────────
{
  const h = makeHistory();
  for (let i = 0; i < LIMIT + 50; i++) h.push(`field${i}`, i * 1000, `state${i}`);
  if (h.stack.length !== LIMIT) fail(`the stack grew to ${h.stack.length}, expected it to stop at ${LIMIT}`);
  // The oldest go first, so the most recent steps are the ones kept.
  if (h.stack[h.stack.length - 1] !== `state${LIMIT + 49}`) fail("the newest step was dropped instead of the oldest");
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nTyping a word is one undo step; a pause, a different field, or a colour change starts another.\n" +
  `Undo breaks the run, and the stack stops at ${LIMIT} by dropping the oldest.`,
);
