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
      nameAbbreviation: "ACB",
      type: "mixed",
      careTypes: ["Assisted Living", "Memory Care"],
      address: { street: "1780 Servant Way", city: "Bellevue", state: "WI", zip: "54311" },
      phone: "920.504.3443",
      email: "Bellevue@CarettaSeniorLiving.com",
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
      nameAbbreviation: null,
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
      nameAbbreviation: null,
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

// ── HubSpot eblast segments (Lists) per community ────────────────────────────
// Pulled from Great Lakes Management's HubSpot (account 8818180) in June 2026.
// Each community's segments are named "{ACRONYM} eBlasts | {funnel stage}".
//   included = active prospects to email (New / Contacted / Qualified /
//              Subscriber, Toured / Qualified / Waitlist / Unit Reserved /
//              Assessment Requested / Application Complete, and broad "Leads"/
//              "Deals New" lists)
//   excluded = suppress (Moved In / Moved Out / Closed Lost / Cancelled
//              Reservation / Lease Signed, and Persona: Referral Source)
// Values are HubSpot hs_list_id numbers. If segments change in HubSpot, update
// here and re-seed. Cottagewood Mankato has no segments yet (intentionally absent).
const EBLAST_SEGMENTS: Record<string, { included: number[]; excluded: number[] }> = {
  CB: { included: [1564, 1568, 1572, 2092, 2093, 2094, 2095], excluded: [1588, 1592, 1704] },
  CEC: { included: [9490, 9492, 9495, 9505, 9506, 9507, 9508, 9512], excluded: [9499, 9501, 9510] },
  CH: { included: [1562, 1566, 1570, 1612, 2088, 2089, 2090, 2091, 6126, 9604, 9605, 9653], excluded: [1586, 1590, 1702] },
  CM: { included: [9752, 9754, 9756, 9760, 9761, 9762, 9763, 9768], excluded: [9758, 9764, 9766] },
  TSC: { included: [1444, 1450, 1456, 1598, 2072, 2073, 2074, 2075], excluded: [1480, 1486, 1688, 2130] },
  TSP: { included: [1446, 1452, 1458, 2068, 2069, 2070, 2071], excluded: [1482, 1488, 1690, 2131] },
  TW: { included: [1448, 1454, 1460, 2064, 2065, 2066, 2067, 9886, 9888, 9890, 9892], excluded: [1484, 1490, 1602, 1692] },
  HGB: { included: [1498, 1502, 1508, 1606, 2076, 2077, 2078, 2079, 2790], excluded: [1522, 1526, 1696] },
  HGSA: { included: [1500, 1504, 1506, 1516, 2080, 2081, 2082, 2083], excluded: [1520, 1524, 1528, 1698] },
  TGB: { included: [1620, 1627, 1639, 2053, 2057, 2058, 2059], excluded: [1663, 1667, 1671] },
  TGH: { included: [1616, 1622, 1629, 1635, 2043, 2044, 2045, 2046, 9468], excluded: [1659, 1665, 1673] },
  TGM: { included: [1618, 1625, 1631, 1637, 2048, 2049, 2050, 2051], excluded: [1661, 1669, 1675] },
  TGWSTP: { included: [10335, 10337, 10345, 10346, 10347, 10349], excluded: [10339, 10341, 10343] },
  CWR: { included: [2143, 2144, 2145, 2146, 2159, 2163, 2165], excluded: [2147, 2151] },
  ACA: { included: [9305, 9306, 9307, 9308, 9311, 9313, 9315], excluded: [9309, 9317, 9319] },
  ACB: { included: [9438, 9439, 9440, 9441, 9442, 9444, 9446], excluded: [9448, 9450, 9452, 9454] },
  GP: { included: [1544, 1546, 1548, 2084, 2085, 2086, 2087], excluded: [1556, 1558, 1700] },
  SH: { included: [1425, 1428, 1430, 2060, 2061, 2062, 2063], excluded: [1438, 1440, 1694] },
  OM: { included: [10360, 10361, 10364, 10366, 10368], excluded: [10356, 10358, 10362] },
  PGR: { included: [10318, 10324, 10325, 10328, 10330, 10332], excluded: [10320, 10322, 10326] },
};

// HubSpot acronym per community slug. The Glenn Buffalo AL & MC intentionally
// share the single TGB segment set. Cottagewood Mankato is intentionally absent
// (no HubSpot segments exist for it yet).
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
  "global-pointe": "GP",
  "seven-hills": "SH",
  "orchards-of-minnetonka": "OM",
  "the-pillars-of-grand-rapids": "PGR",
};

// Attach resolved segments to each community's hubspot config (preserving any
// other hubspot fields). Runs once at module load.
for (const sc of seedCommunities) {
  const acronym = ACRONYM_BY_SLUG[sc.community.slug];
  if (!acronym) continue;
  const seg = EBLAST_SEGMENTS[acronym];
  sc.community.hubspot = {
    ...sc.community.hubspot,
    acronym,
    includedListIds: seg?.included ?? [],
    excludedListIds: seg?.excluded ?? [],
  };
}

// Sender identities recovered from each community's actual HubSpot send history
// (the people/aliases that have sent eblasts for them). First entry = primary.
// Only the communities that previously had no senders are listed here; the rest
// already have inline senders above. (Cottagewood Mankato/Rochester, The Glenn
// Buffalo AL/MC, and The Glenn W St Paul had no from-identity in the data.)
const SENDERS_BY_SLUG: Record<string, SeedSender[]> = {
  "amira-choice-arvada": [{ name: "Michelle Newitt", email: "mnewitt@greatlakesmc.com" }],
  "amira-choice-bloomington": [{ name: "Dean Miller", email: "dmiller@greatlakesmc.com" }],
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
const CONTACT_BY_SLUG: Record<string, { address?: Address; websiteUrl?: string; email?: string }> = {
  "caretta-bellevue": { websiteUrl: "carettaseniorliving.com/bellevue" },
  "caretta-eau-claire": { address: { street: "4688 Keystone Crossing", city: "Eau Claire", state: "WI", zip: "54701" }, websiteUrl: "carettaseniorliving.com/eau-claire-wi", email: "EauClaire@CarettaSeniorLiving.com" },
  "caretta-holmen": { address: { street: "2120 Staphorst Ln", city: "Holmen", state: "WI", zip: "54636" }, websiteUrl: "carettaseniorliving.com/holmen-wi", email: "Holmen@CarettaSeniorLiving.com" },
  "caretta-maplewood": { address: { street: "1910 County Road C E", city: "Maplewood", state: "MN", zip: "55109" }, websiteUrl: "carettaseniorliving.com/maplewood-mn", email: "Maplewood@CarettaSeniorLiving.com" },
  "talamore-st-cloud": { address: { street: "215 37th Ave N", city: "St Cloud", state: "MN", zip: "56303" }, websiteUrl: "talamoreseniorliving.com/st-cloud-mn", email: "stcloud@talamoreseniorliving.com" },
  "talamore-sun-prairie": { address: { street: "275 N City Station Dr", city: "Sun Prairie", state: "WI", zip: "53590" }, websiteUrl: "talamoreseniorliving.com/sun-prairie-wi", email: "sunprairie@talamoreseniorliving.com" },
  "talamore-woodbury": { address: { street: "289 Karen Dr", city: "Woodbury", state: "MN", zip: "55129" }, websiteUrl: "talamoreseniorliving.com/woodbury-mn", email: "woodbury@talamoreseniorliving.com" },
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
  if (cc.email) sc.community.email = cc.email;
}
