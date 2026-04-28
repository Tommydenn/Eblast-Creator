# Eblast Drafter

A Next.js app for Great Lakes Management that automates senior-living eblast creation across ~20 communities. Drop in a flyer PDF, get a community-branded HTML email drafted into HubSpot.

## What it does

- Reads a designed PDF flyer with Anthropic Claude (extracts subject, headline, body copy, CTA, dates, audience as structured fields)
- Pulls the embedded photos out of the PDF — no rendering, no overlays — and normalizes CMYK images to sRGB
- Renders a brand-themed HTML email using each community's brand colors, fonts, and sender identity
- Refines via chat instructions ("make the headline shorter, less salesy")
- Uploads images to HubSpot's File Manager and creates a marketing email draft pointing at the uploaded coded template

## Quickstart

```bash
git clone https://github.com/Tommydenn/Eblast-Creator.git
cd Eblast-Creator
cp .env.example .env.local   # then fill in keys
npm install
npm run dev                  # http://localhost:3000
```

Required env vars (production lives in Vercel):

- `ANTHROPIC_API_KEY`
- `HUBSPOT_PRIVATE_APP_TOKEN` (scopes: `content`, `files`)
- `HUBSPOT_DEFAULT_FROM_NAME`
- `HUBSPOT_DEFAULT_REPLY_TO`

## Deploy

Vercel auto-deploys `main` on push. Live URL: <https://eblast-creator-git-main-tommydenns-projects.vercel.app>.

## Stack

Next.js 14 (App Router) · Anthropic API (Claude Sonnet 4.6) · HubSpot Marketing Email API v3 · pdf-lib + mupdf + sharp for PDF/image processing.

## Working with Claude (AI assistant)

This repo is set up to be Claude-Code friendly:

- **`CLAUDE.md`** — persistent project context (architecture, key decisions, conventions). Read first.
- **`HANDOFF.md`** — current build state, open tasks, observed user preferences. Read once when picking up the project.

Both files are intentionally human-readable too — they double as good onboarding docs.

## Project structure

```
app/
  page.tsx                          drafter UI (homepage)
  communities/                      community dashboard
  api/
    draft-from-pdf/                 PDF → ExtractedFlyer + HTML
    refine-eblast/                  chat refinement
    push-eblast/                    upload images, push to HubSpot
    marketing-emails/recent/        read past sends
data/
  communities.ts                    registry — single source of truth
  communities/{slug}/               per-community asset folders
lib/
  anthropic.ts                      Claude PDF extraction client
  hubspot.ts                        HubSpot API client
  pdf-images.ts                     embedded image extraction + CMYK conversion
  render-email.ts                   HTML email template renderer
```

## Adding a community

1. Add an entry to `data/communities.ts`. The `Community` type at the top of that file is the contract — fill in what you know, leave the rest as `undefined`.
2. Push. Vercel rebuilds; the new community appears in the homepage dropdown and on `/communities`.
3. Upload brand guide / logo / photos to HubSpot's File Manager (folder `/eblast-drafter/{slug}`) and paste the URLs back into the registry entry.

A CSV template for batch onboarding lives at `data/communities-onboarding.csv`.
