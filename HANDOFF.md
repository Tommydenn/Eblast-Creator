# Handoff — current state

One-time read for the next Claude session inheriting this project. After reading, work from `CLAUDE.md` for ongoing context.

## Where we are

The PDF → eblast → HubSpot pipeline works end-to-end. Tommy can:

1. Pick a community on the homepage
2. Upload a flyer PDF
3. Click "Generate eblast draft" — Claude extracts copy + we pull embedded photos
4. Get a brand-themed email preview with the actual flyer photos (CMYK-normalized)
5. Refine via chat instruction
6. Push to HubSpot — images upload to File Manager, HTML uploads as coded template, draft is created

The community dashboard (`/communities`) was just shipped — read-only view of registry data, with per-community detail pages.

## Recent fixes (last few sessions)

| What broke / what we built | Resolution |
|---|---|
| Page rendering baked in text overlays | Switched to embedded image extraction via pdf-lib |
| CMYK photos rendered with purple foliage | Switched to mupdf.Image color-managed conversion |
| Bare sharp CMYK conversion was washed out | Same — mupdf has bundled ICC profiles, sharp doesn't |
| HubSpot rejected our 3.7 MB email template | Upload images to HubSpot Files first, embed CDN URLs |
| Files API needed a scope we didn't have | Added `files` scope to the Private App |
| TypeScript 5.7 build errors on Buffer→Blob | Allocate fresh `Uint8Array(byteLength)` + `.set()` |
| Past-emails endpoint returned only 1 result | Bumped pagination to 60 × 100 = 6000 emails |

These are all in `CLAUDE.md` under "key decisions — don't relitigate."

## Open tasks (priority-ish)

**Agent build order (continue from Step 2):**

3. **Postgres + analytics ingestion.** Provision Vercel Postgres. Schema: `drafts` (id, community_slug, hubspot_email_id, status, extracted_flyer JSONB, html, created_at, scheduled_for), `past_sends` (hubspot email id, community_slug, subject, sent_at, recipient_count, open_rate, click_rate, list_id), `approval_threads` (draft_id, salesperson_email, sent_at, magic_token, decision, notes, decided_at). Scheduled job (Vercel Cron) pulls open/click rates nightly via HubSpot analytics API. Once landed, give the critic a `lookup_past_sends(community_slug)` tool — it becomes a real tool-use loop.
4. **Outbound approval email.** Add `sendSingleSendTransactional()` to `lib/hubspot.ts`. New `lib/approval-email.ts` composes the salesperson email — critic notes + HubSpot draft link + magic-link Approve/Edit buttons.
5. **Magic-link approval form.** `/approve/[token]/page.tsx`. Signed token (HMAC) maps to a draft. Page shows preview + Approve / Request Edits buttons + free-text edit box.
6. **Edit handler.** Salesperson submits edits → reuses refine flow → critic re-runs → second approval email.
7. **Scheduler.** `lib/scheduler.ts` picks send time from past-send patterns, calls HubSpot's email-schedule API.

**Independent open tasks:**

1. **Onboard remaining 19 communities.** CSV template at `data/communities-onboarding.csv`. Use `/api/marketing-emails/recent?days=365` to map `nameAbbreviation` prefixes (ACB, HGB, OM, SH, etc.) to communities. Tommy mentioned the prefixes but the full mapping isn't done.
2. **Brand guide upload UI.** Backend (`uploadImageToFileManager` in `lib/hubspot.ts`) is built and works. Need a form UI on `/communities/[slug]` to upload PDF + photos and store the URLs back into `data/communities.ts` (or a database when we add one).
3. **Wire HubSpot list IDs per community.** `Community.hubspot.listId` field exists; just need the actual list IDs from HubSpot for each community. Without these, the email creates with no recipient list set.
4. **Token rotation.** The HubSpot Private App token has been in chat history multiple times. Rotate, update Vercel env var. Old token still works — just hygiene.

## What I just shipped (last working session)

**Step 2 of the agentic plan: the Critic / Reviewer agent.**

- `lib/critic.ts` — `reviewDraft({ flyer, community })`. Single Claude call with structured tool output. Returns `{ verdict, summary, findings[], subjectLineAlternatives, sendTimeRecommendation, recipientListNote }`. Findings are severity-tagged (`blocker` / `important` / `nice_to_have`) and category-tagged (`voice` / `subject_line` / `cta` / etc.) with optional concrete suggestions phrased as refinement instructions.
- `app/api/critique-eblast/route.ts` — POST endpoint exposing the reviewer.
- `app/page.tsx` — Reviewer panel in the sidebar (above refinement chat). Auto-runs after every draft generation and after every refinement. Shows verdict pill, summary, findings list. Each finding's suggestion is a clickable button that loads the suggestion text into the refine box — one click triggers the existing refinement loop. Alternative subject lines work the same way.

**Architecture decisions locked this session:**
- Outbound approval email → HubSpot single-send transactional (we already have the token).
- Approval mechanism → magic-link in the email, NOT reply-parsing. Salesperson clicks → lands on a one-page Approve/Edit form.
- Critic does NOT auto-fix. It surfaces; user/salesperson decides what to apply.

### Previously shipped

- Expanded `Community` type with `nameAbbreviation`, `careTypes`, `socials`, `marketingDirector`, `brandGuideUrl`, `logoUrl`, `photoLibrary`, `taglines`, `amenities`, `additionalListIds`
- `app/communities/page.tsx` — list view of all communities
- `app/communities/[slug]/page.tsx` — detail view with brand swatches, sender info, asset slots, voice/positioning
- "Communities →" button added to homepage header for navigation
- Caretta Bellevue (the only fully-populated community) updated with example values for new fields
- `app/api/marketing-emails/recent/route.ts` upgraded with full distribution stats + pagination bump

## Tommy's preferences (observed across many sessions)

- Wants results that look real / final-quality, not "good enough" placeholder vibes. When CMYK extraction was washed out, he kept pushing until it matched what Acrobat shows. Don't ship saturation hacks as "the fix."
- Prefers code-driven solutions over manual workflows. `push-to-github.cmd` was specifically requested to skip PowerShell typing.
- Values pragmatic honesty over hype. Push back when something he proposes won't work.
- Shows patience for iteration but doesn't want to relitigate decided things.
- Plans to evolve into agentic patterns later but wants the current setup solid first.

## MCP / tooling notes

In the Cowork sessions where this was built, we used:

- **Vercel MCP** — checking deployments, fetching runtime logs, build error inspection. Genuinely useful. In Claude Code: `claude mcp add` it.
- **HubSpot MCP** — mostly unused. We hit the HubSpot API directly via `lib/hubspot.ts`.
- **Claude in Chrome** — used twice for proof-of-concept HubSpot UI driving. Not needed for this codebase.

The Vercel MCP is the only one I'd recommend wiring up immediately for this project.

## Current rough edges (low-priority)

- Refinement chat preserves images across refinements but isn't persisted across page reloads.
- No undo on refinement — forward only.
- No way to download the rendered HTML without pushing to HubSpot.
- No batch flyer processing.
- No analytics view yet.

## Read order for catching up

1. This file (`HANDOFF.md`) — done if you're reading this
2. `CLAUDE.md` — persistent project context
3. `data/communities.ts` — see the data shape
4. `lib/pdf-images.ts` — the most non-obvious piece of the codebase
5. `app/api/push-eblast/route.ts` — the orchestration layer

After that, you'll have the full picture.
