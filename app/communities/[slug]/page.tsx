"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface CommunitySender {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  isPrimary: boolean;
}

interface CommunityLogo {
  url: string;
  variant: string;
  onColor?: string;
}

interface Community {
  id: string;
  slug: string;
  displayName: string;
  shortName: string;
  brandFamily?: string | null;
  nameAbbreviation?: string | null;
  type: string;
  careTypes?: string[] | null;
  brand: { primary: string; accent: string; background: string; fontHeadline: string; fontBody: string; secondary?: string; supporting?: string[] };
  address: { street?: string; city?: string; state?: string; zip?: string };
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  trackingPhone?: string | null;
  socials?: { facebook?: string; instagram?: string; linkedin?: string; youtube?: string };
  senders: CommunitySender[];
  marketingDirector?: { name: string; email: string } | null;
  hubspot: { listId?: number; additionalListIds?: number[]; businessUnitId?: number };
  brandGuideUrl?: string | null;
  logos?: CommunityLogo[];
  photoLibrary?: Array<{ url: string; caption?: string; tags?: string[] }>;
  taglines?: string[] | null;
  amenities?: string[] | null;
  voiceNotes?: string | null;
  templates: string[];
}

export default function CommunityDetailPage() {
  const params = useParams<{ slug: string }>();
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((d) => {
        const found = d.communities.find((c: Community) => c.slug === params.slug);
        if (!found) setError(`Community "${params.slug}" not found in registry`);
        else setCommunity(found);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [params.slug]);

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#9C7A55",
    fontWeight: 500,
    margin: "0 0 6px 0",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    color: "#1F2937",
    margin: 0,
  };
  const cardStyle: React.CSSProperties = {
    background: "white",
    border: "1px solid #E5DAC1",
    padding: 20,
    marginBottom: 16,
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px" }}>
        <p>Loading community…</p>
      </main>
    );
  }

  if (error || !community) {
    return (
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px" }}>
        <p style={{ color: "#B5683E" }}>{error}</p>
        <Link href="/communities">← Back to communities</Link>
      </main>
    );
  }

  const c = community;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px" }}>
      <Link
        href="/communities"
        style={{ fontSize: 12, color: "#9C7A55", textDecoration: "none", letterSpacing: 1, textTransform: "uppercase" }}
      >
        ← All communities
      </Link>

      <header
        style={{
          marginTop: 12,
          marginBottom: 32,
          paddingBottom: 24,
          borderBottom: `2px solid ${c.brand.primary}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: c.brand.accent, margin: 0 }}>
            {c.nameAbbreviation ? `${c.nameAbbreviation} · ` : ""}
            {c.careTypes?.join(" · ") ?? c.type.replace(/_/g, " ")}
          </p>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, margin: "6px 0 4px 0", color: c.brand.primary }}>
            {c.displayName}
          </h1>
          <p style={{ fontSize: 14, color: "#5C5C5C", margin: 0 }}>
            {[c.address.street, [c.address.city, c.address.state].filter(Boolean).join(", "), c.address.zip].filter(Boolean).join(" · ") || <em style={{ color: "#B5683E" }}>address not set</em>}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            background: c.brand.background,
            border: `1px solid ${c.brand.primary}`,
            padding: "12px 16px",
          }}
        >
          {[c.brand.primary, c.brand.accent, c.brand.background].map((hex) => (
            <div key={hex} style={{ textAlign: "center", fontSize: 11, color: "#3A3A3A" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: hex,
                  border: "1px solid rgba(0,0,0,0.1)",
                  marginBottom: 4,
                }}
              />
              {hex}
            </div>
          ))}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <section style={cardStyle}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, margin: "0 0 16px 0", color: c.brand.primary }}>
            Contact &amp; identity
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <p style={labelStyle}>Phone</p>
              <p style={valueStyle}>{c.phone ?? <em style={{ color: "#B5683E" }}>not set</em>}</p>
            </div>
            <div>
              <p style={labelStyle}>Email</p>
              <p style={valueStyle}>{c.email ?? <em style={{ color: "#B5683E" }}>not set</em>}</p>
            </div>
          </div>
          <div>
            <p style={labelStyle}>Website</p>
            <p style={valueStyle}>
              {c.websiteUrl ? (
                <a href={c.websiteUrl} target="_blank" rel="noreferrer" style={{ color: c.brand.accent }}>
                  {c.websiteUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <em style={{ color: "#B5683E" }}>not set</em>
              )}
            </p>
          </div>
          {c.socials && Object.values(c.socials).some(Boolean) && (
            <div style={{ marginTop: 14 }}>
              <p style={labelStyle}>Social</p>
              <p style={valueStyle}>
                {Object.entries(c.socials)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <a key={k} href={v as string} target="_blank" rel="noreferrer" style={{ marginRight: 12, color: c.brand.accent }}>
                      {k}
                    </a>
                  ))}
              </p>
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, margin: "0 0 16px 0", color: c.brand.primary }}>
            Sending
          </h2>
          <div style={{ marginBottom: 14 }}>
            <p style={labelStyle}>From (recipients see this)</p>
            {c.senders.length === 0 ? (
              <p style={{ ...valueStyle, color: "#B5683E", fontStyle: "italic" }}>No sender configured</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {c.senders.map((s) => (
                  <li key={s.id} style={{ marginBottom: 4 }}>
                    <span style={valueStyle}>{s.name}</span>
                    {s.isPrimary && (
                      <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px", background: c.brand.background, color: c.brand.accent, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                        primary
                      </span>
                    )}
                    <div style={{ fontSize: 12, color: "#9C7A55" }}>{s.email}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {c.marketingDirector && (
            <div style={{ marginBottom: 14 }}>
              <p style={labelStyle}>Marketing director (creates eblasts)</p>
              <p style={valueStyle}>
                {c.marketingDirector.name} &lt;{c.marketingDirector.email}&gt;
              </p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <p style={labelStyle}>HubSpot list ID</p>
              <p style={valueStyle}>
                {c.hubspot.listId ?? <em style={{ color: "#B5683E" }}>not set</em>}
              </p>
            </div>
            <div>
              <p style={labelStyle}>Tracking phone (CallRail)</p>
              <p style={{ ...valueStyle, fontSize: 13 }}>
                {c.trackingPhone ?? <em style={{ color: "#B5683E" }}>not set</em>}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, margin: 0, color: c.brand.primary }}>
            Brand guide &amp; assets
          </h2>
          <p style={{ ...labelStyle, margin: 0 }}>uploaded to HubSpot Files</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <AssetSlot label="Brand guide PDF" url={c.brandGuideUrl ?? undefined} accent={c.brand.accent} />
          <AssetSlot label={`Logos (${c.logos?.length ?? 0})`} url={c.logos?.[0]?.url} accent={c.brand.accent} previewable />
          <AssetSlot
            label={`Photo library (${c.photoLibrary?.length ?? 0})`}
            url={c.photoLibrary?.[0]?.url}
            accent={c.brand.accent}
            previewable
          />
        </div>

        <p style={{ fontSize: 12, color: "#9C7A55", marginTop: 16, lineHeight: 1.6 }}>
          Upload UI ships in the next iteration. For now, drop assets into HubSpot File Manager
          under <code>/eblast-drafter/{c.slug}</code> and paste the URLs into{" "}
          <code>data/communities.ts</code>.
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, margin: "0 0 16px 0", color: c.brand.primary }}>
          Voice &amp; positioning
        </h2>

        {c.taglines && c.taglines.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={labelStyle}>Taglines</p>
            {c.taglines.map((t, i) => (
              <p key={i} style={{ ...valueStyle, fontStyle: "italic", marginBottom: 6 }}>
                &ldquo;{t}&rdquo;
              </p>
            ))}
          </div>
        )}

        {c.amenities && c.amenities.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={labelStyle}>Distinctive amenities</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#3A3A3A", fontSize: 14, lineHeight: 1.7 }}>
              {c.amenities.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {c.voiceNotes && (
          <div>
            <p style={labelStyle}>Voice notes (used by Claude when drafting)</p>
            <p style={{ ...valueStyle, lineHeight: 1.6 }}>{c.voiceNotes}</p>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <details>
          <summary style={{ fontSize: 13, cursor: "pointer", color: "#9C7A55", letterSpacing: 1, textTransform: "uppercase" }}>
            Full registry entry (JSON)
          </summary>
          <pre style={{ background: "#FBF7EE", border: "1px solid #E5DAC1", padding: 12, fontSize: 11, marginTop: 12, overflow: "auto", maxHeight: 400 }}>
            {JSON.stringify(c, null, 2)}
          </pre>
        </details>
      </section>
    </main>
  );
}

function AssetSlot({
  label,
  url,
  accent,
  previewable,
}: {
  label: string;
  url?: string;
  accent: string;
  previewable?: boolean;
}) {
  const isImage = previewable && url && !url.toLowerCase().endsWith(".pdf");
  return (
    <div
      style={{
        border: `1px dashed ${url ? accent : "#D9CDB1"}`,
        borderRadius: 4,
        padding: 14,
        background: url ? "#FBF7EE" : "#F5F1EA",
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#9C7A55",
          fontWeight: 500,
          margin: 0,
        }}
      >
        {label}
      </p>
      {url ? (
        isImage ? (
          <img src={url} alt={label} style={{ maxWidth: "100%", maxHeight: 100, objectFit: "contain", marginTop: 8 }} />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13, color: accent, marginTop: 8, wordBreak: "break-all" }}
          >
            {url.replace(/^https?:\/\//, "").slice(0, 60)}…
          </a>
        )
      ) : (
        <p style={{ fontSize: 12, color: "#9C7A55", margin: 0 }}>not set</p>
      )}
    </div>
  );
}
