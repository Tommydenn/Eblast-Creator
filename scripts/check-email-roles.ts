/**
 * Checks the four parts one eblast's addresses play.
 *
 *   approver    — sent the magic link
 *   signature   — printed in the footer (the senders list, untouched)
 *   hubspotFrom — the From: on the pushed marketing email
 *   regionals   — copied on the approval request
 *
 * The thing worth guarding is the fallback. For nearly every community all
 * four are the same person and nothing is filled in, so a mistake here would
 * not show up on the communities that were set up deliberately — it would show
 * up everywhere else, silently, by sending the approval to the wrong address
 * or by HubSpot sending as nobody.
 *
 *   npx tsx scripts/check-email-roles.ts
 */
import { approverEmailFor, hubspotFromFor, primarySender, regionalEmailsFor } from "@/lib/email-roles";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

const sender = (name: string, email: string | null, isPrimary = false) => ({
  name,
  email,
  title: null,
  isPrimary,
});

const ANGIE = sender("Angie Carr", "angie@example.com", true);
const DEV = sender("Dev Patel", "dev@example.com");
const NAME_ONLY = sender("Pat Who", null, true);

// ── Nothing set: every role is the primary sender ─────────────────────────
{
  const c = { displayName: "Talamore Plymouth", senders: [ANGIE, DEV] };
  if (approverEmailFor(c) !== "angie@example.com") {
    fail(`with nothing set the approver should be the primary sender, got ${approverEmailFor(c)}`);
  }
  const { fromName, replyTo } = hubspotFromFor(c);
  if (replyTo !== "angie@example.com") fail(`HubSpot should send as the primary sender, got ${replyTo}`);
  if (fromName !== "Angie Carr") fail(`HubSpot's from-name should be the primary sender, got ${fromName}`);
  if (regionalEmailsFor(c).length !== 0) fail("a community with no regionals copies nobody");
}

// ── A primary on file by name alone ───────────────────────────────────────
//
// Allowed: a sender can exist for the footer's sign-off with no address. The
// roles that need an address fall through to the next sender who has one,
// rather than to an empty string.
{
  const c = { displayName: "Talamore Plymouth", senders: [NAME_ONLY, DEV] };
  if (approverEmailFor(c) !== "dev@example.com") {
    fail(`a name-only primary should fall through to the next address, got ${approverEmailFor(c)}`);
  }
  if (hubspotFromFor(c).replyTo !== "dev@example.com") {
    fail("HubSpot should fall through to the next address too");
  }
  if (primarySender(c)?.name !== "Pat Who") fail("the signature is still the primary sender");
}

// ── No senders at all ─────────────────────────────────────────────────────
{
  const c = { displayName: "Brand New", senders: [] };
  if (approverEmailFor(c) !== "") fail("a community with no senders has no approver, not a guess");
  if (hubspotFromFor(c).fromName !== "Brand New") {
    fail("with no senders HubSpot falls back to the community's own name");
  }
}

// ── Overrides, and the name that follows the address ──────────────────────
{
  const c = {
    displayName: "Talamore Plymouth",
    senders: [ANGIE, DEV],
    approverEmail: "boss@example.com",
    hubspotFromEmail: "dev@example.com",
  };
  if (approverEmailFor(c) !== "boss@example.com") fail("the approver override is ignored");
  const { fromName, replyTo } = hubspotFromFor(c);
  if (replyTo !== "dev@example.com") fail("the HubSpot override is ignored");
  // An email signed by one person and sent by another reads as a mistake, so
  // when the override is somebody already on the list, their name travels with it.
  if (fromName !== "Dev Patel") {
    fail(`the from-name should follow an override that matches a sender, got ${fromName}`);
  }
}

// ── An override belonging to nobody on the list ───────────────────────────
{
  const c = {
    displayName: "Talamore Plymouth",
    senders: [ANGIE],
    hubspotFromEmail: "info@example.com",
  };
  const { fromName, replyTo } = hubspotFromFor(c);
  if (replyTo !== "info@example.com") fail("a shared address should still be used");
  if (fromName !== "Angie Carr") fail("an unknown address keeps the primary sender's name");
}

// ── Whitespace is not a value ─────────────────────────────────────────────
{
  const c = { displayName: "X", senders: [ANGIE], approverEmail: "   ", hubspotFromEmail: "  " };
  if (approverEmailFor(c) !== "angie@example.com") fail("a blank override must not beat the sender");
  if (hubspotFromFor(c).replyTo !== "angie@example.com") fail("a blank HubSpot override must not win either");
}

// ── Regionals ─────────────────────────────────────────────────────────────
{
  const c = {
    displayName: "X",
    senders: [ANGIE],
    regionals: [{ email: "reg1@example.com" }, { email: " reg2@example.com " }, { email: "  " }],
  };
  const cc = regionalEmailsFor(c);
  if (cc.length !== 2) fail(`blank regional addresses should be dropped, got ${JSON.stringify(cc)}`);
  if (cc[1] !== "reg2@example.com") fail("regional addresses should be trimmed");
}

// ── The approval route's own rules, read out of the source ────────────────
//
// Two of them cannot be called from here without a database, so they are
// checked where they are written instead.
{
  const route = require("node:fs").readFileSync("app/api/draft-approval/route.ts", "utf8") as string;
  if (!/isTest\s*\n?\s*\?\s*\[\]/.test(route)) {
    fail("app/api/draft-approval/route.ts no longer forces a test send to copy nobody");
  }
  if (!/ccEmails \?\? community\.regionals/.test(route)) {
    fail("app/api/draft-approval/route.ts no longer falls back to the community's regionals");
  }

  // Who is copied has to be changeable from the community page. It was
  // read-only there at first, and the only way to the list was a link shown
  // when nobody was on it — which disappeared the moment anybody was.
  const community = require("node:fs").readFileSync("app/api/communities/[slug]/route.ts", "utf8") as string;
  if (!community.includes("Array.isArray(body.regionalIds)")) {
    fail("the community PATCH no longer accepts regionalIds, so coverage cannot be edited there");
  }
  const panel = require("node:fs").readFileSync("components/EmailRolesPanel.tsx", "utf8") as string;
  if (!panel.includes("roster.map") || !panel.includes("setRegionalIds")) {
    fail("components/EmailRolesPanel.tsx no longer offers every regional as a choice");
  }
  // Adding a person and taking one off the roster are both reachable: the
  // first inline here, the second on the page that owns the list.
  if (!panel.includes("/api/regionals")) {
    fail("components/EmailRolesPanel.tsx can no longer add a regional who is not on the list yet");
  }
  if (!panel.includes("/communities#regionals")) {
    fail("components/EmailRolesPanel.tsx no longer points anywhere to edit or remove a regional");
  }
  if (!panel.includes("regionalIds,")) fail("components/EmailRolesPanel.tsx no longer saves the coverage it edits");

  // One person is often both the regional and the approver. They must not be
  // shown as copied, because the mailer will not copy them.
  const modal = require("node:fs").readFileSync("components/drafter/ApprovalModal.tsx", "utf8") as string;
  if (!modal.includes("!== reviewer")) {
    fail("components/drafter/ApprovalModal.tsx lists a regional who is already the reviewer as copied");
  }

  const mailer = require("node:fs").readFileSync("lib/email.ts", "utf8") as string;
  if (!/ccRecipients/.test(mailer)) fail("lib/email.ts does not put the copies on the message");
  if (!/toLower\.has/.test(mailer)) {
    fail("lib/email.ts no longer drops a copy that is already on the To: line");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nEvery role falls back to the primary sender, a sender on file by name alone\n" +
  "falls through to the next address rather than to nothing, an override takes its\n" +
  "owner's name with it when it has one, blank values never beat a real sender,\n" +
  "and a test send copies nobody.",
);
process.exit(0);
