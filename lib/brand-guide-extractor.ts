// Brand-guide extractor.
// Pass a PDF buffer + community context; Claude reads the document and
// returns structured brand attributes that map onto the Community schema:
//   - palette (primary/accent/background/secondary/supporting)
//   - fonts (display/body/script with weights, fallbacks)
//   - voice (tone/dos/donts/prohibited/approvedClaims/photoStyleNotes)
//   - taglines, amenities
//   - logoVariants (descriptions only — actual logo files uploaded separately)
//   - applicationNotes (anything else useful)
//
// The caller decides what to do with the result — typically: write `palette`,
// `fonts`, `voice`, `taglines`, `amenities` directly onto the Community row,
// and stash the full extraction under `brandGuideExtracted` for forensics.

import Anthropic from "@anthropic-ai/sdk";
import type { Community } from "@/lib/db/queries";

const MODEL = "claude-sonnet-4-6";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export interface ExtractedPalette {
  primary?: string;
  accent?: string;
  background?: string;
  secondary?: string;
  supporting?: string[];
  textOnPrimary?: string;
  textOnAccent?: string;
  notes?: string;
}

export interface ExtractedFonts {
  display?: { name: string; fallback?: string; weights?: number[]; notes?: string };
  body?: { name: string; fallback?: string; weights?: number[]; notes?: string };
  script?: { name: string; fallback?: string; notes?: string };
  notes?: string;
}

export interface ExtractedVoice {
  tone?: string[];
  dos?: string[];
  donts?: string[];
  prohibited?: string[];
  approvedClaims?: string[];
  photoStyleNotes?: string;
}

export interface ExtractedLogoVariant {
  variant: string;
  description?: string;
  minSize?: string;
  clearSpace?: string;
  onColor?: "light" | "dark" | "any";
}

export interface BrandGuideExtraction {
  palette: ExtractedPalette;
  fonts: ExtractedFonts;
  voice: ExtractedVoice;
  taglines: string[];
  amenities: string[];
  logoVariants: ExtractedLogoVariant[];
  applicationNotes?: string;
}

const extractionToolSchema = {
  type: "object",
  required: ["palette", "fonts", "voice", "taglines", "amenities", "logoVariants"],
  properties: {
    palette: {
      type: "object",
      properties: {
        primary: { type: "string", description: "Primary brand color in #RRGGBB hex (lowercase or uppercase ok). The dominant brand color used in headers / hero blocks." },
        accent: { type: "string", description: "Accent color in #RRGGBB hex. Used for CTAs, links, highlights." },
        background: { type: "string", description: "Background / paper color in #RRGGBB hex. Often a cream or off-white." },
        secondary: { type: "string", description: "Optional secondary brand color in #RRGGBB hex." },
        supporting: {
          type: "array",
          items: { type: "string" },
          description: "Additional supporting palette colors in #RRGGBB hex.",
        },
        textOnPrimary: { type: "string", description: "Text color to use on top of `primary` background." },
        textOnAccent: { type: "string", description: "Text color to use on top of `accent` background." },
        notes: { type: "string", description: "Anything noteworthy about color usage rules." },
      },
    },
    fonts: {
      type: "object",
      properties: {
        display: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "Font name as it would appear in CSS, e.g. 'Playfair Display'." },
            fallback: { type: "string", description: "CSS fallback chain, e.g. \"'Times New Roman', serif\"." },
            weights: { type: "array", items: { type: "number" }, description: "Approved weight values, e.g. [400, 600, 700]." },
            notes: { type: "string" },
          },
          description: "Display / headline font.",
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            fallback: { type: "string" },
            weights: { type: "array", items: { type: "number" } },
            notes: { type: "string" },
          },
          description: "Body / paragraph font.",
        },
        script: {
          type: "object",
          properties: {
            name: { type: "string" },
            fallback: { type: "string" },
            notes: { type: "string" },
          },
          description: "Optional script / handwritten accent font.",
        },
        notes: { type: "string", description: "Anything noteworthy about font pairing rules." },
      },
    },
    voice: {
      type: "object",
      properties: {
        tone: {
          type: "array",
          items: { type: "string" },
          description: "Tonal attributes the brand uses, e.g. ['warm', 'boutique', 'hospitality-forward'].",
        },
        dos: {
          type: "array",
          items: { type: "string" },
          description: "Specific things copy SHOULD do, phrased as imperatives.",
        },
        donts: {
          type: "array",
          items: { type: "string" },
          description: "Specific things copy SHOULD NOT do, phrased as prohibitions.",
        },
        prohibited: {
          type: "array",
          items: { type: "string" },
          description: "Words or phrases the brand never uses (e.g. 'facility', 'inmate', 'patient').",
        },
        approvedClaims: {
          type: "array",
          items: { type: "string" },
          description: "Factual claims the brand supports and may use freely.",
        },
        photoStyleNotes: {
          type: "string",
          description: "How photos for this brand should look — natural light, candid, etc.",
        },
      },
    },
    taglines: {
      type: "array",
      items: { type: "string" },
      description: "Approved taglines / mission lines pulled verbatim from the guide.",
    },
    amenities: {
      type: "array",
      items: { type: "string" },
      description: "Distinctive amenities or features mentioned in the guide that copy can lean on.",
    },
    logoVariants: {
      type: "array",
      items: {
        type: "object",
        required: ["variant"],
        properties: {
          variant: {
            type: "string",
            description: "One of: primary, monochrome, knockout, square, horizontal, icon, or a name from the guide.",
          },
          description: { type: "string" },
          minSize: { type: "string", description: "Minimum size requirement if specified, e.g. '0.75 inch wide'." },
          clearSpace: { type: "string", description: "Clear-space rule if specified." },
          onColor: { type: "string", enum: ["light", "dark", "any"], description: "What background colors this variant is meant for." },
        },
      },
      description: "Descriptions of every logo variant called out in the guide. We'll upload the actual logo files separately.",
    },
    applicationNotes: {
      type: "string",
      description: "Any other notes about how to apply the brand — email rules, signage, partnerships, etc.",
    },
  },
};

function systemPrompt(community: Community): string {
  return `You are a brand strategist extracting structured brand rules from a brand-guide PDF for ${community.displayName} (${community.brandFamily ?? community.shortName}).

Read the entire PDF. Pull EVERY explicit rule the guide states. Do NOT invent rules; if the guide doesn't say something, leave that field empty.

Color rules
- Hex codes only, in #RRGGBB format. If the guide gives only RGB or CMYK, convert to hex precisely.
- "Primary" is the dominant color (often used for headlines, headers). "Accent" is used for CTAs / interactive elements.
- "Background" is the paper / canvas color (often cream, off-white, or pure white).
- Supporting colors are anything beyond primary/accent/background.

Font rules
- Use the font name as it appears in the guide. If the guide names a Google Font or specific commercial font, use that exact name.
- Add a sensible CSS fallback chain (e.g. "Georgia, 'Times New Roman', serif" for serifs).
- Pull weights only if the guide specifies them.

Voice rules
- Pull tone words, dos and don'ts, approved claims, and prohibited words verbatim.
- If the guide has a "voice & tone" section, that's your primary source. Otherwise infer from copy examples it shows.

Taglines / amenities
- Only pull lines the guide explicitly approves as taglines or features. Do not paraphrase marketing copy that's just an example.

Logo variants
- For each logo variant the guide shows (primary, monochrome, knockout, etc.), record the description, minimum size, clear-space rules, and which background colors it's meant for. We will upload the actual logo files separately — you don't need to extract the image bytes.

Output: call the \`extract_brand_guide\` tool. Do not write prose; only call the tool.`;
}

export async function extractBrandGuide(opts: {
  pdfBase64: string;
  community: Community;
}): Promise<BrandGuideExtraction> {
  const c = client();

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt(opts.community),
    tools: [
      {
        name: "extract_brand_guide",
        description: "Submit the structured brand attributes you extracted from the PDF.",
        input_schema: extractionToolSchema as any,
      },
    ],
    tool_choice: { type: "tool", name: "extract_brand_guide" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: opts.pdfBase64 },
          },
          {
            type: "text",
            text: `Extract the brand rules from this brand guide for ${opts.community.displayName}. Call the extract_brand_guide tool with the structured fields.`,
          },
        ] as any,
      },
    ],
  });

  const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Brand-guide extractor did not return tool_use output.");
  }
  return toolUseBlock.input as BrandGuideExtraction;
}
