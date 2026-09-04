"use client";
import { useEffect, useState } from "react";
import { latestCapture } from "@/lib/captures";
import ReviewEditModal from "../_ui/ReviewEditModal";
import UtilityBar from "../_ui/UtilityBar";

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
  const [editing, setEditing] = useState(null);
  const [allTags, setAllTags] = useState([]);
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
      setAllTags((data.tags || []).filter((t) => t.is_approved));
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
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Review Queue</h1>
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
              {sites.map((site) => (
                <ReviewRow
                  key={site.id}
                  item={site}
                  thumb={latestCapture(site.capture, "desktop")?.thumb_url}
                  fallbackName={site.domain}
                  onEdit={() => setEditing({ kind: "sites", item: { ...site, thumb: latestCapture(site.capture, "desktop")?.thumb_url } })}
                  onMarkReviewed={() => markReviewed("sites", site.id)}
                />
              ))}
            </div>
          </section>
        )}

        {components.length > 0 && (
          <section className="tag-section">
            <h2>Components to review ({components.length})</h2>
            <div className="review-list">
              {components.map((c) => (
                <ReviewRow
                  key={c.id}
                  item={c}
                  thumb={c.image_url}
                  fallbackName="Untitled component"
                  onEdit={() => setEditing({ kind: "components", item: { ...c, thumb: c.image_url } })}
                  onMarkReviewed={() => markReviewed("components", c.id)}
                />
              ))}
            </div>
          </section>
        )}

        {editing && (
          <ReviewEditModal
            item={editing.item}
            kind={editing.kind}
            allTags={allTags}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
          />
        )}

      </main>
    </>
  );
}

// One row per queue item. The whole row opens the edit modal, so a correction
// can be made without leaving the queue and losing your place.
function ReviewRow({ item, thumb, fallbackName, onEdit, onMarkReviewed }) {
  return (
    <div className="review-row" onClick={onEdit} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onEdit()}>
      <div className="review-thumb">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={item.name || fallbackName} />
        ) : (
          <div className="placeholder">No image</div>
        )}
      </div>
      <div className="review-info">
        <span className="review-name">{item.name || fallbackName}</span>
        <p className="review-summary">
          {item.summary || <span className="summary-empty">No summary — the AI pass didn't complete.</span>}
        </p>
        <div className="card-tags">
          {(item.tags || []).map((tag, i) => (
            <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
              {tag.label}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMarkReviewed();
        }}
      >
        Mark reviewed
      </button>
    </div>
  );
}
