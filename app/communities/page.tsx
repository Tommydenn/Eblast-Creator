import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { listCommunities } from "@/data/communities";
import { db } from "@/lib/db";
import { savedDraftApprovals } from "@/lib/db/schema";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

const FAMILY_COLORS: Record<string, string> = {
  "Amira Choice":                "#8b9eb5",
  "Caretta":                     "#7a9e8a",
  "Cottagewood":                 "#c4a87a",
  "Global Pointe":               "#9ab5c4",
  "Hayden Grove":                "#8fa878",
  "Orchards of Minnetonka":      "#a8c4a0",
  "Seven Hills":                 "#b59e7a",
  "The Glenn":                   "#9b8bb5",
  "The Pillars of Grand Rapids": "#b59b8b",
  "Talamore":                    "#7a9bb5",
};
const DEFAULT_BAR_COLOR = "#a0a89e";

/**
 * Approvals still sitting with a salesperson. This is the one number worth
 * surfacing here: it's live, it's actionable (someone needs chasing), and
 * nothing else in the app shows it. The old Sends / Avg-open figures were
 * accurate but not actionable, so they're gone rather than replaced.
 */
async function countAwaitingApproval(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.decision, "pending"));
  return row?.n ?? 0;
}

/** Everything a community needs before it can produce a complete eblast. */
function missingPieces(c: Awaited<ReturnType<typeof listCommunities>>[number]): string[] {
  const missing: string[] = [];
  if (c.logos.length === 0) missing.push("Logo");
  if (c.senders.length === 0) missing.push("Salesperson");
  if (!c.trackingPhone) missing.push("Tracking number");
  if (!c.websiteUrl) missing.push("Website");
  if (c.brand.paletteSource !== "brand-guide-extracted") missing.push("Brand colors");
  if (c.brand.fontsSource !== "brand-guide-extracted") missing.push("Brand fonts");
  return missing;
}

export default async function CommunitiesPage() {
  const [communities, awaitingApproval] = await Promise.all([listCommunities(), countAwaitingApproval()]);

  const grouped = new Map<string, typeof communities>();
  for (const c of communities) {
    const fam = c.brandFamily ?? c.shortName;
    grouped.set(fam, [...(grouped.get(fam) ?? []), c]);
  }

  const total = communities.length;

  return (
    <>
      <Header active="communities" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">

        {/* Page header */}
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Control center</p>
            <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight text-sand-900">Communities</h1>
            <p className="mt-1.5 text-sm text-sand-500">
              {total} communities · Great Lakes Management
            </p>
          </div>

          {/* The one actionable number: approvals a salesperson hasn't answered. */}
          {awaitingApproval > 0 && (
            <div className="hidden sm:flex items-center gap-2.5 rounded-xl border border-sand-200 bg-white px-5 py-3 shrink-0">
              <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" aria-hidden />
              <div>
                <div className="text-[17px] font-semibold leading-none text-sand-900 tabular-nums">{awaitingApproval}</div>
                <div className="mt-1 text-[10px] font-medium uppercase tracking-widest text-sand-400">
                  Awaiting approval
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Community groups */}
        <div className="space-y-6">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([family, list]) => (
              <section key={family}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: FAMILY_COLORS[family] ?? DEFAULT_BAR_COLOR }}
                  />
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-sand-600">
                    {family}
                  </h2>
                  <span className="text-[11px] text-sand-400">
                    {list.length === 1 ? "1 location" : `${list.length} locations`}
                  </span>
                </div>

                <div className="rounded-xl border border-sand-200 bg-white overflow-hidden">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "56%" }} />
                      <col style={{ width: "36%" }} />
                      <col style={{ width: "8%" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-sand-100 bg-sand-50/70 text-[10px] font-semibold uppercase tracking-widest text-sand-400">
                        <th className="px-5 py-2.5 text-left">Community</th>
                        <th className="px-4 py-2.5 text-left">Sender</th>
                        <th className="px-5 py-2.5 text-center">Setup</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-100">
                      {list.map((c) => {
                        const barColor = FAMILY_COLORS[family] ?? DEFAULT_BAR_COLOR;
                        const missing = missingPieces(c);
                        const isReady = missing.length === 0;

                        return (
                          <tr key={c.slug} className="group align-middle hover:bg-sand-50 transition-colors duration-100">
                            <td className="px-5 py-3">
                              <Link href={`/communities/${c.slug}`} className="block">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-6 w-[3px] shrink-0 rounded-full opacity-70"
                                    style={{ backgroundColor: barColor }}
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <div className="font-medium text-sand-900 group-hover:text-forest-700 transition-colors truncate">
                                      {c.displayName}
                                    </div>
                                    <div className="text-[11px] text-sand-400 truncate">
                                      {c.address.city
                                        ? `${c.address.city}, ${c.address.state ?? ""}`
                                        : "—"}
                                      {c.careTypes && c.careTypes.length > 0 && (
                                        <span className="ml-1.5">· {c.careTypes.join(" · ")}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              {c.senders[0] ? (
                                <div className="min-w-0">
                                  <div className="text-sm text-sand-900 truncate">{c.senders[0].name}</div>
                                  {c.senders.length > 1 && (
                                    <div className="text-[11px] text-sand-400">+{c.senders.length - 1} more</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-sand-400">—</span>
                              )}
                            </td>
                            {/* Green when the community has everything an eblast
                                needs; red otherwise, with the specifics on hover. */}
                            <td className="px-5 py-3 text-center">
                              <span
                                className="inline-flex h-2.5 w-2.5 rounded-full cursor-help align-middle"
                                style={{ backgroundColor: isReady ? "#4f9a6a" : "#c0553f" }}
                                title={isReady ? "Everything set up" : `Missing: ${missing.join(", ")}`}
                                aria-label={isReady ? "Everything set up" : `Missing: ${missing.join(", ")}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
        </div>
      </main>
    </>
  );
}

