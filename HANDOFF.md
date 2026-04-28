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

1. **Onboard remaining 19 communities.** CSV template at `data/communities-onboarding.csv`. Use `/api/marketing-emails/recent?days=365` to map `nameAbbreviation` prefixes (ACB, HGB, OM, SH, etc.) to communities. Tommy mentioned the prefixes but the full mapping isn't done.
2. **Brand guide upload UI.** Backend (`uploadImageToFileManager` in `lib/hubspot.ts`) is built and works. Need a form UI on `/communities/[slug]` to upload PDF + photos and store the URLs back into `data/communities.ts` (or a database when we add one).
3. **Wire HubSpot list IDs per community.** `Community.hubspot.listId` field exists; just need the actual list IDs from HubSpot for each community. Without these, the email creates with no recipient list set.
4. **Token rotation.** The HubSpot Private App token has been in chat history multiple times. Rotate, update Vercel env var. Old token still works — just hygiene.
5. **Pipeline dashboard.** Draft / Approved / Sent kanban. Needs a database first.
6. **Agentic feedback loop.** Long-term plan agreed: Postgres → outcomes capture → retrieval-augmented drafting → split agents. See `CLAUDE.md`.

## What I just shipped (last working session)

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
