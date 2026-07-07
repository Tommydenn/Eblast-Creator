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
export interface CommunityBrand { primary: string; accent: string; background: string; fontHeadline: string; fontBody: string; secondary?: string }
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

  // Refs for synchronous access in buildHtml / callbacks
  const fieldsRef = useRef<ExtractedFlyer | null>(null);
  const imagesRef = useRef<DraftImages>(EMPTY_IMAGES);
  const communityRef = useRef<ClientCommunity | null>(null);

  // Keep refs in sync
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { imagesRef.current = images; }, [images]);

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
  }, []);

  const setFields = useCallback((patch: Partial<ExtractedFlyer>) => {
    setFields_((prev) => prev ? { ...prev, ...patch } : prev);
    setIsSaved(false);
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
      setDraftId(null);
      setIsSaved(false);
      setUndoStack([]);
      setRedoStack([]);
      setActiveSection("hero");
      setStage("editing");
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
    const draft: SavedDraft = {
      id,
      communitySlug: c.slug,
      communityName: c.displayName,
      savedAt: new Date().toISOString(),
      subject: f.subject,
      fields: f,
      images: imgs,
      imageBank,
      imageCount: (imgs.hero ? 1 : 0) + (imgs.secondary ? 1 : 0) + imgs.gallery.length,
      review,
      agentLoop,
      pastSendsContext,
      subjectSpecialist,
    };
    return { id, draft };
  }, [draftId, imageBank, review, agentLoop, pastSendsContext, subjectSpecialist]);

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
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Save failed");
      setDraftId(id);
      setIsSaved(true);
      setSaveNotice("Draft saved");
      setTimeout(() => setSaveNotice(null), 3000);
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {};
    } catch (e: any) {
      setSaveError(e.message ?? "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [buildDraftPayload]);

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
      const data = await res.json();
      if (!data.ok) return;
      setDraftId(id);
      setIsSaved(true);
      // Remember last draft ID so GenerateView can offer "Resume" on next visit
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {}
    } catch {
      // silent failure
    }
  }, [buildDraftPayload]);

  // ─── Load saved draft ─────────────────────────────────────────────────────
  const loadSavedDraft = useCallback((draft: SavedDraft) => {
    setFields_(draft.fields ?? null);
    setImages(draft.images ?? EMPTY_IMAGES);
    setImageBank(draft.imageBank ?? []);

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
  }, []);

  // ─── Discard ──────────────────────────────────────────────────────────────
  const discard = useCallback(() => {
    // Fire-and-forget: persist the current state so the user can resume later
    const payload = buildDraftPayload();
    if (payload) {
      const { id, draft } = payload;
      fetch("/api/saved-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      }).catch(() => null);
      try { localStorage.setItem("eblast_lastDraftId", id); } catch {}
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
    const res = await fetch("/api/draft-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedDraftId: draftId, communitySlug: c.slug, ...opts }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "Failed to send approval");
    setApprovalStatus({ decision: "pending", sentAt: new Date().toISOString() });
  }, [draftId]);

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
