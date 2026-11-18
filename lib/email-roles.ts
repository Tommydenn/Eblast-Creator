/**
 * Which address plays which part in one eblast.
 *
 * Four of them, and for most communities they are all the same person, which
 * is exactly why they used to be one field. They come apart when the
 * salesperson who signs the email is not the one who approves it, or when
 * HubSpot has to send as a shared address.
 *
 *   approver   — sent the magic link, clicks approve
 *   signature  — printed in the email's footer (the senders list, unchanged)
 *   hubspotFrom — the From: on the marketing email once it is pushed
 *   regionals  — copied on the approval request
 *
 * Every one of them falls back to the primary sender, so a community with
 * nothing filled in behaves exactly as it did before any of this existed.
 */

/**
 * Described structurally, not imported, because the server's Community and the
 * editor's ClientCommunity are separate types and both have to answer these
 * questions the same way.
 */
export interface SenderLike {
  name: string;
  email: string | null;
  title?: string | null;
  isPrimary: boolean;
}
interface RegionalLike {
  email: string;
}
interface Sendery {
  senders: readonly SenderLike[];
  approverEmail?: string | null;
  hubspotFromEmail?: string | null;
  regionals?: readonly RegionalLike[];
}

/** The primary sender, or the first one on file when none is marked. */
export function primarySender(community: Sendery): SenderLike | null {
  return community.senders.find((s) => s.isPrimary) ?? community.senders[0] ?? null;
}

/** The first sender who actually has an address, primary preferred. */
function firstSenderEmail(community: Sendery): string {
  return (
    primarySender(community)?.email?.trim() ||
    community.senders.find((s) => s.email?.trim())?.email?.trim() ||
    ""
  );
}

/** Who the approval request goes to. Empty when the community has nobody. */
export function approverEmailFor(community: Sendery): string {
  return community.approverEmail?.trim() || firstSenderEmail(community);
}

/**
 * The From: on the pushed HubSpot email.
 *
 * The name follows the address: when the override belongs to somebody already
 * on the senders list, the reader sees their name rather than the primary's,
 * because an email signed by one person and sent by another reads as a
 * mistake.
 */
export function hubspotFromFor(community: Sendery & { displayName: string }): {
  fromName: string;
  replyTo: string;
} {
  const override = community.hubspotFromEmail?.trim();
  const replyTo = override || firstSenderEmail(community);
  const matching = override
    ? community.senders.find((s) => s.email?.trim().toLowerCase() === override.toLowerCase())
    : null;
  return {
    fromName: matching?.name ?? primarySender(community)?.name ?? community.displayName,
    replyTo,
  };
}

/** The regionals copied on an approval, as plain addresses. */
export function regionalEmailsFor(community: Sendery): string[] {
  return (community.regionals ?? []).map((r) => r.email.trim()).filter(Boolean);
}
