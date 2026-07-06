"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SegmentInfo {
  id: number;
  name: string;
}

interface Props {
  slug: string;
  initialIncluded: SegmentInfo[];
  initialExcluded: SegmentInfo[];
}

export function SegmentManager({ slug, initialIncluded, initialExcluded }: Props) {
  const router = useRouter();
  const [included, setIncluded] = useState(initialIncluded);
  const [excluded, setExcluded] = useState(initialExcluded);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Detect whether names resolved — if every name is a bare number, the
  // crm.lists.read scope is missing and we fell back to showing IDs.
  const allSegments = [...initialIncluded, ...initialExcluded];
  const namesAreIds = allSegments.length > 0 && allSegments.every((s) => /^\d+$/.test(s.name));

  async function persist(newIncluded: SegmentInfo[], newExcluded: SegmentInfo[]) {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/communities/${slug}/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includedListIds: newIncluded.map((s) => s.id),
          excludedListIds: newExcluded.map((s) => s.id),
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        router.refresh();
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }

  function moveToExcluded(seg: SegmentInfo) {
    const newIncluded = included.filter((s) => s.id !== seg.id);
    const newExcluded = [...excluded, seg];
    setIncluded(newIncluded);
    setExcluded(newExcluded);
    void persist(newIncluded, newExcluded);
  }

  function moveToIncluded(seg: SegmentInfo) {
    const newExcluded = excluded.filter((s) => s.id !== seg.id);
    const newIncluded = [...included, seg];
    setIncluded(newIncluded);
    setExcluded(newExcluded);
    void persist(newIncluded, newExcluded);
  }

  return (
    <div className="space-y-3">
      {namesAreIds && (
        <p className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-800">
          Segment names need the{" "}
          <code className="font-mono font-semibold">crm.lists.read</code> scope on your HubSpot
          Private App — add it in HubSpot → Settings → Integrations → Private Apps.
          IDs are shown for now; segments still work correctly for sending.
        </p>
      )}

      <p className="text-[10.5px] text-sand-400">
        {saveStatus === "saving"
          ? "Saving…"
          : saveStatus === "saved"
          ? "Saved — will apply on next push."
          : saveStatus === "error"
          ? "Save failed — check your connection."
          : "Click any segment chip to move it between included and excluded."}
      </p>

      <SegmentGroup
        label="Included — send to"
        count={included.length}
        segments={included}
        tone="include"
        emptyMsg="No segments set to include."
        actionLabel="→ move to excluded"
        onClickSegment={moveToExcluded}
      />

      <SegmentGroup
        label="Excluded — suppress"
        count={excluded.length}
        segments={excluded}
        tone="exclude"
        emptyMsg="No segments being suppressed."
        actionLabel="← move to included"
        onClickSegment={moveToIncluded}
      />
    </div>
  );
}

function SegmentGroup({
  label,
  count,
  segments,
  tone,
  emptyMsg,
  actionLabel,
  onClickSegment,
}: {
  label: string;
  count: number;
  segments: SegmentInfo[];
  tone: "include" | "exclude";
  emptyMsg: string;
  actionLabel: string;
  onClickSegment: (seg: SegmentInfo) => void;
}) {
  const chipBase =
    tone === "include"
      ? "border-forest-200 bg-forest-50/60 text-forest-800"
      : "border-clay-200 bg-clay-50/60 text-clay-800";
  const chipHover =
    tone === "include"
      ? "hover:border-clay-300 hover:bg-clay-50 hover:text-clay-700"
      : "hover:border-forest-300 hover:bg-forest-50 hover:text-forest-700";

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sand-500">
        {label}
        <span className="ml-1.5 font-normal text-sand-400">· {count}</span>
      </p>
      {segments.length === 0 ? (
        <p className="text-xs text-sand-400">{emptyMsg}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => onClickSegment(seg)}
              title={actionLabel}
              className={`group/chip flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${chipBase} ${chipHover} cursor-pointer`}
            >
              <span>{seg.name}</span>
              <span className="opacity-0 text-[10px] group-hover/chip:opacity-70 transition-opacity">
                {tone === "include" ? "→" : "←"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
