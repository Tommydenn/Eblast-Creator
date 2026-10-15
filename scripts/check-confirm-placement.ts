/**
 * Checks where the delete confirm box lands.
 *
 * The box used to be anchored to the bottom edge of the section being deleted.
 * On a hero several screens tall that is nowhere near the x at its top corner,
 * so the box opened below the fold and clicking the x looked like it did
 * nothing. It now opens against the x itself. These cases pin that down: the
 * box has to stay within reach of the x, inside the container, and on screen.
 *
 *   npx tsx scripts/check-confirm-placement.ts
 */
import { confirmBoxPosition } from "@/components/drafter/PreviewPanel";

const CONFIRM_WIDTH = 224;
const CONFIRM_HEIGHT = 112;
const failures: string[] = [];

/** The x as the preview draws it: 20px wide, at the section's top-right. */
const xButton = (sectionRight: number, sectionTop: number) =>
  ({ left: sectionRight - 24, top: sectionTop + 4, bottom: sectionTop + 24, width: 20 });

type Case = {
  name: string;
  btn: ReturnType<typeof xButton>;
  geom: Parameters<typeof confirmBoxPosition>[1];
};

const cases: Case[] = [
  {
    // The reported case: a hero 1800px tall, its x near the top of the window.
    name: "tall hero, full-width preview",
    btn: xButton(600, 40),
    geom: { scale: 1, offsetX: 0, offsetY: 0, containerTop: 100, containerWidth: 600, viewportHeight: 900 },
  },
  {
    name: "tall hero, preview scaled to 0.7",
    btn: xButton(600, 40),
    geom: { scale: 0.7, offsetX: 0, offsetY: 0, containerTop: 100, containerWidth: 420, viewportHeight: 900 },
  },
  {
    // Deep into a long email, the container scrolled far up the page.
    name: "section 3000px down a scrolled email",
    btn: xButton(600, 3000),
    geom: { scale: 1, offsetX: 0, offsetY: 0, containerTop: -2700, containerWidth: 600, viewportHeight: 900 },
  },
  {
    // The x near the bottom of the window: the box has to flip above it.
    name: "x near the bottom of the window",
    btn: xButton(600, 3000),
    geom: { scale: 1, offsetX: 0, offsetY: 0, containerTop: -2200, containerWidth: 600, viewportHeight: 900 },
  },
  {
    // A narrow section whose x sits well left of the email's right edge.
    name: "narrow section, x at x=200",
    btn: xButton(200, 500),
    geom: { scale: 1, offsetX: 0, offsetY: 0, containerTop: 0, containerWidth: 600, viewportHeight: 900 },
  },
];

for (const { name, btn, geom } of cases) {
  const box = confirmBoxPosition(btn, geom);
  const xOnPage = geom.containerTop + geom.offsetY + btn.top * geom.scale;
  const boxOnPage = geom.containerTop + box.top;

  // 1. Within reach of the x — the whole point of the change.
  const gap = Math.abs(boxOnPage - xOnPage);
  if (gap > CONFIRM_HEIGHT + 40) {
    failures.push(`${name}: box opens ${Math.round(gap)}px from the x`);
  }
  // 2. Inside the container, horizontally.
  if (box.left < 0 || box.left + CONFIRM_WIDTH > geom.containerWidth) {
    failures.push(`${name}: box spans ${Math.round(box.left)}–${Math.round(box.left + CONFIRM_WIDTH)} in a ${geom.containerWidth}px container`);
  }
  // 3. On screen, vertically.
  if (boxOnPage < 0 || boxOnPage + CONFIRM_HEIGHT > geom.viewportHeight) {
    failures.push(`${name}: box spans ${Math.round(boxOnPage)}–${Math.round(boxOnPage + CONFIRM_HEIGHT)} in a ${geom.viewportHeight}px window`);
  }

  const side = box.top > btn.bottom * geom.scale + geom.offsetY ? "below" : "above";
  console.log(`  ${name.padEnd(38)} ${side} the x, ${Math.round(gap)}px away, left ${Math.round(box.left)}`);
}

// The old behaviour, for contrast: anchored to the bottom of an 1800px hero.
const old = { top: 1800, left: 0 };
console.log(`\n  for contrast, the old anchor on an 1800px hero opened ${old.top}px down the email`);

if (failures.length) {
  console.error(`\n${failures.length} placement problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} placements open against the x, inside the container and on screen.`);
