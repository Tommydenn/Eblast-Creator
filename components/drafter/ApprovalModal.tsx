"use client";

import React, { useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { input as inputCls, label as labelCls, hint as hintCls } from "@/components/drafter/ui";

/**
 * Sending the eblast to somebody to look at.
 *
 * The command bar used to carry two buttons for this — "Send for Approval"
 * and "Send Test" — side by side, in a row that already held a third thing
 * that sends. But a test is not a different destination: it is the same
 * request with `isTest` set, the same email, the same link, recorded nowhere.
 * So it is a choice made inside this window rather than a second button
 * outside it, which is one less thing to read in the bar and one less chance
 * of pressing the wrong one.
 */
export default function ApprovalModal({ onClose }: { onClose: () => void }) {
  const { fields, community, save, isSaving, sendForApproval } = useDraft();

  const [isTest, setIsTest] = useState(false);

  // Default the reviewer to this community's primary salesperson — they're who
  // the approval is almost always for, and they're already on the community
  // record. A sender may be on the record by name alone; the reviewer has to
  // be an address, so fall back to the first sender who has one, then to the
  // marketing address.
  const primarySender = community?.senders?.find((s) => s.isPrimary) ?? community?.senders?.[0] ?? null;
  const firstSenderEmail =
    primarySender?.email?.trim() ||
    community?.senders?.find((s) => s.email?.trim())?.email?.trim() ||
    "";
  const MINE = "jwalls@greatlakesmc.com";

  const [recipientEmail, setRecipientEmail] = useState(firstSenderEmail || MINE);
  // Once the address has been typed in it is left alone; until then it follows
  // the choice above, because a test almost always goes back to whoever sent
  // it and an approval almost always goes to the salesperson.
  const [typedRecipient, setTypedRecipient] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(MINE);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fields || !community) return null;

  function chooseMode(test: boolean) {
    setIsTest(test);
    if (!typedRecipient) setRecipientEmail(test ? MINE : firstSenderEmail || MINE);
  }

  async function handleSend() {
    if (!recipientEmail.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await save();
      await sendForApproval({
        recipientEmail: recipientEmail.trim(),
        notifyEmail: notifyEmail.trim() || undefined,
        note: note.trim() || undefined,
        isTest,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="eb-appear w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#f0ede7] px-6 pb-4 pt-6">
          <h2 className="text-base font-semibold text-[#1F4538]">Send for review</h2>

          {/* The choice comes first, because it changes what everything below
              it means. */}
          <div className="mt-3 flex rounded-lg bg-[#f5f3ef] p-0.5">
            {([false, true] as const).map((test) => (
              <button
                key={String(test)}
                onClick={() => chooseMode(test)}
                className={[
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                  isTest === test ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#5a6b63]",
                ].join(" ")}
              >
                {test ? "Test run" : "For approval"}
              </button>
            ))}
          </div>

          <p className={hintCls + " mt-2.5"}>
            {isTest
              ? "The same email and the same link, recorded nowhere — the draft won't be marked approved, won't lock, and won't count as awaiting approval. Approving it does create a [TEST] email in HubSpot."
              : "The reviewer gets a preview and a link to approve or request changes."}
          </p>
        </div>

        {sent ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1F4538]">Sent to {recipientEmail}</p>
            <button onClick={onClose} className="mt-5 text-sm font-medium text-[#1F4538] hover:underline">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className={labelCls + " mb-1.5"}>Reviewer</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => { setRecipientEmail(e.target.value); setTypedRecipient(true); }}
                className={inputCls}
                placeholder="reviewer@example.com"
              />
            </div>

            <div>
              <label className={labelCls + " mb-1.5"}>Notify marketing</label>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className={inputCls}
                placeholder="marketing@greatlakesmc.com"
              />
              <p className={hintCls + " mt-1"}>
                Gets the notes when the reviewer asks for a change the AI can&rsquo;t make.
              </p>
            </div>

            <div>
              <label className={labelCls + " mb-1.5"}>
                Note <span className="font-normal text-[#9aaba4]">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything they should know before they look…"
                className={inputCls + " resize-y"}
              />
              <p className={hintCls + " mt-1"}>Shown above the eblast.</p>
            </div>

            <div className="space-y-0.5 rounded-lg bg-[#f5f3ef] px-3 py-2.5 text-xs text-[#7a8c85]">
              <p><span className="font-medium text-[#5a6b63]">Community:</span> {community.displayName}</p>
              <p><span className="font-medium text-[#5a6b63]">Subject:</span> {fields.subject || "(no subject)"}</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-[#ddd8d0] py-2 text-sm text-[#5a6b63] transition-colors hover:text-[#1F4538]"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!recipientEmail.trim() || sending || isSaving}
                className="flex-1 rounded-lg bg-[#1F4538] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#173829] disabled:opacity-40"
              >
                {sending || isSaving ? "Sending…" : isTest ? "Send test" : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
