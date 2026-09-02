"use client";
import { useEffect, useState, use as usePromise } from "react";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

function archiveUrl(url, savedAt) {
  const d = new Date(savedAt);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
  return `https://web.archive.org/web/${stamp}/${url}`;
}

export default function SiteDetailPage({ params }) {
  const { id } = usePromise(params);

  const [site, setSite] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [components, setComponents] = useState([]);
  const [viewport, setViewport] = useState("desktop");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingField, setSavingField] = useState(null);
  const [recapturing, setRecapturing] = useState(false);
  const [error, setError] = useState(null);
  const [promoting, setPromoting] = useState(null);
  const [promoted, setPromoted] = useState({});

  async function load() {
    const res = await fetch(`/api/sites/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSite(data.site);
      setSummaryDraft(data.site.summary || "");
      setNotesDraft(data.site.notes || "");
      setNameDraft(data.site.name || "");
    }
  }

  async function loadTags() {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags(data.tags || []);
    }
  }

  async function loadComponents() {
    const res = await fetch(`/api/components?siteId=${id}`);
    if (res.ok) {
      const data = await res.json();
      setComponents(data.components || []);
    }
  }

  useEffect(() => {
    load();
    loadTags();
    loadComponents();
  }, [id]);

  useEffect(() => {
    if (!recapturing) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [recapturing]);

  async function saveField(field, value) {
    setSavingField(field);
    setError(null);
    const res = await fetch(`/api/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSavingField(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
      return;
    }
    await load();
  }

  async function addTag(facet, tagId) {
    if (!tagId) return;
    setError(null);
    const res = await fetch(`/api/sites/${id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add tag");
      return;
    }
    await load();
  }

  async function removeTag(tagId) {
    setError(null);
    const res = await fetch(`/api/sites/${id}/tags/${tagId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to remove tag");
      return;
    }
    await load();
  }

  async function markReviewed() {
    await saveField("needs_review", false);
  }

  async function promotePage(page) {
    setPromoting(page.id);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: page.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to promote page");
        return;
      }
      setPromoted((prev) => ({ ...prev, [page.id]: data.site.id }));
    } finally {
      setPromoting(null);
    }
  }

  async function recapture() {
    setError(null);
    setRecapturing(true);
    const res = await fetch(`/api/sites/${id}/recapture`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to start re-capture");
      setRecapturing(false);
    }
  }

  if (!site) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  const pageTypeLabel = (slug) => {
    if (!slug) return "Unclassified";
    const match = allTags.find((t) => t.facet === "page_type" && t.slug === slug);
    return match?.label || slug;
  };

  const pagesByType = new Map();
  for (const page of site.pages || []) {
    const key = page.page_type || "";
    if (!pagesByType.has(key)) pagesByType.set(key, []);
    pagesByType.get(key).push(page);
  }
  const pageGroups = [...pagesByType.entries()].sort((a, b) => pageTypeLabel(a[0]).localeCompare(pageTypeLabel(b[0])));

  const capture = (site.capture || []).find((c) => c.viewport === viewport);
  const hasMobile = (site.capture || []).some((c) => c.viewport === "mobile");
  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (site.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(site.tags || []).some((st) => st.id === t.id)
    ),
  }));

  return (
    <main className="page detail-page">
      <div className="top-nav">
        <a href="/">← Back to library</a>
        {site.needs_review && (
          <button className="mark-reviewed" onClick={markReviewed}>
            Mark reviewed
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="detail-header">
        <input
          className="name-input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft !== site.name && saveField("name", nameDraft)}
        />
        <div className="detail-actions">
          <a className="visit-btn" href={site.url} target="_blank" rel="noopener noreferrer">
            Visit site ↗
          </a>
          <button onClick={recapture} disabled={recapturing}>
            {recapturing ? "Re-capturing…" : "Re-capture"}
          </button>
        </div>
      </div>

      <p className="meta-line">
        Saved {new Date(site.saved_at).toLocaleDateString()} ·{" "}
        <a href={archiveUrl(site.url, site.saved_at)} target="_blank" rel="noopener noreferrer">
          View on the Wayback Machine
        </a>
      </p>

      <div className="capture-panel">
        {hasMobile && (
          <div className="viewport-toggle">
            <button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")}>
              Desktop
            </button>
            <button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")}>
              Mobile
            </button>
          </div>
        )}

        <div className="detail-capture">
          {capture?.full_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capture.full_url} alt={site.name} />
          ) : (
            <div className="placeholder">{recapturing ? "Capturing…" : "No capture yet"}</div>
          )}
        </div>
      </div>

      <section className="detail-section">
        <h2>Summary</h2>
        <textarea
          value={summaryDraft}
          onChange={(e) => setSummaryDraft(e.target.value)}
          rows={4}
        />
        <button disabled={savingField === "summary"} onClick={() => saveField("summary", summaryDraft)}>
          {savingField === "summary" ? "Saving…" : "Save summary"}
        </button>
      </section>

      <section className="detail-section">
        <h2>Tags</h2>
        {tagsByFacet.map(({ facet, assigned, available }) => (
          <div className="facet-row" key={facet}>
            <span className="facet-name">{FACET_LABELS[facet]}</span>
            <div className="facet-tags">
              {assigned.map((tag) => (
                <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={tag.id}>
                  {tag.label}
                  <button className="chip-remove" onClick={() => removeTag(tag.id)}>
                    ×
                  </button>
                </span>
              ))}
              {available.length > 0 && (
                <select defaultValue="" onChange={(e) => addTag(facet, e.target.value)}>
                  <option value="" disabled>
                    + Add…
                  </option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="detail-section">
        <h2>Notes</h2>
        <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={4} />
        <button disabled={savingField === "notes"} onClick={() => saveField("notes", notesDraft)}>
          {savingField === "notes" ? "Saving…" : "Save notes"}
        </button>
      </section>

      {pageGroups.length > 0 && (
        <section className="detail-section">
          <h2>Discovered pages</h2>
          {pageGroups.map(([typeSlug, pages]) => (
            <div className="page-group" key={typeSlug || "none"}>
              <h3>{pageTypeLabel(typeSlug)}</h3>
              <ul className="page-list">
                {pages.map((page) => (
                  <li key={page.id}>
                    <a href={page.url} target="_blank" rel="noopener noreferrer">
                      {page.label || page.url}
                    </a>
                    {promoted[page.id] ? (
                      <a className="promote-link" href={`/sites/${promoted[page.id]}`}>
                        View full capture →
                      </a>
                    ) : (
                      <button
                        className="promote-btn"
                        disabled={promoting === page.id}
                        onClick={() => promotePage(page)}
                      >
                        {promoting === page.id ? "Capturing…" : "Promote to full capture"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {components.length > 0 && (
        <section className="detail-section">
          <h2>Components from this site</h2>
          <div className="grid">
            {components.map((c) => (
              <a className="card component-card" key={c.id} href={`/components/${c.id}`}>
                <div className="thumb">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name || "Component"} />
                  ) : (
                    <div className="placeholder">Processing…</div>
                  )}
                </div>
                <div className="card-footer">
                  <span className="name">{c.name || "Untitled component"}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
