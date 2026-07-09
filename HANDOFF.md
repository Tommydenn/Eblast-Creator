# Handoff — current state (rewritten 2026-07-09, corrected from stale prior version)

One-time read for the next Claude session inheriting this project. After reading, work from `CLAUDE.md` for ongoing context.

**Heads up:** a previous version of this file (and CLAUDE.md) described the approval email, magic-link approval, and AI-refine-on-edit as future work ("not yet built"). That was wrong by the time it was written — they're built, shipped, and have had dozens of bugfix commits on top of them. Don't trust old summaries in chat history over the actual code/git log.

## Where we really are

The full pipeline works end-to-end and has been in active use, not just built-and-untested:

1. Pick a community, upload a flyer PDF.
2. `draft-from-pdf` runs a real multi-agent loop: Subject Specialist → Drafter↔Critic (up to 2 rounds, with vision-based image review and a stagnation/regression guard) → renders HTML.
3. Editor opens with a custom rich-text engine (bold/italic/underline, locked call-button number, template-forced field defaults). Autosaves every 5s.
4. User can refine via chat, or send straight for approval.
5. **Send for Approval** emails the salesperson (Microsoft Graph) with a one-click Approve link and a Request Edits link.
6. **Request Edits** first tries an AI auto-refine of the salesperson's notes — if it produces a real change, it re-renders and auto-sends a new approval email, no human touches it. Falls back to a plain notification only when auto-refine can't handle it.
7. **Approve** pushes straight to HubSpot: images → File Manager, HTML → Design Manager as a coded template, segments resolved from the community's last HubSpot send, marketing email created.

Community registry, senders, past-sends history, saved drafts, image bank, and the approval flow are all in Postgres (Neon via Vercel). 31 communities seeded.

## Recently fixed (most recent first)

| Commit | What broke / what shipped |
|---|---|
| `44808dd` | Approval push occasionally sent an empty email to HubSpot (footer only) — root cause: HTML was read from the mutable draft, and an autosave between "send for approval" and "approve" could wipe it. Fixed by snapshotting HTML immutably onto the `saved_draft_approvals` row at send time; push route now refuses to push empty HTML. **Not yet manually end-to-end retested by Tommy** — see test steps below. |
| `be66583`, `d73f46f`, `e62d46f` | Rich-text editor: template-forced bold/italic override behavior, footer button text, gallery px sizing, font corruption, sidebar formatting leakage, locked-but-formattable call button. |
| `6a44282` | Full rewrite of the rich-text formatting engine, replacing `document.execCommand` with a from-scratch inline-span engine (`lib/rich-text/inline-format.ts`). Everything editor-formatting-related downstream of this. |
| `c090647`, `abbb40d` | Dead code removal: `voice`/`heroHook` fields, Resend/nodemailer (email is Microsoft Graph only now), orphaned `push-caretta` route and manual `SegmentManager` UI. |
| `42350fd` | Removed hardcoded per-community segment lists — segments are now resolved purely from the community's last HubSpot send. |
| `0830e9f` | Switched approval email transport from Resend to Microsoft Graph. |

Older but structurally foundational (stable, not recently touched):
- `92e119e` — introduced the whole salesperson approval flow (send-for-approval, magic-link pages, edit requests).
- `9b1a653` — moved community registry to Postgres, introduced the agentic drafter↔critic loop and 365-day past-sends memory.
- `ef6a95c` — chunked PDF upload to bypass Vercel's 4.5 MB body limit.
- `ecb3813` — persisted the image bank to Postgres for cross-device access.

## How to test the still-unverified fix

Send a draft for approval → make one edit in the editor to arm autosave → wait for the "Auto-saving…" chip (~5s) → THEN approve → confirm the full eblast (not just the compliance footer) appears in HubSpot.

## Open tasks

1. **Scheduler.** Nothing exists yet — agent picking a send time from past-send patterns and calling HubSpot's schedule API is still fully open.
2. **Pipeline/kanban dashboard** (Draft / Awaiting approval / Approved / Scheduled / Sent) — not built. `saved_drafts`/`saved_draft_approvals` have everything needed to build this; just no UI yet.
3. **Analytics view.** `past_sends` has open/click/bounce data (nightly cron already syncs it), but there's no UI surfacing it beyond the read-only `community-intelligence` stats panel shown before generating a draft.
4. **Batch flyer processing** — still one-at-a-time.
5. **Token rotation** — HubSpot Private App token has been in chat history multiple times. Low urgency, still a hygiene item.
6. **Two parallel approval-confirmation surfaces** worth eventually consolidating: the email's Approve button goes straight to `quick-approve` (one-click, no confirmation screen), but `app/approve/[token]/page.tsx` is a separate full confirmation-page-with-preview that duplicates similar push logic and is only reachable via the "go back" link on the edits page. Not broken, just redundant — worth simplifying if touching that area again.
7. Legacy DB tables `drafts` and `approval_threads` are dead (superseded by `saved_drafts`/`saved_draft_approvals`) but still in the schema. Fine to leave — don't write new code against them, and don't be surprised they're unused if you go looking for where drafts are stored.

## Tommy's preferences (observed across many sessions)

- Wants results that look real/final-quality, not "good enough" placeholder vibes. Don't ship saturation hacks or shortcuts as "the fix" — he'll push until it matches source quality (e.g. CMYK extraction had to match what Acrobat shows).
- Prefers code-driven solutions over manual workflows (`push-to-github.cmd` exists specifically to skip PowerShell typing).
- Values pragmatic honesty over hype — push back when something proposed won't work, and don't overstate confidence about what's built vs. not. **This file was previously wrong about that exact thing — verify against code/git log, not memory or older docs, before describing project state.**
- Wants git pushes to happen automatically after commits, no confirmation needed.
- Wants the full workflow followed for multi-issue work: read all affected files first, parallel edits, `npx tsc --noEmit` before committing, push, then poll Vercel until `READY` and confirm the build log shows a clean compile — don't stop at "pushed."

## Read order for catching up

1. This file — done if you're reading this.
2. `CLAUDE.md` — persistent project context, kept in sync with actual code as of 2026-07-09.
3. `lib/db/schema.ts` — the real data model; more trustworthy than prose descriptions of it.
4. `lib/agentic-draft.ts` + `lib/critic.ts` — the drafting/review loop.
5. `app/api/draft-approval/[token]/edits/route.ts` — the AI-auto-refine-on-edit-request logic, the most non-obvious piece of the approval flow.
6. `lib/pdf-images.ts` — the most non-obvious piece of the extraction pipeline.
7. `context/DraftContext.tsx` — the editor's state machine and autosave/image-bank sync logic.

After that, you'll have the full picture. If anything here contradicts the code, trust the code and fix this file.
