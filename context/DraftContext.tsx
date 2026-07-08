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

async function uploadPdfChunked(file: File, communitySlug: string, signal?: AbortSignal): Promise<Response> {
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

export type FindingSeverity = "blocker" | "important" | "nice_to_have";
export type FindingCategory = "voice" | "brand" | "field_completeness" | "subject_line" | "preview_text" | "cta" | "structure" | "compliance" | "send_strategy" | "image_quality" | "craft";
export interface ReviewFinding { severity: FindingSeverity; category: FindingCategory; field?: string; issue: string; suggestion?: string; rationale: string }
export type ReviewVerdict = "ready" | "needs_revision" | "blocking_issues";
export interface DraftReview { verdict: ReviewVerdict; summary: string; findings: ReviewFinding[]; subjectLineAlternatives?: string[]; sendTimeRecommendation?: string; recipientListNote?: string }
export interface AgentLoopIteration { round: number; verdict: string; findingsCount: number; appliedSuggestions: string[]; droppedImageSlots: string[] }
export interface AgentLoopSummary { stoppedReason: string; totalRounds: number; imagesExcluded: number; iterations: AgentLoopIteration[] }
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
  review?: DraftReview | null;
  agentLoop?: AgentLoopSummary | null;
  pastSendsContext?: PastSendForContext[];
  subjectSpecialist?: SubjectSpecialistResult | null;
}

interface RefineSnapshot {
  fields: ExtractedFlyer;
  images: DraftImages;
  instruction: string;
}

export interface PushStep { step: string; ok: boolean; status?: number; body?: any }

// ─── Crop helpers ─────────────────────────────────────────────────────────────

const ASPECT = { hero: 600 / 340, secondary: 528 / 396, gallery: 4 / 3 } as const;

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
  review: DraftReview | null;
  agentLoop: AgentLoopSummary | null;
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
  lastEditTimestamp: number;
  activeEditorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeEditorCallback: React.MutableRefObject<(() => void) | null>;
  activeFieldNameRef: React.MutableRefObject<string | null>;

  selectCommunity: (slug: string) => void;
  generate: (file: File) => Promise<void>;
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
  sendForApproval: (opts: { recipientEmail: string; recipientName?: string; notifyEmail?: string }) => Promise<void>;
  setActiveSection: (section: EditorSection) => void;
  swapSubjectLine: (subject: string, previewText: string) => void;
  buildHtml: () => string;
  addToImageBank: (url: string) => void;
  dismissPushResult: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used inside DraftProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const EMPTY_IMAGES: DraftImages = { hero: null, secondary: null, gallery: [] };

export function DraftProvider({ children }: { children: React.ReactNode }) {
  // Community list
  const [communities, setCommunities] = useState<ClientCommunity[]>([]);
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState("");

  // Core draft state
  const [stage, setStage] = useState<Stage>("idle");
  const [fields, setFields_] = useState<ExtractedFlyer | null>(null);
  const [images, setImages] = useState<DraftImages>(EMPTY_IMAGES);
  const [imageBank, setImageBank] = useState<string[]>([]);

  // Save state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI outputs
  const [review, setReview] = useState<DraftReview | null>(null);
  const [agentLoop, setAgentLoop] = useState<AgentLoopSummary | null>(null);
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

  // Push
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ steps: PushStep[]; summary: any } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // Approval
  const [approvalStatus, setApprovalStatus] = useState<{ decision: string; sentAt: string } | null>(null);

  // Format toolbar — shared mutable refs so the preview-panel toolbar can
  // target whichever contentEditable is currently focused in the sidebar.
  const activeEditorRef = useRef<HTMLDivElement | null>(null);
  const activeEditorCallback = useRef<(() => void) | null>(null);
  const activeFieldNameRef = useRef<string | null>(null);

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
  useEffect(() => { imageBankRef.current = imageBank; }, [imageBank]);

  // Derived community object
  const community = communities.find((c) => c.slug === selectedCommunitySlug) ?? null;
  useEffect(() => { communityRef.current = community; }, [community]);

  // Fetch communities on mount
  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((data) => {
        if (data.communities) setCommunities(data.communities as ClientCommunity[]);
      })
      .catch(() => null);
  }, []);

  // ─── buildHtml ─────────────────────────────────────────────────────────────
  // Synchronous, uses refs so it's always current even during async operations.
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
  const setField = useCallback(<K extends keyof ExtractedFlyer>(key: K, value: ExtractedFlyer[K]) => {
    setFields_((prev) => prev ? { ...prev, [key]: value } : prev);
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, []);

  const setFields = useCallback((patch: Partial<ExtractedFlyer>) => {
    setFields_((prev) => prev ? { ...prev, ...patch } : prev);
    setIsSaved(false);
    setLastEditTimestamp(Date.now());
  }, []);

  // ─── Image management ──────────────────────────────────────────────────────
  const assignImage = useCallback(async (slot: "hero" | "secondary", imageUrl: string) => {
    const ratio = ASPECT[slot];
    const croppedUrl = await cropImage(imageUrl, ratio);
    setImages((prev) => ({ ...prev, [slot]: { url: croppedUrl, originalUrl: imageUrl } }));
    setIsSaved(false);
  }, []);

  const assignGalleryImage = useCallback(async (idx: number, imageUrl: string) => {
    const croppedUrl = await cropImage(imageUrl, ASPECT.gallery);
    setImages((prev) => {
      const gallery = [...prev.gallery];
      while (gallery.length <= idx) gallery.push({ url: "", originalUrl: "" });
      gallery[idx] = { url: croppedUrl, originalUrl: imageUrl };
      return { ...prev, gallery };
    });
    setIsSaved(false);
  }, []);

  const removeImage = useCallback((slot: "hero" | "secondary" | "gallery", galleryIdx?: number) => {
    setImages((prev) => {
      if (slot === "gallery") {
        const gallery = prev.gallery.filter((_, i) => i !== galleryIdx);
        return { ...prev, gallery };
      }
      return { ...prev, [slot]: null };
    });
    setIsSaved(false);
  }, []);

  const repositionImage = useCallback(async (
    slot: "hero" | "secondary" | "gallery",
    x: number,
    y: number,
    galleryIdx?: number,
  ) => {
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
  }, []);

  const addToImageBank = useCallback((url: string) => {
    setImageBank((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }, []);

  // ─── Generate ──────────────────────────────────────────────────────────────
  const generate = useCallback(async (file: File) => {
    const slug = selectedCommunitySlug;
    if (!slug) return;
    const ctrl = new AbortController();
    generateAbortRef.current = ctrl;
    setIsGenerating(true);
    setGenerateError(null);
    setStage("generating");
    try {
      const MAX_DIRECT = 4 * 1024 * 1024;
      let res: Response;
      if (file.size > MAX_DIRECT) {
        res = await uploadPdfChunked(file, slug, ctrl.signal);
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("communitySlug", slug);
        res = await fetch("/api/draft-from-pdf", { method: "POST", body: fd, signal: ctrl.signal });
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Generation failed");

      const newFields: ExtractedFlyer = data.extracted;
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
      setReview(data.review ?? null);
      setAgentLoop(data.agentLoop ?? null);
      setSubjectSpecialist(data.subjectSpecialist ?? null);
      setPastSendsContext(data.pastSendsContext ?? []);
      setIsSaved(false);
      setUndoStack([]);
      setRedoStack([]);
      setActiveSection("hero");
      setStage("editing");

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
          review: data.review ?? null,
          agentLoop: data.agentLoop ?? null,
          pastSendsContext: data.pastSendsContext ?? [],
          subjectSpecialist: data.subjectSpecialist ?? null,
        };
        fetch("/api/saved-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: initDraft }),
        })
          .then(async () => {
            // Send each slot image individually — cropped data URIs are ~100-200KB each.
            // Skip originalUrl when it's a data URI (raw PDF pages are 2-5MB).
            const isDataUri = (u: string) => u.startsWith("data:");
            const slotItems: Array<{ idx: number; url: string }> = [];
            if (newImages.hero?.url) slotItems.push({ idx: -1, url: newImages.hero.url });
            if (newImages.hero?.originalUrl && !isDataUri(newImages.hero.originalUrl)) slotItems.push({ idx: -2, url: newImages.hero.originalUrl });
            if (newImages.secondary?.url) slotItems.push({ idx: -3, url: newImages.secondary.url });
            if (newImages.secondary?.originalUrl && !isDataUri(newImages.secondary.originalUrl)) slotItems.push({ idx: -4, url: newImages.secondary.originalUrl });
            newImages.gallery.forEach((g, i) => {
              if (g.url) slotItems.push({ idx: -(10 + i * 2), url: g.url });
              if (g.originalUrl && !isDataUri(g.originalUrl)) slotItems.push({ idx: -(11 + i * 2), url: g.originalUrl });
            });
            for (const item of slotItems) {
              await fetch(`/api/saved-drafts/${newDraftId}/images`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ images: [item] }),
              }).catch(() => null);
            }
            // imageBank — HTTPS URLs only (skip data URIs)
            const bankEntries: Array<{ idx: number; url: string }> = [];
            bank.forEach((url, i) => {
              if (url && url.startsWith("http")) bankEntries.push({ idx: i, url });
            });
            const CHUNK = 20;
            const doChunk = (offset: number): Promise<void> => {
              if (offset >= bankEntries.length) return Promise.resolve();
              return fetch(`/api/saved-drafts/${newDraftId}/images`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ images: bankEntries.slice(offset, offset + CHUNK) }),
              }).then(() => doChunk(offset + CHUNK));
            };
            return doChunk(0);
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
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      const current = fieldsRef.current;
      const currentImgs = imagesRef.current;
      if (current) {
        setRedoStack((r) => [...r, { fields: { ...current }, images: { ...currentImgs, gallery: [...currentImgs.gallery] }, instruction: snap.instruction }]);
      }
      setFields_(snap.fields);
      setImages(snap.images);
      setIsSaved(false);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      const current = fieldsRef.current;
      const currentImgs = imagesRef.current;
      if (current) {
        setUndoStack((u) => [...u, { fields: { ...current }, images: { ...currentImgs, gallery: [...currentImgs.gallery] }, instruction: snap.instruction }]);
      }
      setFields_(snap.fields);
      setImages(snap.images);
      setIsSaved(false);
      return prev.slice(0, -1);
    });
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
      review,
      agentLoop,
      pastSendsContext,
      subjectSpecialist,
    };
    return { id, draft };
  }, [draftId, imageBank, review, agentLoop, pastSendsContext, subjectSpecialist]);

  // ─── Save images to separate endpoint ────────────────────────────────────
  // imageBank entries: idx ≥ 0
  // hero.url: -1, hero.originalUrl: -2
  // secondary.url: -3, secondary.originalUrl: -4
  // gallery[i].url: -(10+i*2), gallery[i].originalUrl: -(11+i*2)
  const saveImagesForDraft = useCallback(async (draftId: string) => {
    const imgs = imagesRef.current;
    const bank = imageBankRef.current;

    // Send each slot image in its own POST — cropped data URIs are ~100-200KB each,
    // well under the 4.5 MB Vercel limit when sent individually.
    // Skip originalUrl when it's a data URI (raw PDF pages are 2-5MB each).
    const isDataUri = (u: string) => u.startsWith("data:");
    const slotItems: Array<{ idx: number; url: string }> = [];
    if (imgs.hero?.url) slotItems.push({ idx: -1, url: imgs.hero.url });
    if (imgs.hero?.originalUrl && !isDataUri(imgs.hero.originalUrl)) slotItems.push({ idx: -2, url: imgs.hero.originalUrl });
    if (imgs.secondary?.url) slotItems.push({ idx: -3, url: imgs.secondary.url });
    if (imgs.secondary?.originalUrl && !isDataUri(imgs.secondary.originalUrl)) slotItems.push({ idx: -4, url: imgs.secondary.originalUrl });
    imgs.gallery.forEach((g, i) => {
      if (g.url) slotItems.push({ idx: -(10 + i * 2), url: g.url });
      if (g.originalUrl && !isDataUri(g.originalUrl)) slotItems.push({ idx: -(11 + i * 2), url: g.originalUrl });
    });
    for (const item of slotItems) {
      await fetch(`/api/saved-drafts/${draftId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [item] }),
      }).catch(() => null);
    }

    // Save imageBank HTTPS URLs only — skip data URIs (too large for 4.5 MB limit)
    const bankEntries: Array<{ idx: number; url: string }> = [];
    bank.forEach((url, i) => {
      if (url && url.startsWith("http")) bankEntries.push({ idx: i, url });
    });
    const CHUNK = 20;
    for (let i = 0; i < bankEntries.length; i += CHUNK) {
      await fetch(`/api/saved-drafts/${draftId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: bankEntries.slice(i, i + CHUNK) }),
      }).catch(() => null);
    }
  }, []);

  // ─── Save (explicit — shows "Saving…" indicator) ─────────────────────────
  const save = useCallback(async () => {
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
  }, [buildDraftPayload, saveImagesForDraft]);

  // ─── autoSave (silent — no UI indicator, used by 5s interval) ────────────
  const autoSave = useCallback(async () => {
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
    setFields_(draft.fields ?? null);
    setImages(draft.images ?? EMPTY_IMAGES);
    setImageBank([]);

    setReview(draft.review ?? null);
    setAgentLoop(draft.agentLoop ?? null);
    setSubjectSpecialist(draft.subjectSpecialist ?? null);
    setPastSendsContext(draft.pastSendsContext ?? []);
    setDraftId(draft.id);
    setIsSaved(true);
    setUndoStack([]);
    setRedoStack([]);
    setActiveSection("hero");
    setStage("editing");
    setSelectedCommunitySlug(draft.communitySlug);

    // Load images from separate endpoint (saved to avoid 4.5 MB payload limit)
    fetch(`/api/saved-drafts/${draft.id}/images`)
      .then((r) => r.json())
      .then((data: { ok: boolean; images?: Array<{ idx: number; url: string }> }) => {
        if (!data.ok || !data.images?.length) return;

        const bank: string[] = [];
        let heroUrl = "", heroOrigUrl = "";
        let secUrl = "", secOrigUrl = "";
        const gallerySlots: Record<number, { url?: string; origUrl?: string }> = {};

        for (const { idx, url } of data.images) {
          if (idx >= 0) {
            bank[idx] = url;
          } else if (idx === -1) {
            heroUrl = url;
          } else if (idx === -2) {
            heroOrigUrl = url;
          } else if (idx === -3) {
            secUrl = url;
          } else if (idx === -4) {
            secOrigUrl = url;
          } else if (idx <= -10) {
            const neg = Math.abs(idx) - 10;
            const slot = Math.floor(neg / 2);
            const isOrig = neg % 2 === 1;
            if (!gallerySlots[slot]) gallerySlots[slot] = {};
            if (isOrig) gallerySlots[slot].origUrl = url;
            else gallerySlots[slot].url = url;
          }
        }

        const compactBank = bank.filter(Boolean);
        if (compactBank.length) setImageBank(compactBank);

        const hasSlotImages =
          heroUrl || heroOrigUrl || secUrl || secOrigUrl || Object.keys(gallerySlots).length > 0;
        if (hasSlotImages) {
          setImages((prev) => {
            const next = { ...prev };
            if (heroUrl || heroOrigUrl) {
              next.hero = { url: heroUrl || heroOrigUrl, originalUrl: heroOrigUrl || heroUrl };
            }
            if (secUrl || secOrigUrl) {
              next.secondary = { url: secUrl || secOrigUrl, originalUrl: secOrigUrl || secUrl };
            }
            if (Object.keys(gallerySlots).length > 0) {
              const gallery = [...prev.gallery];
              Object.entries(gallerySlots).forEach(([s, { url: u, origUrl: o }]) => {
                const i = parseInt(s);
                gallery[i] = { url: u || o || "", originalUrl: o || u || "" };
              });
              next.gallery = gallery;
            }
            return next;
          });
        }
      })
      .catch(() => null);
  }, []);

  // ─── Discard ──────────────────────────────────────────────────────────────
  const discard = useCallback(() => {
    // Write localStorage SYNCHRONOUSLY before clearing state so GenerateView
    // can read the resume ID on its very first mount (no async race).
    const payload = buildDraftPayload();
    if (payload) {
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
    setReview(null);
    setAgentLoop(null);
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
  }, [buildDraftPayload]);

  // ─── Push ─────────────────────────────────────────────────────────────────
  const push = useCallback(async () => {
    const f = fieldsRef.current;
    const c = communityRef.current;
    if (!f || !c) return;
    setIsPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const html = buildHtml();
      const res = await fetch("/api/push-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySlug: c.slug,
          subject: f.subject,
          previewText: f.previewText,
          eventCategory: f.eventCategory,
          html,
        }),
      });
      const data = await res.json();
      setPushResult({ steps: data.steps ?? [], summary: data.summary ?? null });
      if (!data.ok) throw new Error(data.steps?.at(-1)?.body?.error ?? data.error ?? "Push failed");
    } catch (e: any) {
      setPushError(e.message ?? "Push failed");
    } finally {
      setIsPushing(false);
    }
  }, [buildHtml]);

  // ─── Send for approval ───────────────────────────────────────────────────
  const sendForApproval = useCallback(async (opts: { recipientEmail: string; recipientName?: string; notifyEmail?: string }) => {
    if (!draftId) throw new Error("Save the draft first before sending for approval.");
    const c = communityRef.current;
    if (!c) throw new Error("No community selected.");
    const html = buildHtml();
    const res = await fetch("/api/draft-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedDraftId: draftId, communitySlug: c.slug, html, ...opts }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "Failed to send approval");
    setApprovalStatus({ decision: "pending", sentAt: new Date().toISOString() });
  }, [draftId, buildHtml]);

  // ─── Subject swap ─────────────────────────────────────────────────────────
  const swapSubjectLine = useCallback((subject: string, previewText: string) => {
    setFields_((prev) => prev ? { ...prev, subject, previewText } : prev);
    setIsSaved(false);
  }, []);

  // ─── selectCommunity ──────────────────────────────────────────────────────
  const selectCommunity = useCallback((slug: string) => {
    setSelectedCommunitySlug(slug);
  }, []);

  const dismissPushResult = useCallback(() => {
    setPushResult(null);
    setPushError(null);
  }, []);

  // ─── Context value ────────────────────────────────────────────────────────
  const value: DraftContextValue = {
    communities,
    selectedCommunitySlug,
    community,
    stage,
    fields,
    images,
    imageBank,
    draftId,
    isSaved,
    saveNotice,
    review,
    agentLoop,
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
  };

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
