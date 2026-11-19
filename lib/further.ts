/**
 * Talking to Further (TalkFurther).
 *
 * The key is an organisation one, and their scheme puts the kind of key in
 * the header value rather than in a separate field: `Org-Api-Key frth_org_…`
 * for an organisation key, `Api-Key frth_usr_…` for a personal one. Sending
 * the wrong word is a 401 that looks exactly like a bad key, so the word is
 * chosen from the key's own prefix instead of being configured.
 */
const BASE = process.env.FURTHER_API_BASE ?? "https://api.talkfurther.com";

function authorization(): string {
  const key = (process.env.FURTHER_API_KEY ?? "").trim();
  if (!key) throw new Error("FURTHER_API_KEY is not set");
  if (key.startsWith("frth_org_")) return `Org-Api-Key ${key}`;
  if (key.startsWith("frth_usr_")) return `Api-Key ${key}`;
  // An unfamiliar prefix is still worth trying as an organisation key rather
  // than refusing outright, since the prefix could change.
  return `Org-Api-Key ${key}`;
}

export function hasFurtherKey(): boolean {
  return Boolean((process.env.FURTHER_API_KEY ?? "").trim());
}

export interface FurtherEvent {
  event_instance_uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  is_all_day: boolean;
  communities: Array<Record<string, unknown>>;
}

async function call(path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authorization(),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Every community event Further holds for this account. */
export async function listCommunityEvents(): Promise<FurtherEvent[]> {
  const out: FurtherEvent[] = [];
  let page = 1;
  // Paginated; a handful of pages at most, and capped so a broken `next`
  // cannot loop for ever.
  for (let i = 0; i < 20; i++) {
    const res = await call(`/api/v1/community-events?page=${page}&page_size=100`);
    if (!res.ok) throw new Error(`Further answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { results?: FurtherEvent[]; next?: string | null };
    out.push(...(body.results ?? []));
    if (!body.next) break;
    page++;
  }
  return out;
}
