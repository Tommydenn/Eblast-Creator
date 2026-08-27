/**
 * Working out whether a line of text fits, without a browser.
 *
 * Seven lines in the eblast must never wrap — the hero headline, script
 * subheadline, date and time and address, the story eyebrow and title, and the
 * footer date and time. They carry white-space:nowrap, so if the text is too
 * wide for the column it would spill out of the email rather than break. The
 * size therefore has to be chosen so it genuinely fits, before it is sent.
 *
 * That measurement has to give the SAME answer in the editor's preview and on
 * the server that renders an approval or a HubSpot push, or the two would
 * disagree about the size. So it can't use the browser's canvas, which the
 * server hasn't got. Instead these are the real advance widths of every
 * character in the fonts recipients actually fall back to, captured at 100px
 * from the browser; widths scale linearly, so any size is a multiplication.
 *
 * Measured against the BACKUP font, never the brand font: the brand faces are
 * not installed on 14 of 15 machines, so measuring them would be measuring
 * something almost nobody sees.
 */

type WidthTable = Record<string, number>;

/** Advance widths at 100px. Captured from the browser, rounded to 0.1px. */
const GEORGIA: WidthTable = {"0":61.4,"1":43,"2":55.9,"3":55.2,"4":56.5,"5":52.8,"6":56.6,"7":50.2,"8":59.6,"9":56.6," ":24.1,"!":33.1,"\"":41.2,"#":64.3,"$":61,"%":81.7,"&":71,"'":21.5,"(":37.5,")":37.5,"*":47.2,"+":64.3,",":27,"-":37.4,".":27,"/":46.9,":":31.3,";":31.3,"<":64.3,"=":64.3,">":64.3,"?":47.9,"@":92.9,"A":67.1,"B":65.4,"C":64.2,"D":74.9,"E":65.3,"F":59.9,"G":72.5,"H":81.5,"I":39,"J":51.8,"K":69.4,"L":60.4,"M":92.7,"N":76.7,"O":74.4,"P":61,"Q":74.4,"R":70.2,"S":56.1,"T":61.9,"U":75.6,"V":66.7,"W":97.6,"X":71,"Y":61.5,"Z":60.2,"[":37.5,"\\":46.9,"]":37.5,"^":64.3,"_":64.3,"`":50,"a":50.4,"b":56,"c":45.4,"d":57.4,"e":48.3,"f":32.5,"g":50.9,"h":58.2,"i":29.3,"j":29.2,"k":53.6,"l":28.6,"m":88.1,"n":59.1,"o":53.9,"p":57.1,"q":56,"r":41,"s":43.2,"t":34.5,"u":57.5,"v":49.7,"w":73.7,"x":50.5,"y":49.2,"z":44.4,"{":43,"|":37.5,"}":43,"~":64.3,"·":27.9,"–":64.3,"—":85.7,"’":22.7,"‘":22.7,"“":41,"”":41,"…":80.7,"é":48.3,"ñ":59.1};

const ARIAL: WidthTable = {"0":55.6,"1":55.6,"2":55.6,"3":55.6,"4":55.6,"5":55.6,"6":55.6,"7":55.6,"8":55.6,"9":55.6," ":27.8,"!":27.8,"\"":35.5,"#":55.6,"$":55.6,"%":88.9,"&":66.7,"'":19.1,"(":33.3,")":33.3,"*":38.9,"+":58.4,",":27.8,"-":33.3,".":27.8,"/":27.8,":":27.8,";":27.8,"<":58.4,"=":58.4,">":58.4,"?":55.6,"@":101.5,"A":66.7,"B":66.7,"C":72.2,"D":72.2,"E":66.7,"F":61.1,"G":77.8,"H":72.2,"I":27.8,"J":50,"K":66.7,"L":55.6,"M":83.3,"N":72.2,"O":77.8,"P":66.7,"Q":77.8,"R":72.2,"S":66.7,"T":61.1,"U":72.2,"V":66.7,"W":94.4,"X":66.7,"Y":66.7,"Z":61.1,"[":27.8,"\\":27.8,"]":27.8,"^":46.9,"_":55.6,"`":33.3,"a":55.6,"b":55.6,"c":50,"d":55.6,"e":55.6,"f":27.8,"g":55.6,"h":55.6,"i":22.2,"j":22.2,"k":50,"l":22.2,"m":83.3,"n":55.6,"o":55.6,"p":55.6,"q":55.6,"r":33.3,"s":50,"t":27.8,"u":55.6,"v":50,"w":72.2,"x":50,"y":50,"z":50,"{":33.4,"|":26,"}":33.4,"~":58.4,"·":33.3,"–":55.6,"—":100,"’":22.2,"‘":22.2,"“":33.3,"”":33.3,"…":100,"é":55.6,"ñ":55.6};

const SCRIPT: WidthTable = {"0":43.8,"1":27.1,"2":43.8,"3":51,"4":42.7,"5":42.7,"6":41.7,"7":43.7,"8":44.8,"9":45.8," ":28.1,"!":34.4,"\"":30.2,"#":60.8,"$":46.9,"%":68.8,"&":49,"'":21.9,"(":33.3,")":33.3,"*":32.3,"+":66.7,",":33.3,"-":51,".":33.3,"/":28.1,":":33.3,";":33.3,"<":66.7,"=":66.7,">":66.7,"?":32.3,"@":101,"A":63.5,"B":55.2,"C":60.4,"D":64.6,"E":61.5,"F":56.3,"G":56.3,"H":64.6,"I":43.8,"J":37.5,"K":65.6,"L":59.4,"M":83.3,"N":57.3,"O":57.3,"P":62.5,"Q":64.6,"R":65.6,"S":64.6,"T":57.3,"U":62.5,"V":42.7,"W":69.8,"X":60.4,"Y":55.2,"Z":54.2,"[":29.2,"\\":28.1,"]":36.5,"^":46.9,"_":50,"`":33.3,"a":40.6,"b":32.3,"c":29.2,"d":41.7,"e":29.2,"f":27.1,"g":38.5,"h":36.5,"i":22.9,"j":28.1,"k":36.5,"l":22.9,"m":55.2,"n":36.5,"o":31.3,"p":40.6,"q":37.5,"r":29.2,"s":31.2,"t":25,"u":38.5,"v":32.3,"w":49,"x":29.2,"y":37.5,"z":30.2,"{":41.7,"|":54.2,"}":41.7,"~":66.7,"·":24.9,"–":50,"—":100,"’":33.3,"‘":33.3,"“":46.9,"”":46.9,"…":100,"é":29.2,"ñ":36.5};

export type FitFace = "serif" | "sans" | "script";

const TABLES: Record<FitFace, WidthTable> = { serif: GEORGIA, sans: ARIAL, script: SCRIPT };

/** Anything not in the table — an em dash from a paste, an accent — falls back
 *  to a mid-weight character rather than counting as zero. */
const UNKNOWN = 60;

/**
 * Room to spare, and a deliberately generous amount of it.
 *
 * Summing advance widths ignores kerning; Outlook measures through Word rather
 * than a browser; and Android has neither Arial nor Helvetica, so it lands on
 * Roboto, which these tables do not describe. A line that overruns cannot wrap
 * — it pushes out of the frame — so the cost of fitting too tightly is far
 * higher than the cost of text being a point smaller than it strictly needs.
 */
const SAFETY = 1.08;

/** Width of `text` at `size` px in the given face, in px. */
export function measureLine(text: string, face: FitFace, size: number): number {
  const table = TABLES[face];
  let units = 0;
  for (const ch of text) units += table[ch] ?? UNKNOWN;
  return (units / 100) * size * SAFETY;
}

/**
 * The largest size at or below `preferred` at which the text holds one line.
 *
 * Never returns more than the preferred size — this only ever shrinks, and only
 * when the alternative is text spilling out of the email. `floor` is a share of
 * the preferred size, so a 40px headline with a 0.6 floor never drops below
 * 24px; if it still doesn't fit there, the floor is returned and the editor
 * flags it rather than shrinking into something unreadable.
 */
export function fitFontSize(
  text: string,
  face: FitFace,
  preferred: number,
  maxWidth: number,
  floor = 0.6,
): number {
  const plain = text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return preferred;
  if (measureLine(plain, face, preferred) <= maxWidth) return preferred;

  const min = Math.max(8, Math.round(preferred * floor));
  for (let size = preferred - 1; size > min; size--) {
    if (measureLine(plain, face, size) <= maxWidth) return size;
  }
  return min;
}

/** True when even the floor can't hold it — the editor should say so. */
export function needsShortening(
  text: string,
  face: FitFace,
  preferred: number,
  maxWidth: number,
  floor = 0.6,
): boolean {
  const plain = text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return false;
  const min = Math.max(8, Math.round(preferred * floor));
  return measureLine(plain, face, min) > maxWidth;
}

/** Which width table matches a font stack. */
export function faceFor(fontStack: string): FitFace {
  if (/script|cursive|handwriting/i.test(fontStack)) return "script";
  if (/serif/i.test(fontStack) && !/sans-serif/i.test(fontStack)) return "serif";
  return "sans";
}
