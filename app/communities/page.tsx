// Community list (control center).
// Read-only summary of every community in the registry. Click into a row to
// edit / upload assets / see past sends.

import Link from "next/link";
import { listCommunities } from "@/data/communities";

export const dynamic = "force-dynamic";

export default function CommunitiesPage() {
  const communities = listCommunities();

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#9C7A55",
    fontWeight: 500,
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px" }}>
      <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ ...labelStyle, margin: 0 }}>Eblast Drafter</p>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, margin: "6px 0 4px 0", color: "#1F4538" }}>
            Communities
          </h1>
          <p style={{ fontSize: 15, color: "#5C5C5C", maxWidth: 720, lineHeight: 1.6 }}>
            {communities.length} registered. Click a community to manage brand guide, photo library,
            sender details, recipient lists, and review past eblasts.
          </p>
        </div>
        <Link
          href="/"
          style={{
            background: "#1F4538",
            color: "white",
            border: 0,
            padding: "12px 22px",
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          ← Back to drafter
        </Link>
      </header>

      <section style={{ background: "white", border: "1px solid #E5DAC1" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 80px minmax(0, 1.4fr) minmax(0, 1.4fr) 90px",
            padding: "12px 20px",
            background: "#FBF7EE",
            borderBottom: "1px solid #E5DAC1",
            ...labelStyle,
          }}
        >
          <span>Community</span>
          <span>Abbr.</span>
          <span>Sender</span>
          <span>HubSpot</span>
          <span style={{ textAlign: "right" }}>Assets</span>
        </div>

        {communities.map((c) => {
          const assetSummary = [
            c.brandGuideUrl ? "guide" : null,
            c.logoUrl ? "logo" : null,
            c.photoLibrary?.length ? `${c.photoLibrary.length} photo${c.photoLibrary.length === 1 ? "" : "s"}` : null,
          ].filter(Boolean).join(" · ") || "—";

          return (
            <Link
              key={c.slug}
              href={`/communities/${c.slug}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) 80px minmax(0, 1.4fr) minmax(0, 1.4fr) 90px",
                padding: "16px 20px",
                borderBottom: "1px solid #F0E8D6",
                textDecoration: "none",
                color: "inherit",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, color: "#1F4538" }}>{c.displayName}</div>
                <div style={{ fontSize: 12, color: "#9C7A55", marginTop: 2 }}>
                  {c.address.city}, {c.address.state} · {c.careTypes?.join(", ") ?? c.type.replace(/_/g, " ")}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#3A3A3A", fontFamily: "monospace" }}>
                {c.nameAbbreviation ?? <span style={{ color: "#B5683E" }}>—</span>}
              </div>
              <div style={{ fontSize: 13, color: "#3A3A3A" }}>
                <div>{c.sender.name}</div>
                <div style={{ fontSize: 11, color: "#9C7A55" }}>{c.sender.email}</div>
              </div>
              <div style={{ fontSize: 13, color: "#3A3A3A" }}>
                {c.hubspot.listId ? (
                  <div>List <code>{c.hubspot.listId}</code></div>
                ) : (
                  <div style={{ color: "#B5683E" }}>list not set</div>
                )}
                {c.hubspot.activeDomain && (
                  <div style={{ fontSize: 11, color: "#9C7A55", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.hubspot.activeDomain}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "#9C7A55" }}>{assetSummary}</div>
            </Link>
          );
        })}
      </section>

      <section style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, color: "#9C7A55", lineHeight: 1.6 }}>
          Need to add a community? Edit <code>data/communities.ts</code> and push. The dashboard
          reads from that file as the source of truth — uploads (brand guide, photos) get hosted
          on HubSpot Files and the URLs are stored back in the registry entry.
        </p>
      </section>
    </main>
  );
}
