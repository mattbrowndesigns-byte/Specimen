"use client";
import { useEffect, useState, use as usePromise } from "react";
import CropTool from "../../_ui/CropTool";
import TagCombobox from "../../_ui/TagCombobox";
import UtilityBar from "../../_ui/UtilityBar";
import RelatedSection from "../../_ui/RelatedSection";
import SaveActions from "../../_ui/SaveActions";
import Favicon from "../../_ui/Favicon";

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
  const [viewport, setViewport] = useState("desktop");
  const [editingSummary, setEditingSummary] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function regenerateSummary() {
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/components/${id}/enrich`, { method: "POST" });
    setRegenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't regenerate the description");
      return;
    }
    setEditingSummary(false);
    await load();
    await loadTags();
  }

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

  async function createTag(facet, label) {
    setError(null);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facet, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create tag");
      return;
    }
    await addTag(facet, data.tag.id);
    await loadTags();
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
      body: JSON.stringify({ cropRect, viewport }),
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
      <>
        <UtilityBar onError={setError} />
        <main className="page detail-page">
          <p>Loading…</p>
        </main>
      </>
    );
  }

  const activeImage = viewport === "mobile" ? component.mobile_image_url : component.image_url;
  const activeSource =
    viewport === "mobile" ? component.mobile_source_image_url : component.source_image_url;
  const canCropHere = Boolean(activeSource);

  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (component.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(component.tags || []).some((ct) => ct.id === t.id)
    ),
  }));

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page detail-page">
        {error && <p className="error">{error}</p>}

        <div className="detail-header">
          <Favicon
            url={component.source_url}
            faviconUrl={component.favicon_url}
            fills={component.favicon_fills !== false}
            alt={component.name || "Component"}
          />
          <input
            className="name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft !== component.name && saveField("name", nameDraft)}
          />
          <div className="detail-actions">
            <SaveActions
              className="detail-save-actions"
              kind="component"
              id={component.id}
              name={component.name || "Untitled component"}
              isFavorite={component.is_favorite}
            />
            {component.needs_review && <button onClick={markReviewed}>Mark reviewed</button>}
            <a className="visit-btn" href={component.source_url} target="_blank" rel="noopener noreferrer">
              Visit source ↗
            </a>
            <button onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <p className="meta-line">Saved {new Date(component.created_at).toLocaleDateString()}</p>

        {/* Crop on the left, the record's fields on the right. Cropping drops
            back to one column -- the crop tool needs the full width to draw a
            region on a full-page screenshot. */}
        <div className={`detail-columns${recropping ? " detail-columns-single" : ""}`}>
          <div className="detail-main">
            <div className="capture-panel">
              <div className="viewport-toggle">
                <button
                  className={viewport === "desktop" ? "active" : ""}
                  onClick={() => {
                    setViewport("desktop");
                    setRecropping(false);
                  }}
                >
                  Desktop
                </button>
                <button
                  className={viewport === "mobile" ? "active" : ""}
                  onClick={() => {
                    setViewport("mobile");
                    setRecropping(false);
                  }}
                >
                  Mobile
                </button>
              </div>

              {recropping ? (
                <CropTool
                  imageUrl={viewport === "mobile" ? component.mobile_source_image_url : component.source_image_url}
                  initialRect={viewport === "mobile" ? component.mobile_crop_rect : component.crop_rect}
                  onCancel={() => setRecropping(false)}
                  onSave={handleRecrop}
                  saving={saving}
                />
              ) : (
                <>
                  <div className="detail-capture component-detail-capture">
                    {activeImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activeImage} alt={component.name || "Component"} />
                    ) : (
                      <div className="placeholder">
                        {viewport === "mobile"
                          ? component.mobile_source_image_url
                            ? "No mobile crop yet."
                            : "No mobile screenshot was captured for this component."
                          : "Processing…"}
                      </div>
                    )}
                  </div>

                  {canCropHere && (
                    <button className="capture-expand" onClick={() => setRecropping(true)}>
                      {activeImage ? `Edit ${viewport} crop` : `Add ${viewport} crop`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <aside className="detail-side">
            <section className="detail-section">
              <div className="section-head">
                <h2>AI summary</h2>
                {!editingSummary && (
                  <div className="section-head-actions">
                    <button onClick={() => setEditingSummary(true)}>Edit</button>
                    <button onClick={regenerateSummary} disabled={regenerating}>
                      {regenerating ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                )}
              </div>

              {editingSummary ? (
                <>
                  <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={3} />
                  <div className="section-head-actions">
                    <button
                      className="primary"
                      disabled={savingField === "summary"}
                      onClick={async () => {
                        await saveField("summary", summaryDraft);
                        setEditingSummary(false);
                      }}
                    >
                      {savingField === "summary" ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setSummaryDraft(component.summary || "");
                        setEditingSummary(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="summary-text">
                  {component.summary || (
                    <span className="summary-empty">
                      No summary yet — use Regenerate to describe this crop.
                    </span>
                  )}
                </p>
              )}
            </section>

            <section className="detail-section">
              <h2>Tags</h2>
              {tagsByFacet.map(({ facet, assigned, available }) => (
                <div className="facet-row" key={facet}>
                  <span className="facet-name">{FACET_LABELS[facet]}</span>
                  <TagCombobox
                    assigned={assigned}
                    available={available}
                    onAdd={(tagId) => addTag(facet, tagId)}
                    onRemove={removeTag}
                    onCreate={(label) => createTag(facet, label)}
                  />
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
          </aside>
        </div>

        <RelatedSection kind="component" item={component} />
      </main>
    </>
  );
}
