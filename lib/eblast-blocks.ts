/**
 * What the email is made of, in the order it is made of it.
 *
 * One list, read by the renderer when it draws and by the sidebar when it
 * offers to rearrange. They used to agree only by coincidence — the sidebar
 * offered a place to add a line after the hero's call button and the email
 * never drew one, so a line added there was saved and never seen. A guard
 * checks the two still agree.
 *
 * A block belongs to exactly one section and cannot leave it. That is the
 * whole of the containment rule: moving a section moves everything in it, and
 * nothing can be dragged from the hero into the story.
 */

/** A piece of a section that can be hidden, added after, and moved. */
export interface BlockDef {
  /** The name the email tags it with, and what a stored order refers to. */
  name: string;
  /** What the sidebar calls it. */
  label: string;
  /**
   * The gap that follows it, where added lines go.
   *
   * Usually the block's own name. The hero's date band is the exception: it
   * is one block, and the gap after it is the one that was already called
   * `heroAddress` when the address was the last thing inside it.
   */
  slot: string;
}

export interface SectionDef {
  /** The name on data-section, and what a stored order refers to. */
  name: string;
  /** The flag that hides the whole section. */
  flag: string;
  /** The gap at the top of the section, above every block. */
  startSlot?: string;
  /**
   * The blocks that can be rearranged within it, in the order the template
   * draws them.
   *
   * Only blocks that share one table cell are in here, because the order is
   * applied by drawing that cell's contents in a different sequence. The
   * story's body copy has a cell of its own, carrying the padding that sets
   * the section off from the one above — so it stays below the heading, and
   * only the eyebrow and the title trade places.
   */
  blocks: BlockDef[];
  /** Blocks the section draws but does not rearrange — they still take lines. */
  fixedSlots?: string[];
}

export const SECTIONS: SectionDef[] = [
  { name: "Header", flag: "headerSectionHidden", blocks: [] },
  {
    name: "Hero",
    flag: "heroSectionHidden",
    startSlot: "hero:start",
    blocks: [
      { name: "rsvpLabel", label: "RSVP Label", slot: "rsvpLabel" },
      { name: "headline", label: "Headline", slot: "headline" },
      { name: "scriptSubheadline", label: "Script Subheadline", slot: "scriptSubheadline" },
      { name: "eventDateTime", label: "Date, Time & Address", slot: "heroAddress" },
      { name: "ctaButtonLabel", label: "Call Button", slot: "ctaButtonLabel" },
    ],
    // Inside the bordered band, between the time and the address.
    fixedSlots: ["eventTime"],
  },
  {
    name: "Story",
    flag: "storySectionHidden",
    startSlot: "story:start",
    blocks: [
      { name: "storyEyebrow", label: "Section Eyebrow", slot: "storyEyebrow" },
      { name: "storyScriptTitle", label: "Section Title", slot: "storyScriptTitle" },
    ],
    fixedSlots: ["bodyParagraphs"],
  },
  { name: "Secondary Image", flag: "secondaryImageSectionHidden", blocks: [] },
  { name: "Photo Gallery", flag: "gallerySectionHidden", blocks: [], fixedSlots: ["galleryLabel"] },
  {
    name: "Call to Action",
    flag: "finalCtaSectionHidden",
    startSlot: "cta:start",
    blocks: [
      { name: "ctaRsvpLabel", label: "RSVP Label", slot: "ctaRsvpLabel" },
      { name: "ctaEventDateTime", label: "Date & Time", slot: "ctaEventTime" },
      { name: "finalCtaButtonLabel", label: "Call Button", slot: "finalCtaButtonLabel" },
    ],
  },
  {
    name: "Footer",
    flag: "footerSectionHidden",
    startSlot: "top",
    blocks: [
      { name: "footerButtonLabel", label: "Website Button", slot: "button" },
      { name: "thankYouText", label: "Thank You Text", slot: "thankYou" },
      { name: "footerSenderName", label: "Salesperson Name", slot: "senderName" },
      { name: "footerName", label: "Footer Signature", slot: "footerName" },
      { name: "footerSenderEmail", label: "Salesperson Email", slot: "senderEmail" },
    ],
  },
];

export const SECTION_NAMES = SECTIONS.map((s) => s.name);

export function sectionDef(name: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.name === name);
}

/** Every gap in the email, which is every place a line can be added. */
export function allSlots(): string[] {
  const out: string[] = [];
  for (const section of SECTIONS) {
    if (section.startSlot) out.push(section.startSlot);
    for (const block of section.blocks) out.push(block.slot);
    for (const slot of section.fixedSlots ?? []) out.push(slot);
  }
  return out;
}

/**
 * A stored order, made safe.
 *
 * A stored order is whatever was written the last time somebody rearranged
 * something, and the template has moved on since more than once. Names that no
 * longer exist are dropped, and names the stored order never heard of are put
 * back beside the neighbour they were drawn after — so a block added to the
 * template later appears in its proper place rather than at the end, and a
 * draft can never lose one by holding a stale list.
 */
export function applyOrder(canonical: string[], stored: string[] | undefined): string[] {
  if (!stored?.length) return canonical;

  const known = new Set(canonical);
  const out: string[] = [];
  const placed = new Set<string>();
  for (const name of stored) {
    if (known.has(name) && !placed.has(name)) {
      out.push(name);
      placed.add(name);
    }
  }

  for (let i = 0; i < canonical.length; i++) {
    const name = canonical[i];
    if (placed.has(name)) continue;
    // Sit it after the nearest thing that came before it in the template and
    // has already found a home.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const was = out.indexOf(canonical[j]);
      if (was !== -1) {
        at = was + 1;
        break;
      }
    }
    out.splice(at, 0, name);
    placed.add(name);
  }

  return out;
}

interface Ordered {
  sectionOrder?: string[];
  blockOrder?: Record<string, string[]>;
}

/** The sections, in the order this draft wants them. */
export function orderedSections(flyer: Ordered): SectionDef[] {
  return applyOrder(SECTION_NAMES, flyer.sectionOrder)
    .map((name) => sectionDef(name))
    .filter((s): s is SectionDef => !!s);
}

/** One section's blocks, in the order this draft wants them. */
export function orderedBlocks(flyer: Ordered, section: string): BlockDef[] {
  const def = sectionDef(section);
  if (!def) return [];
  const canonical = def.blocks.map((b) => b.name);
  return applyOrder(canonical, flyer.blockOrder?.[section])
    .map((name) => def.blocks.find((b) => b.name === name))
    .filter((b): b is BlockDef => !!b);
}

/** The section a block belongs to, which is the only one it can move within. */
export function sectionOfBlock(block: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.blocks.some((b) => b.name === block));
}
