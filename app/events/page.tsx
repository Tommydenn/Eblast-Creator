/**
 * The Facebook and TalkFurther events waiting to be put up.
 *
 * One row per "FB Event" task in Planner. Neither platform can be written to
 * — Facebook has no API that creates an event, and Further's public API has
 * no write method for one — so what this page does is get everything that has
 * to be typed into one place, correct, with the fewest motions.
 */
import { Header } from "@/components/Header";
import { EventsPanel } from "@/components/EventsPanel";
import { listFbEventTasks } from "@/lib/fb-events";
import { listCommunities } from "@/data/communities";
import { facebookEventsUrl } from "@/lib/db/queries";
import { hasFurtherKey, listCommunityEvents } from "@/lib/further";

export const dynamic = "force-dynamic";

/**
 * The events Further already holds, by name.
 *
 * Read so a row can say when the work is already done over there. Further
 * cannot be written to, so this is the only half of that job the app can do,
 * and it is the half that stops the same event being entered twice.
 */
async function furtherNames(): Promise<Set<string> | null> {
  if (!hasFurtherKey()) return null;
  try {
    const events = await listCommunityEvents();
    return new Set(events.map((e) => (e.name ?? "").trim().toLowerCase()).filter(Boolean));
  } catch {
    // Their API being down is not a reason for this page to be.
    return null;
  }
}

export default async function EventsPage() {
  const [events, communities, inFurther] = await Promise.all([
    listFbEventTasks(),
    listCommunities(),
    furtherNames(),
  ]);
  const bySlug = new Map(communities.map((c) => [c.slug, c]));

  const rows = events.map((e) => {
    const community = e.communitySlug ? bySlug.get(e.communitySlug) ?? null : null;
    return {
      taskId: e.taskId,
      eventName: e.eventName,
      community: community?.displayName ?? e.communitySlug ?? null,
      communitySlug: e.communitySlug,
      dueAt: e.dueAt ? e.dueAt.toISOString() : null,
      matchNote: e.matchNote,
      eventTitle: e.eventTitle,
      eventDate: e.eventDate,
      eventTime: e.eventTime,
      eventLocation: e.eventLocation,
      facebookDescription: e.facebookDescription,
      furtherDescription: e.furtherDescription,
      generatedAt: e.generatedAt ? e.generatedAt.toISOString() : null,
      generatedFrom: e.generatedFrom,
      // Only copy written FROM a draft can be out of date with one.
      stale: Boolean(
        e.generatedAt && e.generatedFromDraftId && e.generatedFromDraftId !== e.savedDraftId,
      ),
      postedToFacebookAt: e.postedToFacebookAt ? e.postedToFacebookAt.toISOString() : null,
      // Matched on the name Further holds, since nothing links the two records.
      inFurther: inFurther ? inFurther.has((e.eventTitle ?? e.eventName).trim().toLowerCase()) : null,
      facebookEventsUrl: facebookEventsUrl(community?.socials?.facebook),
    };
  });

  const todo = rows.filter((r) => !r.postedToFacebookAt).length;

  return (
    <>
      <Header active="events" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">
        <div className="mb-6">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Control center</p>
          <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight text-sand-900">Events</h1>
          <p className="mt-1.5 text-sm text-sand-500">
            {todo} to post on Facebook and TalkFurther
          </p>
        </div>
        <EventsPanel initialRows={rows} />
      </main>
    </>
  );
}
