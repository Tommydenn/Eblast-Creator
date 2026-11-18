/**
 * The Facebook and Further events waiting to be put up.
 *
 * One row per "FB Event" task in Planner. What the row can offer depends on
 * whether its eblast has been drafted yet, because that draft is where every
 * word and the photo come from — so an event whose eblast is still to come
 * says exactly that rather than offering a button that would fail.
 */
import { Header } from "@/components/Header";
import { EventsPanel } from "@/components/EventsPanel";
import { listFbEventTasks } from "@/lib/fb-events";
import { listCommunities } from "@/data/communities";
import { hasFurtherKey, listCommunityEvents } from "@/lib/further";

export const dynamic = "force-dynamic";

/**
 * The events Further already holds, by name.
 *
 * Read so a row can say when the work is already done over there. Further
 * cannot be written to — their public API offers no way to create an event —
 * so this is the only half of that job the app can do, and it is the half
 * that stops the same event being entered twice.
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
  const nameBySlug = new Map(communities.map((c) => [c.slug, c.displayName]));

  const rows = events.map((e) => ({
    taskId: e.taskId,
    eventName: e.eventName,
    community: e.communitySlug ? nameBySlug.get(e.communitySlug) ?? e.communitySlug : null,
    dueAt: e.dueAt ? e.dueAt.toISOString() : null,
    hasDraft: Boolean(e.savedDraftId),
    matchNote: e.matchNote,
    eventTitle: e.eventTitle,
    facebookDescription: e.facebookDescription,
    furtherDescription: e.furtherDescription,
    generatedAt: e.generatedAt ? e.generatedAt.toISOString() : null,
    stale: Boolean(e.generatedAt && e.generatedFromDraftId && e.generatedFromDraftId !== e.savedDraftId),
    postedToFacebookAt: e.postedToFacebookAt ? e.postedToFacebookAt.toISOString() : null,
    furtherEventUuid: e.furtherEventUuid,
    // Matched on the name Further holds, since nothing links the two records.
    inFurther: inFurther
      ? inFurther.has((e.eventTitle ?? e.eventName).trim().toLowerCase())
      : null,
  }));

  return (
    <>
      <Header active="events" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">
        <div className="mb-8">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Control center</p>
          <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight text-sand-900">Events</h1>
          <p className="mt-1.5 text-sm text-sand-500">
            {rows.length} Facebook event {rows.length === 1 ? "task" : "tasks"} from Planner · the words and
            the photo come from each one&rsquo;s eblast
          </p>
        </div>
        <EventsPanel initialRows={rows} />
      </main>
    </>
  );
}
