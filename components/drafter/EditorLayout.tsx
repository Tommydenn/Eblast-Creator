"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDraft } from "@/context/DraftContext";
import { AiBar } from "@/components/drafter/AiBar";
import { DeleteConfirmPopover } from "@/components/drafter/DeleteConfirmPopover";
import { SaveStatus } from "@/components/drafter/SaveStatus";
import { btn } from "@/components/drafter/ui";
import EditorPanel from "./EditorPanel";
import PreviewPanel from "./PreviewPanel";
import ApprovalModal from "./ApprovalModal";
import { CopyPromptModal } from "./CopyPromptModal";
import { FlyerPanel, useHasFlyer } from "./FlyerPanel";

/**
 * The editor's shell: one bar across the top, the outline on the left, the
 * email on the right, the AI underneath it.
 *
 * There used to be three bars stacked above the email — this one, a second
 * that said "LIVE PREVIEW" and held two view toggles, and the formatting
 * toolbar — before any of the email was visible. The second bar is gone: its
 * label described what anyone could see, its toggles have moved to the things
 * they act on, and the toolbar has gone to the sidebar, next to the fields it
 * formats.
 */

// Error code generator — gives each error a short stable identifier
function errorCode(msg: string): string {
  let h = 0;
  for (let i = 0; i < msg.length; i++) h = (Math.imul(31, h) + msg.charCodeAt(i)) | 0;
  return "ERR_" + Math.abs(h).toString(36).toUpperCase().slice(0, 5);
}

/**
 * Whatever the editor last has to say, in one place under the bar.
 *
 * A failed save, a failed push and a successful push each used to appear
 * somewhere different, in a shape of their own: two popovers pinned under two
 * different buttons and a green strip that pushed the buttons along as it came
 * and went. They are the same kind of thing — the result of something you
 * asked for — so they look the same and arrive in the same place.
 */
function Notice({
  tone,
  code,
  children,
  onDismiss,
}: {
  tone: "good" | "bad";
  code?: string;
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center">
      <div
        className={[
          "eb-rise pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-lg border px-3.5 py-2 shadow-md",
          tone === "good"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-700",
        ].join(" ")}
      >
        <p className="text-xs leading-relaxed">
          {code && <span className="mr-1.5 font-semibold tracking-wider opacity-60">{code}</span>}
          {children}
        </p>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="mt-0.5 shrink-0 opacity-50 transition-opacity hover:opacity-100"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CommandBar({
  onApproval,
  autoSaving,
  flyerOpen,
  hasFlyer,
  onToggleFlyer,
}: {
  onApproval: () => void;
  autoSaving: boolean;
  flyerOpen: boolean;
  hasFlyer: boolean;
  onToggleFlyer: () => void;
}) {
  const router = useRouter();
  const {
    community,
    fields,
    isPushing,
    imagesLoading,
    push,
    discard,
    canUndo,
    canRedo,
    undo,
    redo,
    lastRefineInstruction,
    waitingForImages,
  } = useDraft();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e8e3dc] bg-white px-4">
      {/* What you are working on. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link href="/" title="All drafts" className="shrink-0">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#1F4538] text-[10px] font-bold uppercase tracking-wider text-white">
            E
          </span>
        </Link>

        {/* This saves the draft on its way out — see discard() — so it is a
            move, not a discard, and it no longer claims to be one. */}
        <button
          onClick={() => { discard(); router.push("/"); }}
          title="Save this one and start another"
          className={btn.secondary + " shrink-0"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New draft
        </button>

        {community && (
          <div className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-xs font-semibold text-[#1a1a1a]">{community.displayName}</span>
            {fields?.subject && (
              <span className="mt-0.5 max-w-[300px] truncate text-[10.5px] text-[#9aaba4]">{fields.subject}</span>
            )}
          </div>
        )}

        {/* Reopened drafts pull their photos in after the text, so say so
            rather than letting the eblast look like it has none. */}
        {imagesLoading && (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#9aaba4]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            Loading photos…
          </span>
        )}
      </div>

      {/* The right-hand side runs left to right by how far a click commits
          you: what you are looking at, what you have changed, whether it is
          safe, and then the two things that send it somewhere. */}
      <div className="flex shrink-0 items-center gap-2">
        {hasFlyer && (
          <button
            onClick={onToggleFlyer}
            title="The flyer this eblast was written from"
            className={[
              btn.secondary,
              flyerOpen ? "border-[#1F4538]/40 bg-[#f0f5f2] text-[#1F4538]" : "",
            ].join(" ")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Flyer
          </button>
        )}

        <span className="mx-1 h-5 w-px bg-[#e8e3dc]" aria-hidden />

        {/* Undo and redo cover every change to the draft — words, colours,
            sizes, hidden blocks, and whatever the AI did. Photos are not in
            it: those are swapped by hand and stay that way. */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={canUndo ? (lastRefineInstruction ? `Undo: ${lastRefineInstruction}` : "Undo") : "Nothing to undo"}
            className={btn.icon}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h11a5 5 0 0 1 0 10H3" /><polyline points="7 3 3 7 7 11" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title={canRedo ? "Redo" : "Nothing to redo"}
            className={btn.icon}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7H10a5 5 0 0 0 0 10h11" /><polyline points="17 3 21 7 17 11" />
            </svg>
          </button>
        </div>

        <SaveStatus autoSaving={autoSaving} />

        <span className="mx-1 h-5 w-px bg-[#e8e3dc]" aria-hidden />

        {/* Held while the flyer's date and its weekday disagree: a wrong date
            is the one mistake in an eblast that cannot be fixed after it has
            gone out. */}
        <button
          onClick={onApproval}
          disabled={!!fields?.dateConflict}
          title={fields?.dateConflict ? "Check the event date first — it is in the Hero section" : undefined}
          className={btn.secondary}
        >
          Approval
        </button>

        <button onClick={push} disabled={isPushing} className={btn.primary}>
          {isPushing ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              {waitingForImages ? "Adding photos…" : "Pushing…"}
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Push to HubSpot
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function EditorLayout() {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(true);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const {
    isSaving, fields, autoSave, lastEditTimestamp,
    lockInfo, copyPromptOpen, isMakingCopy, makeCopy, cancelCopyPrompt, draftId, resetColors,
    community, saveError, pushError, pushResult, dismissPushResult, imagesError,
  } = useDraft();

  // The flyer this draft was written from, for checking the copy against.
  // Hidden until asked for, so the preview keeps its full width by default.
  const hasFlyer = useHasFlyer(draftId);
  const [flyerOpen, setFlyerOpen] = useState(false);

  // How wide the flyer panel has been dragged, or null for its default share.
  // Kept so it survives moving between drafts — having to drag it back every
  // time would make the handle worth less than the trouble.
  const flyerRef = useRef<HTMLDivElement>(null);
  const [flyerWidth, setFlyerWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resetColorsOpen, setResetColorsOpen] = useState(false);
  const FLYER_MIN = 360;
  // What the preview keeps for itself no matter how far the handle is dragged.
  const PREVIEW_MIN = 280;

  // The one thing the editor last had to say, and whether it has been read.
  //
  // What has been read is remembered as the value itself rather than as a
  // name for it: every push produces a new pushResult, so remembering that
  // "pushed" had been dismissed once would have swallowed every push after
  // the first.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const notice: { of: unknown; tone: "good" | "bad"; code?: string; text: string } | null = pushError
    ? { of: pushError, tone: "bad", code: errorCode(pushError), text: pushError }
    : saveError
      ? { of: saveError, tone: "bad", code: errorCode(saveError), text: saveError }
      : imagesError
        ? { of: imagesError, tone: "bad", text: imagesError }
        : pushResult
          ? { of: pushResult, tone: "good", text: "Pushed to HubSpot." }
          : null;
  const showNotice = !!notice && dismissed !== notice.of;

  // Good news reads itself and goes; bad news waits to be read.
  useEffect(() => {
    if (!showNotice || notice?.tone !== "good") return;
    const id = setTimeout(() => setDismissed(notice.of), 4500);
    return () => clearTimeout(id);
  }, [showNotice, notice?.of, notice?.tone]);

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
    // Capture keeps every event for this pointer on the handle, iframe or not.
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

  // Opening the flyer, or collapsing the outline, narrows the preview column,
  // and the email is a fixed 600px that has to scale down to fit or it gets
  // clipped on the right. The preview re-measures on window resize, so say so
  // once the new layout has actually settled — measuring in the same tick
  // reads the old width.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))),
    );
    return () => cancelAnimationFrame(id);
  }, [flyerOpen, editorOpen]);

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
        setAutoSaving(true);
        const start = Date.now();
        await autoSaveRef.current();
        const elapsed = Date.now() - start;
        if (elapsed < 1000) {
          await new Promise<void>((r) => setTimeout(r, 1000 - elapsed));
        }
        setAutoSaving(false);
      }
    }, 5000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEditTimestamp]);

  return (
    <div className="flex h-screen flex-col bg-[#f5f3ef]">
      <CommandBar
        onApproval={() => setApprovalOpen(true)}
        autoSaving={autoSaving}
        flyerOpen={flyerOpen}
        hasFlyer={hasFlyer}
        onToggleFlyer={() => setFlyerOpen((o) => !o)}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {showNotice && notice && (
          <Notice
            tone={notice.tone}
            code={notice.code}
            onDismiss={() => {
              setDismissed(notice.of);
              if (notice.tone === "good") dismissPushResult();
            }}
          >
            {notice.text}
          </Notice>
        )}

        {/* Left: the email's outline, and the fields of whichever section is
            open in it. */}
        <div
          className={[
            "h-full overflow-hidden transition-[width,opacity] duration-200",
            editorOpen ? "w-[400px] min-w-[340px] max-w-[460px]" : "w-0 opacity-0",
          ].join(" ")}
        >
          <EditorPanel onResetColors={() => setResetColorsOpen(true)} />
        </div>

        {/* The control that collapses the outline sits on the edge between the
            two, which is the edge it moves. It used to be a labelled button in
            a bar of its own, the width of the preview away from the panel it
            acted on. */}
        <div className="group/divider relative w-3 shrink-0">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#e8e3dc]" aria-hidden />
          <button
            onClick={() => setEditorOpen((o) => !o)}
            title={editorOpen ? "Hide the outline" : "Show the outline"}
            className="absolute left-1/2 top-3 z-20 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-[#e8e3dc] bg-white text-[#9aaba4] opacity-60 shadow-sm transition-all hover:text-[#1F4538] hover:opacity-100 group-hover/divider:opacity-100"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d={editorOpen ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
            </svg>
          </button>
        </div>

        {/* Right: the email, with the flyer alongside it when asked for. */}
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* min-w-0 so this column can actually give way. A flex item
                defaults to min-width:auto and will not shrink past its
                content, which here is a 600px email — without it the flyer
                beside it is pushed out of the row and clipped rather than
                getting the width it asks for. */}
            <div className="eb-scroll flex-1 min-w-0 overflow-y-auto bg-[#e8e3dc] px-4 py-6">
              {/* Exactly the email's width, and square-cornered: what is in
                  this box should be what lands in an inbox. */}
              <div className="mx-auto w-full max-w-[600px] overflow-hidden shadow-xl">
                <PreviewPanel layoutSignal={`${flyerOpen ? "flyer" : "no-flyer"}:${editorOpen ? "wide" : "full"}:${flyerWidth ?? "auto"}`} />
              </div>
            </div>

            {/* The viewer's toolbar is turned off (see FlyerPanel), so this is
                sized for reading a flyer rather than for fitting a toolbar it
                no longer shows. The default is a share of the row; once the
                edge has been dragged it is whatever width was left there, and
                the ceiling class comes off so the drag is not clamped by it. */}
            {hasFlyer && flyerOpen && draftId && (
              <div
                ref={flyerRef}
                className={[
                  "relative h-full shrink-0",
                  flyerWidth == null ? "w-[42%] min-w-[360px] max-w-[620px]" : "",
                ].join(" ")}
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

          {/* The AI, under the email rather than in the sidebar, so asking for
              a change no longer hides the fields the change is about. */}
          <AiBar />
        </div>
      </div>

      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

      {/* Asked before, not undone after: it reaches the whole eblast, and the
          colours it clears were chosen one at a time. */}
      {resetColorsOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setResetColorsOpen(false)} />
          <div className="fixed bottom-24 left-6 z-50">
            <DeleteConfirmPopover
              label="colors"
              message={<>Put every color back to <span className="font-semibold">{community?.displayName ?? "this community"}</span>&rsquo;s own?</>}
              footerNote="Colors only — bold, italic and size stay."
              confirmLabel="Reset"
              onConfirm={() => { resetColors(); setResetColorsOpen(false); }}
              onCancel={() => setResetColorsOpen(false)}
            />
          </div>
        </>
      )}

      {approvalOpen && <ApprovalModal onClose={() => setApprovalOpen(false)} />}

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
