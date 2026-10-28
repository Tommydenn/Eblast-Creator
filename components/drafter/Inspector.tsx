"use client";

import React, { useState } from "react";
import { useDraft } from "@/context/DraftContext";
import {
  RichInput,
  RichBodyEditor,
  CallButtonField,
  EmailButtonField,
  SenderNameField,
} from "@/components/drafter/RichEditor";
import { combineDateTime, splitDateTime } from "@/lib/date-time-line";
import { PhotoField } from "@/components/drafter/PhotoField";
import { ColorRow } from "@/components/drafter/ColorRow";
import { SectionList } from "@/components/drafter/SectionList";
import { Button, EyeButton, Group, Pill, Row, inputClass, type MenuItem } from "@/components/drafter/ui";
import { orderedBlocks, sectionDef, sectionSlots, type BlockDef } from "@/lib/eblast-blocks";
import { SECTION_PANELS } from "@/lib/eblast-inspector";
import {
  communityAddressLine,
  defaultFooterName,
  defaultGalleryLabel,
  DEFAULT_THANK_YOU_TEXT,
  DEFAULT_WEBSITE_BUTTON_LABEL,
} from "@/lib/eblast-defaults";
import { allCustomLines, type CustomLine, type CustomSlot, type ExtractedFlyer } from "@/lib/extracted-flyer";

/**
 * The panel, which is whatever part of the email you are standing in.
 *
 * There is no list of sections beside it and no row of tabs above it. The
 * email is the navigation: clicking a part of it opens that part here, and
 * clicking away from everything opens the email's own settings. So the panel
 * only ever describes one thing, and what it holds is everything that thing
 * owns — its words, its photos and its colours — rather than whichever of
 * those happened to be grouped under the same tab.
 */

/** How each block is hidden: by name, by a flag of its own, or line by line. */
const BLOCK_HIDE: Record<string, { block?: string; flag?: string; parts?: Array<[string, string]> }> = {
  rsvpLabel: { block: "rsvpLabel" },
  headline: { block: "headline" },
  scriptSubheadline: { block: "scriptSubheadline" },
  eventDateTime: { parts: [["the date", "eventDate"], ["the time", "eventTime"]] },
  ctaButtonLabel: { flag: "ctaButtonHidden" },
  storyEyebrow: { block: "storyEyebrow" },
  storyScriptTitle: { block: "storyScriptTitle" },
  ctaRsvpLabel: { block: "ctaRsvpLabel" },
  ctaEventDateTime: { parts: [["the date", "ctaEventDate"], ["the time", "ctaEventTime"]] },
  finalCtaButtonLabel: { flag: "finalCtaButtonHidden" },
  footerButtonLabel: { flag: "footerButtonHidden" },
  thankYouText: { block: "thankYouText" },
  footerSenderName: { block: "footerSenderName" },
  footerName: { block: "footerName" },
  footerSenderEmail: { block: "footerSenderEmail" },
};

/** What the panel calls each block, which is shorter than the email's name for it. */
const LABELS: Record<string, string> = {
  rsvpLabel: "RSVP label",
  headline: "Headline",
  scriptSubheadline: "Script subheading",
  eventDateTime: "Date and time",
  heroAddress: "Address",
  ctaButtonLabel: "Call button",
  storyEyebrow: "Eyebrow",
  storyScriptTitle: "Script title",
  bodyParagraphs: "Body",
  galleryLabel: "Label",
  ctaRsvpLabel: "RSVP label",
  ctaEventDateTime: "Date and time",
  finalCtaButtonLabel: "Call button",
  footerButtonLabel: "Website button",
  thankYouText: "Closing",
  footerSenderName: "Salesperson",
  footerName: "Signature",
  footerSenderEmail: "Salesperson email",
};

export default function Inspector({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (section: string | null) => void;
}) {
  const { fields } = useDraft();
  if (!fields) return null;
  return selected ? (
    <SectionPanel name={selected} onBack={() => onSelect(null)} />
  ) : (
    <EmailPanel onSelect={onSelect} />
  );
}

// ── Nothing selected: the email itself ──────────────────────────────────────

function EmailPanel({ onSelect }: { onSelect: (section: string) => void }) {
  const { fields, setField, subjectSpecialist, swapSubjectLine, resetColors, community } = useDraft();
  const [resetting, setResetting] = useState(false);
  if (!fields) return null;

  const alternatives = subjectSpecialist?.alternatives.length
    ? [subjectSpecialist.winner, ...subjectSpecialist.alternatives]
    : [];

  return (
    <>
      <header className="px-4 pb-3 pt-4">
        <h2 className="text-[16px] font-semibold leading-tight text-[#1B1D1C]">This email</h2>
        <p className="mt-1 text-[12px] text-[#495250]">Click any part of it to edit that part.</p>
      </header>

      <Group label="The inbox">
        <Row label="Subject" note={`${fields.subject.length}/90 · reads best under 60`}>
          <input
            type="text"
            value={fields.subject}
            onChange={(e) => setField("subject", e.target.value)}
            className={inputClass}
            placeholder="Subject line"
            maxLength={90}
          />
        </Row>

        <Row label="Preview line" note={`${fields.previewText.length}/150 · reads best under 120 · shown under the subject, never in the email`}>
          <textarea
            value={fields.previewText}
            onChange={(e) => setField("previewText", e.target.value)}
            rows={2}
            className={inputClass + " resize-none"}
            placeholder="The line the inbox shows under the subject"
            maxLength={150}
          />
        </Row>

        {alternatives.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-[#495250]">Other subject lines</p>
            <div className="space-y-1.5">
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => swapSubjectLine(alt.subject, alt.previewText)}
                  className={[
                    "w-full rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                    alt.subject === fields.subject
                      ? "border-[#1F4538] bg-[#EDF2EF] text-[#1F4538]"
                      : "border-[#E4E0D9] bg-white text-[#1B1D1C] hover:border-[#1F4538]",
                  ].join(" ")}
                >
                  <span className="block">{alt.subject}</span>
                  {alt.previewText && <span className="mt-0.5 block truncate text-[11px] text-[#6A736F]">{alt.previewText}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Group>

      <Group label="Order">
        <SectionList onSelect={onSelect} />
      </Group>

      <Group label="Colour">
        {resetting ? (
          <div className="rounded-md border border-[#E4E0D9] bg-[#F7F6F3] p-3">
            <p className="text-[12px] text-[#1B1D1C]">
              Put every colour back to {community?.displayName ?? "this community"}&rsquo;s own?
            </p>
            <p className="mt-1 text-[11px] text-[#6A736F]">Colours only — bold, italic and size stay.</p>
            <div className="mt-2.5 flex gap-2">
              <Button tone="secondary" onClick={() => { resetColors(); setResetting(false); }}>Reset</Button>
              <Button tone="quiet" onClick={() => setResetting(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button tone="secondary" onClick={() => setResetting(true)}>Reset every colour</Button>
        )}
      </Group>
    </>
  );
}

// ── One section ─────────────────────────────────────────────────────────────

function SectionPanel({ name, onBack }: { name: string; onBack: () => void }) {
  const { fields, setField, setFields, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  const [confirming, setConfirming] = useState<string | null>(null);

  const def = sectionDef(name);
  const panel = SECTION_PANELS[name];
  if (!fields || !def || !panel) return null;

  const flyer = fields as unknown as Record<string, unknown>;
  const hiddenSection = !!flyer[def.flag];
  const hiddenBlocks = fields.hiddenBlocks ?? [];
  const isHidden = (block?: string, flag?: string) =>
    flag ? !!flyer[flag] : !!block && hiddenBlocks.includes(block);

  const toggle = (block?: string, flag?: string) => {
    if (flag) {
      setField(flag as never, (flyer[flag] ? undefined : true) as never);
      return;
    }
    if (!block) return;
    const next = hiddenBlocks.includes(block)
      ? hiddenBlocks.filter((b) => b !== block)
      : [...hiddenBlocks, block];
    setField("hiddenBlocks", next.length ? next : undefined);
  };

  // ── Added lines ───────────────────────────────────────────────────────────
  const slots = sectionSlots(fields, name);
  const all = allCustomLines(fields);
  // Writing moves whatever the old footer-only list held into the new one, so
  // a draft written before the other sections had gaps quietly catches up the
  // first time anybody touches a line.
  const writeLines = (next: CustomLine[]) =>
    setFields({ customLines: next.length ? next : undefined, footerCustomLines: undefined });

  const addLine = () => {
    const last = slots[slots.length - 1];
    if (!last) return;
    writeLines([
      ...all,
      { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: "", after: last as CustomSlot },
    ]);
  };

  /**
   * A line walks the section's gaps one at a time, and reorders within a gap
   * that holds more than one. Which is the whole of where a line can go — it
   * is added at the end of its section and moved from there, rather than being
   * placed by picking one of a dozen standing controls between the fields.
   */
  const moveLine = (line: CustomLine, dir: -1 | 1) => {
    const here = slots.indexOf(line.after);
    const mine = all.filter((l) => l.after === line.after);
    const pos = mine.indexOf(line);
    const next = [...all];
    const neighbour = mine[pos + dir];
    if (neighbour) {
      const a = next.indexOf(line);
      const b = next.indexOf(neighbour);
      [next[a], next[b]] = [next[b], next[a]];
    } else {
      const target = slots[here + dir];
      if (!target) return;
      next[next.indexOf(line)] = { ...line, after: target as CustomSlot };
    }
    writeLines(next);
  };

  const canMoveLine = (line: CustomLine, dir: -1 | 1) => {
    const here = slots.indexOf(line.after);
    const mine = all.filter((l) => l.after === line.after);
    return !!mine[mine.indexOf(line) + dir] || !!slots[here + dir];
  };

  const lineRows = (slot: string) =>
    all
      .filter((l) => l.after === slot)
      .map((line) => (
        <Row
          key={line.id}
          label="Added line"
          menu={[
            { label: "Move up", onClick: () => moveLine(line, -1), disabled: !canMoveLine(line, -1) },
            { label: "Move down", onClick: () => moveLine(line, 1), disabled: !canMoveLine(line, 1) },
            { label: "Remove", onClick: () => setConfirming(line.id), danger: true },
          ]}
        >
          <RichInput
            value={line.text}
            onValueChange={(html) => writeLines(all.map((l) => (l.id === line.id ? { ...l, text: html } : l)))}
            placeholder="Your words"
            className={inputClass}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
            activeFieldNameRef={activeFieldNameRef}
            fieldName={`footerCustomLine:${line.id}`}
          />
          {confirming === line.id && (
            <div className="mt-1.5 flex items-center gap-2 rounded-md border border-[#EFD9D7] bg-[#FBF2F1] px-2.5 py-1.5">
              <span className="flex-1 text-[11.5px] text-[#A3302B]">Remove this line and its words?</span>
              <button
                type="button"
                onClick={() => { writeLines(all.filter((l) => l.id !== line.id)); setConfirming(null); }}
                className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-[#A3302B] hover:bg-white"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded px-1.5 py-0.5 text-[11.5px] text-[#495250] hover:bg-white"
              >
                Keep
              </button>
            </div>
          )}
        </Row>
      ));

  // ── Blocks ────────────────────────────────────────────────────────────────
  const order = orderedBlocks(fields, name);
  const moveBlock = (block: BlockDef, dir: -1 | 1) => {
    const names = order.map((b) => b.name);
    const at = names.indexOf(block.name);
    const to = at + dir;
    if (at === -1 || to < 0 || to >= names.length) return;
    names.splice(to, 0, names.splice(at, 1)[0]);
    setField("blockOrder", { ...(fields.blockOrder ?? {}), [name]: names });
  };

  const blockMenu = (block: BlockDef): MenuItem[] => {
    const hide = BLOCK_HIDE[block.name];
    const items: MenuItem[] = [];
    if (hide?.parts) {
      for (const [what, part] of hide.parts) {
        items.push({ label: `${isHidden(part) ? "Show" : "Hide"} ${what}`, onClick: () => toggle(part) });
      }
    } else if (hide) {
      items.push({
        label: isHidden(hide.block, hide.flag) ? "Show this" : "Hide this",
        onClick: () => toggle(hide.block, hide.flag),
      });
    }
    if (order.length > 1) {
      const at = order.findIndex((b) => b.name === block.name);
      items.push({ label: "Move up", onClick: () => moveBlock(block, -1), disabled: at <= 0 });
      items.push({ label: "Move down", onClick: () => moveBlock(block, 1), disabled: at >= order.length - 1 });
    }
    return items;
  };

  const blockHidden = (block: BlockDef) => {
    const hide = BLOCK_HIDE[block.name];
    if (!hide) return false;
    if (hide.parts) return hide.parts.every(([, part]) => isHidden(part));
    return isHidden(hide.block, hide.flag);
  };

  const rich = {
    className: inputClass,
    activeEditorRef,
    activeEditorCallback,
    activeFieldNameRef,
  };

  /** One block's control, plus the gap the email draws inside it. */
  function blockRows(block: BlockDef): React.ReactNode {
    const label = LABELS[block.name] ?? block.label;
    const menu = blockMenu(block);
    const hidden = blockHidden(block);
    const wrap = (children: React.ReactNode, note?: string) => (
      <Row key={block.name} label={label} menu={menu} hidden={hidden} note={note}>
        {children}
      </Row>
    );

    switch (block.name) {
      case "rsvpLabel":
        return wrap(
          <RichInput {...rich} fieldName="rsvpLabel" value={fields!.rsvpLabel ?? ""} placeholder="e.g. RSVP required"
            onValueChange={(html) => setField("rsvpLabel", html || undefined)} />,
          "Leave it blank if no RSVP is needed.",
        );
      case "headline":
        return wrap(
          <RichInput {...rich} fieldName="headline" value={fields!.headline} placeholder="The event"
            onValueChange={(html) => setField("headline", html)} />,
        );
      case "scriptSubheadline":
        return wrap(
          <RichInput {...rich} fieldName="scriptSubheadline" value={fields!.scriptSubheadline ?? ""} placeholder="Optional handwritten line"
            onValueChange={(html) => setField("scriptSubheadline", html || undefined)} />,
        );
      case "eventDateTime":
        return (
          <React.Fragment key={block.name}>
            <Row label={label} menu={menu} hidden={hidden} note="The date, then the time on the next line.">
              <RichInput
                {...rich}
                fieldName="eventDate"
                value={combineDateTime(fields!.eventDate, fields!.eventTime)}
                placeholder="Wednesday, May 13"
                onValueChange={(html) =>
                  // Editing the date answers the question, so the warning goes with it.
                  setFields({ ...splitDateTime(html), dateConflict: undefined })
                }
              />
              {fields!.dateConflict && (
                <div className="mt-1.5 rounded-md border border-[#EFD9D7] bg-[#FBF2F1] px-2.5 py-2">
                  <p className="text-[11.5px] leading-snug text-[#A3302B]">{fields!.dateConflict}</p>
                  <button
                    onClick={() => setField("dateConflict", undefined)}
                    className="mt-1 text-[11.5px] font-medium text-[#A3302B] underline underline-offset-2"
                  >
                    The date is right
                  </button>
                </div>
              )}
            </Row>
            {lineRows("eventTime")}
            <Row
              label={LABELS.heroAddress}
              hidden={isHidden("heroAddress")}
              menu={[{ label: isHidden("heroAddress") ? "Show this" : "Hide this", onClick: () => toggle("heroAddress") }]}
            >
              <RichInput {...rich} fieldName="heroAddress" value={fields!.heroAddress ?? communityAddressLine(community)}
                placeholder="Street, city, state" onValueChange={(html) => setField("heroAddress", html)} />
            </Row>
          </React.Fragment>
        );
      case "ctaButtonLabel":
        return wrap(
          <CallButtonField {...rich} fieldName="ctaButtonLabel" value={fields!.ctaButtonLabel ?? ""}
            onValueChange={(html) => setField("ctaButtonLabel", html)} />,
        );
      case "storyEyebrow":
        return wrap(
          <RichInput {...rich} fieldName="storyEyebrow" value={fields!.storyEyebrow} placeholder="A small label above the story"
            onValueChange={(html) => setField("storyEyebrow", html)} />,
        );
      case "storyScriptTitle":
        return wrap(
          <RichInput {...rich} fieldName="storyScriptTitle" value={fields!.storyScriptTitle ?? ""} placeholder="Optional handwritten heading"
            onValueChange={(html) => setField("storyScriptTitle", html || undefined)} />,
        );
      case "ctaRsvpLabel":
        return wrap(
          <RichInput {...rich} fieldName="ctaRsvpLabel" value={fields!.ctaRsvpLabel ?? fields!.rsvpLabel ?? ""} placeholder="e.g. RSVP required"
            onValueChange={(html) => setField("ctaRsvpLabel", html)} />,
          "Follows the hero until you change it here.",
        );
      case "ctaEventDateTime":
        return wrap(
          <RichInput
            {...rich}
            fieldName="ctaEventDate"
            value={combineDateTime(fields!.ctaEventDate ?? fields!.eventDate, fields!.ctaEventTime ?? fields!.eventTime)}
            placeholder="Wednesday, May 13"
            onValueChange={(html) => {
              const { date, time } = splitDateTime(html);
              setFields({ ctaEventDate: date, ctaEventTime: time });
            }}
          />,
          "Follows the hero until you change it here.",
        );
      case "finalCtaButtonLabel":
        return wrap(
          <CallButtonField {...rich} fieldName="finalCtaButtonLabel" value={fields!.finalCtaButtonLabel ?? fields!.ctaButtonLabel ?? ""}
            onValueChange={(html) => setField("finalCtaButtonLabel", html || undefined)} />,
        );
      case "footerButtonLabel":
        return wrap(
          <RichInput {...rich} fieldName="footerButtonLabel" value={fields!.footerButtonLabel ?? DEFAULT_WEBSITE_BUTTON_LABEL}
            placeholder={DEFAULT_WEBSITE_BUTTON_LABEL} onValueChange={(html) => setField("footerButtonLabel", html || undefined)} />,
          "Always links to the community's website.",
        );
      case "thankYouText":
        return wrap(
          <RichInput {...rich} fieldName="thankYouText" value={fields!.thankYouText ?? DEFAULT_THANK_YOU_TEXT}
            placeholder={DEFAULT_THANK_YOU_TEXT} onValueChange={(html) => setField("thankYouText", html)} />,
        );
      case "footerSenderName":
        return wrap(
          <SenderNameField {...rich} fieldName="footerSenderName" value={fields!.footerSenderName ?? ""}
            onValueChange={(html) => setField("footerSenderName", html)} />,
        );
      case "footerName":
        return wrap(
          <RichInput {...rich} fieldName="footerName" value={fields!.footerName ?? defaultFooterName(community)}
            placeholder="Community name" onValueChange={(html) => setField("footerName", html)} />,
        );
      case "footerSenderEmail":
        return wrap(
          <EmailButtonField {...rich} fieldName="footerSenderEmail" value={fields!.footerSenderEmail ?? ""}
            onValueChange={(html) => setField("footerSenderEmail", html)} />,
        );
      default:
        return null;
    }
  }

  /** What a section draws after its blocks and never rearranges. */
  function tailRow(slot: string): React.ReactNode {
    if (slot === "bodyParagraphs") {
      return (
        <Row
          key={slot}
          label={LABELS.bodyParagraphs}
          hidden={isHidden("bodyParagraphs")}
          menu={[{ label: isHidden("bodyParagraphs") ? "Show this" : "Hide this", onClick: () => toggle("bodyParagraphs") }]}
          note="Enter for a new line, twice for a blank one."
        >
          <RichBodyEditor
            paragraphs={fields!.bodyParagraphs}
            onChange={(paras) => setField("bodyParagraphs", paras)}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
            activeFieldNameRef={activeFieldNameRef}
            fieldName="bodyParagraphs"
          />
        </Row>
      );
    }
    if (slot === "galleryLabel") {
      return (
        <Row
          key={slot}
          label={LABELS.galleryLabel}
          hidden={isHidden("galleryLabel")}
          menu={[{ label: isHidden("galleryLabel") ? "Show this" : "Hide this", onClick: () => toggle("galleryLabel") }]}
        >
          <RichInput {...rich} fieldName="galleryLabel" value={fields!.galleryLabel ?? defaultGalleryLabel(community)}
            placeholder="A small label above the photos" onValueChange={(html) => setField("galleryLabel", html)} />
        </Row>
      );
    }
    return null;
  }

  const content: React.ReactNode[] = [];
  if (panel.photo === "hero" || panel.photo === "secondary") {
    content.push(<PhotoField key="photo" slot={panel.photo} />);
  }
  if (def.startSlot) content.push(...lineRows(def.startSlot));
  for (const block of order) {
    content.push(blockRows(block));
    content.push(...lineRows(block.slot));
  }
  for (const slot of def.tailSlots ?? []) {
    content.push(tailRow(slot));
    content.push(...lineRows(slot));
  }
  if (panel.photo === "gallery") content.push(<PhotoField key="photo" slot="gallery" />);
  if (name === "Footer") content.push(<AdditionalEmails key="emails" />);

  return (
    <>
      <header className="px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 -ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] text-[#495250] transition-colors hover:bg-[#F7F6F3] hover:text-[#1B1D1C]"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          This email
        </button>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 truncate text-[16px] font-semibold leading-tight text-[#1B1D1C]">{name}</h2>
          {hiddenSection && <Pill>Hidden</Pill>}
          <EyeButton
            hidden={hiddenSection}
            what={`the ${name.toLowerCase()}`}
            onClick={() => setField(def.flag as never, (hiddenSection ? undefined : true) as never)}
          />
        </div>
        {panel.note && <p className="mt-1 text-[12px] leading-snug text-[#495250]">{panel.note}</p>}
      </header>

      {content.some(Boolean) && (
        <Group label="Content">
          {content}
          {slots.length > 0 && (
            <button
              type="button"
              onClick={addLine}
              className="w-full rounded-md border border-dashed border-[#DCD7CE] py-2 text-[12px] text-[#6A736F] transition-colors hover:border-[#1F4538] hover:text-[#1F4538]"
            >
              Add a line of text
            </button>
          )}
        </Group>
      )}

      <Group label="Appearance">
        {panel.colors.map((c) => <ColorRow key={c.field} field={c.field} label={c.label} />)}
      </Group>
    </>
  );
}

/**
 * The extra addresses under the salesperson's own.
 *
 * Not a block of the email — the template prints however many there are — so
 * it has no gap after it and nothing to reorder.
 */
function AdditionalEmails() {
  const { fields, setField, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  const primary = community?.senders?.find((s) => s.isPrimary) ?? community?.senders?.[0] ?? null;
  const fromCommunity = (community?.senders ?? [])
    .flatMap((s) => (s !== primary && s.email?.trim() ? [s.email.trim()] : []));
  const emails = fields.additionalFooterEmails ?? fromCommunity;

  // An empty array rather than undefined — undefined would fall back to the
  // community's own senders and the removal would not stick.
  const write = (next: string[]) => setField("additionalFooterEmails", next);

  return (
    <Row label="More emails" note={emails.length === 0 ? "Shown under the salesperson's own." : undefined}>
      <div className="space-y-1.5">
        {emails.map((email, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <RichInput
                value={email}
                onValueChange={(html) => write(emails.map((e, j) => (j === i ? html : e)))}
                placeholder="name@greatlakesmc.com"
                className={inputClass}
                activeEditorRef={activeEditorRef}
                activeEditorCallback={activeEditorCallback}
                activeFieldNameRef={activeFieldNameRef}
                fieldName={`additionalFooterEmails-${i}`}
              />
            </div>
            <button
              type="button"
              onClick={() => write(emails.filter((_, j) => j !== i))}
              title="Remove"
              className="mt-1.5 shrink-0 rounded px-1 text-[13px] leading-none text-[#6A736F] transition-colors hover:text-[#A3302B]"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => write([...emails, ""])}
          className="rounded px-1.5 py-0.5 text-[11.5px] font-medium text-[#495250] transition-colors hover:bg-[#F0EDE7] hover:text-[#1B1D1C]"
        >
          Add an email
        </button>
      </div>
    </Row>
  );
}
