# Eblast Drafter — Claude Code context

A Next.js app that automates senior-living eblast creation for ~20 communities under Great Lakes Management. PDF flyer in → AI-drafted email → HubSpot draft.

- **Live:** <https://eblast-creator-git-main-tommydenns-projects.vercel.app>
- **Repo:** <https://github.com/Tommydenn/Eblast-Creator>
- **Owner:** Tommy Denn — tdenn@greatlakesmc.com
- **Vercel team / project:** `tommydenns-projects` / `eblast-creator`

Read `HANDOFF.md` once for the latest state of the build before starting work.

## What it does

Marketing creates a designed PDF flyer per upcoming event/announcement, per community. Pre-app, an intern hand-built each eblast in HubSpot from the flyer. This app:

1. Takes a PDF flyer + community selection
2. Has Claude (Anthropic API) extract structured fields (subject, headline, body, CTA, dates, audience) via tool-use schema
3. Pulls the embedded photos out of the PDF — no rendering, no overlays, original byte streams
4. Normalizes CMYK photos to sRGB using mupdf's color-managed Image rendering
5. Renders a brand-themed HTML email (`lib/render-email.ts`) using one template that adapts to each community's brand
6. Lets the user refine via chat ("make the headline shorter")
7. Uploads images to HubSpot Files, then pushes the (slim) HTML as a coded email draft

## Stack

- Next.js 14 App Router on Vercel
- Anthropic API (Claude Sonnet 4.6) — `lib/anthropic.ts`
- HubSpot Marketing Email API v3 — `lib/hubspot.ts`
- pdf-lib (PDF object walking) + mupdf (color-managed image conversion) + sharp (encoder/fallback) — `lib/pdf-images.ts`
- No database yet (planned: Vercel Postgres for the agentic feedback loop)

## Required environment variables

See `.env.example`. Production values live in Vercel project settings.

- `ANTHROPIC_API_KEY` — Anthropic Console
- `HUBSPOT_PRIVATE_APP_TOKEN` — needs `content` AND `files` scopes
- `HUBSPOT_DEFAULT_FROM_NAME`
- `HUBSPOT_DEFAULT_REPLY_TO`

## Run / deploy

```
npm install
npm run dev          # local dev server
git push             # Vercel auto-deploys main in ~30s
```

The branch-alias URL stays the same across deploys.

## Key decisions — don't relitigate

### PDF image extraction is three tiers, in this order

1. **pdf-lib walks indirect objects** to find image streams (`Subtype == /Image`, filter chain ends in `DCTDecode`). The stream content IS the embedded JPEG bytes. No rendering, no compositing.
2. **RGB JPEGs**: pass through with original bytes unchanged.
3. **CMYK JPEGs**: convert via `new mupdf.Image(bytes).toPixmap(DeviceRGB)`. Sharp is fallback only.

**Why** — Sharp's bare CMYK conversion produces washed colors (no bundled ICC profiles). Page rendering bakes in text/overlay/color-block layers. mupdf's Image class has bundled CMYK and sRGB profiles + handles Adobe APP14/YCCK/inverted CMYK — same machinery as Acrobat's "Save Image As".

If asked to "go back to page rendering" or "use sharp for CMYK," push back — both have been tried and produce worse output.

### HubSpot push is three steps

1. Find every `data:image/...;base64,...` URI in the rendered HTML, upload each unique image to HubSpot's File Manager (`POST /files/v3/files` multipart), replace the data URI with the hosted CDN URL.
2. Upload the (now slim) HTML as a coded email template via the Design Manager source-code API (multipart, NOT JSON — JSON returns 415).
3. Create the marketing email referencing the template (`POST /marketing/v3/emails`, `emailTemplateMode: "HTML"`).

**Why the image upload step** — HubSpot's coded email templates have a hard 1.5 MiB limit. Inlining base64 images blows past it.

### Coded email template wrapping

Coded email templates need a HubL annotation header and a CAN-SPAM compliant footer. `wrapAsHubLEmailTemplate()` in `lib/hubspot.ts` does this. Critical bits:

- `templateType: email` (NOT `email_base_template` — that throws "not a valid template type")
- `isAvailableForNewContent: true`
- A `{% module_block module "compliance_footer" path="@hubspot/email_footer" ... %}` for unsubscribe + address

### Vercel-specific gotchas

- `next.config.js` has `serverComponentsExternalPackages: ["sharp", "pdf-lib", "pdfjs-dist", "mupdf"]` — these ship native code/WASM and must NOT be bundled by webpack.
- Sharp + libvips need their precompiled binaries; Vercel auto-installs.
- TypeScript 5.7 is strict about `Buffer` vs `Uint8Array<ArrayBuffer>`. When passing bytes to a `Blob`, allocate a fresh `Uint8Array(byteLength)` and `.set()` into it — Buffer's underlying `ArrayBufferLike` isn't accepted directly.
- mupdf-js is an ES module; dynamic-import it inside async functions, e.g. `const mupdfModule = await import("mupdf")`.
- The egress allowlist for Vercel functions is permissive — they call `api.hubapi.com`, `api.anthropic.com`, etc. directly.

## Where things live

| Path | Purpose |
|---|---|
| `data/communities.ts` | Single source of truth for the 20 communities — type def + array of entries. Editing this file is how you onboard a new community. |
| `data/communities/{slug}/` | Per-community asset folder placeholders. Real assets live on HubSpot Files. |
| `data/communities-onboarding.csv` | Template for batch-onboarding the remaining 19 communities. |
| `lib/anthropic.ts` | Claude PDF extraction with structured tool output + the chat refinement function. |
| `lib/hubspot.ts` | HubSpot API client — marketing emails, file manager, design manager. |
| `lib/pdf-images.ts` | Embedded image extraction + CMYK normalization. |
| `lib/render-email.ts` | The HTML email template — one template, brand-adapted per community. |
| `lib/extracted-flyer.ts` | The `ExtractedFlyer` type Claude populates. |
| `app/page.tsx` | Main drafter UI. |
| `app/communities/page.tsx` | Registry dashboard. |
| `app/communities/[slug]/page.tsx` | Per-community detail page. |
| `app/api/draft-from-pdf/route.ts` | Extract + render endpoint. |
| `app/api/refine-eblast/route.ts` | Chat refinement. |
| `app/api/push-eblast/route.ts` | Push to HubSpot (image upload + template upload + email create). |
| `app/api/marketing-emails/recent/route.ts` | Read past sends from HubSpot for analysis. |
| `app/api/communities/route.ts` | JSON registry endpoint for client-side rendering. |
| `push-to-github.cmd` | Windows convenience script Tommy uses to commit + push. Optional. |

## Conventions

- **Sender vs. marketing director.** `Community.sender` is the `From:` identity recipients see. `Community.marketingDirector` is the person actually building/scheduling eblasts in HubSpot (typically Amelia Ozell at Great Lakes Management). They differ.
- **`Community.nameAbbreviation`** matches the prefix the team uses in past eblast names — e.g. `ACB - Memory Care - Apr 2026`. Used to link new drafts to historical sends.
- **Brand colors** — `primary` (dark, used for hero blocks), `accent` (warm, used for CTA buttons), `background` (cream/off-white).
- **Image handling** — every flyer is CMYK because they're print-export PDFs from Adobe products. Always assume CMYK and normalize.
- **HubSpot Private App scopes** — currently just `content` and `files`. Adding `crm.lists.read` planned (for resolving recipient list IDs by name) but not yet in use.

## Next milestones (planned, not built)

1. **Vercel Postgres + outcomes capture** — every send's metadata + HubSpot analytics persisted.
2. **Scheduled job** — pull HubSpot campaign analytics 24h post-send, update DB.
3. **Retrieval-augmented drafting** — feed the last N sends + their open rates into Claude's context for the next draft. This is where "learning over time" lives.
4. **Subagent split** — copywriter agent, editor/critic agent, send-time strategist agent.
5. **Pipeline dashboard** — Draft / Approved / Sent kanban view.

The strategic note: the highest-leverage feature is the feedback loop (sends → analytics → next draft context). Don't skip to multi-agent architecture before that's wired up.
