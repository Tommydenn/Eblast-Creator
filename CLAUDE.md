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
- Anthropic API (Claude Sonnet 4.6) — `lib/anthropic.ts` (drafter), `lib/critic.ts` (reviewer)
- HubSpot Marketing Email API v3 — `lib/hubspot.ts`
- pdf-lib (PDF object walking) + mupdf (color-managed image conversion) + sharp (encoder/fallback) — `lib/pdf-images.ts`
- **Vercel Postgres (Neon-backed)** + Drizzle ORM — community registry, past sends, drafts, approvals. See `lib/db/`.

## Database

Postgres is the source of truth for the registry. Schema in `lib/db/schema.ts`. Tables:
- `communities` — 22 GLM communities (Caretta x4, Talamore x3, Hayden Grove x2, The Glenn x5, Cottagewood x2, Amira Choice x2, Global Pointe, Seven Hills, Orchards of Minnetonka, The Pillars of Grand Rapids). JSONB columns for nested objects (`brand`, `address`, `hubspot`, `socials`, `voice`, `marketingDirector`, `logos`, `photoLibrary`, `brandGuideExtracted`).
- `community_senders` — multiple senders per community (real data: Caretta locations share Becky Sobolik + Meranda Lelonek; Talamore St Cloud has Brian Glonek + Josie Brenny; etc.).
- `past_sends` — HubSpot history mirror. Populated by `npm run sync:past-sends`. Keeps last 365 days of `BATCH_EMAIL` sends only. Each row has subject, preview text, from name+email, state, published_at, recipient/open/click/bounce/unsubscribe counts, and a `raw` JSONB blob with the full HubSpot snapshot.
- `drafts` — eblasts the agent has produced, with status state machine (`drafting → awaiting_approval → edits_requested → approved → scheduled → sent`).
- `approval_threads` — magic-link salesperson approvals.

Reads through `lib/db/queries.ts` (`getCommunity(slug)`, `listCommunities()`). All async. Legacy import path `@/data/communities` re-exports the same.

Scripts:
- `npm run db:push` — push schema to DB (requires TTY; use generate+apply for non-TTY).
- `npm run db:generate` — generate SQL migration files.
- `npx tsx lib/db/apply-migrations.ts` — apply generated migrations.
- `npm run db:seed` — idempotent seed of all 22 communities + senders.
- `npm run db:studio` — Drizzle Studio (browser DB explorer).
- `npx tsx scripts/sync-past-sends.ts` — pull last 365 days of BATCH_EMAIL marketing emails into `past_sends` (with stats). Idempotent.
- `npx tsx scripts/enrich-communities.ts` — read each community's past sends and fill in missing community fields (tracking phone, website, email, senders).
- `npx tsx scripts/extract-brand-guide.ts <slug> <path/to/pdf>` — read a brand-guide PDF and write `brand` + `voice` + `taglines` + `amenities` onto the community.

Runs via Vercel cron daily (configured in `vercel.json`) — hits `/api/cron/sync-past-sends`.

Required env vars: `DATABASE_URL` (Neon pooled). Set via Vercel Postgres → Connect Project → `.env.local` snippet.

Per-community fields worth knowing:
- `trackingPhone` — CallRail number used in eblast CTAs. NEVER same as `phone` (which is the public/flyer number).
- `brandFamily` — brand grouping ("Caretta", "Talamore", "The Glenn"). Communities under the same brand share visuals.
- `brand.paletteSource` / `fontsSource` — `"default" | "manual" | "brand-guide-extracted"` so we know if a community has real brand data or is still using the placeholder.
- `brandGuideExtracted` — populated when the brand-guide PDF has been auto-parsed by Claude (not yet wired up — Step 3b).

## Agentic architecture (target)

The app is being shifted from "AI-assisted pipeline" to "marketing agent that replaces the intern role." Five stages:

1. **Drafter ↔ Critic loop** — `lib/agentic-draft.ts` orchestrates this server-side. Drafter writes initial draft from the PDF → critic reviews the draft AND looks at the actual hero/secondary/gallery images → if not ready, drafter applies critic's text findings AND the loop drops any flagged images → critic re-reviews. Up to 3 rounds, with stagnation/regression guards. **The user does not see a preview until the agents converge.**

   The critic uses Claude Sonnet 4.6's vision: each image currently slotted into the rendered email is sent as a labeled image content block. The critic flags blank/corrupted/off-topic/off-brand images via `flaggedImages`. The loop reads that and excludes those slots from the next round (the next-largest available image fills the slot).

   **Both drafter and critic are memory-aware.** Each request fetches the last 12 PUBLISHED sends for the target community via `lib/past-sends-retrieval.ts` and threads them into the agents' system prompts as voice/style/performance reference. The drafter uses them to match what's worked; the critic uses them to flag drift from high-performing patterns (category: `send_strategy`).

   (Built — `lib/anthropic.ts` for the drafter, `lib/critic.ts` for the critic, `lib/agentic-draft.ts` for orchestration. `app/api/draft-from-pdf` runs it; `app/api/critique-eblast` is still exposed for ad-hoc post-refine reviews — note that endpoint is text-only, no images.)
2. **Manual refinement** — User can still type a free-form refinement instruction; the existing single-shot refine + per-refine critic call handles this. (Built — `app/api/refine-eblast`.)
3. **Approval email to site salesperson** — Outbound via **HubSpot single-send transactional email** (we already have the token). Email contains the HubSpot draft link, the critic's notes, and Approve / Edit links. (Not yet built.)
4. **Magic-link approval form** — Salesperson clicks the link, lands on a one-page form, hits Approve or types edits. No inbound email parsing. (Not yet built.)
5. **Scheduler** — Once approved, agent picks send time from history and schedules in HubSpot via API. (Not yet built.)

Memory layer (Vercel Postgres) stores draft state, past-send analytics, approval threads. Nightly job pulls open/click rates so the critic has ground truth.

**Locked choices, don't relitigate:**
- Outbound from agent → HubSpot single-send transactional API (no Resend, no SMTP).
- Approvals → magic-link form, NOT reply-to-approve (reply parsing is fragile).
- Critic does NOT auto-fix. It surfaces. The user / salesperson decides what to apply.

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
| `lib/critic.ts` | Reviewer agent. Takes ExtractedFlyer + Community → severity-tagged findings, suggestions, subject alternatives. |
| `lib/agentic-draft.ts` | Drafter ↔ critic loop orchestrator. `agenticDraftLoop({pdfBase64, community})` returns the converged final draft + iteration trace. Used by `app/api/draft-from-pdf`. |
| `lib/hubspot.ts` | HubSpot API client — marketing emails, file manager, design manager. |
| `lib/pdf-images.ts` | Embedded image extraction + CMYK normalization. |
| `lib/render-email.ts` | The HTML email template — one template, brand-adapted per community. |
| `lib/extracted-flyer.ts` | The `ExtractedFlyer` type Claude populates. |
| `app/page.tsx` | Main drafter UI. |
| `app/communities/page.tsx` | Registry dashboard. |
| `app/communities/[slug]/page.tsx` | Per-community detail page. |
| `app/api/draft-from-pdf/route.ts` | Extract + render endpoint. |
| `app/api/refine-eblast/route.ts` | Chat refinement. |
| `app/api/critique-eblast/route.ts` | Reviewer endpoint. POST `{ extracted, communitySlug }` → `{ review }`. |
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

## Build order for remaining agent stages

1. **Postgres + analytics ingestion** — Vercel Postgres, schema for `drafts`, `past_sends`, `approval_threads`. Scheduled job pulls HubSpot open/click rates per email (`/marketing/v3/emails/{id}/statistics` or analytics API). Once this lands, the critic gains a `lookup_past_sends_for_community(slug)` tool and becomes a real tool-use loop.
2. **Outbound approval email** — `lib/hubspot.ts` adds `sendSingleSendTransactional()`. New `lib/approval-email.ts` builds the salesperson email body (critic notes + draft link + magic-link buttons).
3. **Magic-link approval form** — `/approve/[token]` page. Token-signed URL maps to a draft. Page shows preview + Approve / Request Edits buttons + free-text edit box.
4. **Edit handler** — Salesperson types edits → reuses existing refine flow → critic re-runs → second approval email goes out.
5. **Scheduler** — `lib/scheduler.ts` picks send time from past-send patterns, calls HubSpot's email-schedule API.
6. **Pipeline dashboard** — Draft / Awaiting approval / Approved / Scheduled / Sent kanban.

Strategic note: the highest-leverage feature is the feedback loop (sends → analytics → next draft context). The critic is shipped as a v1 single-call agent; it stays useful but becomes substantially better once Postgres + analytics ingestion (Step 1) is wired up.
