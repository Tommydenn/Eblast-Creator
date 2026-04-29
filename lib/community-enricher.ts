// Community profile enricher.
// Reads each community's past sends, extracts contact info that's already
// embedded in those emails (CallRail tracking phones, website URLs, sender
// names + emails, physical addresses), and fills any gaps in the community
// row that are still null/empty.
//
// Idempotent: never overwrites a manually-set value unless `force: true`.
//
// Phones use regex extraction on the email body's tel: hrefs. For more
// nuanced extraction (which phone is the tracking phone vs the sales line vs
// a partner phone) we delegate to Claude — see `enrichCommunityWithClaude`.

import { eq, sql, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { communities, communitySenders, pastSends } from "@/lib/db/schema";
import { getMarketingEmail } from "@/lib/hubspot";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
// Cap how many email bodies we pull per community per run — most signals
// repeat across sends, no value in fetching all 60.
const SAMPLE_SIZE = 8;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export interface EnrichmentResult {
  slug: string;
  pastSendsScanned: number;
  fieldsUpdated: string[];
  candidates: {
    trackingPhone?: string[];
    email?: string[];
    websiteUrl?: string[];
    address?: any;
    senders?: Array<{ name: string; email: string }>;
  };
  notes: string[];
}

// ---------- regex helpers -------------------------------------------------

const TEL_HREF_RE = /href=["']tel:([^"']+)["']/gi;
const PHONE_DISPLAY_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const MAILTO_RE = /href=["']mailto:([^"'?]+)/gi;
const HTTPS_RE = /https?:\/\/[\w.-]+(?:\/[^"'\s<>]*)?/gi;

function normalizePhone(raw: string): string {
  // Strip everything but digits, then re-format.
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits.slice(1, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return raw.trim();
}

function tally<T extends string>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function topByCount<T extends string>(items: T[], minCount = 1, limit = 5): T[] {
  return Array.from(tally(items).entries())
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * Recursively collect every string value in a nested object tree. HubSpot
 * marketing emails store body content as widgets in a flexAreas tree —
 * walking the tree and accumulating strings is the simplest way to get a
 * grep-able representation that includes every link, phone, and snippet.
 */
function collectAllStrings(obj: any, depth = 0): string[] {
  if (depth > 12) return [];
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap((v) => collectAllStrings(v, depth + 1));
  if (obj && typeof obj === "object") return Object.values(obj).flatMap((v) => collectAllStrings(v, depth + 1));
  return [];
}

// ---------- the enricher --------------------------------------------------

const addressExtractionTool = {
  type: "object",
  required: ["found"],
  properties: {
    found: { type: "boolean", description: "Whether you confidently identified this community's physical street address in the email content." },
    street: { type: "string" },
    city: { type: "string" },
    state: { type: "string", description: "Two-letter US state abbreviation." },
    zip: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "How confident you are." },
    notes: { type: "string" },
  },
};

async function extractAddressFromEmailBodies(
  communityName: string,
  bodies: string[],
): Promise<{ street?: string; city?: string; state?: string; zip?: string; confidence?: string } | null> {
  if (bodies.length === 0) return null;
  const c = client();

  // Email footers are where addresses live. Slice the bottom portion of each
  // body and concatenate — keeps token count down.
  const slices = bodies.map((b) => b.slice(-3500)).join("\n\n---\n\n");

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `You are extracting a physical street address from senior-living marketing email footers. The community is ${communityName}. Look for the street, city, state, and zip that the community uses in its email signatures and footers — not partner addresses, not unsubscribe addresses, not corporate-parent addresses unless that IS this community's address.`,
    tools: [{ name: "extract_address", description: "Submit the address found.", input_schema: addressExtractionTool as any }],
    tool_choice: { type: "tool", name: "extract_address" },
    messages: [
      {
        role: "user",
        content: `Footers and lower portions of recent eblasts for ${communityName}:\n\n${slices}\n\nExtract the physical address by calling extract_address. If you can't confidently identify it, set found=false.`,
      },
    ],
  });
  const tu = response.content.find((b: any) => b.type === "tool_use");
  if (!tu || tu.type !== "tool_use") return null;
  const input = tu.input as any;
  if (!input.found) return null;
  return { street: input.street, city: input.city, state: input.state, zip: input.zip, confidence: input.confidence };
}

export async function enrichCommunity(opts: {
  slug: string;
  /** If true, overwrite even existing values. */
  force?: boolean;
  /** If true, also call Claude to extract the physical address from bodies. */
  extractAddress?: boolean;
  /** Callback for log lines so the caller can show progress. */
  log?: (msg: string) => void;
}): Promise<EnrichmentResult> {
  const log = opts.log ?? (() => {});
  const result: EnrichmentResult = {
    slug: opts.slug,
    pastSendsScanned: 0,
    fieldsUpdated: [],
    candidates: {},
    notes: [],
  };

  const community = (await db.select().from(communities).where(eq(communities.slug, opts.slug)).limit(1))[0];
  if (!community) {
    result.notes.push(`Community ${opts.slug} not found.`);
    return result;
  }

  // Pull this community's past sends from DB, sorted by recency.
  const sends = await db
    .select()
    .from(pastSends)
    .where(eq(pastSends.communityId, community.id))
    .orderBy(sql`COALESCE(${pastSends.publishedAt}, ${pastSends.syncedAt}) DESC`)
    .limit(SAMPLE_SIZE);

  result.pastSendsScanned = sends.length;
  log(`  ${opts.slug}: ${sends.length} past sends to scan`);
  if (sends.length === 0) return result;

  // Fetch each email's full content from HubSpot. The body is stored as a
  // nested widget/flex-area tree (drag-and-drop format), not flat HTML, so we
  // walk the tree and accumulate every string value. The result keeps every
  // tel:/mailto:/https:// reference present in the rendered email.
  const bodies: string[] = [];
  for (const send of sends) {
    const full = await getMarketingEmail(send.hubspotEmailId);
    if (full.ok && full.body?.content) {
      const text = collectAllStrings(full.body.content).join("\n");
      if (text) bodies.push(text);
    }
  }

  // ---------- phone extraction -----------------------------------------
  const telHrefs: string[] = [];
  const phoneDisplays: string[] = [];
  for (const body of bodies) {
    let m: RegExpExecArray | null;
    TEL_HREF_RE.lastIndex = 0;
    while ((m = TEL_HREF_RE.exec(body)) !== null) telHrefs.push(normalizePhone(m[1]));
    PHONE_DISPLAY_RE.lastIndex = 0;
    while ((m = PHONE_DISPLAY_RE.exec(body)) !== null) phoneDisplays.push(normalizePhone(m[0]));
  }
  const allPhones = [...telHrefs, ...phoneDisplays].filter((p) => p.length >= 10);
  const topPhones = topByCount(allPhones, 1, 5);
  result.candidates.trackingPhone = topPhones;

  // The most-frequently-occurring phone in past sends is almost certainly the
  // CallRail tracking number used in CTAs. Tommy confirmed each community
  // reuses one tracking number.
  if (topPhones.length > 0 && (opts.force || !community.trackingPhone)) {
    await db.update(communities).set({ trackingPhone: topPhones[0], updatedAt: new Date() }).where(eq(communities.id, community.id));
    result.fieldsUpdated.push(`trackingPhone=${topPhones[0]}`);
  }

  // ---------- website extraction ---------------------------------------
  // We score by the FULL URL (with path) so location-specific paths win
  // over generic root links — e.g. carettaseniorliving.com/holmen-wi/ over
  // carettaseniorliving.com/. Keep tracking-redirect domains out.
  const skipDomains = [
    "hubspot",
    "hsforms",
    "hsappstatic",
    "hubspotusercontent",
    "hs-sites",
    "google.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "twitter.com",
    "x.com",
    "tel:",
    "mailto:",
  ];
  const urlCounts = new Map<string, number>();
  for (const body of bodies) {
    let m: RegExpExecArray | null;
    HTTPS_RE.lastIndex = 0;
    while ((m = HTTPS_RE.exec(body)) !== null) {
      const url = m[0].split("?")[0].replace(/[).,;\]]+$/, "");
      if (skipDomains.some((d) => url.toLowerCase().includes(d))) continue;
      // Normalize trailing slash so /bellevue-wi and /bellevue-wi/ tally together.
      const normalized = url.replace(/\/+$/, "") + "/";
      urlCounts.set(normalized, (urlCounts.get(normalized) ?? 0) + 1);
    }
  }
  const topUrls = Array.from(urlCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  result.candidates.websiteUrl = topUrls.map(([u]) => u);
  if (topUrls.length > 0 && (opts.force || !community.websiteUrl)) {
    const winner = topUrls[0][0];
    await db.update(communities).set({ websiteUrl: winner, updatedAt: new Date() }).where(eq(communities.id, community.id));
    result.fieldsUpdated.push(`websiteUrl=${winner}`);
  }

  // ---------- email extraction -----------------------------------------
  const mailtos: string[] = [];
  for (const body of bodies) {
    let m: RegExpExecArray | null;
    MAILTO_RE.lastIndex = 0;
    while ((m = MAILTO_RE.exec(body)) !== null) {
      const e = m[1].toLowerCase();
      if (e.startsWith("unsubscribe")) continue;
      mailtos.push(e);
    }
  }
  const topMailtos = topByCount(mailtos, 1, 5);
  result.candidates.email = topMailtos;
  if (topMailtos.length > 0 && (opts.force || !community.email)) {
    await db.update(communities).set({ email: topMailtos[0], updatedAt: new Date() }).where(eq(communities.id, community.id));
    result.fieldsUpdated.push(`email=${topMailtos[0]}`);
  }

  // ---------- senders --------------------------------------------------
  // Past sends store from.fromName + from.replyTo. Add any new sender that
  // isn't already in community_senders.
  const existingSenders = await db.select().from(communitySenders).where(eq(communitySenders.communityId, community.id));
  const existingEmails = new Set(existingSenders.map((s) => s.email.toLowerCase()));

  const newSenders: Array<{ name: string; email: string }> = [];
  for (const send of sends) {
    const name = send.fromName?.trim();
    const email = send.fromEmail?.trim().toLowerCase();
    if (!name || !email) continue;
    if (existingEmails.has(email)) continue;
    if (newSenders.some((s) => s.email === email)) continue;
    newSenders.push({ name, email });
  }
  result.candidates.senders = newSenders;
  if (newSenders.length > 0) {
    await db.insert(communitySenders).values(
      newSenders.map((s) => ({
        communityId: community.id,
        name: s.name,
        email: s.email,
        isPrimary: existingSenders.length === 0 && newSenders[0].email === s.email,
      })),
    );
    result.fieldsUpdated.push(`senders+=${newSenders.length}`);
  }

  // ---------- physical address (Claude extraction, optional) ------------
  if (opts.extractAddress && bodies.length > 0) {
    const currentAddr = (community.address as any) ?? {};
    const addressIncomplete = !currentAddr.street || !currentAddr.city || !currentAddr.state || !currentAddr.zip;
    if (addressIncomplete || opts.force) {
      try {
        const addr = await extractAddressFromEmailBodies(community.displayName, bodies);
        if (addr && (addr.street || addr.city)) {
          result.candidates.address = addr;
          const merged = {
            street: addr.street ?? currentAddr.street ?? null,
            city: addr.city ?? currentAddr.city ?? null,
            state: addr.state ?? currentAddr.state ?? null,
            zip: addr.zip ?? currentAddr.zip ?? null,
          };
          await db.update(communities).set({ address: merged, updatedAt: new Date() }).where(eq(communities.id, community.id));
          result.fieldsUpdated.push(`address(claude/${addr.confidence ?? "unknown"})`);
        } else {
          result.notes.push("Claude could not confidently identify a physical address in past sends.");
        }
      } catch (e: any) {
        result.notes.push(`Address extraction failed: ${e.message ?? String(e)}`);
      }
    }
  }

  return result;
}

export async function enrichAllCommunities(opts: {
  force?: boolean;
  extractAddress?: boolean;
  log?: (msg: string) => void;
} = {}): Promise<EnrichmentResult[]> {
  const log = opts.log ?? console.log;
  const all = await db.select().from(communities);
  const results: EnrichmentResult[] = [];
  for (const c of all) {
    log(`Enriching ${c.slug}...`);
    try {
      const r = await enrichCommunity({ slug: c.slug, force: opts.force, extractAddress: opts.extractAddress, log });
      results.push(r);
      if (r.fieldsUpdated.length > 0) {
        log(`  -> updated: ${r.fieldsUpdated.join(", ")}`);
      } else {
        log(`  -> no updates (${r.pastSendsScanned} sends scanned)`);
      }
    } catch (e: any) {
      log(`  -> error: ${e.message ?? String(e)}`);
      results.push({ slug: c.slug, pastSendsScanned: 0, fieldsUpdated: [], candidates: {}, notes: [String(e)] });
    }
  }
  return results;
}
