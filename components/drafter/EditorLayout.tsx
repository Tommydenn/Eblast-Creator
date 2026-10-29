"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDraft } from "@/context/DraftContext";
import { AiBar } from "@/components/drafter/AiBar";
import Inspector from "./Inspector";
import PreviewPanel from "./PreviewPanel";
import ApprovalModal from "./ApprovalModal";
import { CopyPromptModal } from "./CopyPromptModal";
import { FlyerPanel, useHasFlyer } from "./FlyerPanel";
import { FloatingFormat } from "./FloatingFormat";
import { Button, Menu } from "./ui";
import { orderedSections } from "@/lib/eblast-blocks";
import { SECTION_PANELS } from "@/lib/eblast-inspector";
import type { EditorSection } from "@/context/DraftContext";

/**
 * The editor: the email on one side, one panel on the other, and nothing else
 * standing between them.
 *
 * It used to be four stacked bars — actions, a preview header, a formatting
 * toolbar, a row of section tabs — above two columns, one of which was a
 * permanent table of contents for a document already on screen. The email is
 * the navigation now, the formatting rides the selection, and what is left up
 * here is the handful of things that act on the whole draft.
 */

/** Which part of the email the AI is pointed at, for each of the real sections. */
const AI_SCOPE: Record<string, EditorSection> = {
  Header: "hero",
  Hero: "hero",
  Story: "story",
  "Secondary Image": "story",
  "Photo Gallery": "images",
  "Call to Action": "cta",
  Footer: "cta",
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// Error code generator — gives each error a short stable identifier.
function errorCode(msg: string): string {
  let h = 0;
  for (let i = 0; i < msg.length; i++) h = (Math.imul(31, h) + msg.charCodeAt(i)) | 0;
  return "ERR_" + Math.abs(h).toString(36).toUpperCase().slice(0, 5);
}

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function Check({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TopBar({
  onApproval,
  onTestApproval,
  autoSaveLabel,
}: {
  onApproval: () => void;
  onTestApproval: () => void;
  autoSaveLabel: string | null;
}) {
  const router = useRouter();
  const {
    community, fields, isSaving, saveError, isPushing, pushResult, pushError, approvalStatus,
    imagesLoading, waitingForImages, save, push, discard, dismissPushResult,
    canUndo, canRedo, undo, redo, lastRefineInstruction,
  } = useDraft();

  const [pushFlash, setPushFlash] = useState(false);
  const [approvalFlash, setApprovalFlash] = useState(false);
  const [hidePushError, setHidePushError] = useState(false);

  useEffect(() => {
    if (!pushError) { setHidePushError(false); return; }
    setHidePushError(false);
    const id = setTimeout(() => setHidePushError(true), 4500);
    return () => clearTimeout(id);
  }, [pushError]);

  const prevIsPushing = useRef(false);
  useEffect(() => {
    if (prevIsPushing.current && !isPushing && !pushError) {
      setPushFlash(true);
      const id = setTimeout(() => setPushFlash(false), 2500);
      return () => clearTimeout(id);
    }
    prevIsPushing.current = isPushing;
  }, [isPushing, pushError]);

  const prevApprovalStatus = useRef(approvalStatus);
  useEffect(() => {
    if (!prevApprovalStatus.current && approvalStatus) {
      setApprovalFlash(true);
      const id = setTimeout(() => setApprovalFlash(false), 2500);
      return () => clearTimeout(id);
    }
    prevApprovalStatus.current = approvalStatus;
  }, [approvalStatus]);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#E4E0D9] bg-white px-4">
      <Link href="/" className="shrink-0" title="All drafts">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[#1F4538] text-[10px] font-bold uppercase tracking-wider text-white">E</span>
      </Link>

      {community && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold text-[#1B1D1C]">{community.displayName}</span>
          {fields?.subject && <span className="mt-px max-w-[320px] truncate text-[11px] text-[#6A736F]">{fields.subject}</span>}
        </div>
      )}

      <SaveStatus autoSaving={!!autoSaveLabel} />

      {imagesLoading && (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#6A736F]">
          <Spinner />
          Loading photos
        </span>
      )}

      <span className="flex-1" aria-hidden />

      {pushResult && !pushError && !pushFlash && (
        <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#EDF2EF] px-2.5 py-1 text-[11.5px] text-[#1F4538]">
          <Check />
          Pushed to HubSpot
          <button onClick={dismissPushResult} className="ml-0.5 text-[#1F4538]/60 hover:text-[#1F4538]" aria-label="Dismiss">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {/* Undo and redo cover every change to the draft — words, colours, sizes,
          hidden blocks, and whatever the AI did. Photos are not in it: those
          are swapped by hand and stay that way. */}
      <div className="flex shrink-0 items-center">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={canUndo ? (lastRefineInstruction ? `Undo: ${lastRefineInstruction}` : "Undo") : "Nothing to undo"}
          className="grid h-7 w-7 place-items-center rounded-md text-[#495250] transition-colors hover:bg-[#F0EDE7] hover:text-[#1B1D1C] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h11a5 5 0 0 1 0 10H3" /><polyline points="7 3 3 7 7 11" /></svg>
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={canRedo ? "Redo" : "Nothing to redo"}
          className="grid h-7 w-7 place-items-center rounded-md text-[#495250] transition-colors hover:bg-[#F0EDE7] hover:text-[#1B1D1C] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7H10a5 5 0 0 0 0 10h11" /><polyline points="17 3 21 7 17 11" /></svg>
        </button>
      </div>

      <span className="h-5 w-px shrink-0 bg-[#E4E0D9]" aria-hidden />

      {/* Two actions and a menu, which is what every design system that has
          written this down recommends: the one thing this screen is for stays
          visible, the step before it sits beside it, and the rest — a test run
          of that same step, saving by hand, starting over — are variants and
          afterthoughts rather than decisions to be weighed each time.

          Held while the flyer's date and its weekday disagree: a wrong date is
          the one mistake in an eblast that cannot be fixed after it goes out. */}
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onApproval}
          disabled={!!fields?.dateConflict}
          title={fields?.dateConflict ? "Check the event date first — it is in the Hero" : undefined}
          className={`${SPLIT} rounded-l-md px-3`}
        >
          {approvalFlash ? <span className="flex items-center gap-1.5"><Check />Sent</span> : "Send for approval"}
        </button>
        <Menu
          align="right"
          label="Other ways to send this"
          title="Other ways to send this"
          className={`${SPLIT} -ml-px rounded-r-md px-1.5`}
          items={[
            {
              label: "Send a test to myself",
              onClick: onTestApproval,
            },
          ]}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </Menu>
      </div>

      <div className="relative shrink-0">
        <Button tone="primary" onClick={push} disabled={isPushing}>
          {isPushing ? (
            <><Spinner />{waitingForImages ? "Adding photos…" : "Pushing…"}</>
          ) : pushFlash ? (
            <><Check />Pushed</>
          ) : (
            "Push to HubSpot"
          )}
        </Button>
        {pushError && !hidePushError && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-[9px] border border-[#EFD9D7] bg-[#FBF2F1] px-3 py-2 shadow-[0_8px_24px_rgba(27,29,28,0.12)]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A3302B]">{errorCode(pushError)}</p>
            <p className="mt-0.5 text-[11.5px] text-[#A3302B]">{pushError}</p>
          </div>
        )}
      </div>

      <Menu
        align="right"
        label="More"
        title="More"
        className="grid h-[30px] w-[30px] place-items-center rounded-md text-[#495250] transition-colors hover:bg-[#F0EDE7] hover:text-[#1B1D1C]"
        items={[
          { label: isSaving ? "Saving…" : "Save now", onClick: save, disabled: isSaving },
          { label: "Start a new draft", onClick: () => { discard(); router.push("/"); } },
        ]}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </Menu>
    </header>
  );
}

/** The two halves of the split button, so they read as one control. */
const SPLIT =
  "h-[30px] border border-[#DCD7CE] bg-white text-[12px] font-medium text-[#1B1D1C] transition-colors " +
  "hover:border-[#1F4538] hover:text-[#1F4538] hover:z-10 relative disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Whether the draft is safe, instead of a button asking you to make it so.
 *
 * It saves itself five seconds after you stop typing, which made a Save button
 * a thing you pressed for reassurance rather than effect. The reassurance is
 * the real need, so this says plainly where the draft stands — including when
 * a save failed, which a button that looked the same before and after could
 * never tell you. Saving by hand is still there, in the menu.
 */
function SaveStatus({ autoSaving }: { autoSaving: boolean }) {
  const { isSaving, isSaved, saveError, waitingForImages } = useDraft();
  const [hideError, setHideError] = useState(false);

  useEffect(() => {
    if (!saveError) { setHideError(false); return; }
    setHideError(false);
    const id = setTimeout(() => setHideError(true), 4500);
    return () => clearTimeout(id);
  }, [saveError]);

  const busy = isSaving || autoSaving || waitingForImages;
  const label = saveError
    ? "Couldn't save"
    : waitingForImages
      ? "Adding photos…"
      : busy
        ? "Saving…"
        : isSaved
          ? "Saved"
          : "Unsaved changes";

  return (
    <div className="relative shrink-0">
      <span className={`flex items-center gap-1.5 text-[11px] ${saveError ? "text-[#A3302B]" : "text-[#6A736F]"}`}>
        {busy && <Spinner />}
        {label}
      </span>
      {saveError && !hideError && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-[9px] border border-[#EFD9D7] bg-[#FBF2F1] px-3 py-2 shadow-[0_8px_24px_rgba(27,29,28,0.12)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A3302B]">{errorCode(saveError)}</p>
          <p className="mt-0.5 text-[11.5px] text-[#A3302B]">{saveError}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The parts of the email that are not in it.
 *
 * Two different things end up looking the same from the canvas. A section you
 * hid draws nothing; so does a section with nothing in it yet — an empty
 * gallery, a second photo nobody has chosen. Either way there is no row to
 * click, and without this strip the only way back to a second photo would be
 * to already have one.
 *
 * `drawn` is what the email actually rendered, read back from it rather than
 * worked out again here, so a section that stops drawing for some new reason
 * turns up in this list without anybody adding it.
 */
function MissingSections({ drawn, onSelect }: { drawn: string[]; onSelect: (name: string) => void }) {
  const { fields } = useDraft();
  // Before the first render there is nothing to compare against, and every
  // section would read as missing.
  if (!fields || drawn.length === 0) return null;
  const flyer = fields as unknown as Record<string, unknown>;
  const missing = orderedSections(fields).filter((s) => flyer[s.flag] || !drawn.includes(s.name));
  if (missing.length === 0) return null;

  return (
    <div className="mx-auto mb-3 flex w-full max-w-[600px] flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-[#6A736F]">Not in this email:</span>
      {missing.map((s) => (
        <button
          key={s.name}
          onClick={() => onSelect(s.name)}
          title={flyer[s.flag] ? `Hidden — open the ${s.name.toLowerCase()}` : `Empty — open the ${s.name.toLowerCase()}`}
          className="rounded-full border border-dashed border-[#B9B2A7] px-2 py-0.5 text-[11px] text-[#495250] transition-colors hover:border-[#1F4538] hover:text-[#1F4538]"
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

export default function EditorLayout() {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  /** What the email drew last time, so the panel can mark what it did not. */
  const [drawn, setDrawn] = useState<{ sections: string[]; fields: string[] }>({ sections: [], fields: [] });
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"real" | "test">("real");
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const {
    isSaving, fields, autoSave, lastEditTimestamp, community,
    lockInfo, copyPromptOpen, isMakingCopy, makeCopy, cancelCopyPrompt, draftId, setActiveSection,
  } = useDraft();

  const scrollerRef = useRef<HTMLDivElement>(null);

  // The AI follows whatever is open, so "make it shorter" means the thing in
  // front of you. Nothing selected points it at the subject line, which is
  // what the panel is showing then. Re-asserted when a draft loads, because
  // opening one sets its own starting section and the panel would then be
  // showing one thing while the AI was pointed at another.
  useEffect(() => {
    setActiveSection(selected ? AI_SCOPE[selected] ?? "hero" : "subject");
  }, [selected, draftId, setActiveSection]);

  // The flyer this draft was written from, for checking the copy against.
  // Hidden until asked for, so the email keeps its full width by default.
  const hasFlyer = useHasFlyer(draftId);
  const [flyerOpen, setFlyerOpen] = useState(false);

  // How wide the flyer panel has been dragged, or null for its default share.
  // Kept so it survives moving between drafts.
  const flyerRef = useRef<HTMLDivElement>(null);
  const [flyerWidth, setFlyerWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const FLYER_MIN = 360;
  // What the email keeps for itself no matter how far the handle is dragged.
  const PREVIEW_MIN = 280;

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("eblast_flyerWidth"));
      if (saved >= FLYER_MIN) setFlyerWidth(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFlyerResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = flyerRef.current;
    const row = el?.parentElement;
    if (!el || !row) return;

    // Capture the pointer on the handle. Without it the drag is followed on
    // the window, and the moment the cursor crosses the flyer the events go to
    // the PDF viewer's own document instead — including the release, so the
    // drag never ended and the panel kept following the cursor afterwards.
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = el.offsetWidth;
    // Dragging left widens the panel, so the delta is subtracted.
    const ceiling = Math.max(FLYER_MIN, row.clientWidth - PREVIEW_MIN);
    let latest = startWidth;
    setResizing(true);

    const onMove = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startWidth - (ev.clientX - startX), FLYER_MIN), ceiling);
      setFlyerWidth(latest);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      setResizing(false);
      try { localStorage.setItem("eblast_flyerWidth", String(Math.round(latest))); } catch {}
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", stop);
    // A cancelled pointer — the window losing focus mid-drag, say — has to end
    // it too, or the panel is left following a cursor that is no longer down.
    handle.addEventListener("pointercancel", stop);
  }

  // Opening the flyer or closing the panel narrows the email's column, and the
  // email is a fixed 600px that has to scale down to fit or it gets clipped.
  // The preview re-measures on window resize, so say so once the new layout
  // has settled — measuring in the same tick reads the old width.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))),
    );
    return () => cancelAnimationFrame(id);
  }, [flyerOpen, panelOpen]);

  const isSavingRef = useRef(isSaving);
  const fieldsRef2 = useRef(fields);
  const autoSaveRef = useRef(autoSave);
  isSavingRef.current = isSaving;
  fieldsRef2.current = fields;
  autoSaveRef.current = autoSave;

  // Auto-save: fires 5 seconds AFTER the last user edit (debounce).
  useEffect(() => {
    if (!lastEditTimestamp) return;
    const id = setTimeout(async () => {
      if (!isSavingRef.current && fieldsRef2.current) {
        setAutoSaveLabel("Saving");
        const start = Date.now();
        await autoSaveRef.current();
        const elapsed = Date.now() - start;
        if (elapsed < 1000) await new Promise<void>((r) => setTimeout(r, 1000 - elapsed));
        setAutoSaveLabel(null);
      }
    }, 5000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEditTimestamp]);

  // All brand colours: primary, accent, background, secondary, plus supporting.
  const brandColors = [
    community?.brand?.primary,
    community?.brand?.accent,
    community?.brand?.background,
    community?.brand?.secondary,
    ...(community?.brand?.supporting ?? []),
  ].filter(Boolean) as string[];

  const brandFonts = [
    community?.brand?.fontHeadline,
    community?.brand?.fontBody,
    community?.brand?.fonts?.script?.name,
  ].filter(Boolean) as string[];

  /** Only a section the panel knows how to show may be opened. */
  const select = (name: string | null) => setSelected(name && SECTION_PANELS[name] ? name : null);

  // The email reports this on every redraw, which is every few keystrokes, and
  // the answer almost never changes.
  const handleDrawn = (next: { sections: string[]; fields: string[] }) =>
    setDrawn((was) => (same(was.sections, next.sections) && same(was.fields, next.fields) ? was : next));

  return (
    <div className="flex h-screen flex-col bg-[#F7F6F3]">
      <TopBar
        onApproval={() => { setApprovalMode("real"); setApprovalOpen(true); }}
        onTestApproval={() => { setApprovalMode("test"); setApprovalOpen(true); }}
        autoSaveLabel={autoSaveLabel}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* The panel: whichever part of the email is open. */}
        <aside
          className={[
            "h-full shrink-0 overflow-hidden border-r border-[#E4E0D9] bg-white transition-[width] duration-200",
            panelOpen ? "w-[360px]" : "w-0 border-r-0",
          ].join(" ")}
        >
          <div className="eb-scroll h-full w-[360px] overflow-y-auto pb-8">
            <Inspector selected={selected} onSelect={select} drawnFields={drawn.fields} />
          </div>
        </aside>

        <div className="flex h-full flex-1 flex-col overflow-hidden">
          {/* One quiet bar, for the things that are about looking at the email
              rather than changing it. */}
          <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[#E4E0D9] bg-[#F7F6F3] px-4">
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] text-[#495250] transition-colors hover:bg-[#EFEBE4] hover:text-[#1B1D1C]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d={panelOpen ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
              </svg>
              {panelOpen ? "Hide panel" : "Show panel"}
            </button>

            <span className="flex-1" aria-hidden />

            {hasFlyer && (
              <button
                onClick={() => setFlyerOpen((o) => !o)}
                title="The flyer this eblast was written from"
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] text-[#495250] transition-colors hover:bg-[#EFEBE4] hover:text-[#1B1D1C]"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                {flyerOpen ? "Hide flyer" : "Flyer"}
              </button>
            )}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* min-w-0 so this column can actually give way. A flex item
                defaults to min-width:auto and will not shrink past its
                content, which here is a 600px email — without it the flyer
                beside it is pushed out of the row and clipped. */}
            <div
              ref={scrollerRef}
              onClick={(e) => { if (e.target === e.currentTarget) select(null); }}
              className="eb-scroll flex-1 min-w-0 overflow-y-auto bg-[#E9E5DE] px-4 py-5"
            >
              <MissingSections drawn={drawn.sections} onSelect={select} />
              {/* Square corners, exactly the email's width. What is in this box
                  should be what lands in an inbox. */}
              <div className="mx-auto w-full max-w-[600px] shadow-[0_8px_32px_rgba(27,29,28,0.12)]">
                <PreviewPanel
                  layoutSignal={`${flyerOpen ? "flyer" : "no-flyer"}:${flyerWidth ?? "auto"}:${panelOpen ? "panel" : "wide"}`}
                  selected={selected}
                  onSelect={select}
                  onDrawn={handleDrawn}
                  scrollerRef={scrollerRef}
                />
              </div>
            </div>

            {hasFlyer && flyerOpen && draftId && (
              <div
                ref={flyerRef}
                className={["relative h-full shrink-0", flyerWidth == null ? "w-[42%] min-w-[360px] max-w-[620px]" : ""].join(" ")}
                style={flyerWidth == null ? undefined : { width: flyerWidth }}
              >
                {/* Drag the panel's edge to widen it. Sits over the border
                    rather than beside it, so there is nothing to aim at. */}
                <div
                  onPointerDown={startFlyerResize}
                  title="Drag to resize"
                  className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-[#1F4538]/25 active:bg-[#1F4538]/40"
                />
                <FlyerPanel draftId={draftId} />
              </div>
            )}
          </div>

          {/* The AI, under the email rather than in the panel, so asking for a
              change no longer hides the fields the change is about. */}
          <AiBar />
        </div>
      </div>

      {/* Formatting belongs to a selection, so it appears beside one. */}
      <FloatingFormat brandColors={brandColors} brandFonts={brandFonts} />

      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

      {approvalOpen && <ApprovalModal mode={approvalMode} onClose={() => setApprovalOpen(false)} />}

      {copyPromptOpen && lockInfo && (
        <CopyPromptModal
          reasons={lockInfo.reasons}
          isMakingCopy={isMakingCopy}
          onMakeCopy={async () => {
            const copyId = await makeCopy();
            if (copyId) router.replace(`/draft/${encodeURIComponent(copyId)}`);
          }}
          onCancel={cancelCopyPrompt}
        />
      )}
    </div>
  );
}
