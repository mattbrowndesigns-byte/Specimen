"use client";
import { useEffect, useState } from "react";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};

export default function ReviewPage() {
  const [sites, setSites] = useState([]);
  const [components, setComponents] = useState([]);
  const [pendingTags, setPendingTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    const [sitesRes, componentsRes, tagsRes] = await Promise.all([
      fetch("/api/sites"),
      fetch("/api/components"),
      fetch("/api/tags"),
    ]);
    if (sitesRes.ok) {
      const data = await sitesRes.json();
      setSites((data.sites || []).filter((s) => s.needs_review));
    }
    if (componentsRes.ok) {
      const data = await componentsRes.json();
      setComponents((data.components || []).filter((c) => c.needs_review));
    }
    if (tagsRes.ok) {
      const data = await tagsRes.json();
      setPendingTags((data.tags || []).filter((t) => !t.is_approved));
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function markReviewed(kind, id) {
    setError(null);
    const res = await fetch(`/api/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ needs_review: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update");
      return;
    }
    await load();
  }

  async function updateTag(id, patch) {
    setError(null);
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Update failed");
      return;
    }
    await load();
  }

  async function rejectTag(id) {
    setError(null);
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  const nothingToReview = loaded && sites.length === 0 && components.length === 0 && pendingTags.length === 0;

  return (
    <main className="page">
      <div className="top-nav">
        <h1>Review Queue</h1>
        <a href="/">← Back to library</a>
      </div>

      {error && <p className="error">{error}</p>}

      {nothingToReview && <p className="empty-small">Nothing needs review right now.</p>}

      {pendingTags.length > 0 && (
        <section className="tag-section">
          <h2>Pending tags ({pendingTags.length})</h2>
          <div className="tag-list">
            {pendingTags.map((tag) => (
              <div className="tag-row" key={tag.id}>
                <span className="tag-facet">{FACET_LABELS[tag.facet]}</span>
                <span className="tag-label">{tag.label}</span>
                <div className="tag-actions">
                  <button onClick={() => updateTag(tag.id, { is_approved: true })}>Approve</button>
                  <button onClick={() => rejectTag(tag.id)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sites.length > 0 && (
        <section className="tag-section">
          <h2>Sites to review ({sites.length})</h2>
          <div className="review-list">
            {sites.map((site) => {
              const thumb = (site.capture || []).find((c) => c.viewport === "desktop")?.thumb_url;
              return (
                <div className="review-row" key={site.id}>
                  <div className="review-thumb">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={site.name} />
                    ) : (
                      <div className="placeholder">No image</div>
                    )}
                  </div>
                  <div className="review-info">
                    <a href={`/sites/${site.id}`}>{site.name || site.domain}</a>
                    {site.summary && <p className="review-summary">{site.summary}</p>}
                    <div className="card-tags">
                      {(site.tags || []).map((tag, i) => (
                        <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => markReviewed("sites", site.id)}>Mark reviewed</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {components.length > 0 && (
        <section className="tag-section">
          <h2>Components to review ({components.length})</h2>
          <div className="review-list">
            {components.map((c) => (
              <div className="review-row" key={c.id}>
                <div className="review-thumb">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name || "Component"} />
                  ) : (
                    <div className="placeholder">No image</div>
                  )}
                </div>
                <div className="review-info">
                  <a href={`/components/${c.id}`}>{c.name || "Untitled component"}</a>
                  {c.summary && <p className="review-summary">{c.summary}</p>}
                  <div className="card-tags">
                    {(c.tags || []).map((tag, i) => (
                      <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => markReviewed("components", c.id)}>Mark reviewed</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
