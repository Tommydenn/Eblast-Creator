// Seed stubs for all 22 Great Lakes Management communities.
// Source-of-truth for the initial migration; the seed script reads this file
// and inserts/upserts into the `communities` and `community_senders` tables.
//
// Confidence levels (per field):
//   - High: derived from YTD email metadata (sender domains, sender names).
//   - Medium: inferred from community name (brand family, likely website).
//   - TODO: needs Tommy to fill in (brand colors, addresses, phone, tracking
//     phone, voice, amenities, etc.). Marked with explicit `null` or default.
//
// To re-seed: `npm run db:seed` (idempotent — uses INSERT...ON CONFLICT).

import type { NewCommunityRow } from "./schema";

export interface SeedSender {
  name: string;
  email: string;
  title?: string;
  isPrimary?: boolean;
}

export interface SeedCommunity {
  community: Omit<NewCommunityRow, "id" | "createdAt" | "updatedAt">;
  senders: SeedSender[];
}

// Default brand placeholder — used for communities with no confirmed brand guide data.
const DEFAULT_BRAND = {
  primary: "#1F4538",
  accent: "#B5683E",
  background: "#FBF7EE",
  fontHeadline: "Georgia, 'Times New Roman', serif",
  fontBody: "'Helvetica Neue', Arial, sans-serif",
  paletteSource: "default" as const,
  fontsSource: "default" as const,
};

// ── Extracted from brand guides June 2025 ────────────────────────────────────

const CARETTA_BRAND = {
  primary: "#064C3F",   // PMS 3435C — dark forest green
  accent: "#995B25",    // copper brown
  background: "#FBF7EE",
  fontHeadline: "Bookman Old Style",
  fontBody: "Josefin Sans",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const TALAMORE_BRAND = {
  primary: "#004D71",   // deep blue
  accent: "#CCAC77",    // warm gold
  background: "#FBF7EE",
  fontHeadline: "Nexa",
  fontBody: "Nexa",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const SEVEN_HILLS_BRAND = {
  primary: "#588074",   // Summit Green
  accent: "#322110",    // Brownstone (dark warm brown)
  background: "#F1ECE6", // Sandstone
  fontHeadline: "Garamond BE",
  fontBody: "Garamond BE",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const THE_GLENN_BRAND = {
  primary: "#4F8736",   // forest green
  accent: "#4C7F94",    // slate blue
  background: "#B1B3B6", // warm gray
  fontHeadline: "BigCity Grotesque Pro",
  fontBody: "Minion",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const HAYDEN_GROVE_BRAND = {
  primary: "#457574",   // Jade (Pantone 7720 U)
  accent: "#C9DED3",    // Gold (Pantone 5807 U)
  background: "#DBD6D1", // Stone (warm light gray)
  fontHeadline: "Georgia, 'Times New Roman', serif", // typography page not in brand guide
  fontBody: "'Helvetica Neue', Arial, sans-serif",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "default" as const,
};

const AMIRA_CHOICE_BRAND = {
  primary: "#303B56",   // Amira Navy (PMS 2378)
  accent: "#524B43",    // Amira Taupe (PMS 4231CP)
  background: "#DDDDDB", // Amira Gray (Cool Gray 1)
  fontHeadline: "P22 Mackinac",
  fontBody: "F37 Moon",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const PILLARS_BRAND = {
  primary: "#59611D",   // Fern Frond (dark olive green)
  accent: "#AF7C58",    // Limed Oak (toffee copper)
  background: "#FBF7EE",
  fontHeadline: "Bebas Neue",
  fontBody: "Neutra Text",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

const GLOBAL_POINTE_BRAND = {
  primary: "#6B999B",   // PMS 5497 U — muted teal (IL property color)
  accent: "#E8604C",    // PMS 7416 U — coral/salmon (AL property color)
  background: "#C1C6C8", // PMS 428 U — light cool gray (accent/surface)
  fontHeadline: "Adobe Caslon Pro",
  fontBody: "Montserrat",
  paletteSource: "brand-guide-extracted" as const,
  fontsSource: "brand-guide-extracted" as const,
};

export const seedCommunities: SeedCommunity[] = [
  // ---------------- Caretta brand ----------------
  {
    community: {
      slug: "caretta-bellevue",
      displayName: "Caretta Bellevue",
      shortName: "Caretta",
      brandFamily: "Caretta",
      nameAbbreviation: "ACB",
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: { street: "1780 Servant Way", city: "Bellevue", state: "WI", zip: "54311" },
      phone: "920.504.3443",
      email: "Bellevue@CarettaSeniorLiving.com",
      websiteUrl: "https://www.CarettaSeniorLiving.com/bellevue",
      trackingPhone: null, // TODO: CallRail tracking number
      hubspot: {},
      brand: CARETTA_BRAND,
      taglines: [
        "Caretta seeks to enrich the rhythms of our residents' lives by fostering meaningful relationships, creating engaging experiences, and providing exceptional care.",
      ],
      amenities: [
        "Boutique 26-apartment memory care neighborhood",
        "Made-from-scratch dining via Unidine",
        "9' ceilings and large windows",
        "All-new stainless appliances and quartz countertops",
        "Satellite TV and WiFi included",
      ],
      voiceNotes:
        "Boutique, warm, hospitality-forward. Lean on food and craft. Family-decision audience: addresses adult children making the decision for a parent as much as the resident themselves.",
      socials: {},
      marketingDirector: { name: "Amelia Ozell", email: "aozell@greatlakesmc.com" },
    },
    senders: [
      // YTD shows Becky Sobolik and Meranda Lelonek both sending from
      // @carettaseniorliving.com across multiple Caretta locations. Tommy
      // needs to confirm which sender belongs to which location.
      { name: "Becky Sobolik", email: "rsobolik@carettaseniorliving.com" },
      { name: "Meranda Lelonek", email: "mlelonek@carettaseniorliving.com" },
    ],
  },
  {
    community: {
      slug: "caretta-eau-claire",
      displayName: "Caretta Eau Claire",
      shortName: "Caretta",
      brandFamily: "Caretta",
      nameAbbreviation: null, // TODO
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      phone: null,
      email: null,
      websiteUrl: "https://www.CarettaSeniorLiving.com/eau-claire",
      trackingPhone: null,
      hubspot: {},
      brand: CARETTA_BRAND,
      socials: {},
      marketingDirector: { name: "Amelia Ozell", email: "aozell@greatlakesmc.com" },
    },
    senders: [
      { name: "Becky Sobolik", email: "rsobolik@carettaseniorliving.com" },
      { name: "Meranda Lelonek", email: "mlelonek@carettaseniorliving.com" },
    ],
  },
  {
    community: {
      slug: "caretta-holmen",
      displayName: "Caretta Holmen",
      shortName: "Caretta",
      brandFamily: "Caretta",
      nameAbbreviation: null,
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      websiteUrl: "https://www.CarettaSeniorLiving.com/holmen",
      hubspot: {},
      brand: CARETTA_BRAND,
      socials: {},
      marketingDirector: { name: "Amelia Ozell", email: "aozell@greatlakesmc.com" },
    },
    senders: [
      { name: "Becky Sobolik", email: "rsobolik@carettaseniorliving.com" },
      { name: "Meranda Lelonek", email: "mlelonek@carettaseniorliving.com" },
    ],
  },
  {
    community: {
      slug: "caretta-maplewood",
      displayName: "Caretta Maplewood",
      shortName: "Caretta",
      brandFamily: "Caretta",
      nameAbbreviation: null,
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      websiteUrl: "https://www.CarettaSeniorLiving.com/maplewood",
      hubspot: {},
      brand: CARETTA_BRAND,
      socials: {},
      marketingDirector: { name: "Amelia Ozell", email: "aozell@greatlakesmc.com" },
    },
    senders: [
      { name: "Becky Sobolik", email: "rsobolik@carettaseniorliving.com" },
      { name: "Meranda Lelonek", email: "mlelonek@carettaseniorliving.com" },
    ],
  },

  // ---------------- Talamore brand ----------------
  {
    community: {
      slug: "talamore-st-cloud",
      displayName: "Talamore St Cloud",
      shortName: "Talamore",
      brandFamily: "Talamore",
      type: "mixed",
      address: { city: "St Cloud", state: "MN" },
      websiteUrl: "https://www.talamoreseniorliving.com",
      hubspot: {},
      brand: TALAMORE_BRAND,
      socials: {},
    },
    senders: [
      { name: "Brian Glonek", email: "bglonek@talamoreseniorliving.com" },
      { name: "Josie Brenny", email: "jbrenny@talamoreseniorliving.com" },
    ],
  },
  {
    community: {
      slug: "talamore-sun-prairie",
      displayName: "Talamore Sun Prairie",
      shortName: "Talamore",
      brandFamily: "Talamore",
      type: "mixed",
      address: { city: "Sun Prairie", state: "WI" },
      websiteUrl: "https://www.talamoresunprairie.com",
      hubspot: {},
      brand: TALAMORE_BRAND,
      socials: {},
    },
    senders: [{ name: "Shannon Francis", email: "sfrancis@talamoresunprairie.com", isPrimary: true }],
  },
  {
    community: {
      slug: "talamore-woodbury",
      displayName: "Talamore Woodbury",
      shortName: "Talamore",
      brandFamily: "Talamore",
      type: "mixed",
      address: { city: "Woodbury", state: "MN" },
      websiteUrl: "https://www.talamoreseniorliving.com",
      hubspot: {},
      brand: TALAMORE_BRAND,
      socials: {},
    },
    senders: [
      // Talamore Woodbury shares the @talamoreseniorliving.com domain with
      // Talamore St Cloud. Tommy needs to confirm sender mapping per location.
      { name: "Brian Glonek", email: "bglonek@talamoreseniorliving.com" },
      { name: "Josie Brenny", email: "jbrenny@talamoreseniorliving.com" },
    ],
  },

  // ---------------- Hayden Grove brand ----------------
  {
    community: {
      slug: "hayden-grove-bloomington",
      displayName: "Hayden Grove Bloomington",
      shortName: "Hayden Grove",
      brandFamily: "Hayden Grove",
      type: "mixed",
      address: { city: "Bloomington", state: "MN" },
      websiteUrl: "https://www.haydengroveseniorliving.com",
      hubspot: {},
      brand: HAYDEN_GROVE_BRAND,
      socials: {},
    },
    senders: [
      { name: "Carrie Speidel", email: "cspeidel@haydengroveseniorliving.com" },
      { name: "Shelley Beckman", email: "sbeckman@haydengroveseniorliving.com" },
    ],
  },
  {
    community: {
      slug: "hayden-grove-st-anthony",
      displayName: "Hayden Grove St Anthony",
      shortName: "Hayden Grove",
      brandFamily: "Hayden Grove",
      type: "mixed",
      address: { city: "St Anthony", state: "MN" },
      websiteUrl: "https://www.haydengroveseniorliving.com",
      hubspot: {},
      brand: HAYDEN_GROVE_BRAND,
      socials: {},
    },
    senders: [
      { name: "Carrie Speidel", email: "cspeidel@haydengroveseniorliving.com" },
      { name: "Shelley Beckman", email: "sbeckman@haydengroveseniorliving.com" },
    ],
  },

  // ---------------- The Glenn brand ----------------
  // The Glenn Buffalo has separate AL and MC registry rows per Tommy's list.
  {
    community: {
      slug: "the-glenn-buffalo-al",
      displayName: "The Glenn Buffalo AL",
      shortName: "The Glenn",
      brandFamily: "The Glenn",
      type: "assisted_living",
      careTypes: ["Assisted Living"],
      address: { city: "Buffalo", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: THE_GLENN_BRAND,
      socials: {},
    },
    senders: [], // TODO: confirm sender per The Glenn Buffalo AL
  },
  {
    community: {
      slug: "the-glenn-buffalo-mc",
      displayName: "The Glenn Buffalo MC",
      shortName: "The Glenn",
      brandFamily: "The Glenn",
      type: "memory_care",
      careTypes: ["Memory Care"],
      address: { city: "Buffalo", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: THE_GLENN_BRAND,
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "the-glenn-hopkins",
      displayName: "The Glenn Hopkins",
      shortName: "The Glenn",
      brandFamily: "The Glenn",
      type: "mixed",
      address: { city: "Hopkins", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: THE_GLENN_BRAND,
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "the-glenn-minnetonka",
      displayName: "The Glenn Minnetonka",
      shortName: "The Glenn",
      brandFamily: "The Glenn",
      type: "mixed",
      address: { city: "Minnetonka", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: THE_GLENN_BRAND,
      socials: {},
    },
    senders: [], // YTD shows "The Glenn Minnetonka" subjects via @greatlakesmc.com — confirm sender
  },
  {
    community: {
      slug: "the-glenn-w-st-paul",
      displayName: "The Glenn W St Paul",
      shortName: "The Glenn",
      brandFamily: "The Glenn",
      type: "mixed",
      address: { city: "West St Paul", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: THE_GLENN_BRAND,
      socials: {},
    },
    senders: [],
  },

  // ---------------- Cottagewood brand ----------------
  {
    community: {
      slug: "cottagewood-mankato",
      displayName: "Cottagewood Mankato",
      shortName: "Cottagewood",
      brandFamily: "Cottagewood",
      type: "mixed",
      address: { city: "Mankato", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: DEFAULT_BRAND,
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "cottagewood-rochester",
      displayName: "Cottagewood Rochester",
      shortName: "Cottagewood",
      brandFamily: "Cottagewood",
      type: "mixed",
      address: { city: "Rochester", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: DEFAULT_BRAND,
      socials: {},
    },
    senders: [],
  },

  // ---------------- Amira Choice brand ----------------
  {
    community: {
      slug: "amira-choice-arvada",
      displayName: "Amira Choice Arvada",
      shortName: "Amira Choice",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Arvada", state: "CO" },
      websiteUrl: null,
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-choice-bloomington",
      displayName: "Amira Choice Bloomington",
      shortName: "Amira Choice",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Bloomington", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      socials: {},
    },
    // YTD shows a sender alias literally named "Amira Choice Bloomington" via
    // @greatlakesmc.com — likely a shared inbox or generic alias. Confirm.
    senders: [],
  },

  // ---------------- Standalone communities ----------------
  {
    community: {
      slug: "global-pointe",
      displayName: "Global Pointe",
      shortName: "Global Pointe",
      brandFamily: "Global Pointe",
      type: "mixed",
      address: {},
      websiteUrl: "https://www.globalpointeseniorliving.com",
      hubspot: {},
      brand: GLOBAL_POINTE_BRAND,
      socials: {},
    },
    senders: [{ name: "Lisa Zehner", email: "lzehner@globalpointeseniorliving.com", isPrimary: true }],
  },
  {
    community: {
      slug: "seven-hills",
      displayName: "Seven Hills",
      shortName: "Seven Hills",
      brandFamily: "Seven Hills",
      type: "mixed",
      address: {},
      websiteUrl: "https://www.sevenhillsseniorliving.com",
      hubspot: {},
      brand: SEVEN_HILLS_BRAND,
      socials: {},
    },
    senders: [{ name: "Angela Elwell", email: "aelwell@sevenhillsseniorliving.com", isPrimary: true }],
  },
  {
    community: {
      slug: "orchards-of-minnetonka",
      displayName: "Orchards of Minnetonka",
      shortName: "Orchards of Minnetonka",
      brandFamily: "Orchards of Minnetonka",
      type: "mixed",
      address: { city: "Minnetonka", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: DEFAULT_BRAND,
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "the-pillars-of-grand-rapids",
      displayName: "The Pillars of Grand Rapids",
      shortName: "The Pillars",
      brandFamily: "The Pillars",
      type: "mixed",
      address: { city: "Grand Rapids", state: "MN" },
      websiteUrl: null,
      hubspot: {},
      brand: PILLARS_BRAND,
      socials: {},
    },
    senders: [],
  },
];
