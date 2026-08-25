import { redirect } from "next/navigation";

/**
 * Retired approval screen — now only a redirect to the real one.
 *
 * This page used to approve the eblast and push it to HubSpot on a plain GET,
 * behind an `?confirmed=1` link. That is the same shape as the bug fixed in
 * /api/quick-approve: anything that follows links in an email (Outlook Safe
 * Links, mail scanners, inbox previewers) could approve and push without a
 * person ever clicking. This copy also had none of the protections added
 * there — no expiry check, no atomic claim against double-pushing, no
 * superseded check, no test-mode handling — so a single visit could create a
 * duplicate HubSpot email from a link that should have been refused.
 *
 * Approval emails have pointed at /api/quick-approve for a while, but the
 * Request Edits page still linked here through its "Go back" link, which is
 * how a reviewer could still land on it. That link now goes straight to the
 * guarded route, and anyone arriving here from an older email is sent there
 * too. Its GET renders a confirmation page and changes nothing.
 */
export const dynamic = "force-dynamic";

export default function ApprovePage({ params }: { params: { token: string } }) {
  redirect(`/api/quick-approve/${params.token}`);
}
