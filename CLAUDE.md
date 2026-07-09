# Eblast Drafter — Claude Code context

A Next.js app that automates senior-living eblast creation for ~22+ communities under Great Lakes Management. PDF flyer in → AI-drafted email → salesperson approval → HubSpot draft.

- **Live:** <https://eblast-creator-git-main-tommydenns-projects.vercel.app>
- **Repo:** <https://github.com/Tommydenn/Eblast-Creator>
- **Owner:** Tommy Denn — tdenn@greatlakesmc.com
- **Vercel team / project:** `tommydenns-projects` / `eblast-creator`

**This file and `HANDOFF.md` must be kept current.** They previously described a much earlier state of the app (approval flow, magic-link, AI auto-refine on edits, etc. marked "not yet built" when they'd actually been shipped and iterated on for dozens of commits). Whenever a feature lands, update the relevant section here — don't let this drift again.

## What it actually does (built, working, in production)

1. Marketing creates a designed PDF flyer per event/community. User picks a community, uploads the PDF.
2. **Extraction + drafting** (`app/api/draft-from-pdf`): Claude extracts structured fields (subject, headline, body, CTA, dates, audience) via tool-use; embedded photos are pulled from the PDF (no rendering, no overlays) and CMYK-normalized via mupdf.
3. **Multi-agent draft loop** (`lib/agentic-draft.ts::agenticDraftLoop`, capped at 2 rounds):
   - A **Subject Specialist** (`lib/agents/subject-specialist.ts`) runs once up front and only overrides the drafter's subject/preview if it's genuinely different/better.
   - **Drafter ↔ Critic** loop: critic (`lib/critic.ts`, single Claude call, forced tool-use) reviews text AND looks at the actual hero/secondary/gallery images (vision), flagging bad images separately from text findings. If flagged, those image slots get dropped and refilled. A severity-weighted stagnation/regression guard stops the loop early if a round doesn't improve things.
   - Both drafter and critic are memory-aware — each pulls the last 12 sends for the community from `past_sends` for voice/style/performance reference.
4. **Editor** (`app/page.tsx`, `context/DraftContext.tsx`, `components/drafter/*`): full rich-text editing on top of the draft. `fields` (ExtractedFlyer) is the source of truth; HTML is always computed on demand, never stored in editor state. 5-second debounced autosave.
5. **Refine via chat**: free-form refinement instruction re-runs drafter + a critic pass.
6. **Send for approval** (`app/api/draft-approval`): snapshots the rendered HTML immutably onto a `saved_draft_approvals` row (token = magic link) so a later autosave can't corrupt a pending approval. Emails the salesperson via Microsoft Graph.
7. **Salesperson approval**: one-click **Approve** (`app/api/quick-approve/[token]`) pushes straight to HubSpot. **Request Edits** (`/approve/[token]/edits`) first tries an **AI auto-refine** of the salesperson's free-text notes — if it produces a real, in-scope change, it re-renders, mints a new approval token, and auto-sends a fresh approval email with no human in the loop. Falls back to a plain notification email only if auto-refine is skipped/no-op/errors.
8. **Push to HubSpot** (`app/api/push-eblast` for the direct/manual path, or via approval): uploads images to HubSpot Files, uploads HTML as a coded email template, resolves recipient segments purely from the community's last HubSpot send (no manual segment picker), creates the marketing email draft.

## Stack

- Next.js 14 App Router on Vercel
- Anthropic API (Claude Sonnet 4.6) — `lib/anthropic.ts` (drafter), `lib/critic.ts` (critic), `lib/agents/subject-specialist.ts` (subject line), `lib/agentic-draft.ts` (orchestration)
- HubSpot Marketing Email API v3 — `lib/hubspot.ts`
- pdf-lib (PDF object walking) + mupdf (color-managed image conversion) + sharp (encoder/fallback) — `lib/pdf-images.ts`
- Microsoft Graph (app-only) for outbound approval/notification email — `lib/email.ts`
- **Vercel Postgres (Neon-backed)** + Drizzle ORM — `lib/db/`

## Database (`lib/db/schema.ts`)

Postgres is the source of truth for the community registry and the drafting/approval flow. Live tables:

- **`communities`** — 31 seeded (`lib/db/seed-data.ts`). JSONB columns: `brand`, `address`, `hubspot`, `socials`, `marketingDirector`, `logos`, `photoLibrary`, `brandGuideExtracted`.
- **`community_senders`** — multiple senders per community, UI-editable in production (not just seed data — `addSender`/`updateSender`/`deleteSender` in `lib/db/queries.ts`).
- **`past_sends`** — HubSpot history mirror (`npm run sync:past-sends`, also nightly via Vercel cron `/api/cron/sync-past-sends`). Feeds the critic, subject specialist, and `community-intelligence` panel.
- **`saved_drafts`** — the real work-in-progress store (NOT the `drafts` table below). Text PK, `data` JSONB holds fields/subject/etc. Images are stripped out before saving (see `draft_image_bank`). Capped at 8 per community — except rows with `approvedAt` set, which are exempt from that cap (see "Approved drafts are permanent" below).
- **`draft_image_bank`** — one row per image per draft (composite PK `draftId, idx`), kept out of the main payload to stay under Vercel's 4.5 MB body limit.
- **`saved_draft_approvals`** — the real approval-flow table. Token (magic-link) as text PK. Has its own immutable `html` snapshot column, independent of the mutable draft.
- **`pdf_chunks`** — staging table for the chunked-PDF-upload workaround (PDFs >4MB), reassembled and purged by `draft-from-pdf`.
- **`drafts`** and **`approval_threads`** — **dead/legacy tables.** Defined in schema, nothing reads or writes them. `approval_threads` is explicitly commented as superseded in the schema file; `drafts` isn't commented but is equally unused — the real flow uses `saved_drafts`/`saved_draft_approvals`. Don't write new code against either.

Reads through `lib/db/queries.ts`. Legacy import path `@/data/communities` is a 10-line re-export shim — new code should import `lib/db/queries` directly.

Scripts: `npm run db:push`, `npm run db:generate`, `npx tsx lib/db/apply-migrations.ts`, `npm run db:seed`, `npm run db:studio`, `npx tsx scripts/sync-past-sends.ts`, `npx tsx scripts/enrich-communities.ts`, `npx tsx scripts/extract-brand-guide.ts <slug> <pdf>`.

Required env vars: see `.env.example` (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `HUBSPOT_PRIVATE_APP_TOKEN`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_FROM`, `NEXT_PUBLIC_APP_URL`).

Per-community fields worth knowing:
- `trackingPhone` — CallRail number used in eblast CTAs. NEVER same as `phone` (public/flyer number).
- `brandFamily` — brand grouping ("Caretta", "Talamore", "The Glenn", etc.).
- `brand.paletteSource`/`fontsSource` — `"default" | "manual" | "brand-guide-extracted"`.
- `hubspot.officeLocationId` — for the CAN-SPAM footer address; find candidates via `/api/admin/hubspot-office-locations`.
- `hubspot.includedListIds`/`excludedListIds` — segments to send to / suppress. Resolved automatically from the community's last HubSpot send (`resolveSegmentsFromRecentSend`) — there is no manual segment picker anymore (removed in `42350fd`).

## Locked choices, don't relitigate

- Outbound email → **Microsoft Graph app-only**, not Resend/SMTP (Resend was fully removed in `c090647`).
- Approvals → magic-link token in `saved_draft_approvals`, NOT reply-to-approve.
- Edit requests → **AI auto-refine first**, human notification only as fallback. This is a deliberate design choice, not a shortcut — don't "simplify" it back to always-notify-a-human without checking with the user first.
- Segments → resolved from the community's last HubSpot send only. No hardcoded/manual per-community segment lists (removed in `42350fd`).
- Critic **surfaces**, does not auto-fix, in its standalone `/api/critique-eblast` call. (The agentic loop's automatic refine-on-critic-feedback during initial drafting is a separate, already-approved mechanism — don't confuse the two.)
- PDF image extraction: pdf-lib walks indirect objects for embedded JPEG streams (no page rendering, no compositing); CMYK converts via `mupdf.Image(...).toPixmap(DeviceRGB)`; sharp is fallback only. Both "render the page" and "use sharp for CMYK" have been tried and produce worse output — push back if asked to revert to either.
- HubSpot push is three steps: base64 images → HubSpot File Manager, HTML → Design Manager as a coded template (multipart, not JSON — JSON 415s), then create the marketing email referencing that template.
- Email must render identically regardless of the recipient's dark-mode setting — the eblast template's brand colors are intentional, not something Outlook/Apple Mail/Gmail should be allowed to auto-invert. Both `render-email.ts`'s `<head>` and the approval-wrapper email's `<head>` (`lib/email.ts`) declare `<meta name="color-scheme" content="light only">` + `<meta name="supported-color-schemes" content="light only">` for this. If a client is later reported still inverting colors (older Outlook desktop's proprietary dark-mode heuristics are the most likely holdout), the next step is per-element `[data-ogsc]` overrides, not removing these meta tags.
- **Approved drafts are permanent, not evictable.** `saved_drafts.approvedAt` is set only when a salesperson's approval click (`quick-approve/[token]` or the `/approve/[token]?confirmed=1` fallback) results in a *successful* HubSpot push — never on an edit request. Rows with `approvedAt` set are excluded from the per-community 8-draft cap-eviction in `POST /api/saved-drafts`. Don't add a path that sets `approvedAt` outside those two success cases.

## Known limitation: HubSpot "last modified by" always shows the Private App owner

All HubSpot API calls (editor's direct push, quick-approve, the `/approve` fallback) authenticate with one shared `HUBSPOT_PRIVATE_APP_TOKEN`. HubSpot Private Apps aren't tied to the person triggering an individual API call — every write is attributed to whichever HubSpot user created/owns the Private App in that portal, which is why every eblast shows "last modified by [Private App owner]" in HubSpot regardless of which salesperson actually approved it or which staff member pushed it from the editor. This is inherent to using a Private App (shared token) rather than per-user OAuth (each person authorizes their own HubSpot login) — there's no API parameter that overrides it. Not a bug to "fix" lightly: correcting it would mean migrating from a Private App to an OAuth app with per-user delegated auth, a real architecture change (each user would need to connect their own HubSpot account), not a config tweak. Worth knowing this before it causes confusion in HubSpot's audit trail, and worth revisiting if the Private-App-owning HubSpot user's account is ever deactivated (the integration's access is tied to that user).

## Key implementation notes

- **Sentinel placeholders**: `draft-from-pdf` and `render-email` return HTML with `SENTINEL_HERO`/`SENTINEL_SECONDARY`/gallery sentinels instead of embedding base64 directly — actual image data URIs travel as separate JSON fields and get injected client-side. Keeps response payloads manageable.
- **Chunked PDF upload**: PDFs >4MB get POSTed in chunks to `/api/pdf-chunk`, staged in `pdf_chunks`, reassembled by `draft-from-pdf` via an `uploadId`.
- **Rich-text engine** (`lib/rich-text/inline-format.ts`) — from-scratch replacement for `document.execCommand` (`6a44282`). Formatting is inline `<span style="...">` only; tri-state bold/italic/underline (true/false/undefined) so explicit "off" can override a template-forced default; `escAttr()` escapes multi-word font names. `FIELD_DEFAULTS`/`FIELD_FONT_SIZES` in `components/drafter/RichEditor.tsx` must stay in sync with what `lib/render-email.ts` hardcodes per field.
- **Call button locking** (`CallButtonField` in RichEditor.tsx) — label text is formattable, but any edit that removes the community's tracking number from the plain text is reverted via a `guardPlain` check.
- Vercel-specific: `next.config.js` externalizes `sharp`/`pdf-lib`/`pdfjs-dist`/`mupdf` from webpack bundling. TypeScript 5.7 wants a fresh `Uint8Array(byteLength)` + `.set()` when handing Buffer bytes to a `Blob`. mupdf-js is ESM — dynamic-import inside async functions.

## Where things live

| Path | Purpose |
|---|---|
| `lib/db/queries.ts` | Community registry reads/writes — the real source of truth. |
| `lib/db/schema.ts` | Full DB schema — read this, not this doc, for exact columns. |
| `lib/anthropic.ts` | Claude PDF extraction (tool-use) + chat refinement. |
| `lib/critic.ts` | Reviewer agent — single call, vision-aware, forced tool-use. |
| `lib/agents/subject-specialist.ts` | Subject-line specialist, runs once per draft-from-pdf. |
| `lib/agentic-draft.ts` | Drafter↔critic orchestration loop with stagnation/regression guards. |
| `lib/hubspot.ts` | HubSpot API client — marketing emails, file manager, design manager. |
| `lib/email.ts` | Microsoft Graph outbound email (approval + notification). |
| `lib/pdf-images.ts` | Embedded image extraction + CMYK normalization + cropping. |
| `lib/render-email.ts` | The HTML email template — one template, brand-adapted per community. |
| `lib/rich-text/inline-format.ts` | Custom rich-text formatting engine. |
| `context/DraftContext.tsx` | Editor state machine — fields as source of truth, autosave, image bank sync. |
| `components/drafter/RichEditor.tsx` | RichInput/RichBodyEditor/CallButtonField/FormatToolbar + FIELD_DEFAULTS/FIELD_FONT_SIZES. |
| `components/drafter/sections/*` | Per-section field wiring (Hero, Story, CTA, Images, Subject). |
| `app/page.tsx` | Main drafter UI. |
| `app/approve/[token]/page.tsx` | Salesperson confirmation UI (secondary path; edits page links back here). |
| `app/api/draft-from-pdf` | Extract + agentic-draft + render. |
| `app/api/refine-eblast` | Chat refinement. |
| `app/api/critique-eblast` | Standalone critic call (text-only, on-demand from editor). |
| `app/api/community-intelligence` | Read-only past-sends stats panel (no AI call). |
| `app/api/draft-approval` + `[token]/edits` | Send-for-approval, AI auto-refine-on-edit-request. |
| `app/api/quick-approve/[token]` | One-click approve → push to HubSpot. |
| `app/api/push-eblast` | Manual/direct push to HubSpot from the editor. |
| `app/api/saved-drafts` + `[id]` + `[id]/images` | Draft persistence + image bank. |
| `app/api/pdf-chunk` | Chunked-upload staging. |
| `app/api/crop-image` | Drag-to-reposition / focus-based cropping. |
| `app/api/admin/hubspot-office-locations` | One-off diagnostic probe for CAN-SPAM office-location IDs. |
| `app/api/marketing-emails/recent` | Read past sends from HubSpot (feeds `sync:past-sends`). |
| `push-to-github.cmd` | Windows convenience script for commit + push. |

## Conventions

- **Sender vs. marketing director.** `sender` is the `From:` identity recipients see; `marketingDirector` is who actually builds/schedules eblasts (typically Amelia Ozell). They differ.
- **`nameAbbreviation`** matches the historical eblast-naming prefix (e.g. `ACB - Memory Care - Apr 2026`), used to link drafts to past sends.
- **Brand colors** — `primary` (dark, hero blocks), `accent` (warm, CTA buttons), `background` (cream/off-white).
- Every flyer is CMYK (print-export PDFs from Adobe) — always assume CMYK and normalize.
- HubSpot Private App scopes: `content`, `files`.

## What's genuinely still open / rough edges

- Recently fixed, not yet manually end-to-end retested by Tommy: the approval-HTML-snapshot fix (`44808dd`) — send → let an autosave fire → approve → confirm full content lands in HubSpot (not just the footer).
- Scheduler (agent picks send time and schedules via HubSpot API) — not built.
- Pipeline/kanban dashboard (Draft/Awaiting approval/Approved/Scheduled/Sent) — not built.
- No batch flyer processing.
- No analytics view surfaced in the UI yet (data exists in `past_sends`, just not visualized for the user).
- HubSpot Private App token has been in chat history multiple times — rotation is hygiene, not urgent.
