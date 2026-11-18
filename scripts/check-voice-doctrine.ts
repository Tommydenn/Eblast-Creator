/**
 * Checks that nothing in the prompts asks the model for its own wording.
 *
 * The body copy is supposed to be the flyer's sentences, carried across as
 * they are written. That instruction is easy to contradict by accident,
 * because tone guidance used to live in five files at once and any of them
 * saying "write original prose" is enough to undo it. So the rule is checked
 * rather than trusted: one doctrine, and no prompt anywhere disagreeing with
 * it.
 *
 *   npx tsx scripts/check-voice-doctrine.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

/** Every file that ends up in a prompt. */
function promptFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) promptFiles(path, out);
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const voice = readFileSync("lib/voice.ts", "utf8");

// The doctrine has to actually say it.
for (const phrase of [
  "Use the flyer's words",
  "carry that sentence into the email",
  "Never invent a fact",
]) {
  if (!voice.includes(phrase)) fail(`the doctrine no longer says "${phrase}"`);
}

// And nothing may ask for the model's own phrasing instead.
const BANNED: Array<[RegExp, string]> = [
  [/the wording yours/i, "asks the drafter to supply its own wording"],
  [/original prose/i, "asks for original prose rather than the flyer's"],
  [/write original copy/i, "asks for original copy rather than the flyer's"],
  [/do not paraphrase the flyer/i, "forbids using the flyer's wording at all"],
  [/as close to the flyer.{0,40}do not rephrase/is, "the old verbatim rule, which forbade writing the email"],
];

for (const file of promptFiles("lib")) {
  const text = readFileSync(file, "utf8");
  for (const [re, why] of BANNED) {
    if (re.test(text)) fail(`${file} ${why}`);
  }
}

// The hook has one home, and the two places that say where must agree.
const schema = readFileSync("lib/anthropic.ts", "utf8");
if (/opening hook is NOT here/i.test(schema)) {
  fail("lib/anthropic.ts still sends the opening hook to the headline, which now holds the event's name");
}
if (!/hook DOES belong here/i.test(schema)) {
  fail("lib/anthropic.ts no longer tells the drafter where the opening hook goes");
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nOne doctrine, and it says the body is the flyer's own sentences. No prompt\n" +
  "asks the drafter for wording of its own, and the opening hook has exactly one\n" +
  "home: the first body entry, not the headline.",
);
process.exit(0);
