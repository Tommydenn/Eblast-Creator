/**
 * Checks that the website's photos are cropped to keep the subject.
 *
 * The WordPress tab hands the community website a photo cut to exactly
 * 1000×667, because the site has no cropping tool of its own. The one rule
 * that matters is that the cut is not blind: a subject off to one side has to
 * survive it, not get sliced off by a centre crop. That rule lives in one
 * word — `position: sharp.strategy.attention` — so this proves both that the
 * word is there and that it does what the word claims.
 *
 *   npx tsx scripts/check-wordpress-crop.ts
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// ── The tab asks for the crop ──────────────────────────────────────────────
{
  const panel = readFileSync("components/EventsPanel.tsx", "utf-8");
  // The tab button itself, not merely the word somewhere in the file — the
  // crop logic and the type both mention "wordpress" and would mask a tab
  // that had been taken out of the row.
  if (!/\[\s*["']wordpress["']\s*,\s*["']WordPress["']\s*\]/.test(panel)) {
    fail("components/EventsPanel.tsx has no WordPress tab button");
  }
  // The website's size, exactly, and handed to the photo panel.
  if (!/WORDPRESS_CROP\s*=\s*\{\s*w:\s*1000,\s*h:\s*667\s*\}/.test(panel)) {
    fail("components/EventsPanel.tsx no longer sizes the website crop at 1000×667");
  }
  if (!/crop=\{tab === "wordpress" \? WORDPRESS_CROP/.test(panel)) {
    fail("components/EventsPanel.tsx does not crop the photos on the WordPress tab");
  }
  // And only there: Facebook and Further must still offer the whole photo.
  if (/crop=\{\{\s*w:\s*1000/.test(panel)) {
    fail("components/EventsPanel.tsx crops a photo on a tab that should offer it whole");
  }
}

// ── The crop keeps the subject, not the centre ─────────────────────────────
{
  const route = readFileSync("app/api/fb-events/[taskId]/photos/[index]/route.ts", "utf-8");
  if (!/position:\s*sharp\.strategy\.attention/.test(route)) {
    fail("the photo route no longer crops toward the subject (sharp.strategy.attention)");
  }
}

/**
 * A wide frame that is dull grey everywhere except a vivid, busy patch off to
 * the right. "Attention" should move the crop toward that patch; a centre cut
 * would take the dull middle and miss it entirely. Measured by how much
 * colour survives the crop — grey has none, the patch has a lot.
 */
async function meanSaturation(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += Math.max(r, g, b) - Math.min(r, g, b);
  }
  return sum / px;
}

async function cropBehaviour() {
  const W = 1800;
  const H = 667;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (x >= 1500) {
        // The subject: high-saturation, high-frequency stripes on the right.
        const red = (x + y) % 2 === 0;
        px[i] = red ? 230 : 240;
        px[i + 1] = red ? 20 : 210;
        px[i + 2] = red ? 20 : 20;
      } else {
        px[i] = px[i + 1] = px[i + 2] = 128; // dull grey, no colour
      }
    }
  }
  const source = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

  const attention = await sharp(source)
    .resize(1000, 667, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();
  const centre = await sharp(source)
    .resize(1000, 667, { fit: "cover", position: "center" })
    .toBuffer();

  const aMeta = await sharp(attention).metadata();
  if (aMeta.width !== 1000 || aMeta.height !== 667) {
    fail(`the crop is not 1000×667, it is ${aMeta.width}×${aMeta.height}`);
  }

  const aSat = await meanSaturation(attention);
  const cSat = await meanSaturation(centre);
  // The centre crop takes the grey middle and should see almost no colour;
  // attention should pull the vivid patch in. A clear margin, not a hair.
  if (!(aSat > cSat + 15)) {
    fail(
      `attention did not favour the subject: it kept ${aSat.toFixed(1)} saturation vs the ` +
        `centre crop's ${cSat.toFixed(1)} — expected a margin of at least 15`,
    );
  }
}

async function main() {
  await cropBehaviour();

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "\nThe WordPress tab crops to exactly 1000×667, only there, and the cut moves toward\n" +
      "the subject rather than taking the centre — a vivid patch off to one side survives it.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
