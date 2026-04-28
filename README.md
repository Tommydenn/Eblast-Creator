# Eblast Drafter

Local dev environment for pushing designed marketing emails into HubSpot.

## One-time setup

```powershell
cd "C:\Users\TommyDenn\Documents\Claude\Projects\Eblast Drafter"
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Iteration loop

1. Claude edits files in this folder via Cowork.
2. Next.js hot-reloads — refresh the browser.
3. Click "Push Caretta draft to HubSpot" — response appears below the button.
4. Paste the response into the chat if Claude needs to iterate on the request shape.

## Files

- `app/page.tsx` — the dashboard (one button for now).
- `app/api/push-caretta/route.ts` — server endpoint that calls HubSpot.
- `lib/hubspot.ts` — HubSpot Marketing Email + Design Manager API client.
- `public/caretta-dining-info-session.html` — the email design.
- `.env.local` — HubSpot Private App token + sender defaults.

## Why a local dev server, not Cowork's sandbox

Cowork's sandbox can't reach `api.hubapi.com` (research-preview egress restrictions
that don't read from org-level Anthropic settings). Your machine has full network
access. Same code will deploy unchanged to Vercel later.
