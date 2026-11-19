/**
 * Where a Facebook event's content comes from.
 *
 * Two sources, in this order, and the order is the whole point:
 *
 *   1. The eblast draft, when one exists. It has been through the voice
 *      doctrine and usually through a person, so it is the version of the day
 *      that has already been agreed.
 *
 *   2. The flyer on the eblast's Planner task, when no draft exists yet.
 *      Facebook events are usually due more than a week before the eblast
 *      they belong to, so waiting for the draft would mean the event is
 *      always late. The flyer is attached from the start, which is what makes
 *      this possible at all.
 *
 * Reading the flyer costs a Graph call and an extraction, so the PDF is kept
 * in pending_flyers under this task's own key — the cover needs the same file
 * and the copy is usually written more than once.
 */
import { db } from "@/lib/db";
import { draftFlyers, fbEventTasks, pendingFlyers, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGraphToken } from "@/lib/graph";
import { downloadTaskFlyer } from "@/lib/planner";
import { extractFlyerContent } from "@/lib/anthropic";
import { getCommunity } from "@/lib/db/queries";
import type { DraftFields } from "@/lib/fb-event-draft";
import { phoneFrom } from "@/lib/fb-event-copy";

/** pending_flyers is keyed by a free string; this is the one we use. */
export const flyerKey = (taskId: string) => `fb:${taskId}`;

export type SourceKind = "draft" | "flyer";

export interface EventSource {
  kind: SourceKind;
  fields: DraftFields;
  communityName: string;
  /**
   * The number this event tells people to ring: the community's Facebook
   * tracking number, or nothing at all.
   *
   * Facebook has a number of its own so a call from an event can be told
   * apart from a call from an eblast, which is the whole reason the two
   * differ. Falling back to the eblast's would book the call against the
   * wrong campaign and look perfectly right doing it, and whatever line the
   * designer printed on the flyer is no safer. So a community that has not
   * been given a Facebook number has no number here, and the copy says so
   * rather than borrowing one.
   */
  phone: string | null;
  /** The draft the fields came from, when they came from one. */
  draftId: string | null;
}

export class NoSourceError extends Error {}

/**
 * The flyer PDF for this event.
 *
 * Three places, cheapest first: the eblast draft's own copy, this event's
 * cache, and finally Planner — which costs a Graph call and is the only one
 * that can be slow.
 */
export async function flyerFor(taskId: string): Promise<Buffer | null> {
  const [task] = await db
    .select({ eblastTaskId: fbEventTasks.eblastTaskId, savedDraftId: fbEventTasks.savedDraftId })
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, taskId))
    .limit(1);

  if (task?.savedDraftId) {
    const [onDraft] = await db
      .select({ pdfBase64: draftFlyers.pdfBase64 })
      .from(draftFlyers)
      .where(eq(draftFlyers.draftId, task.savedDraftId))
      .limit(1);
    if (onDraft) return Buffer.from(onDraft.pdfBase64, "base64");
  }

  const key = flyerKey(taskId);
  const [cached] = await db
    .select({ pdfBase64: pendingFlyers.pdfBase64 })
    .from(pendingFlyers)
    .where(eq(pendingFlyers.key, key))
    .limit(1);
  if (cached) return Buffer.from(cached.pdfBase64, "base64");

  if (!task?.eblastTaskId) return null;

  const token = await getGraphToken();
  const flyer = await downloadTaskFlyer(task.eblastTaskId, token);
  if (!flyer) return null;

  await db
    .insert(pendingFlyers)
    .values({
      key,
      fileName: flyer.fileName,
      pdfBase64: flyer.bytes.toString("base64"),
      bytes: flyer.bytes.length,
    })
    .onConflictDoNothing();
  return flyer.bytes;
}

/**
 * The fields to build this event from.
 *
 * @throws NoSourceError when there is neither a draft nor a flyer, with a
 *         sentence saying which, because that is what the page shows.
 */
export async function sourceFor(taskId: string): Promise<EventSource> {
  const [task] = await db.select().from(fbEventTasks).where(eq(fbEventTasks.taskId, taskId)).limit(1);
  if (!task) throw new NoSourceError("No such event task");
  if (!task.communitySlug) {
    throw new NoSourceError(task.matchNote ?? "This event's Planner plan matches no community");
  }

  const community = await getCommunity(task.communitySlug);
  if (!community) throw new NoSourceError(`No community on file for ${task.communitySlug}`);

  if (task.savedDraftId) {
    const [draft] = await db
      .select({ data: savedDrafts.data, communityName: savedDrafts.communityName })
      .from(savedDrafts)
      .where(eq(savedDrafts.id, task.savedDraftId))
      .limit(1);
    if (draft) {
      const fields = ((draft.data as { fields?: DraftFields })?.fields ?? {}) as DraftFields;
      return {
        kind: "draft",
        fields,
        communityName: draft.communityName,
        draftId: task.savedDraftId,
        phone: phoneFrom(community.facebookPhone),
      };
    }
  }

  const pdf = await flyerFor(taskId);
  if (!pdf) {
    throw new NoSourceError(
      task.eblastTaskId
        ? "The eblast task has no flyer attached yet, so there is nothing to build from"
        : "No eblast task of this name, so there is no flyer to build from",
    );
  }

  const flyer = await extractFlyerContent({ pdfBase64: pdf.toString("base64"), community });

  return {
    kind: "flyer",
    draftId: null,
    communityName: community.displayName,
    phone: phoneFrom(community.facebookPhone),
    fields: {
      headline: flyer.headline,
      storyScriptTitle: flyer.storyScriptTitle,
      scriptSubheadline: flyer.scriptSubheadline,
      storyEyebrow: flyer.storyEyebrow,
      eventDate: flyer.eventDate,
      eventTime: flyer.eventTime,
      eventLocation: flyer.eventLocation,
      bodyParagraphs: flyer.bodyParagraphs,
      // Only when the flyer says so. Assuming it meant every walk-in event
      // was printed with a number and told people to call first.
      rsvpRequired: flyer.rsvpRequired === true,
    },
  };
}
