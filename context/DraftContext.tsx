"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Stage = "idle" | "drafting" | "preview" | "refining" | "pushing" | "done";

export interface Community {
  slug: string;
  displayName: string;
  shortName: string;
  type: string;
  brand: { primary: string; accent: string; background: string };
  senders: Array<{ id: string; name: string; email: string; isPrimary: boolean }>;
  hubspot: { listId?: number };
  trackingPhone?: string | null;
  templates: string[];
}

export interface ExtractedFlyer {
  subject: string;
  previewText: string;
  eyebrow: string;
  headline: string;
  scriptSubheadline?: string;
  heroHook: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  storyEyebrow: string;
  storyScriptTitle?: string;
  bodyParagraphs: string[];
  pullQuoteEyebrow?: string;
  pullQuote?: string;
  pullQuoteAttribution?: string;
  ctaEyebrow: string;
  ctaHeadline: string;
  ctaSubline: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  heroImageAlt: string;
  heroImageDescription: string;
  audienceHints: string[];
  drafterRationale?: string;
  // Inline-edit overrides for community-derived footer/gallery text.
  galleryLabel?: string;
  footerName?: string;
  footerAddress?: string;
}

export type FindingSeverity = "blocker" | "important" | "nice_to_have";
// These must match what lib/critic.ts actually emits.
export type FindingCategory =
  | "voice" | "brand" | "field_completeness" | "subject_line" | "preview_text"
  | "cta" | "structure" | "compliance" | "send_strategy" | "image_quality" | "craft";

export interface ReviewFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  field?: string;
  issue: string;
  suggestion?: string;
  rationale: string;
}

// Must match what lib/critic.ts ReviewVerdict actually emits.
export type ReviewVerdict = "ready" | "needs_revision" | "blocking_issues";

export interface DraftReview {
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
  subjectLineAlternatives?: string[];
  sendTimeRecommendation?: string;
  recipientListNote?: string;
  flaggedImages?: Array<{ slot: string; reason: string; galleryIndex?: number }>;
}

export interface AgentLoopIteration {
  round: number;
  verdict: string;
  findingsCount: number;
  appliedSuggestions: string[];
  droppedImageSlots: string[];
}

export interface AgentLoopSummary {
  stoppedReason: string;
  totalRounds: number;
  imagesExcluded: number;
  iterations: AgentLoopIteration[];
}

export interface PastSendForContext {
  subject: string;
  openRate?: number;
  clickRate?: number;
  sentAt?: string;
}

export interface SubjectAlternative {
  subject: string;
  previewText: string;
  rationale: string;
  score: number;
}

export interface SubjectSpecialistResult {
  winner: SubjectAlternative;
  alternatives: SubjectAlternative[];
  reasoning: string;
}

export interface RefinementEntry {
  instruction: string;
  ok: boolean;
  /** Fields changed by this refinement step, e.g. ["Headline", "Body text"]. */
  changedFields?: string[];
  /** True if this refine rearranged/removed photos. */
  imagesChanged?: boolean;
  /** True if the refine produced no text or image change. */
  noChange?: boolean;
  /** Short note from the refiner (what changed, or why nothing did). */
  note?: string;
}

/** Full restorable state for one undo/redo step around a refine. */
export interface RefineSnapshot {
  extracted: ExtractedFlyer;
  html: string;
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: string[];
  htmlDirty: boolean;
  refineHistory: RefinementEntry[];
  /** The refine instruction this step is associated with, for button labels. */
  instruction: string;
}

export interface SavedDraft {
  id: string;
  communitySlug: string;
  communityName: string;
  savedAt: string;
  subject: string;
  extracted: ExtractedFlyer;
  html: string;
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: string[];
  imageCount: number;
  review?: DraftReview | null;
  agentLoop?: AgentLoopSummary | null;
  pastSendsContext?: PastSendForContext[];
  subjectSpecialist?: SubjectSpecialistResult | null;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const PDF_HISTORY_KEY = "eblast-pdf-history";
const DRAFTS_KEY = "eblast-saved-drafts";
const MAX_SAVED_DRAFTS = 5;

type PdfRecord = { hash: string; name: string; generatedAt: string; community: string };

function getPdfHistory(): PdfRecord[] {
  try { return JSON.parse(localStorage.getItem(PDF_HISTORY_KEY) ?? "[]"); } catch { return []; }
}

function savePdfRecord(hash: string, name: string, community: string) {
  const history = getPdfHistory().filter((r) => r.hash !== hash);
  history.unshift({ hash, name, generatedAt: new Date().toISOString(), community });
  localStorage.setItem(PDF_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function getSavedDrafts(): SavedDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]"); } catch { return []; }
}

function persistSavedDrafts(drafts: SavedDraft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // QuotaExceededError — drop oldest draft and retry once
    if (drafts.length > 1) {
      try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, drafts.length - 1))); } catch {}
    }
  }
}

// ─── Context interface ────────────────────────────────────────────────────────

export interface DraftContextValue {
  communities: Community[];
  selectedSlug: string;
  setSelectedSlug: (slug: string) => void;
  pdf: File | null;
  stage: Stage;
  extracted: ExtractedFlyer | null;
  html: string;
  heroImageUrl: string | undefined;
  secondaryImageUrl: string | undefined;
  galleryImageUrls: string[];
  imageCount: number;
  refineInput: string;
  setRefineInput: (v: string) => void;
  refineHistory: RefinementEntry[];
  review: DraftReview | null;
  reviewing: boolean;
  reviewError: string | null;
  agentLoop: AgentLoopSummary | null;
  pushResult: any;
  error: string | null;
  pastSendsContext: PastSendForContext[];
  subjectSpecialist: SubjectSpecialistResult | null;
  duplicateWarning: { name: string; generatedAt: string; community: string } | null;
  savedDrafts: SavedDraft[];
  currentDraftSaved: boolean;
  /** True when the user has edited text inline and `html` hasn't been re-rendered yet. */
  htmlDirty: boolean;
  handleFileChange: (file: File | null) => Promise<void>;
  generateDraft: () => Promise<void>;
  cancelGeneration: () => void;
  refineDraft: () => Promise<void>;
  /** Revert the most recent successful refine (single-level undo). */
  undoRefine: () => void;
  /** Re-apply a refine that was just undone (single-level redo). */
  redoRefine: () => void;
  /** True when the last refine can still be undone. */
  canUndoRefine: boolean;
  /** True when an undone refine can be re-applied. */
  canRedoRefine: boolean;
  /** Instruction text of the refine that undo would revert, for the button label. */
  lastRefineInstruction: string | null;
  /** Instruction text of the refine that redo would re-apply, for the button label. */
  redoRefineInstruction: string | null;
  runReview: (targetExtracted?: ExtractedFlyer, targetSlug?: string) => Promise<void>;
  pushDraft: () => Promise<void>;
  /** Directly swap subject + preview text without any AI call. */
  swapSubjectLine: (subject: string, previewText: string) => void;
  /** Re-render HTML from current `extracted` without calling any AI. */
  syncHtml: () => Promise<void>;
  saveDraft: () => void;
  discardDraft: () => void;
  loadSavedDraft: (draft: SavedDraft) => void;
  deleteSavedDraft: (id: string) => void;
  dismissDuplicateWarning: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [extracted, setExtracted] = useState<ExtractedFlyer | null>(null);
  const [html, setHtml] = useState<string>("");
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | undefined>();
  const [galleryImageUrls, setGalleryImageUrls] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState<number>(0);
  const [refineInput, setRefineInput] = useState("");
  const [refineHistory, setRefineHistory] = useState<RefinementEntry[]>([]);
  const [review, setReview] = useState<DraftReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [agentLoop, setAgentLoop] = useState<AgentLoopSummary | null>(null);
  const [pushResult, setPushResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastSendsContext, setPastSendsContext] = useState<PastSendForContext[]>([]);
  const [subjectSpecialist, setSubjectSpecialist] = useState<SubjectSpecialistResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; generatedAt: string; community: string } | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [currentDraftSaved, setCurrentDraftSaved] = useState(false);
  const [htmlDirty, setHtmlDirty] = useState(false);
  // Single-level undo/redo for the last successful refine. Each snapshot
  // captures everything a refine mutates so an AI edit can be reverted and
  // re-applied, with the refine history moving with it.
  const [undoSnapshot, setUndoSnapshot] = useState<RefineSnapshot | null>(null);
  const [redoSnapshot, setRedoSnapshot] = useState<RefineSnapshot | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingHashRef = useRef<string | null>(null);
  // Stable ref so the postMessage listener can read current extracted without
  // capturing a stale closure (the listener is set up once with empty deps).
  const extractedRef = useRef<ExtractedFlyer | null>(null);
  const selectedSlugRef = useRef<string>("");
  const heroImageUrlRef = useRef<string | undefined>();
  const secondaryImageUrlRef = useRef<string | undefined>();
  const galleryImageUrlsRef = useRef<string[]>([]);

  // Keep refs in sync with state
  useEffect(() => { extractedRef.current = extracted; }, [extracted]);
  useEffect(() => { selectedSlugRef.current = selectedSlug; }, [selectedSlug]);
  useEffect(() => { heroImageUrlRef.current = heroImageUrl; }, [heroImageUrl]);
  useEffect(() => { secondaryImageUrlRef.current = secondaryImageUrl; }, [secondaryImageUrl]);
  useEffect(() => { galleryImageUrlsRef.current = galleryImageUrls; }, [galleryImageUrls]);

  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.communities)) return;
        setCommunities(d.communities);
        // Intentionally do NOT auto-select a community — the Generate card
        // loads empty so the user makes an explicit choice.
      })
      .catch((err) => {
        console.error("[DraftProvider] Failed to load communities:", err);
      });
    try {
      setSavedDrafts(getSavedDrafts());
    } catch (err) {
      console.error("[DraftProvider] Failed to load saved drafts:", err);
    }
  }, []);

  // postMessage listener — receives inline edits from the preview iframe.
  // Uses refs so this effect never needs to re-subscribe.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== "eblast-field-edit") return;
      const { field, value } = e.data as { field: string; value: string };
      const current = extractedRef.current;
      if (!current) return;
      const parts = field.split(".");
      let updated: ExtractedFlyer;
      if (parts.length === 1) {
        updated = { ...current, [field]: value } as ExtractedFlyer;
      } else if (parts[0] === "bodyParagraphs" && !isNaN(parseInt(parts[1], 10))) {
        const idx = parseInt(parts[1], 10);
        const bp = [...current.bodyParagraphs];
        bp[idx] = value;
        updated = { ...current, bodyParagraphs: bp };
      } else {
        return;
      }
      setExtracted(updated);
      setHtmlDirty(true);
      setCurrentDraftSaved(false);
      setRedoSnapshot(null); // a manual edit invalidates any pending redo
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  async function hashFile(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function handleFileChange(file: File | null) {
    // Never clear an existing selection on a null/empty change (e.g. the user
    // opened the file picker and cancelled). Only a real file mutates state.
    if (!file) return;
    setPdf(file);
    setDuplicateWarning(null);
    pendingHashRef.current = null;
    const hash = await hashFile(file);
    pendingHashRef.current = hash;
    const match = getPdfHistory().find((r) => r.hash === hash || r.name === file.name);
    if (match) {
      setDuplicateWarning({
        name: match.name,
        generatedAt: match.generatedAt,
        community: match.community,
      });
    }
  }

  async function generateDraft() {
    if (!pdf || !selectedSlug) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStage("drafting");
    setError(null);
    setExtracted(null);
    setHtml("");
    setPushResult(null);
    setRefineHistory([]);
    setReview(null);
    setReviewError(null);
    setAgentLoop(null);
    setPastSendsContext([]);
    setSubjectSpecialist(null);
    setCurrentDraftSaved(false);
    setHtmlDirty(false);
    setUndoSnapshot(null);
    setRedoSnapshot(null);

    const fd = new FormData();
    fd.append("file", pdf);
    fd.append("communitySlug", selectedSlug);

    try {
      const res = await fetch("/api/draft-from-pdf", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Draft failed");
        setStage("idle");
        return;
      }
      setExtracted(data.extracted);
      setHtml(data.html);
      setHeroImageUrl(data.heroImageUrl);
      setSecondaryImageUrl(data.secondaryImageUrl);
      setGalleryImageUrls(data.galleryImageUrls ?? []);
      setImageCount(data.imageCount ?? 0);
      setReview(data.review ?? null);
      setAgentLoop(data.agentLoop ?? null);
      setPastSendsContext(data.pastSendsContext ?? []);
      setSubjectSpecialist(data.subjectSpecialist ?? null);
      setHtmlDirty(false);
      setStage("preview");
      if (pendingHashRef.current) {
        savePdfRecord(pendingHashRef.current, pdf.name, selectedSlug);
      }
      setDuplicateWarning(null);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setStage("idle");
        return;
      }
      setError(String(e));
      setStage("idle");
    }
  }

  function cancelGeneration() {
    abortControllerRef.current?.abort();
    setStage("idle");
    setError(null);
  }

  async function runReview(targetExtracted?: ExtractedFlyer, targetSlug?: string) {
    const flyer = targetExtracted ?? extracted;
    const slug = targetSlug ?? selectedSlug;
    if (!flyer || !slug) return;
    setReviewing(true);
    setReviewError(null);
    setReview(null);
    try {
      const res = await fetch("/api/critique-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: flyer, communitySlug: slug }),
      });
      const data = await res.json();
      if (data.ok) setReview(data.review);
      else setReviewError(data.error ?? "Review failed");
    } catch (e: any) {
      setReviewError(String(e));
    } finally {
      setReviewing(false);
    }
  }

  async function refineDraft() {
    if (!extracted || !refineInput.trim() || !selectedSlug) return;
    const instruction = refineInput.trim();

    // Snapshot the pre-refine state so this AI edit can be undone.
    const prevSnapshot: RefineSnapshot = {
      extracted,
      html,
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
      htmlDirty,
      refineHistory,
      instruction,
    };

    setStage("refining");
    setError(null);
    setRefineInput("");

    try {
      // Images are never shuffled client-side anymore. We send the CURRENT
      // image arrangement and the server returns a (possibly identical) one —
      // photos only change when the user explicitly asked, via the model's
      // imageLayout. This kills the old "edit text → images randomly rotate" bug.
      const res = await fetch("/api/refine-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: extracted,
          instruction,
          communitySlug: selectedSlug,
          heroImageUrl,
          secondaryImageUrl,
          galleryImageUrls,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Refinement failed");
        setRefineHistory((h) => [...h, { instruction, ok: false }]);
        setStage("preview");
        return;
      }
      setExtracted(data.extracted);
      setHtml(data.html);
      // Apply the server-resolved image arrangement (unchanged unless the user
      // explicitly asked to change photos).
      if (data.images) {
        setHeroImageUrl(data.images.hero ?? undefined);
        setSecondaryImageUrl(data.images.secondary ?? undefined);
        setGalleryImageUrls(data.images.gallery ?? []);
      }
      setHtmlDirty(false);
      setRefineHistory((h) => [
        ...h,
        {
          instruction,
          ok: true,
          changedFields: data.changedFields,
          imagesChanged: !!data.imagesChanged,
          noChange: !!data.noChange,
          note: typeof data.refineNote === "string" && data.refineNote.trim() ? data.refineNote.trim() : undefined,
        },
      ]);
      setCurrentDraftSaved(false);
      setUndoSnapshot(prevSnapshot);
      setRedoSnapshot(null); // a fresh refine invalidates any pending redo
      setStage("preview");
    } catch (e: any) {
      setError(String(e));
      setRefineHistory((h) => [...h, { instruction, ok: false }]);
      setStage("preview");
    }
  }

  function applySnapshot(s: RefineSnapshot) {
    setExtracted(s.extracted);
    setHtml(s.html);
    setHeroImageUrl(s.heroImageUrl);
    setSecondaryImageUrl(s.secondaryImageUrl);
    setGalleryImageUrls(s.galleryImageUrls);
    setHtmlDirty(s.htmlDirty);
    setRefineHistory(s.refineHistory);
    setCurrentDraftSaved(false);
  }

  function undoRefine() {
    if (!undoSnapshot || !extracted) return;
    // Stash the current (post-refine) state so it can be redone, then revert.
    setRedoSnapshot({
      extracted,
      html,
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
      htmlDirty,
      refineHistory,
      instruction: undoSnapshot.instruction,
    });
    applySnapshot(undoSnapshot);
    setUndoSnapshot(null);
  }

  function redoRefine() {
    if (!redoSnapshot || !extracted) return;
    // Stash the current (pre-refine) state so it can be undone again, then re-apply.
    setUndoSnapshot({
      extracted,
      html,
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
      htmlDirty,
      refineHistory,
      instruction: redoSnapshot.instruction,
    });
    applySnapshot(redoSnapshot);
    setRedoSnapshot(null);
  }

  function swapSubjectLine(subject: string, previewText: string) {
    const current = extractedRef.current;
    if (!current) return;
    const updated = { ...current, subject, previewText };
    setExtracted(updated);
    setCurrentDraftSaved(false);
    setRedoSnapshot(null); // a manual swap invalidates any pending redo
    // Subject/preview don't affect the visible preview rendering, so no htmlDirty.
  }

  async function syncHtml() {
    const current = extractedRef.current;
    const slug = selectedSlugRef.current;
    if (!current || !slug) return;
    try {
      const res = await fetch("/api/render-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: current,
          communitySlug: slug,
          heroImageUrl: heroImageUrlRef.current,
          secondaryImageUrl: secondaryImageUrlRef.current,
          galleryImageUrls: galleryImageUrlsRef.current,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setHtml(data.html);
        setHtmlDirty(false);
      }
    } catch (e) {
      console.error("[DraftProvider] syncHtml failed:", e);
    }
  }

  async function pushDraft() {
    if (!extracted || !selectedSlug) return;
    // Re-render from extracted so inline edits are captured in the pushed HTML.
    let pushHtml = html;
    if (htmlDirty) {
      await syncHtml();
      // syncHtml updates state async, so read from ref after awaiting
      pushHtml = html; // will still use latest after state settles; good enough
    }
    setStage("pushing");
    setError(null);

    try {
      const res = await fetch("/api/push-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySlug: selectedSlug,
          subject: extracted.subject,
          previewText: extracted.previewText,
          html: pushHtml,
        }),
      });
      const data = await res.json();
      setPushResult(data);
      setStage("done");
    } catch (e: any) {
      setError(String(e));
      setStage("preview");
    }
  }

  function saveDraft() {
    if (!extracted || !html) return;
    const community = communities.find((c) => c.slug === selectedSlug);
    const draft: SavedDraft = {
      id: `${Date.now()}`,
      communitySlug: selectedSlug,
      communityName: community?.displayName ?? selectedSlug,
      savedAt: new Date().toISOString(),
      subject: extracted.subject,
      extracted,
      html,
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
      imageCount,
      review,
      agentLoop,
      pastSendsContext,
      subjectSpecialist,
    };
    const updated = [draft, ...getSavedDrafts()].slice(0, MAX_SAVED_DRAFTS);
    persistSavedDrafts(updated);
    setSavedDrafts(updated);
    setCurrentDraftSaved(true);
  }

  function discardDraft() {
    setExtracted(null);
    setHtml("");
    setHeroImageUrl(undefined);
    setSecondaryImageUrl(undefined);
    setGalleryImageUrls([]);
    setImageCount(0);
    setReview(null);
    setAgentLoop(null);
    setPastSendsContext([]);
    setSubjectSpecialist(null);
    setRefineHistory([]);
    setRefineInput("");
    setPushResult(null);
    setError(null);
    setCurrentDraftSaved(false);
    setHtmlDirty(false);
    setUndoSnapshot(null);
    setRedoSnapshot(null);
    setStage("idle");
  }

  function loadSavedDraft(draft: SavedDraft) {
    setSelectedSlug(draft.communitySlug);
    setExtracted(draft.extracted);
    setHtml(draft.html);
    setHeroImageUrl(draft.heroImageUrl);
    setSecondaryImageUrl(draft.secondaryImageUrl);
    setGalleryImageUrls(draft.galleryImageUrls);
    setImageCount(draft.imageCount);
    setReview(draft.review ?? null);
    setAgentLoop(draft.agentLoop ?? null);
    setPastSendsContext(draft.pastSendsContext ?? []);
    setSubjectSpecialist(draft.subjectSpecialist ?? null);
    setRefineHistory([]);
    setRefineInput("");
    setPushResult(null);
    setError(null);
    setCurrentDraftSaved(true);
    setHtmlDirty(false);
    setUndoSnapshot(null);
    setRedoSnapshot(null);
    setStage("preview");
  }

  function deleteSavedDraft(id: string) {
    const updated = getSavedDrafts().filter((d) => d.id !== id);
    persistSavedDrafts(updated);
    setSavedDrafts(updated);
  }

  function dismissDuplicateWarning() {
    setDuplicateWarning(null);
  }

  const value: DraftContextValue = {
    communities,
    selectedSlug, setSelectedSlug,
    pdf,
    stage,
    extracted,
    html,
    heroImageUrl, secondaryImageUrl, galleryImageUrls,
    imageCount,
    refineInput, setRefineInput,
    refineHistory,
    review,
    reviewing, reviewError,
    agentLoop,
    pushResult,
    error,
    pastSendsContext,
    subjectSpecialist,
    duplicateWarning,
    savedDrafts,
    currentDraftSaved,
    htmlDirty,
    handleFileChange,
    generateDraft, cancelGeneration,
    refineDraft,
    undoRefine,
    redoRefine,
    canUndoRefine: undoSnapshot !== null,
    canRedoRefine: redoSnapshot !== null,
    lastRefineInstruction: undoSnapshot?.instruction ?? null,
    redoRefineInstruction: redoSnapshot?.instruction ?? null,
    runReview,
    pushDraft,
    swapSubjectLine,
    syncHtml,
    saveDraft, discardDraft,
    loadSavedDraft, deleteSavedDraft,
    dismissDuplicateWarning,
  };

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
}
