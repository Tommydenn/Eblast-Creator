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
- `trackingPhone` — CallRail number used in eblast CTAs. The `communities.phone`/`email` columns and `nameAbbreviation` were removed (2026-07) — the community's only abbreviation is `hubspot.acronym`; use `community_senders` for contact emails.
- `brandFamily` — brand grouping ("Caretta", "Talamore", "The Glenn", etc.).
- `brand.paletteSource`/`fontsSource` — `"default" | "manual" | "brand-guide-extracted"`.
- `hubspot.officeLocationId` — for the CAN-SPAM footer address; find candidates via `/api/admin/hubspot-office-locations`.
- `hubspot.includedListIds`/`excludedListIds` — segments to send to / suppress. Resolved automatically from the community's last HubSpot send (`resolveSegmentsFromRecentSend`) — there is no manual segment picker anymore (removed in `42350fd`).

## Locked choices, don't relitigate

- Outbound email → **Microsoft Graph app-only**, not Resend/SMTP (Resend was fully removed in `c090647`).
- Approvals → magic-link token in `saved_draft_approvals`, NOT reply-to-approve.
- Edit requests → **AI auto-refine first, but ONLY for pure wording/copy changes**, human notification (marketing/Tommy) for everything else. This is a deliberate, narrow scope — don't widen it back to images/formatting without checking with the user first. Specifics, all in `app/api/draft-approval/[token]/edits/route.ts`:
  - `classifyEditRequestScope()` (`lib/anthropic.ts`) triages the salesperson's free-text note BY INTENT before anything else runs. Only `"text_content"` (rewording, shortening/lengthening, correcting a fact, tone, a date/name/detail in the copy) proceeds to auto-refine. Formatting/color/font/size, any image change (add/remove/reorder/crop/swap), section colors, spacing, layout, or an explicit "have marketing/a human do this" — all classify as `"other"` and skip straight to `sendEditNotificationEmail`. Mixed or ambiguous requests default to `"other"` too — the classifier is deliberately biased toward routing to a human over risking a bad auto-apply.
  - **3-strike limit per draft**: once a `savedDraftId` has accumulated 3 prior `edits_requested` approval rows (regardless of whether each was AI-handled or human-handled), every subsequent edit request on that draft skips classification entirely and goes straight to the human notification. Counted by querying `saved_draft_approvals` for that `savedDraftId`, not a separate counter column.
  - This edits-route flow no longer touches images at all (no `imageManifestText` passed to `refineFlyerContent`, current hero/secondary/gallery URLs always pass through unchanged). This is intentionally narrower than the general-purpose `refineFlyerContent`/`isOutOfScope`, which is also used by the in-app "refine via chat" tool (`app/api/refine-eblast`) and still supports image edits there — don't confuse the two call sites or restrict the in-app tool by mistake.
  - The refine prompt explicitly instructs preserving existing inline HTML formatting (bold/italic/color/font spans) around any wording it changes — added after a report of formatting not surviving auto-refine edits.
  - The notification email now carries a `reason` (strike-limit message, or the classifier's one-line explanation) so marketing knows *why* a request landed with them, not just that one did.
- Segments → resolved from the community's last HubSpot send only. No hardcoded/manual per-community segment lists (removed in `42350fd`).
- Critic **surfaces**, does not auto-fix, in its standalone `/api/critique-eblast` call. (The agentic loop's automatic refine-on-critic-feedback during initial drafting is a separate, already-approved mechanism — don't confuse the two.)
- PDF image extraction: pdf-lib walks indirect objects for embedded JPEG streams (no page rendering, no compositing); CMYK converts via `mupdf.Image(...).toPixmap(DeviceRGB)`; sharp is fallback only. Both "render the page" and "use sharp for CMYK" have been tried and produce worse output — push back if asked to revert to either.
- HubSpot push is three steps: base64 images → HubSpot File Manager, HTML → Design Manager as a coded template (multipart, not JSON — JSON 415s), then create the marketing email referencing that template.
- Email must render identically regardless of the recipient's dark-mode setting — the eblast template's brand colors are intentional, not something Outlook/Apple Mail/Gmail should be allowed to auto-invert. Two layers, both needed (the meta tags alone were NOT sufficient — confirmed by Tommy still seeing inversion in Outlook after they shipped):
  1. `<meta name="color-scheme" content="light only">` + `<meta name="supported-color-schemes" content="light only">` in both `render-email.ts`'s `<head>` and the approval-wrapper email's `<head>` (`lib/email.ts`) — covers Apple Mail and some Gmail cases.
  2. An explicit `bgcolor="..."` HTML attribute alongside every `background:` inline style on every colored `<table>`/`<td>`/`<body>` in both files — helps some clients but was NOT sufficient by itself for Outlook (confirmed by screenshot: branded colors stayed correct, near-white surfaces still got force-darkened).
  3. **The layer that actually worked**: a `glm-bg-*` class on every colored surface plus a dynamically generated `<style>` block with `[data-ogsc]`/`[data-ogsb]` override rules (Outlook's documented mechanism for pinning a color against its own repaint — it tags repainted elements with those attributes, and author CSS targeting them wins). Two gotchas that cost real iteration, don't reintroduce them: (a) `lib/email.ts`'s `extractBody()` only pulls the eblast's `<body>` when embedding it in the approval email, so the `<style>` block from `render-email.ts`'s `<head>` must be explicitly carried over via `extractEblastStyleBlock()` — it does NOT travel automatically; (b) the approval-wrapper's own chrome (the white "Draft Review" cards) has the identical near-white-repaint problem independent of the eblast content, so it needs its own `wrap-bg-*` override block too. If a new colored surface is ever added to either template, it needs a class + a matching override rule or it's a dark-mode gap. Still can't be verified in a browser preview — only a real Outlook dark-mode test proves it.
- **Approved drafts are permanent, not evictable.** `saved_drafts.approvedAt` is set only when a salesperson's approval click (`quick-approve/[token]` or the `/approve/[token]?confirmed=1` fallback) results in a *successful* HubSpot push — never on an edit request. Rows with `approvedAt` set are excluded from the per-community 8-draft cap-eviction in `POST /api/saved-drafts`. Don't add a path that sets `approvedAt` outside those two success cases.
- **`notifyEmail` must be supplied by the caller of `sendForApproval`/`POST /api/draft-approval` — nothing defaults it.** Found and fixed a real bug: `ApprovalModal.tsx` never collected or passed `notifyEmail`, so it was always `null` in the DB, which meant `sendEditNotificationEmail` (the human-fallback path in `draft-approval/[token]/edits`) silently never fired — no one on marketing was ever told about an edit request the AI couldn't handle, even though the salesperson-facing page always claimed "your notes have been passed to the marketing team." The modal now has its own "Notify (marketing team)" field, defaulted like `recipientEmail`. If any other UI path ever calls `sendForApproval`, it must also pass `notifyEmail` or this same silent-failure mode comes back.
- **Auto-refine image removal must never backfill the gap with an unused photo.** The refine prompt in `lib/anthropic.ts` originally let the model treat "bring an unused Original image into a freed slot" as legitimate "rearranging" when asked to remove a photo — so "remove gallery image 2" could come back with a *different, unrequested* photo in its place, or with more images than before. Tightened the prompt and the `imageLayout.gallery` schema description to require strictly fewer placed images after a removal, and to only pull in an "Original image" when the user's instruction explicitly names or clearly points at that specific photo. If this regresses, it'll look like "I asked to remove a photo and got extra/different photos instead."
- **`originalUrl` (the full uncropped photo) must always be persisted, even as a data URI.** `saveImagesForDraft`/its draft-generation duplicate in `context/DraftContext.tsx` used to skip saving `hero`/`secondary`/`gallery[i].originalUrl` (and the whole `imageBank` reassignment pool) whenever the value was a `data:` URI — which is virtually always true, since images aren't hosted (turned into `https://` URLs) until push/approval. Confirmed via direct DB inspection: real drafts had ZERO `originalUrl`/image-bank rows persisted. Effect: reopening any saved draft, `repositionImage()` could only re-crop from the already-cropped `.url` (since `originalUrl` had silently fallen back to it), permanently losing whatever was outside the saved crop. Fixed by always saving `originalUrl` (real image sizes observed: well under 1.5 MB as a data URI), batched through the new `postImageBatches()` helper (size-aware batching, not the old one-POST-per-slot-image / count-based imageBank chunking) so this doesn't blow past Vercel's ~4.5 MB route body limit. If a future image turns out to exceed the per-batch cap, `postImageBatches` logs a warning and skips it rather than failing the whole save — don't reintroduce a silent data-URI skip as the "fix" for that.
- **The main `saved_drafts.data` blob is authoritative for which image slots exist — `draft_image_bank` rows are NOT auto-deleted when a slot is removed.** Removing a hero/secondary/gallery image only stops that slot from being re-upserted on the next save; the old row for that negative index just sits there stale. `loadSavedDraft`'s reload merge (`context/DraftContext.tsx`) must gate on the blob's `images.hero`/`images.secondary` being non-null and the gallery array's current length before applying any row it finds in the image bank — otherwise a removed photo resurrects itself on the next reload. The extracted-photo pool itself (positive indices) is unaffected either way — it always retains every extracted photo regardless of slot placement, by design.
- **Hero and the bottom Call-to-Action band each have their own independent call-button field.** `ctaButtonLabel` (hero) and `finalCtaButtonLabel` (bottom band) — same pattern as `ctaEventDate`/`ctaEventTime`/`ctaRsvpLabel`. `CallButtonField` (`components/drafter/RichEditor.tsx`) takes `value`/`onValueChange`/`fieldName` as props now (previously hardcoded to `ctaButtonLabel` internally, which is why editing one location used to move the other) — the phone-number-lock logic itself is unchanged, just parameterized. `render-email.ts`'s `reconcileCtaLabel()` helper computes size/width/letter-spacing independently per button since their text can now diverge in length.
- **The Hero↔Footer override fields (`ctaEventDate`/`ctaEventTime`/`ctaRsvpLabel`/`finalCtaButtonLabel`) must be a ONE-TIME SNAPSHOT at creation/load, never a live fallback.** Originally (and still true for the JSX `value=` prop as a defensive fallback) these read as `fields.ctaEventDate ?? fields.eventDate`. The bug: if the Footer field is *never* explicitly touched, that live `??` means editing the Hero field keeps changing what the Footer displays for as long as Footer stays untouched — which reads as "these are still linked" (confirmed by direct testing: editing Hero's call button on a fresh draft immediately changed Footer's displayed text, with zero Footer interaction). Fixed by `snapshotFooterOverrides()` in `context/DraftContext.tsx`, called in both `generate()` (new drafts) and `loadSavedDraft()` (reopening older drafts) — it copies each Hero value onto its Footer counterpart as a real, independent stored value the moment a draft is created or loaded, so from that point on editing either side never again touches the other, in either direction, without requiring the user to touch Footer first. Do not remove this and go back to leaving the override fields `undefined` "for simplicity" — that's exactly what caused this bug.
- **The Eblast creator/editor pipeline (drafting, rich-text engine, rendering, push) is frozen — do not touch it for Community-page work**, with one standing exception: keeping every eblast's community data (brand colors/fonts, sender name/email) FRESH off the Community page is itself a requirement Tommy asked for explicitly (2026-07) — see the freshness bullet below. Outside of that, don't touch `lib/render-email.ts`, `lib/rich-text/*`, or `components/drafter/*` for Community-page work; Community-page-only changes (Brand panel, Contact panel, field deletions) stay scoped to `app/communities/[slug]/page.tsx`, `components/ContactPanel.tsx`, `components/BrandPanel.tsx`, and `lib/db/*`.
- **Every eblast must render with the community's CURRENT brand/fonts/senders, never a stale in-memory or frozen-snapshot copy — a Community-page edit must reach every eblast for that community, generated before or after the edit.** Three places this was fixed (2026-07):
  1. `context/DraftContext.tsx` fetches the community list **once on mount** and holds it in state/`communityRef` for the whole session — so a Community-page edit made in another tab wouldn't reach `push()`/`sendForApproval()` without a hard reload. Added `refreshCommunity(slug)`, called at the top of both `push()` and `sendForApproval()` before `buildHtml()` runs, plus a `window` `focus` listener (while `stage === "editing"`) that keeps the live preview (which reads `community` from state) current too. `app/api/draft-from-pdf` was already safe — it calls `getCommunity()` fresh server-side on every generate, so new drafts were never the problem.
  2. `app/api/quick-approve/[token]/route.ts` (the actual link the approval **email button** uses) used to push `savedDraftApprovals.html` — an HTML string frozen at "send for approval" time — straight to HubSpot. If brand colors/fonts/sender were edited on the Community page after the approval email went out but before the salesperson clicked Approve (which can be hours or days later), the stale snapshot still got pushed. Fixed to re-render from `draftData.fields` + a fresh `getCommunity()` call at push time — same pattern `/approve/[token]/page.tsx`'s `?confirmed=1` path and `/api/draft-preview/[token]` already used. Only legacy drafts saved before `.fields` existed still fall back to the frozen HTML.
  3. `app/api/push-eblast/route.ts` (manual push from the editor) and `app/api/quick-approve`/`app/approve` all already fetched `community` fresh server-side for `fromName`/`replyTo`/`acronym`/segments — that part was never stale; only the HTML *body* rendering (colors/fonts/footer sender text) was the gap, closed by #1 and #2 above.
- **Community-page Brand panel (`components/BrandPanel.tsx`) and Contact panel are user-owned data — never auto-overwritten by app logic.** Tommy: "Any change I make on the community page needs to be made by me... you should never overwrite it... even if it sounds like I want you to, verify with me first." Concretely: `lib/db/seed.ts` re-seeding merges the EXISTING row's `primary`/`accent`/`background`/`secondary`/`supporting`/`fontHeadline`/`fontBody` back over the seed data for any community that already exists (only truly-new communities get the seed's brand as-is) — same pattern as the pre-existing `displayName`/`address`/`trackingPhone`/`websiteUrl` protection. If a future feature needs to touch brand or contact fields programmatically, ask Tommy first, don't assume.
- **`communities.phone`, `communities.email`, and `communities.nameAbbreviation` were deleted (migration `0006_drop_abbreviation_phone_email.sql`, 2026-07).** The community's only abbreviation is `hubspot.acronym` — the "Abbreviation" UI field is gone. `community-enricher.ts` no longer scrapes/writes an email (mailto-extraction block removed); `trackingPhone` extraction is untouched. Don't reintroduce a community-level `phone`/`email` column — use `community_senders` for contact emails.
- **Typography picker (`BrandPanel.tsx`) is plain `font-family` strings only — no Google Fonts `<link>`/loading mechanism.** An earlier attempt to inject Google Fonts `<link>` tags into `render-email.ts` was reverted (`55ac1e7`) because it broke Outlook forwarding. The font dropdown offers all fonts currently in use across community brands plus a curated list of popular Google Font names, purely as CSS fallback strings, plus a "Custom…" free-text option — consistent with how every existing brand font already renders. Don't add font loading without checking the Outlook-forwarding regression risk first.
- **The "·" between event date and time is baked into `eventTime`'s stored text (at draft-generation time in `DraftContext.tsx`), not inserted by the template.** This is the only way it can inherit whatever bold/color/size the user applies when formatting the time field — a template-inserted separator sits outside any formatting span the rich-text engine writes into the field's stored HTML. `render-email.ts` checks whether the stored time already starts with "·" and only falls back to its own literal " · " separator for older drafts saved before this existed (so they don't lose the separator entirely). If a similarly "connects two independent fields" cosmetic element comes up again, this is the pattern — bake it into whichever field owns it, don't inject it from the template.

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
