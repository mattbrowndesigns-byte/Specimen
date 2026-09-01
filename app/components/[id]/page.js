"use client";
import { useEffect, useState, use as usePromise } from "react";
import CropTool from "../../_ui/CropTool";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

export default function ComponentDetailPage({ params }) {
  const { id } = usePromise(params);

  const [component, setComponent] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingField, setSavingField] = useState(null);
  const [recropping, setRecropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    const res = await fetch(`/api/components/${id}`);
    if (res.ok) {
      const data = await res.json();
      setComponent(data.component);
      setSummaryDraft(data.component.summary || "");
      setNotesDraft(data.component.notes || "");
      setNameDraft(data.component.name || "");
    }
  }

  async function loadTags() {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags(data.tags || []);
    }
  }

  useEffect(() => {
    load();
    loadTags();
  }, [id]);

  async function saveField(field, value) {
    setSavingField(field);
    setError(null);
    const res = await fetch(`/api/components/${id}`, {
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
    const res = await fetch(`/api/components/${id}/tags`, {
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
    const res = await fetch(`/api/components/${id}/tags/${tagId}`, { method: "DELETE" });
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

  async function handleRecrop(cropRect) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/components/${id}/recrop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cropRect }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Re-crop failed");
      return;
    }
    setRecropping(false);
    await load();
  }

  async function handleDelete() {
    if (!confirm("Delete this component?")) return;
    const res = await fetch(`/api/components/${id}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/";
    }
  }

  if (!component) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (component.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(component.tags || []).some((ct) => ct.id === t.id)
    ),
  }));

  return (
    <main className="page detail-page">
      <div className="top-nav">
        <a href="/">← Back to library</a>
        {component.needs_review && (
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
          onBlur={() => nameDraft !== component.name && saveField("name", nameDraft)}
        />
        <div className="detail-actions">
          <a className="visit-btn" href={component.source_url} target="_blank" rel="noopener noreferrer">
            Visit source ↗
          </a>
          {!recropping && <button onClick={() => setRecropping(true)}>Edit crop</button>}
          <button onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <p className="meta-line">Saved {new Date(component.created_at).toLocaleDateString()}</p>

      {recropping ? (
        <CropTool
          imageUrl={component.source_image_url}
          initialRect={component.crop_rect}
          onCancel={() => setRecropping(false)}
          onSave={handleRecrop}
          saving={saving}
        />
      ) : (
        <div className="detail-capture component-detail-capture">
          {component.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={component.image_url} alt={component.name || "Component"} />
          ) : (
            <div className="placeholder">Processing…</div>
          )}
        </div>
      )}

      <section className="detail-section">
        <h2>Summary</h2>
        <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={3} />
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
    </main>
  );
}
