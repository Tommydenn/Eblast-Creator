"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/Card";
import type { Address } from "@/lib/db/schema";

interface Props {
  slug: string;
  initialDisplayName: string;
  initialAddress: Address;
  /** Where this community holds its events, when that is not where it is. */
  initialEventsAddress: Address | null;
  initialUseEventsAddress: boolean;
  initialTrackingPhone: string | null;
  initialWebsiteUrl: string | null;
}

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";

export function ContactPanel({
  slug,
  initialDisplayName,
  initialAddress,
  initialEventsAddress,
  initialUseEventsAddress,
  initialTrackingPhone,
  initialWebsiteUrl,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [street, setStreet] = useState(initialAddress.street ?? "");
  const [city, setCity] = useState(initialAddress.city ?? "");
  const [state, setState] = useState(initialAddress.state ?? "");
  const [zip, setZip] = useState(initialAddress.zip ?? "");
  const [useVenue, setUseVenue] = useState(initialUseEventsAddress);
  const [venueStreet, setVenueStreet] = useState(initialEventsAddress?.street ?? "");
  const [venueCity, setVenueCity] = useState(initialEventsAddress?.city ?? "");
  const [venueState, setVenueState] = useState(initialEventsAddress?.state ?? "");
  const [venueZip, setVenueZip] = useState(initialEventsAddress?.zip ?? "");
  const [trackingPhone, setTrackingPhone] = useState(initialTrackingPhone ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");

  function handleCancel() {
    setDisplayName(initialDisplayName);
    setStreet(initialAddress.street ?? "");
    setCity(initialAddress.city ?? "");
    setState(initialAddress.state ?? "");
    setZip(initialAddress.zip ?? "");
    setUseVenue(initialUseEventsAddress);
    setVenueStreet(initialEventsAddress?.street ?? "");
    setVenueCity(initialEventsAddress?.city ?? "");
    setVenueState(initialEventsAddress?.state ?? "");
    setVenueZip(initialEventsAddress?.zip ?? "");
    setTrackingPhone(initialTrackingPhone ?? "");
    setWebsiteUrl(initialWebsiteUrl ?? "");
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || initialDisplayName,
          address: {
            street: street.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            zip: zip.trim() || undefined,
          },
          eventsAddress: {
            street: venueStreet.trim() || undefined,
            city: venueCity.trim() || undefined,
            state: venueState.trim() || undefined,
            zip: venueZip.trim() || undefined,
          },
          useEventsAddress: useVenue,
          trackingPhone: trackingPhone.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const na = <span className="text-clay-600">not set</span>;

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Display name</SectionLabel>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-sand-400 hover:text-sand-700 transition-colors"
          >
            Edit
          </button>
        </div>
        <p className="text-sm text-sand-900">{displayName}</p>

        <div>
          <SectionLabel>Address</SectionLabel>
          <p className="mt-0.5 text-sm text-sand-900">
            {(street || city || state || zip)
              ? [street, city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean).join(" · ")
              : na}
          </p>
        </div>

        {useVenue && (
          <div>
            <SectionLabel>Events are held at</SectionLabel>
            <p className="mt-0.5 text-sm text-sand-900">
              {[venueStreet, venueCity && venueState ? venueCity + ", " + venueState : venueCity || venueState, venueZip]
                .filter(Boolean)
                .join(" · ") || na}
            </p>
            <p className="mt-0.5 text-xs text-sand-500">Eblasts print this instead of the address above.</p>
          </div>
        )}

        <div>
          <SectionLabel className="text-forest-700">Tracking phone (CallRail)</SectionLabel>
          <p className="mt-0.5 text-sm font-medium text-forest-700">{trackingPhone || na}</p>
        </div>

        <div>
          <SectionLabel>Website</SectionLabel>
          <p className="mt-0.5 text-sm text-sand-900">
            {websiteUrl
              ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
              : na}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel>Display name</SectionLabel>
        <input
          className={`mt-1 ${INPUT}`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
        />
      </div>

      <div>
        <SectionLabel>Address</SectionLabel>
        <div className="mt-1 space-y-2">
          <input className={INPUT} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" />
          <div className="grid grid-cols-3 gap-2">
            <input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <input className={INPUT} value={state} onChange={(e) => setState(e.target.value)} placeholder="State" maxLength={2} />
            <input className={INPUT} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" />
          </div>
        </div>
      </div>

      {/* A community that runs its events somewhere else — a sales office,
          a venue down the road — needs the eblast to print where people
          should actually turn up. Kept separate from the address above so
          switching it off does not lose it. */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useVenue}
            onChange={(e) => setUseVenue(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-sand-300 text-forest-600 focus:ring-forest-600/20"
          />
          <SectionLabel>Events are held somewhere else</SectionLabel>
        </label>
        {useVenue && (
          <div className="mt-1 space-y-2">
            <input className={INPUT} value={venueStreet} onChange={(e) => setVenueStreet(e.target.value)} placeholder="Street" />
            <div className="grid grid-cols-3 gap-2">
              <input className={INPUT} value={venueCity} onChange={(e) => setVenueCity(e.target.value)} placeholder="City" />
              <input className={INPUT} value={venueState} onChange={(e) => setVenueState(e.target.value)} placeholder="State" maxLength={2} />
              <input className={INPUT} value={venueZip} onChange={(e) => setVenueZip(e.target.value)} placeholder="ZIP" />
            </div>
            <p className="text-xs text-sand-500">Eblasts print this instead of the address above.</p>
          </div>
        )}
      </div>

      <div>
        <SectionLabel className="text-forest-700">Tracking phone</SectionLabel>
        <input className={`mt-1 ${INPUT}`} value={trackingPhone} onChange={(e) => setTrackingPhone(e.target.value)} placeholder="(555) 000-0000" />
      </div>

      <div>
        <SectionLabel>Website URL</SectionLabel>
        <input className={`mt-1 ${INPUT}`} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-forest-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
