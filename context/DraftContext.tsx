"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";

// ─── Image injection helpers ─────────────────────────────────────────────────

// Injects base64 image data URIs into a server-rendered HTML template that
// uses sentinel placeholder values instead of actual data URIs. Avoids sending
// megabytes of image data in API request/response bodies.
function injectImages(
  html: string,
  images: { hero?: string; secondary?: string; gallery?: string[] },
): string {
  let result = html;
  if (images.hero) result = result.replaceAll(`"${SENTINEL_HERO}"`, `"${images.hero}"`);
  if (images.secondary) result = result.replaceAll(`"${SENTINEL_SECONDARY}"`, `"${images.secondary}"`);
  (images.gallery ?? []).forEach((src, i) => {
    result = result.replaceAll(`"${sentinelGallery(i)}"`, `"${src}"`);
  });
  return result;
}

// Replaces the src attribute of a specific img element (identified by its
// data-img-label) in the HTML. Used for client-side image swap/reposition
// that doesn't change the structural layout.
function updateImageSrc(html: string, label: string, newSrc: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(
    new RegExp(`<img(?=[^>]*\\bdata-img-label="${escapedLabel}"[^>]*>)[^>]*>`, "gi"),
    (tag) => tag.replace(/\bsrc="[^"]*"/, `src="${newSrc}"`),
  );
}

// ─── Chunked PDF upload helpers ───────────────────────────────────────────────
// PDFs larger than ~4 MB are split into 3 MB chunks and staged in the DB via
// /api/pdf-chunk. The draft route reassembles them using the uploadId.

const CHUNK_BYTES = 3 * 1024 * 1024; // 3 MB raw bytes per chunk

function bytesToBase64(bytes: Uint8Array): string {
  const step = 0x8000; // 32 KB at a time — avoids stack overflow from spread
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += step) {
    parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length))));
  }
  return btoa(parts.join(""));
}

async function uploadPdfChunked(
  file: File,
  communitySlug: string,
  signal?: AbortSignal,
): Promise<Response> {
  const uploadId = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const totalChunks = Math.ceil(bytes.length / CHUNK_BYTES);

  for (let i = 0; i < totalChunks; i++) {
    const slice = bytes.subarray(i * CHUNK_BYTES, Math.min((i + 1) * CHUNK_BYTES, bytes.length));
    const res = await fetch("/api/pdf-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, chunkIndex: i, totalChunks, data: bytesToBase64(slice) }),
      signal,
    });
    if (!res.ok) throw new Error("PDF upload failed — please try again.");
  }

  const fd = new FormData();
  fd.append("uploadId", uploadId);
  fd.append("communitySlug", communitySlug);
  return fetch("/api/draft-from-pdf", { method: "POST", body: fd, signal });
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Stage = "idle" | "drafting" | "preview" | "refining" | "pushing" | "done";

export interface Community {
  slug: string;
  displayName: string;
  shortName: string;
  type: string;
  brand: { primary: string; accent: string; background: string; fontHeadline?: string; fontBody?: string; secondary?: string; supporting?: string[] };
  senders: Array<{ id: string; name: string; email: string; isPrimary: boolean }>;
  hubspot: { listId?: number; acronym?: string; includedListIds?: number[]; excludedListIds?: number[] };
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
  rsvpRequired?: boolean;
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
  // 1–3 word generic event type used for the HubSpot email list name.
  eventCategory?: string;
  // "RSVP Required" or "RSVP Requested" from the flyer; empty if no RSVP.
  rsvpLabel?: string;
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
  /** All original (pre-crop) images from the PDF — powers the image bank. */
  allExtractedImageUrls?: string[];
  /** Pre-crop original for each placed slot — powers in-preview repositioning. */
  heroOriginalUrl?: string;
  secondaryOriginalUrl?: string;
  galleryOriginalUrls?: string[];
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const PDF_HISTORY_KEY = "eblast-pdf-history";

type PdfRecord = { hash: string; name: string; generatedAt: string; community: string };

function getPdfHistory(): PdfRecord[] {
  try { return JSON.parse(localStorage.getItem(PDF_HISTORY_KEY) ?? "[]"); } catch { return []; }
}

function savePdfRecord(hash: string, name: string, community: string) {
  const history = getPdfHistory().filter((r) => r.hash !== hash);
  history.unshift({ hash, name, generatedAt: new Date().toISOString(), community });
  localStorage.setItem(PDF_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
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
  /** Pre-crop originals for each placed slot — power in-preview repositioning. */
  heroOriginalUrl: string | undefined;
  secondaryOriginalUrl: string | undefined;
  galleryOriginalUrls: string[];
  currentDraftSaved: boolean;
  /** The saved_drafts.id of the most recently saved or loaded draft. Null until first save. */
  currentDraftId: string | null;
  /** Transient confirmation shown briefly after a draft is saved. */
  saveNotice: { id: number; text: string } | null;
  /** True when the user has edited text inline and `html` hasn't been re-rendered yet. */
  htmlDirty: boolean;
  allExtractedImageUrls: string[];
  handleFileChange: (file: File | null) => Promise<void>;
  /** Reset the Generate card — clear the selected community and uploaded file. */
  clearInputs: () => void;
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
  /** Directly set the HTML from the iframe DOM (used after inline formatting). */
  updateHtml: (newHtml: string) => void;
  saveDraft: (htmlSnapshot?: string) => void;
  discardDraft: () => void;
  loadSavedDraft: (draft: SavedDraft) => void;
  swapImage: (slot: 'hero' | 'secondary' | 'gallery', imageUrl: string, galleryIdx?: number, focus?: string) => Promise<void>;
  /** Re-crop the current image in a slot from its original using XY offset (0-100). */
  repositionImage: (slot: 'hero' | 'secondary' | 'gallery', x: number, y: number, galleryIdx?: number) => Promise<void>;
  /** Remove the image from a specific slot (hero/secondary/gallery). */
  removeImage: (slot: 'hero' | 'secondary' | 'gallery', galleryIdx?: number) => Promise<void>;
  dismissDuplicateWarning: () => void;
  addToImageBank: (dataUri: string) => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

function fetchCommunities(setter: (c: Community[]) => void) {
  fetch("/api/communities")
    .then((r) => r.json())
    .then((d) => { if (Array.isArray(d.communities)) setter(d.communities); })
    .catch(() => {});
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  // The community the ACTIVE draft belongs to — frozen when generated/loaded so
  // clearing the Generate card (selectedSlug) never orphans the current draft.
  const [activeCommunitySlug, setActiveCommunitySlug] = useState<string>("");
  // Transient "saved!" toast; cleared after a few seconds.
  const [saveNotice, setSaveNotice] = useState<{ id: number; text: string } | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [extracted, setExtracted] = useState<ExtractedFlyer | null>(null);
  const [html, setHtml] = useState<string>("");
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | undefined>();
  const [galleryImageUrls, setGalleryImageUrls] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState<number>(0);
  const [allExtractedImageUrls, setAllExtractedImageUrls] = useState<string[]>([]);
  const [heroOriginalUrl, setHeroOriginalUrl] = useState<string | undefined>();
  const [secondaryOriginalUrl, setSecondaryOriginalUrl] = useState<string | undefined>();
  const [galleryOriginalUrls, setGalleryOriginalUrls] = useState<string[]>([]);
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
  const [currentDraftSaved, setCurrentDraftSaved] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [htmlDirty, setHtmlDirty] = useState(false);
  // Single-level undo/redo for the last successful refine. Each snapshot
  // captures everything a refine mutates so an AI edit can be reverted and
  // re-applied, with the refine history moving with it.
  // Multi-level stacks: each refine pushes the pre-refine state onto undoStack;
  // undo pops it (pushing the current state onto redoStack) so the user can step
  // back through many refines, and redo replays them.
  const [undoStack, setUndoStack] = useState<RefineSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<RefineSnapshot[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingHashRef = useRef<string | null>(null);
  // Stable ref so the postMessage listener can read current extracted without
  // capturing a stale closure (the listener is set up once with empty deps).
  const extractedRef = useRef<ExtractedFlyer | null>(null);
  const selectedSlugRef = useRef<string>("");
  const activeCommunitySlugRef = useRef<string>("");
  const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroImageUrlRef = useRef<string | undefined>();
  const secondaryImageUrlRef = useRef<string | undefined>();
  const galleryImageUrlsRef = useRef<string[]>([]);
  const heroOriginalUrlRef = useRef<string | undefined>();
  const secondaryOriginalUrlRef = useRef<string | undefined>();
  const galleryOriginalUrlsRef = useRef<string[]>([]);

  // Keep refs in sync with state
  useEffect(() => { extractedRef.current = extracted; }, [extracted]);
  useEffect(() => { selectedSlugRef.current = selectedSlug; }, [selectedSlug]);
  useEffect(() => { activeCommunitySlugRef.current = activeCommunitySlug; }, [activeCommunitySlug]);
  useEffect(() => { heroImageUrlRef.current = heroImageUrl; }, [heroImageUrl]);
  useEffect(() => { secondaryImageUrlRef.current = secondaryImageUrl; }, [secondaryImageUrl]);
  useEffect(() => { galleryImageUrlsRef.current = galleryImageUrls; }, [galleryImageUrls]);
  useEffect(() => { heroOriginalUrlRef.current = heroOriginalUrl; }, [heroOriginalUrl]);
  useEffect(() => { secondaryOriginalUrlRef.current = secondaryOriginalUrl; }, [secondaryOriginalUrl]);
  useEffect(() => { galleryOriginalUrlsRef.current = galleryOriginalUrls; }, [galleryOriginalUrls]);

  useEffect(() => {
    fetchCommunities(setCommunities);
  }, []);

  // Re-fetch communities on every navigation so segment changes made on the
  // community detail page are reflected in the Generate card without a full reload.
  useEffect(() => {
    if (communities.length > 0) fetchCommunities(setCommunities);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // postMessage listener — receives inline edits from the preview iframe.
  // Uses refs so this effect never needs to re-subscribe.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data) return;
      // Catch-all text edits and formatting toolbar actions update the iframe DOM
      // directly (not React state). Mark unsaved so Save/Discard buttons appear,
      // but don't set htmlDirty — syncHtml would lose those edits since extracted
      // hasn't changed. HTML is captured from the iframe DOM at save time.
      if (e.data.type === "eblast-html-edit" || e.data.type === "eblast-format-done") {
        setCurrentDraftSaved(false);
        return;
      }
      if (e.data.type !== "eblast-field-edit") return;
      const { field, value } = e.data as { field: string; value: string };
      const current = extractedRef.current;
      if (!current) return;
      const parts = field.split(".");
      let updated: ExtractedFlyer;
      if (field === "bodyParagraphs") {
        // Combined edit: split by double newlines back into individual paragraphs.
        const paras = value.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
        updated = { ...current, bodyParagraphs: paras.length > 0 ? paras : current.bodyParagraphs };
      } else if (parts.length === 1) {
        updated = { ...current, [field]: value } as ExtractedFlyer;
      } else if (parts[0] === "bodyParagraphs" && !isNaN(parseInt(parts[1], 10))) {
        // Legacy indexed field — kept for any existing drafts that still use it.
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
      setRedoStack([]); // a manual edit invalidates the redo stack
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

  function clearInputs() {
    setSelectedSlug("");
    setPdf(null);
    setDuplicateWarning(null);
    pendingHashRef.current = null;
  }

  async function generateDraft() {
    if (!pdf || !selectedSlug) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Freeze the draft's community so clearing the Generate card later can't orphan it.
    setActiveCommunitySlug(selectedSlug);
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
    setUndoStack([]);
    setRedoStack([]);

    try {
      // PDFs over 4 MB are split into 3 MB chunks, staged in the DB, then
      // reassembled server-side — bypassing Vercel's 4.5 MB body limit.
      let res: Response;
      if (pdf.size > 4 * 1024 * 1024) {
        res = await uploadPdfChunked(pdf, selectedSlug, controller.signal);
      } else {
        const fd = new FormData();
        fd.append("file", pdf);
        fd.append("communitySlug", selectedSlug);
        res = await fetch("/api/draft-from-pdf", { method: "POST", body: fd, signal: controller.signal });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Server error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
      }
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Draft failed");
        setStage("idle");
        return;
      }

      // Route returns sentinel HTML — inject image data URIs client-side.
      const injectedHtml = injectImages(data.html, {
        hero: data.heroImageUrl,
        secondary: data.secondaryImageUrl,
        gallery: data.galleryImageUrls ?? [],
      });

      setExtracted(data.extracted);
      setHtml(injectedHtml);
      setHeroImageUrl(data.heroImageUrl);
      setSecondaryImageUrl(data.secondaryImageUrl);
      setGalleryImageUrls(data.galleryImageUrls ?? []);
      setImageCount(data.imageCount ?? 0);
      setAllExtractedImageUrls(data.allExtractedImageUrls ?? []);
      setHeroOriginalUrl(data.heroOriginalUrl ?? undefined);
      setSecondaryOriginalUrl(data.secondaryOriginalUrl ?? undefined);
      setGalleryOriginalUrls(data.galleryOriginalUrls ?? []);
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
      setError(e?.message ?? String(e));
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
    if (!extracted || !refineInput.trim() || !activeCommunitySlug) return;
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
          communitySlug: activeCommunitySlug,
          heroImageUrl,
          secondaryImageUrl,
          galleryImageUrls,
          // allExtractedImageUrls omitted — too large for request body
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Refinement failed");
        setRefineHistory((h) => [...h, { instruction, ok: false }]);
        setStage("preview");
        return;
      }
      // The server returns sentinel HTML (no embedded images). Resolve the final
      // image arrangement, then inject actual data URIs into the HTML client-side.
      const finalImages = data.imagesChanged && data.images
        ? { hero: data.images.hero as string | undefined, secondary: data.images.secondary as string | undefined, gallery: (data.images.gallery ?? []) as string[] }
        : { hero: heroImageUrl, secondary: secondaryImageUrl, gallery: galleryImageUrls ?? [] };

      setExtracted(data.extracted);
      setHtml(injectImages(data.html, finalImages));

      if (data.imagesChanged && data.images) {
        setHeroImageUrl(finalImages.hero);
        setSecondaryImageUrl(finalImages.secondary);
        setGalleryImageUrls(finalImages.gallery);
        // Originals are unknown after a refine-driven image swap — clear them
        // so repositioning doesn't try to use a stale original.
        setHeroOriginalUrl(undefined);
        setSecondaryOriginalUrl(undefined);
        setGalleryOriginalUrls([]);
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
      setUndoStack((s) => [...s, prevSnapshot]);
      setRedoStack([]); // a fresh refine invalidates the redo stack
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

  function currentSnapshot(instruction: string): RefineSnapshot {
    return {
      extracted: extracted as ExtractedFlyer,
      html,
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
      htmlDirty,
      refineHistory,
      instruction,
    };
  }

  function undoRefine() {
    if (undoStack.length === 0 || !extracted) return;
    const prev = undoStack[undoStack.length - 1];
    // Stash the current (post-refine) state on the redo stack, then revert.
    setRedoStack((s) => [...s, currentSnapshot(prev.instruction)]);
    setUndoStack((s) => s.slice(0, -1));
    applySnapshot(prev);
  }

  function redoRefine() {
    if (redoStack.length === 0 || !extracted) return;
    const next = redoStack[redoStack.length - 1];
    // Stash the current state back on the undo stack, then re-apply.
    setUndoStack((s) => [...s, currentSnapshot(next.instruction)]);
    setRedoStack((s) => s.slice(0, -1));
    applySnapshot(next);
  }

  function swapSubjectLine(subject: string, previewText: string) {
    const current = extractedRef.current;
    if (!current) return;
    const updated = { ...current, subject, previewText };
    setExtracted(updated);
    setCurrentDraftSaved(false);
    setRedoStack([]); // a manual swap invalidates the redo stack
    // Subject/preview don't affect the visible preview rendering, so no htmlDirty.
  }

  function updateHtml(newHtml: string) {
    setHtml(newHtml);
    setHtmlDirty(false);
    setCurrentDraftSaved(false);
  }

  async function syncHtml() {
    const current = extractedRef.current;
    const slug = activeCommunitySlugRef.current;
    if (!current || !slug) return;
    try {
      const res = await fetch("/api/render-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: current,
          communitySlug: slug,
          hasHero: !!heroImageUrlRef.current,
          hasSecondary: !!secondaryImageUrlRef.current,
          galleryCount: galleryImageUrlsRef.current.length,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setHtml(injectImages(data.html, {
          hero: heroImageUrlRef.current,
          secondary: secondaryImageUrlRef.current,
          gallery: galleryImageUrlsRef.current,
        }));
        setHtmlDirty(false);
      }
    } catch (e) {
      console.error("[DraftProvider] syncHtml failed:", e);
    }
  }

  async function pushDraft() {
    if (!extracted || !activeCommunitySlug) return;
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
          communitySlug: activeCommunitySlug,
          subject: extracted.subject,
          previewText: extracted.previewText,
          eventCategory: extracted.eventCategory,
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

  function saveDraft(htmlSnapshot?: string) {
    const saveHtml = htmlSnapshot ?? html;
    if (!extracted || !saveHtml) return;
    const slug = activeCommunitySlug;
    const community = communities.find((c) => c.slug === slug);
    const communityName = community?.displayName ?? slug;
    const draftId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCurrentDraftId(draftId);

    // Cache originals in localStorage for repositioning on the same device.
    // (Originals are not uploaded to Postgres — they're only needed locally.)
    try {
      const hasOriginals = heroOriginalUrl || secondaryOriginalUrl || (galleryOriginalUrls?.length ?? 0) > 0;
      if (hasOriginals) {
        localStorage.setItem(
          `eblast-originals-${draftId}`,
          JSON.stringify({ heroOriginalUrl, secondaryOriginalUrl, galleryOriginalUrls }),
        );
      }
    } catch { /* ignore */ }

    // Compact draft for Postgres: text + metadata only, no base64 images.
    // Placed images are recoverable from the inline HTML; the bank is uploaded
    // separately in small chunks to stay under the 4.5 MB body limit.
    const draft = {
      id: draftId,
      communitySlug: slug,
      communityName,
      savedAt: new Date().toISOString(),
      subject: extracted.subject,
      extracted,
      html: saveHtml,
      imageCount,
      review,
      agentLoop,
      pastSendsContext,
      subjectSpecialist,
    };

    // Snapshot the image bank now (before any async gaps).
    const bankSnapshot = [...allExtractedImageUrls];

    setSaveNotice({ id: Date.now(), text: `Saving to ${communityName}…` });
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);

    // Step 1: save the text draft.
    fetch("/api/saved-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
        if (!data.ok) {
          setCurrentDraftSaved(false);
          setSaveNotice({ id: Date.now(), text: `Save failed: ${data.error ?? "unknown error"}` });
          saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(null), 4500);
          return;
        }

        // Step 2: upload the image bank in chunks of 8 (~1.6 MB each max).
        // Each chunk is a separate request so no single payload hits the limit.
        if (bankSnapshot.length > 0) {
          setSaveNotice({ id: Date.now(), text: `Saving images…` });
          const CHUNK = 8;
          const chunks: Array<Array<{ idx: number; url: string }>> = [];
          for (let i = 0; i < bankSnapshot.length; i += CHUNK) {
            chunks.push(
              bankSnapshot.slice(i, i + CHUNK).map((url, j) => ({ idx: i + j, url })),
            );
          }
          // Upload chunks sequentially to avoid overwhelming the connection.
          for (const chunk of chunks) {
            await fetch(`/api/saved-drafts/${draftId}/images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ images: chunk }),
            });
          }
        }

        setCurrentDraftSaved(true);
        setSaveNotice({ id: Date.now(), text: `Saved — find it on the ${communityName} community page.` });
        saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(null), 4500);
      })
      .catch((err) => {
        setCurrentDraftSaved(false);
        setSaveNotice({ id: Date.now(), text: "Save failed — check your connection and try again." });
        saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(null), 4500);
        console.error("[DraftProvider] saveDraft failed:", err);
      });
  }

  function discardDraft() {
    setExtracted(null);
    setHtml("");
    setHeroImageUrl(undefined);
    setSecondaryImageUrl(undefined);
    setGalleryImageUrls([]);
    setImageCount(0);
    setAllExtractedImageUrls([]);
    setHeroOriginalUrl(undefined);
    setSecondaryOriginalUrl(undefined);
    setGalleryOriginalUrls([]);
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
    setUndoStack([]);
    setRedoStack([]);
    setActiveCommunitySlug("");
    setStage("idle");
  }

  function loadSavedDraft(draft: SavedDraft) {
    setSelectedSlug(draft.communitySlug);
    setActiveCommunitySlug(draft.communitySlug);
    setExtracted(draft.extracted);
    setHtml(draft.html);

    // Placed image URLs: prefer explicitly stored values (legacy drafts that still
    // have them), otherwise extract from the inline HTML (current format).
    let hero = draft.heroImageUrl;
    let secondary = draft.secondaryImageUrl;
    let gallery = draft.galleryImageUrls ?? [];
    if (!hero && !secondary && gallery.length === 0 && draft.html && typeof window !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(draft.html, 'text/html');
        hero = doc.querySelector<HTMLImageElement>('img[data-img-label="Hero image"]')?.getAttribute('src') ?? undefined;
        secondary = doc.querySelector<HTMLImageElement>('img[data-img-label="Secondary image"]')?.getAttribute('src') ?? undefined;
        gallery = Array.from(doc.querySelectorAll<HTMLImageElement>('img[data-img-label^="Gallery image"]'))
          .map(el => el.getAttribute('src') ?? '').filter(Boolean);
      } catch { /* ignore */ }
    }
    setHeroImageUrl(hero);
    setSecondaryImageUrl(secondary);
    setGalleryImageUrls(gallery);

    setImageCount(draft.imageCount);

    // Image bank: prefer server-stored (legacy); fall back to local cache.
    let bank = draft.allExtractedImageUrls ?? [];
    if (bank.length === 0) {
      try {
        const cached = localStorage.getItem(`eblast-bank-${draft.id}`);
        if (cached) bank = JSON.parse(cached);
      } catch { /* ignore */ }
    }
    setAllExtractedImageUrls(bank);

    // Originals (pre-crop, needed for repositioning): prefer server-stored (legacy);
    // fall back to local cache written at save time.
    let heroOrig = draft.heroOriginalUrl;
    let secondaryOrig = draft.secondaryOriginalUrl;
    let galleryOrigs = draft.galleryOriginalUrls ?? [];
    if (!heroOrig && !secondaryOrig && galleryOrigs.length === 0) {
      try {
        const cached = localStorage.getItem(`eblast-originals-${draft.id}`);
        if (cached) {
          const stored = JSON.parse(cached);
          heroOrig = stored.heroOriginalUrl;
          secondaryOrig = stored.secondaryOriginalUrl;
          galleryOrigs = stored.galleryOriginalUrls ?? [];
        }
      } catch { /* ignore */ }
    }
    setHeroOriginalUrl(heroOrig);
    setSecondaryOriginalUrl(secondaryOrig);
    setGalleryOriginalUrls(galleryOrigs);

    setReview(draft.review ?? null);
    setAgentLoop(draft.agentLoop ?? null);
    setPastSendsContext(draft.pastSendsContext ?? []);
    setSubjectSpecialist(draft.subjectSpecialist ?? null);
    setRefineHistory([]);
    setRefineInput("");
    setPushResult(null);
    setError(null);
    setCurrentDraftSaved(true);
    setCurrentDraftId(draft.id);
    setHtmlDirty(false);
    setUndoStack([]);
    setRedoStack([]);
    setStage("preview");
  }

  async function removeImage(
    slot: 'hero' | 'secondary' | 'gallery',
    galleryIdx?: number,
  ): Promise<void> {
    const current = extractedRef.current;
    const slug = activeCommunitySlugRef.current;
    if (!current || !slug) return;

    let newHero = heroImageUrlRef.current;
    let newSecondary = secondaryImageUrlRef.current;
    let newGallery = [...galleryImageUrlsRef.current];

    if (slot === 'hero') {
      newHero = undefined;
      setHeroImageUrl(undefined);
      setHeroOriginalUrl(undefined);
    } else if (slot === 'secondary') {
      newSecondary = undefined;
      setSecondaryImageUrl(undefined);
      setSecondaryOriginalUrl(undefined);
    } else if (slot === 'gallery' && galleryIdx !== undefined) {
      newGallery = newGallery.filter((_, i) => i !== galleryIdx);
      setGalleryOriginalUrls(galleryOriginalUrlsRef.current.filter((_, i) => i !== galleryIdx));
      setGalleryImageUrls(newGallery);
    }

    try {
      const res = await fetch("/api/render-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: current,
          communitySlug: slug,
          hasHero: !!newHero,
          hasSecondary: !!newSecondary,
          galleryCount: newGallery.length,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setHtml(injectImages(data.html, {
          hero: newHero,
          secondary: newSecondary,
          gallery: newGallery,
        }));
        setHtmlDirty(false);
      }
    } catch (e) {
      console.error("[DraftProvider] removeImage render failed:", e);
    }
    setCurrentDraftSaved(false);
  }

  async function swapImage(
    slot: 'hero' | 'secondary' | 'gallery',
    imageUrl: string,
    galleryIdx?: number,
    focus?: string,
  ): Promise<void> {
    const current = extractedRef.current;
    const slug = activeCommunitySlugRef.current;
    if (!current || !slug) return;

    // Crop the image to the correct aspect ratio for its slot so the email
    // template always receives a properly proportioned image.
    const targetRatio = slot === 'gallery' ? 4 / 3 : 16 / 9;
    let placedUrl = imageUrl;
    try {
      const cropRes = await fetch("/api/crop-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, targetRatio, focus: focus ?? "center" }),
      });
      const cropData = await cropRes.json();
      if (cropData.ok) placedUrl = cropData.croppedUrl;
    } catch {
      // Fall back to the original URL — display may be off but doesn't break.
    }

    let newHero = heroImageUrlRef.current;
    let newSecondary = secondaryImageUrlRef.current;
    let newGallery = [...galleryImageUrlsRef.current];

    // Track the original (pre-crop) URL for each slot so repositionImage can
    // re-crop from the source with a different focus.
    if (slot === 'hero') {
      newHero = placedUrl;
      setHeroOriginalUrl(imageUrl);
    } else if (slot === 'secondary') {
      newSecondary = placedUrl;
      setSecondaryOriginalUrl(imageUrl);
    } else if (slot === 'gallery') {
      const newGalleryOriginals = [...galleryOriginalUrlsRef.current];
      if (galleryIdx !== undefined && galleryIdx >= 0 && galleryIdx < newGallery.length) {
        newGallery[galleryIdx] = placedUrl;
        newGalleryOriginals[galleryIdx] = imageUrl;
      } else {
        newGallery = [...newGallery, placedUrl];
        newGalleryOriginals.push(imageUrl);
      }
      setGalleryOriginalUrls(newGalleryOriginals);
    }

    // Capture which slots had images BEFORE the swap so we know if a structural
    // re-render is needed (slot going from empty → populated changes layout).
    const hadHero = !!heroImageUrlRef.current;
    const hadSecondary = !!secondaryImageUrlRef.current;
    const hadGallery = galleryImageUrlsRef.current.length;

    setHeroImageUrl(newHero);
    setSecondaryImageUrl(newSecondary);
    setGalleryImageUrls(newGallery);

    const needsRerender =
      (!!newHero !== hadHero) ||
      (!!newSecondary !== hadSecondary) ||
      (newGallery.length !== hadGallery);

    if (needsRerender) {
      // Structural change (slot added) — re-render the full template via server.
      try {
        const res = await fetch("/api/render-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extracted: current,
            communitySlug: slug,
            hasHero: !!newHero,
            hasSecondary: !!newSecondary,
            galleryCount: newGallery.length,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setHtml(injectImages(data.html, {
            hero: newHero,
            secondary: newSecondary,
            gallery: newGallery,
          }));
          setHtmlDirty(false);
        }
      } catch (e) {
        console.error("[DraftProvider] swapImage render failed:", e);
      }
    } else {
      // Same slots, just different images — update src attributes client-side.
      setHtml((prev) => {
        let next = prev;
        if (newHero && slot === "hero") next = updateImageSrc(next, "Hero image", newHero);
        if (newSecondary && slot === "secondary") next = updateImageSrc(next, "Secondary image", newSecondary);
        if (slot === "gallery" && galleryIdx !== undefined && newGallery[galleryIdx]) {
          next = updateImageSrc(next, `Gallery image ${galleryIdx + 1}`, newGallery[galleryIdx]);
        }
        return next;
      });
      setHtmlDirty(false);
    }
    setCurrentDraftSaved(false);
  }

  async function repositionImage(
    slot: 'hero' | 'secondary' | 'gallery',
    x: number,
    y: number,
    galleryIdx?: number,
  ): Promise<void> {
    const current = extractedRef.current;
    const slug = activeCommunitySlugRef.current;
    if (!current || !slug) return;

    let originalUrl: string | undefined;
    if (slot === 'hero') originalUrl = heroOriginalUrlRef.current;
    else if (slot === 'secondary') originalUrl = secondaryOriginalUrlRef.current;
    else if (slot === 'gallery' && galleryIdx !== undefined) originalUrl = galleryOriginalUrlsRef.current[galleryIdx];
    if (!originalUrl) return;

    const targetRatio = slot === 'gallery' ? 4 / 3 : 16 / 9;
    let placedUrl = originalUrl;
    try {
      const cropRes = await fetch("/api/crop-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: originalUrl, targetRatio, x, y }),
      });
      const cropData = await cropRes.json();
      if (cropData.ok) placedUrl = cropData.croppedUrl;
    } catch {
      // Fall back to the original without cropping.
    }

    let newHero = heroImageUrlRef.current;
    let newSecondary = secondaryImageUrlRef.current;
    let newGallery = [...galleryImageUrlsRef.current];
    if (slot === 'hero') newHero = placedUrl;
    else if (slot === 'secondary') newSecondary = placedUrl;
    else if (slot === 'gallery' && galleryIdx !== undefined) newGallery[galleryIdx] = placedUrl;

    setHeroImageUrl(newHero);
    setSecondaryImageUrl(newSecondary);
    setGalleryImageUrls(newGallery);

    // Repositioning only changes the crop of an existing slot — update src client-side.
    setHtml((prev) => {
      let next = prev;
      if (slot === "hero" && newHero) next = updateImageSrc(next, "Hero image", newHero);
      if (slot === "secondary" && newSecondary) next = updateImageSrc(next, "Secondary image", newSecondary);
      if (slot === "gallery" && galleryIdx !== undefined && newGallery[galleryIdx]) {
        next = updateImageSrc(next, `Gallery image ${galleryIdx + 1}`, newGallery[galleryIdx]);
      }
      return next;
    });
    setHtmlDirty(false);
    setCurrentDraftSaved(false);
  }

  function dismissDuplicateWarning() {
    setDuplicateWarning(null);
  }

  function addToImageBank(dataUri: string) {
    setAllExtractedImageUrls(prev => [...prev, dataUri]);
    setCurrentDraftSaved(false);
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
    currentDraftSaved,
    currentDraftId,
    saveNotice,
    htmlDirty,
    allExtractedImageUrls,
    handleFileChange,
    clearInputs,
    generateDraft, cancelGeneration,
    refineDraft,
    undoRefine,
    redoRefine,
    canUndoRefine: undoStack.length > 0,
    canRedoRefine: redoStack.length > 0,
    lastRefineInstruction: undoStack.length > 0 ? undoStack[undoStack.length - 1].instruction : null,
    redoRefineInstruction: redoStack.length > 0 ? redoStack[redoStack.length - 1].instruction : null,
    runReview,
    pushDraft,
    swapSubjectLine,
    syncHtml,
    updateHtml,
    saveDraft, discardDraft,
    loadSavedDraft,
    swapImage,
    repositionImage,
    removeImage,
    heroOriginalUrl,
    secondaryOriginalUrl,
    galleryOriginalUrls,
    dismissDuplicateWarning,
    addToImageBank,
  };

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
}
