// The drafter ↔ critic loop. Runs server-side, does not surface to the user
// until the two agents converge on a draft the critic considers ready (or the
// loop hits its iteration cap).
//
// Loop:
//   round N:
//     Derive the current hero/secondary/gallery image slots from
//     availableImages minus excludedIndices.
//     critic reviews the current draft + the images it would actually see.
//     if critic flagged images: drop those slots, mark imagesChanged, continue.
//     if verdict == "ready" and no image flags: stop.
//     if no actionable suggestions and no image flags: stop.
//     drafter applies the critic's text findings as a refinement instruction.
//   stops at MAX_ROUNDS regardless.
//
// Stagnation guard: if the count of blocker/important findings doesn't drop
// between rounds AND no images were swapped, we're stalled — bail out rather
// than burn another round.

import { refineFlyerContent } from "@/lib/anthropic";
import { reviewDraft, type DraftReview, type CriticFinding } from "@/lib/critic";
import type { Community } from "@/data/communities";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import type { ExtractedImage } from "@/lib/pdf-images";
import type { PastSendForContext } from "@/lib/past-sends-retrieval";

const MAX_ROUNDS = 3;

export type StopReason = "ready" | "max_iterations" | "no_progress" | "regressed";

export interface AgenticIteration {
  /** 1-indexed round number. */
  round: number;
  /** The draft that was reviewed THIS round. */
  draft: ExtractedFlyer;
  /** Review of `draft` (with the round's image slot assignment in view). */
  review: DraftReview;
  /** Indices into availableImages that were active for this round's review. */
  activeImageIndices: number[];
  /** Indices excluded going into this round (cumulative). */
  excludedIndicesSnapshot: number[];
  /**
   * If we refined after this round, the suggestions we asked the drafter to
   * address. Absent on the final round.
   */
  appliedSuggestions?: string[];
  /** Image slots dropped after this round's review. */
  droppedImageSlots?: string[];
}

export interface FinalImageAssignment {
  heroDataUri?: string;
  secondaryDataUri?: string;
  galleryDataUris: string[];
  /** How many of the originally-extracted images were excluded by the critic. */
  excludedCount: number;
}

export interface AgenticDraftResult {
  finalDraft: ExtractedFlyer;
  finalReview: DraftReview;
  finalImages: FinalImageAssignment;
  iterations: AgenticIteration[];
  stoppedReason: StopReason;
  totalRounds: number;
}

function severityWeight(s: CriticFinding["severity"]): number {
  return s === "blocker" ? 100 : s === "important" ? 10 : 1;
}

function actionableScore(review: DraftReview): number {
  return (review.findings ?? [])
    .filter((f) => f.severity === "blocker" || f.severity === "important")
    .reduce((acc, f) => acc + severityWeight(f.severity), 0);
}

function buildRefinementInstruction(review: DraftReview): string {
  const actionable = (review.findings ?? []).filter(
    (f) => (f.severity === "blocker" || f.severity === "important") && f.suggestion,
  );
  if (actionable.length === 0) return "";

  const lines = [
    "A senior reviewer flagged the following issues with the current draft. Apply each fix in the order listed. Where two fixes conflict, honor the higher-severity one. Make ONLY the changes implied by these notes — do not rewrite untouched fields.",
    "",
    ...actionable.map((f, i) => {
      const target = f.field ? ` (field: ${f.field})` : "";
      return `${i + 1}. [${f.severity.toUpperCase()}]${target} ${f.issue}\n   Fix: ${f.suggestion}`;
    }),
  ];
  return lines.join("\n");
}

/**
 * Given the available image pool, the indices that have been excluded so far,
 * and the slot order the renderer uses, return what's currently in each slot
 * AND the originalIndex for each so we can map flags back to indices.
 */
function deriveSlots(availableImages: ExtractedImage[], excluded: Set<number>) {
  const active = availableImages
    .map((img, originalIndex) => ({ img, originalIndex }))
    .filter(({ originalIndex }) => !excluded.has(originalIndex));

  return {
    hero: active[0],
    secondary: active[1],
    gallery: active.slice(2, 6),
    activeIndices: active.map((a) => a.originalIndex),
  };
}

/**
 * Run the drafter ↔ critic loop. Returns the final converged draft, the
 * final image slot assignment, and the full iteration trace.
 */
export async function agenticDraftLoop(opts: {
  initialDraft: ExtractedFlyer;
  community: Community;
  availableImages: ExtractedImage[];
  /** Recent sends + performance for this community. Threaded into both drafter and critic so the agents have memory. */
  pastSends?: PastSendForContext[];
}): Promise<AgenticDraftResult> {
  let currentDraft = opts.initialDraft;
  const excluded = new Set<number>();

  const iterations: AgenticIteration[] = [];
  let stoppedReason: StopReason = "max_iterations";

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const slots = deriveSlots(opts.availableImages, excluded);

    const review = await reviewDraft({
      flyer: currentDraft,
      community: opts.community,
      images: {
        heroDataUri: slots.hero?.img.dataUri,
        secondaryDataUri: slots.secondary?.img.dataUri,
        galleryDataUris: slots.gallery.map((s) => s.img.dataUri),
      },
      pastSends: opts.pastSends,
    });

    const iter: AgenticIteration = {
      round,
      draft: currentDraft,
      review,
      activeImageIndices: slots.activeIndices,
      excludedIndicesSnapshot: Array.from(excluded),
    };
    iterations.push(iter);

    // Process image flags FIRST. Even if the critic says "ready" overall,
    // any flagged image needs swapping — flagging an image is itself a
    // blocker by construction.
    const dropped: string[] = [];
    if (review.flaggedImages && review.flaggedImages.length > 0) {
      for (const flag of review.flaggedImages) {
        if (flag.slot === "hero" && slots.hero) {
          excluded.add(slots.hero.originalIndex);
          dropped.push(`hero (${flag.reason})`);
        } else if (flag.slot === "secondary" && slots.secondary) {
          excluded.add(slots.secondary.originalIndex);
          dropped.push(`secondary (${flag.reason})`);
        } else if (flag.slot === "gallery" && flag.galleryIndex) {
          const target = slots.gallery[flag.galleryIndex - 1];
          if (target) {
            excluded.add(target.originalIndex);
            dropped.push(`gallery #${flag.galleryIndex} (${flag.reason})`);
          }
        }
      }
    }
    if (dropped.length > 0) iter.droppedImageSlots = dropped;
    const imagesChanged = dropped.length > 0;

    // Convergence: critic says ready AND no image flags need acting on.
    if (review.verdict === "ready" && !imagesChanged) {
      stoppedReason = "ready";
      break;
    }

    const actionable = (review.findings ?? []).filter(
      (f) => (f.severity === "blocker" || f.severity === "important") && f.suggestion,
    );

    // Critic flagged things but had no concrete fix to offer AND no image
    // swap was triggered — stalled.
    if (actionable.length === 0 && !imagesChanged) {
      stoppedReason = "no_progress";
      break;
    }

    // Stagnation/regression guard — only meaningful if we have a prior round
    // AND no image change happened (image swaps always count as forward
    // progress because they materially alter what the critic will see next).
    if (iterations.length >= 2 && !imagesChanged) {
      const prev = iterations[iterations.length - 2];
      const prevScore = actionableScore(prev.review);
      const currScore = actionableScore(review);
      if (currScore > prevScore) {
        stoppedReason = "regressed";
        break;
      }
      if (currScore === prevScore) {
        stoppedReason = "no_progress";
        break;
      }
    }

    // Last allowed round — don't refine further.
    if (round === MAX_ROUNDS) break;

    // Apply text findings to the draft for the next round. If the only
    // change this round was image swapping (no text suggestions), skip the
    // refine call — the same draft is fine to re-review with new images.
    if (actionable.length > 0) {
      const instruction = buildRefinementInstruction(review);
      iter.appliedSuggestions = actionable.map((f) => f.suggestion!);
      currentDraft = await refineFlyerContent({
        current: currentDraft,
        instruction,
        community: opts.community,
        pastSends: opts.pastSends,
      });
    }
  }

  const finalSlots = deriveSlots(opts.availableImages, excluded);

  return {
    finalDraft: currentDraft,
    finalReview: iterations[iterations.length - 1].review,
    finalImages: {
      heroDataUri: finalSlots.hero?.img.dataUri,
      secondaryDataUri: finalSlots.secondary?.img.dataUri,
      galleryDataUris: finalSlots.gallery.map((s) => s.img.dataUri),
      excludedCount: excluded.size,
    },
    iterations,
    stoppedReason,
    totalRounds: iterations.length,
  };
}
