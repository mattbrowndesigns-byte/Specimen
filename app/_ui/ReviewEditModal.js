"use client";
import { useState } from "react";
import TagCombobox from "./TagCombobox";
import ModalShell from "./ModalShell";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

// Lets a queue item be corrected without leaving the queue: name, summary,
// notes and tags, then mark it reviewed. `kind` is "sites" or "components",
// which is also the API path segment for both.
export default function ReviewEditModal({ item, kind, allTags, onClose, onSaved }) {
  const [name, setName] = useState(item.name || "");
  const [summary, setSummary] = useState(item.summary || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [tags, setTags] = useState(item.tags || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function refreshTags() {
    const res = await fetch(`/api/${kind}/${item.id}`);
    if (res.ok) {
      const data = await res.json();
      setTags((kind === "sites" ? data.site : data.component).tags || []);
    }
  }

  async function addTag(tagId) {
    await fetch(`/api/${kind}/${item.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    await refreshTags();
  }

  async function removeTag(tagId) {
    await fetch(`/api/${kind}/${item.id}/tags/${tagId}`, { method: "DELETE" });
    await refreshTags();
  }

  async function createTag(facet, label) {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facet, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't create that tag");
      return;
    }
    await addTag(data.tag.id);
  }

  // Saving fields also clears needs_review, which is the point of the queue:
  // an edit is the review. "Save and keep in queue" is there for when you
  // want to fix a typo now and come back to it.
  async function save({ markReviewed }) {
    setBusy(true);
    setError(null);
    const body = { name, summary, notes };
    if (!markReviewed) body.needs_review = true;

    const res = await fetch(`/api/${kind}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't save those changes");
      return;
    }
    onSaved();
  }

  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: tags.filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !tags.some((at) => at.id === t.id),
    ),
  }));

  const detailHref = kind === "sites" ? `/sites/${item.id}` : `/components/${item.id}`;

  return (
    <ModalShell label="Review item" wide onClose={onClose}>
      <div className="modal-head">
        <h2>Review</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="modal-body">
        {error && <p className="error">{error}</p>}

        <div className="review-modal-top">
          {item.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="review-modal-thumb" src={item.thumb} alt={name} />
          )}
          <div className="review-modal-fields">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <a className="review-modal-link" href={detailHref}>
              Open full detail page →
            </a>
          </div>
        </div>

        <label className="field">
          <span>AI summary</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
        </label>

        <div className="field">
          <span>Tags</span>
          {tagsByFacet.map(({ facet, assigned, available }) => (
            <div className="facet-row" key={facet}>
              <span className="facet-name">{FACET_LABELS[facet]}</span>
              <TagCombobox
                assigned={assigned}
                available={available}
                onAdd={addTag}
                onRemove={removeTag}
                onCreate={(label) => createTag(facet, label)}
              />
            </div>
          ))}
        </div>

        <label className="field">
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
      </div>

      <div className="modal-foot">
        <button onClick={() => save({ markReviewed: false })} disabled={busy}>
          Save, keep in queue
        </button>
        <button className="modal-apply" onClick={() => save({ markReviewed: true })} disabled={busy}>
          {busy ? "Saving…" : "Save and mark reviewed"}
        </button>
      </div>
    </ModalShell>
  );
}
