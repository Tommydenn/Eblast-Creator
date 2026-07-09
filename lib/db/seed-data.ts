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

import type { NewCommunityRow, CommunityLogo, Address } from "./schema";

// Helpers for the two common logo patterns
function twoLogos(slug: string): CommunityLogo[] {
  return [
    { url: `/logos/${slug}/primary.png`, variant: "primary", onColor: "light" },
    { url: `/logos/${slug}/knockout.png`, variant: "knockout", onColor: "dark" },
  ];
}
function oneLogoLight(slug: string): CommunityLogo[] {
  return [{ url: `/logos/${slug}/primary.png`, variant: "primary", onColor: "light" }];
}

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
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: { street: "1780 Servant Way", city: "Bellevue", state: "WI", zip: "54311" },
      websiteUrl: "https://www.CarettaSeniorLiving.com/bellevue",
      trackingPhone: "920-504-3028",
      hubspot: {},
      brand: CARETTA_BRAND,
      logos: twoLogos("caretta-bellevue"),
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
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      websiteUrl: "https://www.CarettaSeniorLiving.com/eau-claire",
      trackingPhone: "715-334-8959",
      hubspot: {},
      brand: CARETTA_BRAND,
      logos: twoLogos("caretta-eau-claire"),
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
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      websiteUrl: "https://www.CarettaSeniorLiving.com/holmen",
      trackingPhone: "608-351-0755",
      hubspot: {},
      brand: CARETTA_BRAND,
      logos: twoLogos("caretta-holmen"),
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
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: {},
      websiteUrl: "https://www.CarettaSeniorLiving.com/maplewood",
      trackingPhone: "651-319-8608",
      hubspot: {},
      brand: CARETTA_BRAND,
      logos: twoLogos("caretta-maplewood"),
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
      trackingPhone: "320-746-5582",
      hubspot: {},
      brand: TALAMORE_BRAND,
      logos: twoLogos("talamore-st-cloud"),
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
      trackingPhone: "608-688-8153",
      hubspot: {},
      brand: TALAMORE_BRAND,
      logos: twoLogos("talamore-sun-prairie"),
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
      trackingPhone: "651-240-3938",
      hubspot: {},
      brand: TALAMORE_BRAND,
      logos: twoLogos("talamore-woodbury"),
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
      trackingPhone: "952-295-3158",
      hubspot: {},
      brand: HAYDEN_GROVE_BRAND,
      logos: twoLogos("hayden-grove-bloomington"),
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
      trackingPhone: "612-260-9862",
      hubspot: {},
      brand: HAYDEN_GROVE_BRAND,
      logos: twoLogos("hayden-grove-st-anthony"),
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
      logos: [],
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
      logos: [],
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
      trackingPhone: "952-230-1423",
      hubspot: {},
      brand: THE_GLENN_BRAND,
      logos: oneLogoLight("the-glenn-hopkins"),
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
      trackingPhone: "952-230-2242",
      hubspot: {},
      brand: THE_GLENN_BRAND,
      logos: oneLogoLight("the-glenn-minnetonka"),
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
      trackingPhone: "763-489-2024",
      hubspot: {},
      brand: THE_GLENN_BRAND,
      logos: twoLogos("the-glenn-w-st-paul"),
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
      logos: [],
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
      trackingPhone: "507-585-4925",
      hubspot: {},
      brand: DEFAULT_BRAND,
      logos: [],
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
      trackingPhone: "720-538-8605",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-choice-arvada"),
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
      trackingPhone: "952-800-9203",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-choice-bloomington"),
      socials: {},
    },
    // YTD shows a sender alias literally named "Amira Choice Bloomington" via
    // @greatlakesmc.com — likely a shared inbox or generic alias. Confirm.
    senders: [],
  },

  // ---------------- New Amira communities (added July 2026) ----------------
  {
    community: {
      slug: "amira-corcoran",
      displayName: "Amira Corcoran",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Corcoran", state: "MN" },
      websiteUrl: null,
      trackingPhone: "763-363-1935",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: [],
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-minnetonka",
      displayName: "Amira Minnetonka",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Minnetonka", state: "MN" },
      websiteUrl: null,
      trackingPhone: "952-206-6906",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-minnetonka"),
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-villas-minnetonka",
      displayName: "Amira Villas Minnetonka",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Minnetonka", state: "MN" },
      websiteUrl: null,
      trackingPhone: "952-592-3360",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-villas-minnetonka"),
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-lowry",
      displayName: "Amira Lowry",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Denver", state: "CO" },
      websiteUrl: null,
      trackingPhone: "720-386-8268",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-lowry"),
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-lake-elmo",
      displayName: "Amira Lake Elmo",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Lake Elmo", state: "MN" },
      websiteUrl: null,
      trackingPhone: "651-705-4150",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-lake-elmo"),
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-bloomington",
      displayName: "Amira Bloomington",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Bloomington", state: "MN" },
      websiteUrl: null,
      trackingPhone: "952-395-5707",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: twoLogos("amira-bloomington"),
      socials: {},
    },
    senders: [],
  },
  {
    community: {
      slug: "amira-roseville",
      displayName: "Amira Roseville",
      shortName: "Amira",
      brandFamily: "Amira Choice",
      type: "mixed",
      address: { city: "Roseville", state: "MN" },
      websiteUrl: null,
      trackingPhone: "651-240-2861",
      hubspot: {},
      brand: AMIRA_CHOICE_BRAND,
      logos: [],
      socials: {},
    },
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
      trackingPhone: "763-325-8107",
      hubspot: {},
      brand: GLOBAL_POINTE_BRAND,
      logos: twoLogos("global-pointe"),
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
      trackingPhone: "651-381-4621",
      hubspot: {},
      brand: SEVEN_HILLS_BRAND,
      logos: oneLogoLight("seven-hills"),
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
      trackingPhone: "763-342-5170",
      hubspot: {},
      brand: DEFAULT_BRAND,
      logos: oneLogoLight("orchards-of-minnetonka"),
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
      trackingPhone: "218-245-4147",
      hubspot: {},
      brand: PILLARS_BRAND,
      logos: oneLogoLight("the-pillars-of-grand-rapids"),
      socials: {},
    },
    senders: [],
  },
];

// HubSpot acronym per community slug. Used to label emails in HubSpot
// ("{ACRONYM} eBlasts | {funnel stage}"). Segments are resolved at push time
// from the community's most recent HubSpot send — nothing is hardcoded here.
const ACRONYM_BY_SLUG: Record<string, string> = {
  "caretta-bellevue": "CB",
  "caretta-eau-claire": "CEC",
  "caretta-holmen": "CH",
  "caretta-maplewood": "CM",
  "talamore-st-cloud": "TSC",
  "talamore-sun-prairie": "TSP",
  "talamore-woodbury": "TW",
  "hayden-grove-bloomington": "HGB",
  "hayden-grove-st-anthony": "HGSA",
  "the-glenn-buffalo-al": "TGB",
  "the-glenn-buffalo-mc": "TGB",
  "the-glenn-hopkins": "TGH",
  "the-glenn-minnetonka": "TGM",
  "the-glenn-w-st-paul": "TGWSTP",
  "cottagewood-rochester": "CWR",
  "amira-choice-arvada": "ACA",
  "amira-choice-bloomington": "ACB",
  "amira-corcoran": "AC",
  "amira-minnetonka": "AM",
  "amira-villas-minnetonka": "AVM",
  "amira-lowry": "AL",
  "amira-lake-elmo": "ALE",
  "amira-bloomington": "AB",
  "amira-roseville": "AR",
  "global-pointe": "GP",
  "seven-hills": "SH",
  "orchards-of-minnetonka": "OM",
  "the-pillars-of-grand-rapids": "PGR",
};

// Attach HubSpot acronym to each community's hubspot config.
for (const sc of seedCommunities) {
  const acronym = ACRONYM_BY_SLUG[sc.community.slug];
  if (!acronym) continue;
  sc.community.hubspot = { ...sc.community.hubspot, acronym };
}

// Sender identities recovered from each community's actual HubSpot send history
// (the people/aliases that have sent eblasts for them). First entry = primary.
// Only the communities that previously had no senders are listed here; the rest
// already have inline senders above. (Cottagewood Mankato/Rochester, The Glenn
// Buffalo AL/MC, and The Glenn W St Paul had no from-identity in the data.)
const SENDERS_BY_SLUG: Record<string, SeedSender[]> = {
  "amira-choice-arvada": [{ name: "Michelle Newitt", email: "mnewitt@greatlakesmc.com" }],
  "amira-choice-bloomington": [{ name: "Dean Miller", email: "dmiller@greatlakesmc.com" }],
  "amira-corcoran": [{ name: "Kim Holmberg", email: "kholmberg@greatlakesmc.com" }],
  "amira-minnetonka": [{ name: "Kelly Clarno", email: "kclarno@greatlakesmc.com" }],
  "amira-villas-minnetonka": [{ name: "Kelly Clarno", email: "kclarno@greatlakesmc.com" }],
  "amira-lake-elmo": [{ name: "Terri Ford", email: "tford@greatlakesmc.com" }],
  "amira-bloomington": [{ name: "Jill Johnson", email: "jijohnson@greatlakesmc.com" }],
  "amira-roseville": [{ name: "Colleen Watschke", email: "cwatschke@greatlakesmc.com" }],
  "orchards-of-minnetonka": [{ name: "Lauren Martinovich", email: "lmartinovich@greatlakesmc.com" }],
  "the-glenn-hopkins": [{ name: "Scott Saffert", email: "ssaffert@greatlakesmc.com" }],
  "the-glenn-minnetonka": [
    { name: "Madelyn Macgowan", email: "mmacgowan@greatlakesmc.com" },
    { name: "Kasey Krieger", email: "kkrieger@greatlakesmc.com" },
  ],
  "the-pillars-of-grand-rapids": [{ name: "Sherry Frick", email: "sfrick@greatlakesmc.com" }],
};
for (const sc of seedCommunities) {
  const senders = SENDERS_BY_SLUG[sc.community.slug];
  if (senders && sc.senders.length === 0) sc.senders = senders;
}

// Public contact details gathered from each community's official site (June 2026).
// Website URLs are stored WITHOUT the protocol; the render/href code prepends
// https:// when linking. This block is the source of truth for these fields and
// overrides any inline values above.
const CONTACT_BY_SLUG: Record<string, { address?: Address; websiteUrl?: string }> = {
  "caretta-bellevue": { websiteUrl: "carettaseniorliving.com/bellevue" },
  "caretta-eau-claire": { address: { street: "4688 Keystone Crossing", city: "Eau Claire", state: "WI", zip: "54701" }, websiteUrl: "carettaseniorliving.com/eau-claire-wi" },
  "caretta-holmen": { address: { street: "2120 Staphorst Ln", city: "Holmen", state: "WI", zip: "54636" }, websiteUrl: "carettaseniorliving.com/holmen-wi" },
  "caretta-maplewood": { address: { street: "1910 County Road C E", city: "Maplewood", state: "MN", zip: "55109" }, websiteUrl: "carettaseniorliving.com/maplewood-mn" },
  "talamore-st-cloud": { address: { street: "215 37th Ave N", city: "St Cloud", state: "MN", zip: "56303" }, websiteUrl: "talamoreseniorliving.com/st-cloud-mn" },
  "talamore-sun-prairie": { address: { street: "275 N City Station Dr", city: "Sun Prairie", state: "WI", zip: "53590" }, websiteUrl: "talamoreseniorliving.com/sun-prairie-wi" },
  "talamore-woodbury": { address: { street: "289 Karen Dr", city: "Woodbury", state: "MN", zip: "55129" }, websiteUrl: "talamoreseniorliving.com/woodbury-mn" },
  "hayden-grove-bloomington": { address: { street: "8715 Portland Ave S", city: "Bloomington", state: "MN", zip: "55420" }, websiteUrl: "haydengroveseniorliving.com/bloomington-mn" },
  "hayden-grove-st-anthony": { address: { street: "2601 NE Stinson Pkwy", city: "St Anthony", state: "MN", zip: "55418" }, websiteUrl: "haydengroveseniorliving.com/st-anthony-mn" },
  "the-glenn-buffalo-al": { address: { street: "201 1st St NE", city: "Buffalo", state: "MN", zip: "55313" }, websiteUrl: "glennseniorliving.com/buffalo-mn" },
  "the-glenn-buffalo-mc": { address: { street: "201 1st St NE", city: "Buffalo", state: "MN", zip: "55313" }, websiteUrl: "glennseniorliving.com/buffalo-mn" },
  "the-glenn-hopkins": { address: { street: "1011 Feltl Ct", city: "Hopkins", state: "MN", zip: "55343" }, websiteUrl: "glennseniorliving.com/hopkins-mn" },
  "the-glenn-minnetonka": { address: { street: "5300 Woodhill Rd", city: "Minnetonka", state: "MN", zip: "55345" }, websiteUrl: "glennseniorliving.com/minnetonka-mn" },
  "the-glenn-w-st-paul": { address: { street: "1984 Oakdale Ave", city: "West St Paul", state: "MN", zip: "55118" }, websiteUrl: "glennseniorliving.com/west-st-paul-mn" },
  "cottagewood-mankato": { address: { street: "300 Bunting Ln", city: "Mankato", state: "MN", zip: "56001" }, websiteUrl: "cottagewoodmankato.com" },
  "cottagewood-rochester": { address: { street: "4220 55th St NW", city: "Rochester", state: "MN", zip: "55901" }, websiteUrl: "cottagewoodseniorliving.com/rochester-mn" },
  "amira-choice-arvada": { address: { street: "6260 McIntyre St", city: "Arvada", state: "CO", zip: "80403" }, websiteUrl: "amiraliving.com/location/arvada-choice" },
  "amira-choice-bloomington": { address: { street: "5501 American Blvd W", city: "Bloomington", state: "MN", zip: "55437" }, websiteUrl: "amiraliving.com/location/bloomington-choice" },
  "amira-corcoran": { address: { street: "7330 Brockton Lane N", city: "Corcoran", state: "MN", zip: "55305" }, websiteUrl: "amiraliving.com/location/corcoran/" },
  "amira-minnetonka": { address: { street: "801 Carlson Parkway", city: "Minnetonka", state: "MN", zip: "55305" }, websiteUrl: "amiraliving.com/location/minnetonka/" },
  "amira-villas-minnetonka": { address: { street: "801 Carlson Parkway", city: "Minnetonka", state: "MN", zip: "55305" }, websiteUrl: "amiraliving.com/location/minnetonka-villas/" },
  "amira-lowry": { address: { street: "8892 East Lowry Boulevard", city: "Denver", state: "CO", zip: "80230" }, websiteUrl: "amiraliving.com/location/denver/" },
  "amira-lake-elmo": { address: { street: "8695 Eagle Point Blvd", city: "Lake Elmo", state: "MN", zip: "55042" }, websiteUrl: "amiraliving.com/location/lake-elmo/" },
  "amira-bloomington": { address: { street: "5601 American Blvd W", city: "Bloomington", state: "MN", zip: "55437" }, websiteUrl: "amiraliving.com/location/bloomington/" },
  "amira-roseville": { address: { street: "2650 Lexington Ave N", city: "Roseville", state: "MN", zip: "55113" }, websiteUrl: "amiraliving.com/location/roseville/" },
  "global-pointe": { address: { street: "5200 Wayzata Blvd", city: "Golden Valley", state: "MN", zip: "55416" }, websiteUrl: "globalpointeseniorliving.com" },
  "seven-hills": { address: { street: "733 Selby Ave", city: "Saint Paul", state: "MN", zip: "55104" }, websiteUrl: "sevenhillsseniorliving.com" },
  "orchards-of-minnetonka": { address: { street: "10955 Wayzata Blvd", city: "Minnetonka", state: "MN", zip: "55305" }, websiteUrl: "orchardsofminnetonka.com" },
  "the-pillars-of-grand-rapids": { address: { street: "2060 SW 8th St", city: "Grand Rapids", state: "MN", zip: "55744" }, websiteUrl: "pillarsgrandrapids.com" },
};
for (const sc of seedCommunities) {
  const cc = CONTACT_BY_SLUG[sc.community.slug];
  if (!cc) continue;
  if (cc.address) sc.community.address = { ...sc.community.address, ...cc.address };
  if (cc.websiteUrl !== undefined) sc.community.websiteUrl = cc.websiteUrl;
}
