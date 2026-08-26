"use client";

/**
 * DraftContext — rebuilt from scratch.
 *
 * Core principle: `fields` (ExtractedFlyer) is the source of truth.
 * HTML is computed client-side on demand via buildHtml() — never stored in state.
 * No postMessage editing, no iframe script injection, no fieldHtmlOverridesRef,
 * no htmlDirty flag. The preview is always an accurate reflection of current fields.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { buildEblastHtml } from "@/lib/render-email";
import {
  IMAGE_REF_PREFIX,
  buildImageRows,
  dedupeImageRows,
  resolveImageRefs,
  type ImagePhaseName,
  type ImageRow,
} from "@/lib/image-bank";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

// ─── Chunked PDF upload ───────────────────────────────────────────────────────

const CHUNK_BYTES = 3 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  const step = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += step) {
    parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length))));
  }
  return btoa(parts.join(""));
}

async function uploadPdfChunked(file: File, communitySlug: string, signal?: AbortSignal, notes?: string): Promise<Response> {
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
    if (!res.ok) throw new Error("PDF chunk upload failed — please try again.");
  }
  const fd = new FormData();
  fd.append("uploadId", uploadId);
  fd.append("communitySlug", communitySlug);
  if (notes?.trim()) fd.append("notes", notes.trim());
  return fetch("/api/draft-from-pdf", { method: "POST", body: fd, signal });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Stage = "idle" | "generating" | "editing";
export type EditorSection = "subject" | "hero" | "story" | "images" | "cta";

export interface CommunityAddress { street?: string; city?: string; state?: string; zip?: string }
export interface CommunityBrand { primary: string; accent: string; background: string; fontHeadline: string; fontBody: string; secondary?: string; supporting?: string[]; textOnPrimary?: string; textOnAccent?: string; fonts?: { display?: { name: string; fallback: string }; body?: { name: string; fallback: string }; script?: { name: string; fallback: string } } }
export interface CommunityLogo { url: string; variant: string; onColor: string }
export interface CommunitySender { id: string; name: string; email: string; title?: string | null; isPrimary: boolean }
export interface CommunityHubspot { acronym?: string; listId?: number; includedListIds?: number[]; excludedListIds?: number[] }

export interface ClientCommunity {
  id: string;
  slug: string;
  displayName: string;
  shortName: string;
  email?: string | null;
  websiteUrl?: string | null;
  trackingPhone?: string | null;
  address: CommunityAddress;
  brand: CommunityBrand;
  logos: CommunityLogo[];
  senders: CommunitySender[];
  hubspot: CommunityHubspot;
  templates?: string[];
}

export interface DraftImages {
  hero: { url: string; originalUrl: string } | null;
  secondary: { url: string; originalUrl: string } | null;
  gallery: Array<{ url: string; originalUrl: string }>;
}

export interface PastSendForContext { subject: string; openRate?: number; clickRate?: number; sentAt?: string }
export interface SubjectAlternative { subject: string; previewText: string; rationale: string; score: number }
export interface SubjectSpecialistResult { winner: SubjectAlternative; alternatives: SubjectAlternative[]; reasoning: string }

export interface SavedDraft {
  id: string;
  communitySlug: string;
  communityName: string;
  savedAt: string;
  subject: string;
  fields: ExtractedFlyer;
  images: DraftImages;
  imageBank: string[];
  imageCount: number;
  pastSendsContext?: PastSendForContext[];
  subjectSpecialist?: SubjectSpecialistResult | null;
  /** Persisted AI-edit history so undo/redo survives closing and reopening. */
  editHistory?: { undo: RefineSnapshot[]; redo: RefineSnapshot[] } | null;
  /**
   * Lock-relevant metadata, present only when loaded via GET /api/saved-drafts/[id]
   * (never part of the stored payload itself) — see loadSavedDraft/lockInfo.
   */
  approvedAt?: string | null;
  pushedAt?: string | null;
  pendingApproval?: boolean;
}

// A draft that's been approved by the sales director, pushed to HubSpot, or
// sent for approval and still awaiting a decision must never be silently
// altered — any edit attempt instead prompts the user to continue on a fresh
// copy, leaving the original exactly as it was at that milestone.
export type DraftLockReason = "approved" | "pushed" | "pending_approval";
export interface DraftLockInfo { locked: boolean; reasons: DraftLockReason[] }

function computeLockInfo(draft: Pick<SavedDraft, "approvedAt" | "pushedAt" | "pendingApproval">): DraftLockInfo {
  const reasons: DraftLockReason[] = [];
  if (draft.approvedAt) reasons.push("approved");
  if (draft.pushedAt) reasons.push("pushed");
  if (draft.pendingApproval) reasons.push("pending_approval");
  return { locked: reasons.length > 0, reasons };
}

interface RefineSnapshot {
  fields: ExtractedFlyer;
  /**
   * Undefined for history restored from a saved draft: image data URIs are
   * multi-MB and can't ride along in the save payload (same reason
   * buildDraftPayload strips them), so persisted history is text-only and
   * undo/redo leaves images untouched. Present for in-session snapshots.
   */
  images?: DraftImages;
  instruction: string;
}

/**
 * How many AI-edit steps ride along with a saved draft. Each snapshot is a
 * full ExtractedFlyer (text only), so ~10 KB apiece — 25 each way stays far
 * inside the save payload's budget while covering any realistic session.
 */
const MAX_PERSISTED_HISTORY = 25;

/** Drop the in-memory image data before a snapshot goes into the save payload. */
function stripSnapshotImages(s: RefineSnapshot): RefineSnapshot {
  return { fields: s.fields, instruction: s.instruction };
}

export interface PushStep { step: string; ok: boolean; status?: number; body?: any }

// ─── Crop helpers ─────────────────────────────────────────────────────────────

// Must match the <img> slots in render-email.ts (hero 600×340, secondary
// 528×300, gallery tiles 4:3) — those render with height:auto, so a mismatch
// here doesn't crop to fit, it changes the photo's displayed shape. secondary
// was 528/396 (4:3), so repositioning re-cropped a 16:9 photo to 4:3 and made
// it visibly taller and narrower than the draft was generated with.
const ASPECT = { hero: 600 / 340, secondary: 528 / 300, gallery: 4 / 3 } as const;

async function cropImage(imageUrl: string, ratio: number, x = 50, y = 50): Promise<string> {
  const res = await fetch("/api/crop-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, targetRatio: ratio, x, y }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "Crop failed");
  return data.croppedUrl as string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface DraftContextValue {
  communities: ClientCommunity[];
  selectedCommunitySlug: string;
  community: ClientCommunity | null;
  stage: Stage;
  fields: ExtractedFlyer | null;
  images: DraftImages;
  imageBank: string[];
  draftId: string | null;
  isSaved: boolean;
  saveNotice: string | null;
  subjectSpecialist: SubjectSpecialistResult | null;
  pastSendsContext: PastSendForContext[];
  activeSection: EditorSection;
  isGenerating: boolean;
  generateError: string | null;
  isRefining: boolean;
  refineError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  lastRefineInstruction: string | null;
  isPushing: boolean;
  pushResult: { steps: PushStep[]; summary: any } | null;
  pushError: string | null;
  isSaving: boolean;
  saveError: string | null;
  approvalStatus: { decision: string; sentAt: string } | null;
  lockInfo: DraftLockInfo | null;
  copyPromptOpen: boolean;
  isMakingCopy: boolean;
  lastEditTimestamp: number;
  activeEditorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeEditorCallback: React.MutableRefObject<(() => void) | null>;
  activeFieldNameRef: React.MutableRefObject<string | null>;

  selectCommunity: (slug: string) => void;
  generate: (file: File | null, notes?: string) => Promise<void>;
  cancelGenerate: () => void;
  setField: <K extends keyof ExtractedFlyer>(key: K, value: ExtractedFlyer[K]) => void;
  setFields: (patch: Partial<ExtractedFlyer>) => void;
  assignImage: (slot: "hero" | "secondary", imageUrl: string) => Promise<void>;
  assignGalleryImage: (idx: number, imageUrl: string) => Promise<void>;
  removeImage: (slot: "hero" | "secondary" | "gallery", galleryIdx?: number) => void;
  repositionImage: (slot: "hero" | "secondary" | "gallery", x: number, y: number, galleryIdx?: number) => Promise<void>;
  refine: (instruction: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  autoSave: () => Promise<void>;
  discard: () => void;
  loadSavedDraft: (draft: SavedDraft) => void;
  push: () => Promise<void>;
  sendForApproval: (opts: { recipientEmail: string; recipientName?: string; notifyEmail?: string; note?: string; isTest?: boolean }) => Promise<void>;
  setActiveSection: (section: EditorSection) => void;
  swapSubjectLine: (subject: string, previewText: string) => void;
  buildHtml: () => string;
  /** A reopened draft is still fetching the photos shown in the eblast. */
  imagesLoading: boolean;
  /** The unplaced flyer photos behind the picker are still arriving. */
  imageBankLoading: boolean;
  /** Set when the photos could not be loaded, so nothing should be saved or sent. */
  imagesError: string | null;
  /** A save or send is holding until the photos are in. */
  waitingForImages: boolean;
  addToImageBank: (url: string) => void;
  dismissPushResult: () => void;
  makeCopy: () => Promise<void>;
  cancelCopyPrompt: () => void;
  /** Opens the copy prompt directly — used by RichInput/RichBodyEditor to
   * reject a locked edit at the DOM level (revert innerHTML, don't call
   * onValueChange) the same way a guardPlain failure is rejected. */
  requestCopyPrompt: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used inside DraftProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const EMPTY_IMAGES: DraftImages = { hero: null, secondary: null, gallery: [] };

// The bottom CTA/Footer band's date, time, RSVP label, and call button are
// each independent fields that generate with the same text as their Hero
// counterpart — but that must be a ONE-TIME snapshot at creation, not a live
// fallback. A live fallback (`fields.ctaEventDate ?? fields.eventDate`) means
// editing the Hero field keeps changing what the Footer shows for as long as
// the Footer field itself is untouched, which reads as "these are still
// linked" even though they're stored separately. Snapshotting them onto real,
// independent values the moment a draft is created/loaded means editing
// Hero afterward never again affects what Footer displays, in either
// direction, from the very start.
function snapshotFooterOverrides(fields: ExtractedFlyer): void {
  if (fields.ctaEventDate === undefined) fields.ctaEventDate = fields.eventDate;
  if (fields.ctaEventTime === undefined) fields.ctaEventTime = fields.eventTime;
  if (fields.ctaRsvpLabel === undefined) fields.ctaRsvpLabel = fields.rsvpLabel;
  if (fields.finalCtaButtonLabel === undefined) fields.finalCtaButtonLabel = fields.ctaButtonLabel;
}

// Batches image POSTs to /api/saved-drafts/[id]/images so multiple small
// items share a request while staying safely under Vercel's ~4.5 MB route
// body limit. Any single item over the cap is skipped (logged, not silently
// dropped) rather than risk a failed request — in practice no observed
// original/cropped image has come close to this.
const IMAGE_BATCH_MAX_CHARS = 3_500_000;
async function postImageBatches(draftId: string, rows: Array<{ idx: number; url: string }>): Promise<void> {
  // A photo used in more than one place is stored once and pointed at from the
  // others. Ordering keepers before pointers matters: if a request fails, the
  // loop stops, so a pointer can never be stored without the photo it needs.
  const items = dedupeImageRows(rows).sort(
    (a, b) =>
      Number(a.url.startsWith(IMAGE_REF_PREFIX)) - Number(b.url.startsWith(IMAGE_REF_PREFIX)),
  );

  let batch: Array<{ idx: number; url: string }> = [];
  let batchChars = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const res = await fetch(`/api/saved-drafts/${draftId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: batch }),
    }).catch(() => null);
    if (!res?.ok) throw new Error("Image save failed");
    batch = [];
    batchChars = 0;
  };
  for (const item of items) {
    if (item.url.length > IMAGE_BATCH_MAX_CHARS) {
      console.warn(`[postImageBatches] skipping oversized image at idx ${item.idx} (${item.url.length} chars)`);
      continue;
    }
    if (batchChars + item.url.length > IMAGE_BATCH_MAX_CHARS) await flush();
    batch.push(item);
    batchChars += item.url.length;
  }
  await flush();
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  // Community list
  const [communities, setCommunities] = useState<ClientCommunity[]>([]);
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState("");

  // Core draft state
  const [stage, setStage] = useState<Stage>("idle");
  const [fields, setFields_] = useState<ExtractedFlyer | null>(null);
  const [images, setImages] = useState<DraftImages>(EMPTY_IMAGES);
  const [imageBank, setImageBank] = useState<string[]>([]);
  // Reopening a saved draft pulls its photos in over several requests (see
  // lib/image-bank). `imagesLoading` drives the placeholders; `imagesReadyRef`
  // is what save/push/approval await so nothing is ever sent or stored from a
  // half-loaded draft; `imagesLoadedRef` stays false if the load failed, which
  // keeps a failed load from being written back as "no photos".
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageBankLoading, setImageBankLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  // Set while a save or send is holding for the photos, so the button can say
  // so rather than appearing to hang.
  const [waitingForImages, setWaitingForImages] = useState(false);
  // The photos IN the eblast settle first; the untouched originals and the
  // unplaced flyer pool keep arriving afterwards. Saving and sending wait only
  // on the first of those, since that is all either one needs: a send carries
  // the photos on screen, and a save that omits a row leaves the stored one
  // alone rather than clearing it.
  const shownLoadedRef = useRef(true);
  const shownReadyRef = useRef<Promise<void> | null>(null);
  const imagesLoadedRef = useRef(true);
  const imagesErrorRef = useRef<string | null>(null);
  const imagesReadyRef = useRef<Promise<void> | null>(null);
  useEffect(() => { imagesErrorRef.current = imagesError; }, [imagesError]);
  // Back to "nothing to wait for": a new draft holds its photos in memory, and
  // a discarded one must not leave a stale flag blocking the next save.
  const resetImageLoadState = useCallback(() => {
    imagesLoadedRef.current = true;
    imagesReadyRef.current = null;
    shownLoadedRef.current = true;
    shownReadyRef.current = null;
    setImagesLoading(false);
    setImageBankLoading(false);
    setImagesError(null);
    setWaitingForImages(false);
  }, []);

  // Save state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI outputs
  const [subjectSpecialist, setSubjectSpecialist] = useState<SubjectSpecialistResult | null>(null);
  const [pastSendsContext, setPastSendsContext] = useState<PastSendForContext[]>([]);

  // Editor
  const [activeSection, setActiveSection] = useState<EditorSection>("hero");

  // Generate
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  // Refine / undo-redo
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<RefineSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<RefineSnapshot[]>([]);
  // Read inside undo()/redo() so their setState calls can stay pure updaters.
  const undoStackRef = useRef<RefineSnapshot[]>([]);
  const redoStackRef = useRef<RefineSnapshot[]>([]);

  // Push
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ steps: PushStep[]; summary: any } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // Approval
  const [approvalStatus, setApprovalStatus] = useState<{ decision: string; sentAt: string } | null>(null);

  // Lock (approved / pushed / pending-approval drafts can't be edited in place —
  // any edit attempt opens a "make a copy" prompt instead). null = unlocked/unknown.
  const [lockInfo, setLockInfo] = useState<DraftLockInfo | null>(null);
  const lockInfoRef = useRef<DraftLockInfo | null>(null);
  useEffect(() => { lockInfoRef.current = lockInfo; }, [lockInfo]);
  const [copyPromptOpen, setCopyPromptOpen] = useState(false);
  const [isMakingCopy, setIsMakingCopy] = useState(false);

  // Format toolbar — shared mutable refs so the preview-panel toolbar can
  // target whichever contentEditable is currently focused in the sidebar.
  const activeEditorRef = useRef<HTMLDivElement | null>(null);
  const activeEditorCallback = useRef<(() => void) | null>(null);
  const activeFieldNameRef = useRef<string | null>(null);

  // Opens the copy prompt (safe to call repeatedly — every guarded mutator
  // calls this on every blocked edit attempt while locked, but it's just a
  // state set, so it's a no-op once already open) and blurs whatever's
  // focused so further keystrokes don't keep silently landing in the locked
  // field while the user decides.
  const requestCopyPrompt = useCallback(() => {
    setCopyPromptOpen(true);
    if (activeEditorRef.current) activeEditorRef.current.blur();
  }, []);

  // Debounce auto-save — increments whenever any field is edited so EditorLayout
  // can start a 5-second timer that resets on each new edit.
  const [lastEditTimestamp, setLastEditTimestamp] = useState(0);

  // Refs for synchronous access in buildHtml / callbacks
  const fieldsRef = useRef<ExtractedFlyer | null>(null);
  const imagesRef = useRef<DraftImages>(EMPTY_IMAGES);
  const imageBankRef = useRef<string[]>([]);
  const communityRef = useRef<ClientCommunity | null>(null);

  // Keep refs in sync
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { undoStackRef.current = undoStack; }, [undoStack]);
  useEffect(() => { redoStackRef.current = redoStack; }, [redoStack]);
  useEffect(() => { imageBankRef.current = imageBank; }, [imageBank]);

  // Derived community object
  const community = communities.find((c) => c.slug === selectedCommunitySlug) ?? null;
  useEffect(() => { communityRef.current = community; }, [community]);

  // Fetch communities on mount, then honor a ?community=<slug> deep link — the
  // "Create Eblast" button on a community page lands here with that param and
  // expects its community already selected. Validated against the fetched list
  // so a stale/bogus slug just leaves the picker empty instead of selecting a
  // community that doesn't exist. `prev || slug` so a selection the user made
  // while the fetch was still in flight wins.
  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((data) => {
        if (!data.communities) return;
        const list = data.communities as ClientCommunity[];
        setCommunities(list);
        const slug = new URLSearchParams(window.location.search).get("community");
        if (slug && list.some((c) => c.slug === slug)) {
          setSelectedCommunitySlug((prev) => prev || slug);
        }
      })
      .catch(() => null);
  }, []);

  // Re-fetch the full community list and return the freshest copy of one slug.
  // Community-page edits (brand colors, fonts, senders) must never be baked
  // into an eblast from a stale in-memory copy — call this immediately before
  // any HTML render that will be pushed/sent, not just rely on the mount fetch.
  const refreshCommunity = useCallback(async (slug: string): Promise<ClientCommunity | null> => {
    try {
      const res = await fetch("/api/communities");
      const data = await res.json();
      if (data.communities) {
        const fresh = (data.communities as ClientCommunity[]).find((c) => c.slug === slug) ?? null;
        setCommunities(data.communities as ClientCommunity[]);
        if (fresh) communityRef.current = fresh;
        return fresh;
      }
    } catch {
      // Network hiccup — fall back to whatever's already cached below.
    }
    return communityRef.current;
  }, []);

  // While actively editing a draft, keep the community data current whenever
  // the tab regains focus — so the live preview (which reads `community` from
  // state, not the ref) reflects a Community-page edit made in another tab
  // without requiring a full reload.
  useEffect(() => {
    if (stage !== "editing" || !selectedCommunitySlug) return;
    const onFocus = () => { refreshCommunity(selectedCommunitySlug); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [stage, selectedCommunitySlug, refreshCommunity]);

  // ─── buildHtml ─────────────────────────────────────────────────────────────
  // Synchronous, uses refs so it's always current even during async operations.
  // This feeds pushes, approvals and test sends only — never the preview, which
  // builds its own HTML so it can show grey blocks for photos still arriving.
  // Nothing here substitutes a placeholder: every caller waits for the real
  // photos first, so what goes out is always the real eblast.
  const buildHtml = useCallback((): string => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    if (!f || !c) return "";
    const imgs = imagesRef.current;
    return buildEblastHtml(f, c as any, {
      heroImageUrl: imgs.hero?.url,
      secondaryImageUrl: imgs.secondary?.url,
      galleryImageUrls: imgs.gallery.map((g) => g.url),
    });
  }, []);

  // ─── setField / setFields ──────────────────────────────────────────────────
  // Locked drafts (approved / pushed / pending-approval) reject the edit
  // outright — fields/images state never changes, so nothing needs undoing
  // later. For contentEditable RichInput fields, the DOM has already visibly
  // changed by the time this runs (the keystroke already landed), but
  // RichInput's own "sync external changes" effect corrects that as soon as
  // it loses focus: since `value` never actually changed, the moment
  // requestCopyPrompt() blurs the active editor, that effect resets the
  // DOM's innerHTML back to match — no separate revert logic needed here.
  const setField = useCallback(<K extends keyof ExtractedFlyer>(key: K, value: ExtractedFlyer[K]) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    setFields_((prev) => prev ? { ...prev, [key]: value } : prev);
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, [requestCopyPrompt]);

  const setFields = useCallback((patch: Partial<ExtractedFlyer>) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    setFields_((prev) => prev ? { ...prev, ...patch } : prev);
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, [requestCopyPrompt]);

  // ─── Image management ──────────────────────────────────────────────────────
  const assignImage = useCallback(async (slot: "hero" | "secondary", imageUrl: string) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    const ratio = ASPECT[slot];
    const croppedUrl = await cropImage(imageUrl, ratio);
    setImages((prev) => ({ ...prev, [slot]: { url: croppedUrl, originalUrl: imageUrl } }));
    setIsSaved(false);
  }, [requestCopyPrompt]);

  const assignGalleryImage = useCallback(async (idx: number, imageUrl: string) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    const croppedUrl = await cropImage(imageUrl, ASPECT.gallery);
    setImages((prev) => {
      const gallery = [...prev.gallery];
      while (gallery.length <= idx) gallery.push({ url: "", originalUrl: "" });
      gallery[idx] = { url: croppedUrl, originalUrl: imageUrl };
      return { ...prev, gallery };
    });
    setIsSaved(false);
  }, [requestCopyPrompt]);

  const removeImage = useCallback((slot: "hero" | "secondary" | "gallery", galleryIdx?: number) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    setImages((prev) => {
      if (slot === "gallery") {
        const gallery = prev.gallery.filter((_, i) => i !== galleryIdx);
        return { ...prev, gallery };
      }
      return { ...prev, [slot]: null };
    });
    setIsSaved(false);
  }, [requestCopyPrompt]);

  const repositionImage = useCallback(async (
    slot: "hero" | "secondary" | "gallery",
    x: number,
    y: number,
    galleryIdx?: number,
  ) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    const imgs = imagesRef.current;
    let originalUrl: string;
    let ratio: number;
    if (slot === "gallery") {
      const g = imgs.gallery[galleryIdx ?? 0];
      if (!g) return;
      originalUrl = g.originalUrl;
      ratio = ASPECT.gallery;
    } else {
      const img = imgs[slot];
      if (!img) return;
      originalUrl = img.originalUrl;
      ratio = ASPECT[slot];
    }
    const croppedUrl = await cropImage(originalUrl, ratio, x, y);
    setImages((prev) => {
      if (slot === "gallery") {
        const gallery = prev.gallery.map((g, i) =>
          i === (galleryIdx ?? 0) ? { ...g, url: croppedUrl } : g,
        );
        return { ...prev, gallery };
      }
      return { ...prev, [slot]: { url: croppedUrl, originalUrl } };
    });
  }, [requestCopyPrompt]);

  const addToImageBank = useCallback((url: string) => {
    setImageBank((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }, []);

  // ─── Generate ──────────────────────────────────────────────────────────────
  // Either input alone is enough: a flyer PDF, pasted event details, or both.
  const generate = useCallback(async (file: File | null, notes?: string) => {
    const slug = selectedCommunitySlug;
    if (!slug) return;
    if (!file && !notes?.trim()) return;
    const ctrl = new AbortController();
    generateAbortRef.current = ctrl;
    setIsGenerating(true);
    setGenerateError(null);
    setStage("generating");
    // A freshly drafted eblast holds its photos in memory already — nothing to
    // wait for, and no stale flag from a previously opened draft.
    resetImageLoadState();
    try {
      const MAX_DIRECT = 4 * 1024 * 1024;
      let res: Response;
      if (file && file.size > MAX_DIRECT) {
        res = await uploadPdfChunked(file, slug, ctrl.signal, notes);
      } else {
        const fd = new FormData();
        if (file) fd.append("file", file);
        if (notes?.trim()) fd.append("notes", notes.trim());
        fd.append("communitySlug", slug);
        res = await fetch("/api/draft-from-pdf", { method: "POST", body: fd, signal: ctrl.signal });
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Generation failed");

      const newFields: ExtractedFlyer = data.extracted;
      // Bake the "date · time" separator into the time text itself, rather than
      // the template inserting it between two independently-editable fields —
      // that's the only way it can pick up whatever bold/color/size the user
      // applies when editing the event time (render-email.ts falls back to its
      // own literal separator for older drafts saved before this existed).
      if (newFields.eventTime && !newFields.eventTime.trim().startsWith("·")) {
        newFields.eventTime = `· ${newFields.eventTime}`;
      }
      snapshotFooterOverrides(newFields);
      const bank: string[] = data.allExtractedImageUrls ?? [];

      // Build images from the API response
      const heroUrl = data.heroImageUrl as string | undefined;
      const secUrl = data.secondaryImageUrl as string | undefined;
      const galleryUrls: string[] = data.galleryImageUrls ?? [];
      const heroOrigUrl = data.heroOriginalUrl as string | undefined;
      const secOrigUrl = data.secondaryOriginalUrl as string | undefined;
      const galleryOrigUrls: string[] = data.galleryOriginalUrls ?? [];

      const newImages: DraftImages = {
        hero: heroUrl ? { url: heroUrl, originalUrl: heroOrigUrl ?? heroUrl } : null,
        secondary: secUrl ? { url: secUrl, originalUrl: secOrigUrl ?? secUrl } : null,
        gallery: galleryUrls.map((url, i) => ({ url, originalUrl: galleryOrigUrls[i] ?? url })),
      };

      setFields_(newFields);
      setImages(newImages);
      setImageBank(bank);
      setSubjectSpecialist(data.subjectSpecialist ?? null);
      setPastSendsContext(data.pastSendsContext ?? []);
      setIsSaved(false);
      setUndoStack([]);
      setRedoStack([]);
      setActiveSection("hero");
      setStage("editing");
      setLockInfo(null);
      setCopyPromptOpen(false);

      // Eagerly claim a draftId and write it to localStorage so the resume
      // banner always points to the draft just generated, not a previous one.
      const newDraftId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDraftId(newDraftId);
      try { localStorage.setItem("eblast_lastDraftId", newDraftId); } catch {}

      // Immediately persist to DB so resume works even if the user navigates
      // away before the first 5-second autoSave fires.
      const com = communityRef.current;
      if (com) {
        const initDraft: SavedDraft = {
          id: newDraftId,
          communitySlug: com.slug,
          communityName: com.displayName,
          savedAt: new Date().toISOString(),
          subject: newFields.subject,
          fields: newFields,
          images: { hero: null, secondary: null, gallery: [] },
          imageBank: [],
          imageCount: (newImages.hero ? 1 : 0) + (newImages.secondary ? 1 : 0) + newImages.gallery.length,
          pastSendsContext: data.pastSendsContext ?? [],
          subjectSpecialist: data.subjectSpecialist ?? null,
        };
        fetch("/api/saved-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: initDraft }),
        })
          .then(async () => {
            // Attach the flyer this was written from, so the editor can show
            // it beside the eblast. It was parked during generation rather
            // than uploaded twice. Non-fatal: a draft without one simply has
            // no flyer to show.
            if (data.flyerKey) {
              fetch(`/api/drafts/${newDraftId}/flyer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flyerKey: data.flyerKey }),
              }).catch(() => null);
            }
            // The untouched originals must be saved even as data URIs — they
            // are what repositionImage() re-crops from after a reload.
            return postImageBatches(newDraftId, buildImageRows(newImages, bank));
          })
          .catch(() => null);
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        setStage("idle");
      } else {
        setGenerateError(e.message ?? "Generation failed");
        setStage("idle");
      }
    } finally {
      setIsGenerating(false);
      generateAbortRef.current = null;
    }
  }, [selectedCommunitySlug]);

  const cancelGenerate = useCallback(() => {
    generateAbortRef.current?.abort();
  }, []);

  // ─── Refine ────────────────────────────────────────────────────────────────
  const refine = useCallback(async (instruction: string) => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    const imgs = imagesRef.current;
    if (!f || !c) return;
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }

    // Snapshot for undo
    const snapshot: RefineSnapshot = {
      fields: { ...f },
      images: { ...imgs, gallery: [...imgs.gallery] },
      instruction,
    };

    setIsRefining(true);
    setRefineError(null);
    try {
      const res = await fetch("/api/refine-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: f,
          instruction,
          communitySlug: c.slug,
          heroImageUrl: imgs.hero?.url,
          secondaryImageUrl: imgs.secondary?.url,
          galleryImageUrls: imgs.gallery.map((g) => g.url),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Refinement failed");

      setFields_(data.extracted as ExtractedFlyer);

      if (data.imagesChanged && data.images) {
        const { hero: h, secondary: s, gallery: g } = data.images as { hero?: string; secondary?: string; gallery?: string[] };
        setImages((prev) => ({
          hero: h ? { url: h, originalUrl: prev.hero?.originalUrl ?? h } : null,
          secondary: s ? { url: s, originalUrl: prev.secondary?.originalUrl ?? s } : null,
          gallery: (g ?? []).map((url: string, i: number) => ({
            url,
            originalUrl: prev.gallery[i]?.originalUrl ?? url,
          })),
        }));
      }

      setUndoStack((prev) => [...prev, snapshot]);
      setRedoStack([]);
      setIsSaved(false);
    } catch (e: any) {
      setRefineError(e.message ?? "Refinement failed");
    } finally {
      setIsRefining(false);
    }
  }, [requestCopyPrompt]);

  // Both stacks are read through refs and every setState below is a plain,
  // pure updater. The previous version nested setRedoStack inside the
  // setUndoStack updater (and vice versa) — React treats updaters as pure and
  // is free to invoke them more than once for a single dispatch, which it does
  // under StrictMode. Each undo click could therefore push the same snapshot
  // onto the redo stack twice, so the stacks drifted out of step and undo/redo
  // stopped lining up with what was actually on screen.
  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    const current = fieldsRef.current;
    const currentImgs = imagesRef.current;
    if (current) {
      const redoEntry: RefineSnapshot = {
        fields: { ...current },
        // Only capture images when the snapshot being restored carries them;
        // otherwise redo would "restore" images that undo never changed.
        images: snap.images ? { ...currentImgs, gallery: [...currentImgs.gallery] } : undefined,
        instruction: snap.instruction,
      };
      setRedoStack((r) => [...r, redoEntry]);
    }
    setFields_(snap.fields);
    if (snap.images) setImages(snap.images);
    setUndoStack((prev) => prev.slice(0, -1));
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    const current = fieldsRef.current;
    const currentImgs = imagesRef.current;
    if (current) {
      const undoEntry: RefineSnapshot = {
        fields: { ...current },
        images: snap.images ? { ...currentImgs, gallery: [...currentImgs.gallery] } : undefined,
        instruction: snap.instruction,
      };
      setUndoStack((u) => [...u, undoEntry]);
    }
    setFields_(snap.fields);
    if (snap.images) setImages(snap.images);
    setRedoStack((prev) => prev.slice(0, -1));
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, []);

  // ─── Build draft payload (shared by save + autoSave) ─────────────────────
  const buildDraftPayload = useCallback((): { id: string; draft: SavedDraft } | null => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    if (!f || !c) return null;
    const id = draftId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const imgs = imagesRef.current;

    // Strip ALL data URIs from the main payload — these can be multi-MB blobs
    // from PDF extraction and will exceed Vercel's 4.5 MB API route body limit.
    // All image data is saved separately via /api/saved-drafts/[id]/images.
    const filteredImages: DraftImages = {
      hero: imgs.hero ? { url: "", originalUrl: "" } : null,
      secondary: imgs.secondary ? { url: "", originalUrl: "" } : null,
      gallery: imgs.gallery.map(() => ({ url: "", originalUrl: "" })),
    };

    const draft: SavedDraft = {
      id,
      communitySlug: c.slug,
      communityName: c.displayName,
      savedAt: new Date().toISOString(),
      subject: f.subject,
      fields: f,
      images: filteredImages,
      imageBank: [],
      imageCount: (imgs.hero ? 1 : 0) + (imgs.secondary ? 1 : 0) + imgs.gallery.length,
      pastSendsContext,
      subjectSpecialist,
      // AI-edit history, so undo/redo still works after reopening a draft.
      // Text only (see RefineSnapshot.images) and capped, since this rides in
      // the same body as the draft and must stay well under Vercel's limit.
      editHistory: {
        undo: undoStackRef.current.slice(-MAX_PERSISTED_HISTORY).map(stripSnapshotImages),
        redo: redoStackRef.current.slice(-MAX_PERSISTED_HISTORY).map(stripSnapshotImages),
      },
    };
    return { id, draft };
  }, [draftId, imageBank, pastSendsContext, subjectSpecialist]);

  // ─── Save images to separate endpoint ────────────────────────────────────
  // imageBank entries: idx ≥ 0
  // hero.url: -1, hero.originalUrl: -2
  // secondary.url: -3, secondary.originalUrl: -4
  // gallery[i].url: -(10+i*2), gallery[i].originalUrl: -(11+i*2)
  const saveImagesForDraft = useCallback(async (draftId: string) => {
    // Never write photos out of a half-loaded draft. Until every phase has
    // arrived, the in-memory slots hold empty URLs and the flyer pool is
    // empty, so saving here would record "this eblast has no photos" over a
    // draft that has them. Callers await imagesReady first; this is the
    // backstop for any path that doesn't.
    if (!shownLoadedRef.current) return;

    // The untouched originals (the full, uncropped photos) MUST be saved even
    // as data URIs — they are the only way repositionImage() can crop to a
    // different part of a photo after a reload. Skipping them, as an earlier
    // version did, silently lost everything outside the saved crop.
    await postImageBatches(draftId, buildImageRows(imagesRef.current, imageBankRef.current));
  }, []);

  // ─── Save (explicit — shows "Saving…" indicator) ─────────────────────────
  // Deliberately NOT lock-guarded. Saving doesn't change the eblast — every
  // mutator that could change it is already blocked while locked, so this can
  // only ever persist the content that's already there. Prompting for a copy
  // here meant a locked draft couldn't even be re-saved, which reads as the
  // app refusing an action that changes nothing.
  const save = useCallback(async () => {
    // Wait for a reopened draft to finish pulling its photos in. Saving over
    // a half-loaded draft would otherwise record it as having none.
    setWaitingForImages(true);
    try { await shownReadyRef.current; } finally { setWaitingForImages(false); }
    if (!shownLoadedRef.current) { setSaveError(imagesErrorRef.current ?? "Photos are still loading"); return; }
    const payload = buildDraftPayload();
    if (!payload) return;
    const { id, draft } = payload;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/saved-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const text = await res.text();
      let data: { ok: boolean; error?: string };
      try { data = JSON.parse(text); }
      catch { throw new Error(text.replace(/\n/g, " ").trim().slice(0, 200) || `HTTP ${res.status}`); }
      if (!data.ok) throw new Error(data.error ?? "Save failed");
      setDraftId(id);
      setIsSaved(true);
      setSaveNotice("Draft saved");
      setTimeout(() => setSaveNotice(null), 3000);
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {};
      // Save all images separately to avoid 4.5 MB payload limit
      saveImagesForDraft(id).catch(() => null);
    } catch (e: any) {
      setSaveError(e.message ?? "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [buildDraftPayload, saveImagesForDraft, requestCopyPrompt]);

  // ─── autoSave (silent — no UI indicator, used by 5s interval) ────────────
  // Guarded the same way as save() — belt-and-suspenders: setField/setFields
  // already stop bumping lastEditTimestamp while locked (so this normally
  // never even gets scheduled), but this covers any other path that might.
  const autoSave = useCallback(async () => {
    if (lockInfoRef.current?.locked) return;
    // Same reasoning as save(), and this one runs on a timer, so it is the
    // likeliest to fire while a freshly opened draft is still loading.
    await shownReadyRef.current;
    if (!shownLoadedRef.current) return;
    const payload = buildDraftPayload();
    if (!payload) return;
    const { id, draft } = payload;
    try {
      const res = await fetch("/api/saved-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const text = await res.text();
      let data: { ok: boolean };
      try { data = JSON.parse(text); }
      catch { return; /* non-JSON response, fail silently for auto-save */ }
      if (!data.ok) return;
      setDraftId(id);
      setIsSaved(true);
      // Remember last draft ID so GenerateView can offer "Resume" on next visit
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {}
      // Save all images separately to avoid 4.5 MB payload limit
      saveImagesForDraft(id).catch(() => null);
    } catch {
      // silent failure
    }
  }, [buildDraftPayload, saveImagesForDraft]);

  // ─── Load saved draft ─────────────────────────────────────────────────────
  const loadSavedDraft = useCallback((draft: SavedDraft) => {
    // Older drafts saved before the Footer override fields existed still have
    // them undefined (live-fallback era) — snapshot them now so reopening an
    // old draft also gets independent Hero/Footer fields going forward.
    if (draft.fields) snapshotFooterOverrides(draft.fields);
    setFields_(draft.fields ?? null);
    setImages(draft.images ?? EMPTY_IMAGES);
    setImageBank([]);
    setSubjectSpecialist(draft.subjectSpecialist ?? null);
    setPastSendsContext(draft.pastSendsContext ?? []);
    setDraftId(draft.id);
    setIsSaved(true);
    // Restore the AI-edit history so undo/redo works on a reopened draft.
    // Snapshots come back text-only, so undo will roll back copy but leave
    // images where they are — see RefineSnapshot.images.
    setUndoStack(draft.editHistory?.undo ?? []);
    setRedoStack(draft.editHistory?.redo ?? []);
    undoStackRef.current = draft.editHistory?.undo ?? [];
    redoStackRef.current = draft.editHistory?.redo ?? [];
    setActiveSection("hero");
    setStage("editing");
    setSelectedCommunitySlug(draft.communitySlug);
    setLockInfo(computeLockInfo(draft));
    setCopyPromptOpen(false);

    // ── Load the photos, in the order they're needed ──────────────────────
    // The photos in the eblast come first so the draft stops looking empty,
    // then the untouched originals that Reposition needs, then the unplaced
    // flyer pool behind the picker. On the largest real draft that is 1.2 MB
    // before anything is visible instead of 17.4 MB.
    //
    // Which slots exist is decided by the saved draft, not by what's in
    // storage: rows for a removed slot are not deleted, so a removed photo
    // would otherwise reappear on load. The exception is a draft with no
    // recorded slots at all (older drafts, or one saved before its photos
    // finished loading), where the stored rows are the only record there is
    // and ignoring them is what makes a draft look permanently empty.
    const blob = draft.images;
    const slotsUnrecorded = !blob || (!blob.hero && !blob.secondary && !blob.gallery?.length);
    const gallerySlotCount = blob?.gallery?.length ?? 0;

    imagesLoadedRef.current = false;
    setImagesLoading(true);
    setImageBankLoading(true);
    setImagesError(null);

    const received: ImageRow[] = [];
    // Whether the untouched originals have arrived yet. It decides whether a
    // slot missing one may fall back to the cropped photo: some older drafts
    // genuinely have no original stored and need that fallback, but applying
    // it while the originals are still downloading would treat every slot as
    // having none, and a save at that moment would write the cropped photo
    // over the original — destroying everything outside the crop.
    let originalsIn = false;

    // Rebuilds from everything received so far, so each phase can merge in
    // without needing to know what the previous ones set.
    const applyReceived = () => {
      const bank: string[] = [];
      let heroUrl = "", heroOrigUrl = "";
      let secUrl = "", secOrigUrl = "";
      const gallerySlots: Record<number, { url?: string; origUrl?: string }> = {};

      for (const { idx, url } of received) {
        if (idx >= 0) bank[idx] = url;
        else if (idx === -1) heroUrl = url;
        else if (idx === -2) heroOrigUrl = url;
        else if (idx === -3) secUrl = url;
        else if (idx === -4) secOrigUrl = url;
        else if (idx <= -10) {
          const neg = Math.abs(idx) - 10;
          const slot = Math.floor(neg / 2);
          if (!gallerySlots[slot]) gallerySlots[slot] = {};
          if (neg % 2 === 1) gallerySlots[slot].origUrl = url;
          else gallerySlots[slot].url = url;
        }
      }

      const compactBank = bank.filter(Boolean);
      if (compactBank.length) setImageBank(compactBank);

      setImages((prev) => {
        const next = { ...prev };
        const fallback = (v: string, other: string) => v || (originalsIn ? other : "");
        if ((slotsUnrecorded || blob?.hero) && (heroUrl || heroOrigUrl)) {
          next.hero = {
            url: fallback(heroUrl, heroOrigUrl),
            originalUrl: fallback(heroOrigUrl, heroUrl),
          };
        }
        if ((slotsUnrecorded || blob?.secondary) && (secUrl || secOrigUrl)) {
          next.secondary = {
            url: fallback(secUrl, secOrigUrl),
            originalUrl: fallback(secOrigUrl, secUrl),
          };
        }
        const gallery = [...prev.gallery];
        Object.entries(gallerySlots).forEach(([s, { url: u, origUrl: o }]) => {
          const i = parseInt(s);
          if (!slotsUnrecorded && i >= gallerySlotCount) return; // removed slot
          gallery[i] = { url: fallback(u ?? "", o ?? ""), originalUrl: fallback(o ?? "", u ?? "") };
        });
        next.gallery = gallery;
        return next;
      });
    };

    // Released as soon as the photos in the eblast are in, so a save or send
    // doesn't sit through the originals and the flyer pool as well.
    let releaseShown: () => void = () => {};
    shownLoadedRef.current = false;
    shownReadyRef.current = new Promise<void>((r) => { releaseShown = r; });

    const ready = (async () => {
      try {
        for (const phase of ["shown", "originals", "pool"] as ImagePhaseName[]) {
          const res = await fetch(`/api/saved-drafts/${draft.id}/images?phase=${phase}`);
          const data: { ok: boolean; images?: ImageRow[] } = await res.json();
          if (!data.ok) throw new Error("Could not load this draft's photos");
          // A repeated photo is stored once and pointed at from its other
          // rows; the pointer always names a row from this phase or an
          // earlier one, so everything received so far resolves it.
          received.push(...resolveImageRefs(data.images ?? [], received));
          if (phase === "originals") originalsIn = true;
          applyReceived();
          if (phase === "shown") {
            shownLoadedRef.current = true;
            setImagesLoading(false);
            releaseShown();
          }
        }
        imagesLoadedRef.current = true;
      } catch {
        // Leave imagesLoadedRef false so saving can't record this draft as
        // having no photos, and say so rather than looking merely slow.
        setImagesError("Could not load this draft's photos. Reload before saving or sending.");
      } finally {
        setImagesLoading(false);
        setImageBankLoading(false);
        // Always release, so a save or send reports the failure rather than
        // waiting on a phase that is never going to arrive.
        releaseShown();
      }
    })();
    imagesReadyRef.current = ready;
  }, []);

  // ─── Discard ──────────────────────────────────────────────────────────────
  const discard = useCallback(() => {
    resetImageLoadState();
    // Write localStorage SYNCHRONOUSLY before clearing state so GenerateView
    // can read the resume ID on its very first mount (no async race).
    const payload = buildDraftPayload();
    // Never persist a locked draft's in-memory edits on the way out — that
    // would slip an unauthorized change through the one exit path that
    // doesn't go through setField/save's guards.
    if (payload && !lockInfoRef.current?.locked) {
      const { id, draft } = payload;
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {}
      // Fire-and-forget save so the draft is persisted in the DB too.
      fetch("/api/saved-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      }).catch(() => null);
    }
    setStage("idle");
    setFields_(null);
    setImages(EMPTY_IMAGES);
    setImageBank([]);
    setSubjectSpecialist(null);
    setPastSendsContext([]);
    setDraftId(null);
    setIsSaved(false);
    setSaveNotice(null);
    setUndoStack([]);
    setRedoStack([]);
    setPushResult(null);
    setPushError(null);
    setApprovalStatus(null);
    setRefineError(null);
    setGenerateError(null);
    setLockInfo(null);
    setCopyPromptOpen(false);
  }, [buildDraftPayload]);

  // ─── Push ─────────────────────────────────────────────────────────────────
  // Not lock-guarded: pushing sends the draft to HubSpot, it doesn't alter it.
  // A draft that's already been pushed or approved is exactly the one you'd
  // legitimately want to push again (a failed push, a second segment), and the
  // copy prompt made that impossible.
  const push = useCallback(async () => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    if (!f || !c) return;
    setIsPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      // The eblast must go to HubSpot with its photos whether or not the
      // screen has finished loading them.
      setWaitingForImages(true);
      try { await shownReadyRef.current; } finally { setWaitingForImages(false); }
      if (!shownLoadedRef.current) throw new Error(imagesErrorRef.current ?? "Photos are still loading");
      // Community-page edits (colors, fonts, senders) made since this session
      // started must land in the pushed eblast — refresh before rendering.
      await refreshCommunity(c.slug);
      const html = buildHtml();
      const res = await fetch("/api/push-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySlug: c.slug,
          draftId,
          subject: f.subject,
          previewText: f.previewText,
          eventCategory: f.eventCategory,
          html,
        }),
      });
      const data = await res.json();
      setPushResult({ steps: data.steps ?? [], summary: data.summary ?? null });
      if (!data.ok) throw new Error(data.steps?.at(-1)?.body?.error ?? data.error ?? "Push failed");
      // A successful push locks this draft (push-eblast/route.ts just set
      // pushedAt in the DB) — reflect that immediately so a further edit in
      // THIS session prompts for a copy too, not just after a fresh reload.
      setLockInfo((prev) => ({
        locked: true,
        reasons: prev?.reasons.includes("pushed") ? prev.reasons : [...(prev?.reasons ?? []), "pushed"],
      }));
    } catch (e: any) {
      setPushError(e.message ?? "Push failed");
    } finally {
      setIsPushing(false);
    }
  }, [draftId, buildHtml, refreshCommunity, requestCopyPrompt]);

  // ─── Send for approval ───────────────────────────────────────────────────
  // Not lock-guarded either — sending for approval mails the draft out, it
  // doesn't edit it. Re-sending to a second reviewer, or re-sending after an
  // expired link, are both normal and were blocked by the copy prompt.
  const sendForApproval = useCallback(async (opts: { recipientEmail: string; recipientName?: string; notifyEmail?: string; note?: string; isTest?: boolean }) => {
    if (!draftId) throw new Error("Save the draft first before sending for approval.");
    const c = communityRef.current;
    if (!c) throw new Error("No community selected.");
    // Approval and test sends carry the photos too, loaded or not.
    setWaitingForImages(true);
    try { await shownReadyRef.current; } finally { setWaitingForImages(false); }
    if (!shownLoadedRef.current) throw new Error(imagesErrorRef.current ?? "Photos are still loading");
    // Same freshness guarantee as push() — the approval email must reflect
    // the community's current brand/sender, not a stale in-memory copy.
    await refreshCommunity(c.slug);
    const html = buildHtml();
    const res = await fetch("/api/draft-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedDraftId: draftId, communitySlug: c.slug, html, ...opts }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "Failed to send approval");
    // A test send deliberately leaves local state alone: no pending status, no
    // lock. It must be indistinguishable from never having pressed the button.
    if (opts.isTest) return;
    setApprovalStatus({ decision: "pending", sentAt: new Date().toISOString() });
    // Same reasoning as push() above — a pending approval row now exists in
    // the DB, so lock this draft immediately rather than waiting for a reload.
    setLockInfo((prev) => ({
      locked: true,
      reasons: prev?.reasons.includes("pending_approval") ? prev.reasons : [...(prev?.reasons ?? []), "pending_approval"],
    }));
  }, [draftId, buildHtml, refreshCommunity, requestCopyPrompt]);

  // ─── Subject swap ─────────────────────────────────────────────────────────
  const swapSubjectLine = useCallback((subject: string, previewText: string) => {
    if (lockInfoRef.current?.locked) { requestCopyPrompt(); return; }
    setFields_((prev) => prev ? { ...prev, subject, previewText } : prev);
    setIsSaved(false);
  }, [requestCopyPrompt]);

  // ─── selectCommunity ──────────────────────────────────────────────────────
  const selectCommunity = useCallback((slug: string) => {
    setSelectedCommunitySlug(slug);
  }, []);

  const dismissPushResult = useCallback(() => {
    setPushResult(null);
    setPushError(null);
  }, []);

  // ─── Copy prompt resolution (locked drafts) ──────────────────────────────
  // Every guarded mutator above rejects a locked edit outright — fields/images
  // never change while locked, so fieldsRef/imagesRef here are still exactly
  // what was loaded (the attempted edit was never applied, and RichInput has
  // already reverted its own DOM back to match once it lost focus). "Make a
  // Copy" duplicates that pristine state into a brand-new, unlocked draft,
  // titled `Copy of "{original subject}"`, and switches the editor onto it —
  // the user lands directly in the copy, ready to make the edit for real.
  // That title is written directly into fields.subject (the real email
  // subject line), not just the top-level SavedDraft.subject metadata —
  // buildDraftPayload() always re-derives the latter from fields.subject on
  // every save/autosave/discard, so a metadata-only title would get silently
  // clobbered by the very next one. This matches how "make a copy" works in
  // most similar tools (the copy's title visibly says "Copy of ..." until the
  // user renames it) rather than permanently diverging the list title from
  // the actual subject field.
  const makeCopy = useCallback(async () => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    if (!f || !c) return;
    setIsMakingCopy(true);
    try {
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const copiedFields: ExtractedFlyer = { ...f, subject: `Copy of "${f.subject}"` };
      const imgs = imagesRef.current;
      const filteredImages: DraftImages = {
        hero: imgs.hero ? { url: "", originalUrl: "" } : null,
        secondary: imgs.secondary ? { url: "", originalUrl: "" } : null,
        gallery: imgs.gallery.map(() => ({ url: "", originalUrl: "" })),
      };
      const draft: SavedDraft = {
        id: newId,
        communitySlug: c.slug,
        communityName: c.displayName,
        savedAt: new Date().toISOString(),
        subject: copiedFields.subject,
        fields: copiedFields,
        images: filteredImages,
        imageBank: [],
        imageCount: (imgs.hero ? 1 : 0) + (imgs.secondary ? 1 : 0) + imgs.gallery.length,
        pastSendsContext,
        subjectSpecialist,
      };
      const res = await fetch("/api/saved-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error ?? "Failed to create copy");

      setFields_(copiedFields);
      setDraftId(newId);
      setLockInfo(null);
      setIsSaved(true);
      setCopyPromptOpen(false);
      try { localStorage.setItem("eblast_lastDraftId", newId); } catch {}
      setSaveNotice("Created a copy — you're now editing it");
      setTimeout(() => setSaveNotice(null), 4000);
      saveImagesForDraft(newId).catch(() => null);
    } catch (e: any) {
      setSaveError(e.message ?? "Failed to create copy");
    } finally {
      setIsMakingCopy(false);
    }
  }, [pastSendsContext, subjectSpecialist, saveImagesForDraft]);

  // "Cancel" discards whatever's been typed since the lock was hit by
  // reloading the untouched original from the server — safe because setField/
  // save/autoSave/discard never actually persisted any of it while locked.
  const cancelCopyPrompt = useCallback(() => {
    setCopyPromptOpen(false);
    const id = draftId;
    if (!id) return;
    fetch(`/api/saved-drafts/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.draft) {
          loadSavedDraft({
            ...(data.draft as SavedDraft),
            approvedAt: data.approvedAt,
            pushedAt: data.pushedAt,
            pendingApproval: data.pendingApproval,
          });
        }
      })
      .catch(() => null);
  }, [draftId, loadSavedDraft]);

  // ─── Context value ────────────────────────────────────────────────────────
  const value: DraftContextValue = {
    communities,
    selectedCommunitySlug,
    community,
    stage,
    fields,
    images,
    imagesLoading,
    imageBankLoading,
    imagesError,
    waitingForImages,
    imageBank,
    draftId,
    isSaved,
    saveNotice,
    subjectSpecialist,
    pastSendsContext,
    activeSection,
    isGenerating,
    generateError,
    isRefining,
    refineError,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    lastRefineInstruction: undoStack.at(-1)?.instruction ?? null,
    isPushing,
    pushResult,
    pushError,
    isSaving,
    saveError,
    approvalStatus,
    lockInfo,
    copyPromptOpen,
    isMakingCopy,
    lastEditTimestamp,
    activeEditorRef,
    activeEditorCallback,
    activeFieldNameRef,

    selectCommunity,
    generate,
    cancelGenerate,
    setField,
    setFields,
    assignImage,
    assignGalleryImage,
    removeImage,
    repositionImage,
    refine,
    undo,
    redo,
    save,
    autoSave,
    discard,
    loadSavedDraft,
    push,
    sendForApproval,
    setActiveSection,
    swapSubjectLine,
    buildHtml,
    addToImageBank,
    dismissPushResult,
    makeCopy,
    cancelCopyPrompt,
    requestCopyPrompt,
  };

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
