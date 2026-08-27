/**
 * Backup fonts for the brand typefaces.
 *
 * Email clients don't download fonts. Measured on a normal machine, 14 of the
 * 15 brand faces in use aren't installed — only Bookman Old Style, because it
 * ships with Windows. So naming "Nexa" and nothing else means every recipient
 * gets whatever their client falls back to, and those differ in width by up to
 * 40%: the same date line is 452px in Arial Narrow and 687px in Courier New
 * against a 528px column. That is why one person sees one line and the next
 * sees two.
 *
 * Naming a backup doesn't make the brand font appear — it decides what happens
 * when it's missing, which is the normal case. Each one here is chosen to match
 * the real face's shape and, more importantly, its WIDTH, since width is what
 * decides whether a line wraps.
 *
 * Applied when the email is built, NOT stored against the community. The
 * Community page keeps showing exactly what was typed there, and a font changed
 * later picks up a sensible backup on its own.
 */

const SERIF = `Georgia, 'Times New Roman', serif`;
const NARROW_SERIF = `'Times New Roman', Times, serif`;
const SANS = `Arial, Helvetica, sans-serif`;
const NARROW_SANS = `'Arial Narrow', Arial, Helvetica, sans-serif`;

/**
 * Keyed by the brand font's own name, lowercased. The value is what follows it
 * in the stack.
 */
const BACKUPS: Record<string, string> = {
  // Serif brand faces
  "p22 mackinac": SERIF,          // contemporary serif, close to Georgia in weight and body size
  "bookman old style": SERIF,     // wide slab serif; Georgia is the nearest wide serif
  "adobe caslon pro": NARROW_SERIF, // old-style and narrow — Georgia's body is far too large
  "garamond be": `Garamond, 'Times New Roman', Times, serif`, // Garamond ships with Office
  "garamond": `'Times New Roman', Times, serif`,
  "minion": NARROW_SERIF,         // near-identical proportions to Times
  "minion pro": NARROW_SERIF,
  "hightower": SERIF,

  // Sans brand faces
  "nexa": SANS,
  "bigcity grotesque pro": SANS,
  "montserrat": SANS,
  "asul": SANS,
  "f37 moon": SANS,
  "raleway": SANS,
  "neutra text": SANS,
  "josefin sans": NARROW_SANS,    // noticeably narrow and light
  "bebas neue": NARROW_SANS,      // condensed display face; plain Arial would be far wider
};

/** Faces that read as serif when we have to guess. */
const SERIF_HINTS = /serif|garamond|caslon|minion|mackinac|bookman|times|georgia|baskerville|didot|hightower/i;

/**
 * The brand font followed by its backup.
 *
 * A value that already lists more than one font is left exactly as it is —
 * that has been chosen deliberately and is none of our business.
 */
export function withFallback(font: string | undefined | null): string {
  const name = (font ?? "").trim();
  if (!name) return SANS;
  // Already a stack.
  if (name.includes(",")) return name;

  const backup = BACKUPS[name.toLowerCase()];
  if (backup) return `'${name}', ${backup}`;

  // Unknown face: guess by name, which is better than leaving it to the client.
  return `'${name}', ${SERIF_HINTS.test(name) ? SERIF : SANS}`;
}

/**
 * The font a recipient most likely actually sees — the first backup, since the
 * brand face is almost never installed. This is what any "will it fit?"
 * measurement has to use; measuring the brand font would be measuring something
 * hardly anyone gets.
 */
export function likelyRenderedFont(font: string | undefined | null): string {
  const stack = withFallback(font);
  const parts = stack.split(",").map((p) => p.trim());
  return parts.length > 1 ? parts.slice(1).join(", ") : parts[0];
}
