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

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [events, communities] = await Promise.all([listFbEventTasks(), listCommunities()]);
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
