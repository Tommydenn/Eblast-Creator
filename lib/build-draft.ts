import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import type { Community } from "@/lib/db/queries";
import type { ExtractedImage } from "@/lib/pdf-images";
import type { PastSendForContext } from "@/lib/past-sends-retrieval";
import { craftSubjectLine, type SubjectSpecialistResult } from "@/lib/agents/subject-specialist";

/**
 * Single-pass draft assembly. Replaces the old drafter/critic loop, which was
 * removed: the reviewer kept pushing copy toward "sharper" writing, which is
 * the opposite of the plain house voice, and every revision round was another
 * chance to drift away from it. The drafter's output now stands as written.
 */
export interface BuildDraftResult {
  finalDraft: ExtractedFlyer;
  finalImages: {
    heroDataUri?: string;
    secondaryDataUri?: string;
    galleryDataUris: string[];
  };
  subjectSpecialist: SubjectSpecialistResult | null;
}

/**
 * Slot order the renderer uses: first image is hero, second is the inline
 * secondary, next four fill the gallery.
 */
function deriveSlots(availableImages: ExtractedImage[]) {
  return {
    hero: availableImages[0],
    secondary: availableImages[1],
    gallery: availableImages.slice(2, 6),
  };
}

export async function buildDraft(opts: {
  initialDraft: ExtractedFlyer;
  community: Community;
  availableImages: ExtractedImage[];
  pastSends?: PastSendForContext[];
}): Promise<BuildDraftResult> {
  let draft = opts.initialDraft;

  // Subject specialist still runs — it generates alternatives shown in the
  // sidebar rather than critiquing the draft. Failure is non-fatal.
  let subjectSpecialist: SubjectSpecialistResult | null = null;
  try {
    subjectSpecialist = await craftSubjectLine({
      flyer: draft,
      community: opts.community,
      pastSends: opts.pastSends,
    });
    // Only swap when the winner genuinely differs, so the drafter's own line
    // survives when it already landed.
    if (
      subjectSpecialist.winner.subject !== draft.subject ||
      subjectSpecialist.winner.previewText !== draft.previewText
    ) {
      draft = {
        ...draft,
        subject: subjectSpecialist.winner.subject,
        previewText: subjectSpecialist.winner.previewText,
      };
    }
  } catch (e) {
    console.error("[build-draft] subject specialist failed, keeping drafter's subject:", e);
  }

  const slots = deriveSlots(opts.availableImages);
  return {
    finalDraft: draft,
    finalImages: {
      heroDataUri: slots.hero?.dataUri,
      secondaryDataUri: slots.secondary?.dataUri,
      galleryDataUris: slots.gallery.map((s) => s.dataUri),
    },
    subjectSpecialist,
  };
}
