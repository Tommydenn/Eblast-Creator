"use client";

import React, { useState } from "react";
import { useDraft } from "@/context/DraftContext";

interface Props {
  onClose: () => void;
}

export default function ApprovalModal({ onClose }: Props) {
  const { fields, community, buildHtml, save, isSaving } = useDraft();
  const [recipientEmail, setRecipientEmail] = useState("jwalls@greatlakesmc.com");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fields || !community) return null;

  async function handleSend() {
    if (!recipientEmail.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await save();
      const html = buildHtml();
      const res = await fetch("/api/send-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          notes: notes.trim(),
          communitySlug: community!.slug,
          communityName: community!.displayName,
          subject: fields!.subject,
          html,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response" }));
      if (data.ok) {
        setSent(true);
      } else {
        setError(data.error ?? "Failed to send approval request.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-[#f0ede7]">
          <h2 className="text-base font-semibold text-[#1F4538]">Send for Approval</h2>
          <p className="mt-1 text-xs text-[#7a8c85]">
            An email preview will be sent to the reviewer with a link to approve or request changes.
          </p>
        </div>

        {sent ? (
          <div className="px-6 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1F4538]">Approval request sent!</p>
            <p className="mt-1 text-xs text-[#7a8c85]">We notified {recipientEmail}.</p>
            <button
              onClick={onClose}
              className="mt-5 text-sm font-medium text-[#1F4538] hover:underline"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">
                Reviewer Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538]"
                placeholder="reviewer@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">
                Notes <span className="normal-case font-normal text-[#9aaba4]">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] resize-none"
                placeholder="Any context for the reviewer…"
              />
            </div>

            <div className="bg-[#f5f3ef] rounded-lg px-3 py-2.5 text-xs text-[#7a8c85] space-y-0.5">
              <p><span className="font-medium text-[#5a6b63]">Community:</span> {community.displayName}</p>
              <p><span className="font-medium text-[#5a6b63]">Subject:</span> {fields.subject || "(no subject)"}</p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-[#ddd8d0] text-sm text-[#5a6b63] hover:text-[#1F4538] py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!recipientEmail.trim() || sending || isSaving}
                className="flex-1 rounded-lg bg-[#1F4538] text-white text-sm font-semibold py-2 hover:bg-[#173829] transition-colors disabled:opacity-40"
              >
                {sending || isSaving ? "Sending…" : "Send for approval"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
