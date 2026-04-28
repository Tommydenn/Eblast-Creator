// Single source of truth for Great Lakes Management senior-living communities.
// Add a community by:
//   1. Dropping its assets into data/communities/{slug}/ (brand-guide.pdf, logo, etc.)
//   2. Adding an entry below.
//   3. Committing and pushing — Vercel auto-deploys.

export interface CommunityBrand {
  /** Hex, e.g. "#1F4538". The dominant brand color for hero blocks, links. */
  primary: string;
  /** Hex, e.g. "#B5683E". Used for CTA buttons, accents. */
  accent: string;
  /** Hex, e.g. "#FBF7EE". Page/email background. */
  background: string;
  /** Brand-appropriate display font, falls back to Georgia. */
  fontHeadline: string;
  /** Body font. Defaults to Helvetica/Arial stack. */
  fontBody: string;
}

export interface CommunitySender {
  /** Sales director full name — appears as "From" in HubSpot. */
  name: string;
  /** Sales director email. Must be a verified sending address in HubSpot. */
  email: string;
  /** Optional title shown in email signatures. */
  title?: string;
}

export interface CommunityHubSpot {
  /** Numeric ID of the segmented contact list this community emails. */
  listId?: number;
  /** Optional: HubSpot business unit if you've split portals. */
  businessUnitId?: number;
  /** The active sending domain HubSpot uses for this community. */
  activeDomain?: string;
}

export type CommunityType = "assisted_living" | "memory_care" | "independent_living" | "mixed";

export interface Community {
  /** URL-safe identifier, e.g. "caretta-bellevue". Used in routes and folder paths. */
  slug: string;
  /** Full marketing name, e.g. "Caretta Bellevue". */
  displayName: string;
  /** Short brand name without the city, e.g. "Caretta". */
  shortName: string;
  /** What this community offers. Drives template defaults. */
  type: CommunityType;
  brand: CommunityBrand;
  address: { street: string; city: string; state: string; zip: string };
  phone: string;
  email: string;
  websiteUrl: string;
  sender: CommunitySender;
  hubspot: CommunityHubSpot;
  /** Human notes — voice, tone, audience cues for AI drafting. */
  voiceNotes?: string;
}

export const communities: Community[] = [
  {
    slug: "caretta-bellevue",
    displayName: "Caretta Bellevue",
    shortName: "Caretta",
    type: "mixed", // assisted living + memory care
    brand: {
      primary: "#1F4538",
      accent: "#B5683E",
      background: "#FBF7EE",
      fontHeadline: "Georgia, 'Times New Roman', serif",
      fontBody: "'Helvetica Neue', Arial, sans-serif",
    },
    address: {
      street: "1780 Servant Way",
      city: "Bellevue",
      state: "WI",
      zip: "54311",
    },
    phone: "920.504.3443",
    email: "Bellevue@CarettaSeniorLiving.com",
    websiteUrl: "https://www.CarettaSeniorLiving.com",
    sender: {
      // TODO: replace with the actual Caretta Bellevue sales director
      name: "Caretta Bellevue",
      email: "Bellevue@CarettaSeniorLiving.com",
    },
    hubspot: {
      // TODO: fill with the Caretta Bellevue segmented list ID
      activeDomain: "talamoresunprairie-8818180.hs-sites.com",
    },
    voiceNotes:
      "Boutique, warm, hospitality-forward. Lean on food and craft. " +
      "Family-decision audience: addresses adult children making the decision " +
      "for a parent as much as the resident themselves.",
  },
];

// ---------- helpers ------------------------------------------------------

export function getCommunity(slug: string): Community | undefined {
  return communities.find((c) => c.slug === slug);
}

export function listCommunities(): Community[] {
  return [...communities].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
