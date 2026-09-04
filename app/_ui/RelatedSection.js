"use client";
import { useEffect, useState } from "react";
import { latestCapture } from "@/lib/captures";
import { rankRelated } from "@/lib/related";

// Closes out a detail page with the nearest few records in the library.
// Ranking is client-side against the full lists: the library is one person's,
// so it's tens of records, and fetching them beats adding a search endpoint
// that would have to reimplement the same scoring in SQL.
export default function RelatedSection({ kind, item }) {
  const [related, setRelated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sitesRes, componentsRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/components"),
      ]);
      const pool = [];
      if (sitesRes.ok) {
        const data = await sitesRes.json();
        for (const site of data.sites || []) pool.push({ kind: "site", item: site });
      }
      if (componentsRes.ok) {
        const data = await componentsRes.json();
        for (const c of data.components || []) pool.push({ kind: "component", item: c });
      }
      if (!cancelled) setRelated(rankRelated({ kind, item }, pool));
    }
    load();
    return () => {
      cancelled = true;
    };
    // Keyed on identity plus the tag set rather than the object, so a tag edit
    // re-ranks but an unrelated re-render doesn't refetch.
  }, [kind, item.id, (item.tags || []).map((t) => t.id).join(",")]);

  if (!related || related.length === 0) return null;

  return (
    <section className="detail-section related-section">
      <h2>Related</h2>
      <p className="related-hint">Closest matches by shared tags, then by wording in common.</p>
      <div className="grid">
        {related.map((entry) => {
          const href = entry.kind === "site" ? `/sites/${entry.item.id}` : `/components/${entry.item.id}`;
          const thumb =
            entry.kind === "site"
              ? latestCapture(entry.item.capture, "desktop")?.thumb_url
              : entry.item.image_url;
          const name = entry.item.name || entry.item.domain || "Untitled";
          return (
            <div className="card" key={`${entry.kind}-${entry.item.id}`}>
              <a className="thumb" href={href}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={name} />
                ) : (
                  <div className="placeholder">No image</div>
                )}
              </a>
              <div className="card-footer">
                <a className="name" href={href} title={entry.item.summary || undefined}>
                  {name}
                </a>
                <span className="related-kind">{entry.kind}</span>
              </div>
              <p className="related-reason">
                {entry.sharedTagCount > 0
                  ? `${entry.sharedTagCount} shared tag${entry.sharedTagCount === 1 ? "" : "s"}`
                  : "Similar wording"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
