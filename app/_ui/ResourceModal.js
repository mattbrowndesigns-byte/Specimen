"use client";
import { useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import TagCombobox from "./TagCombobox";
import ModalShell from "./ModalShell";

const FACET = "resource_type";

// A resource has no detail page, so this modal is the whole of its editing
// surface: the title, the sentence, the type and any notes. That's deliberate
// — a resource is a link, and the reason it has no page of its own is that
// there would be nothing on it worth the trip.
export default function ResourceModal({ resource, allTags, onSaved, onDeleted, onClose }) {
  const [title, setTitle] = useState(resource.title || "");
  const [summary, setSummary] = useState(resource.summary || "");
  const [notes, setNotes] = useState(resource.notes || "");
  const [tags, setTags] = useState(resource.tags || []);
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  async function refreshTags() {
    const res = await fetch("/api/resources");
    if (!res.ok) return;
    const data = await res.json();
    const fresh = (data.resources || []).find((r) => r.id === resource.id);
    if (fresh) setTags(fresh.tags || []);
  }

  async function addTag(tagId) {
    await fetch(`/api/resources/${resource.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    await refreshTags();
  }

  async function removeTag(tagId) {
    await fetch(`/api/resources/${resource.id}/tags/${tagId}`, { method: "DELETE" });
    await refreshTags();
  }

  async function createTag(label) {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facet: FACET, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't create that type");
      return;
    }
    await addTag(data.tag.id);
  }

  // Re-reads the page and asks again. The equivalent of a site's re-capture,
  // except there's nothing to re-capture — the page is fetched fresh inside
  // the enrichment run, so a tool that has since explained itself better gets
  // a better summary.
  async function regenerate() {
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/resources/${resource.id}/enrich`, { method: "POST" });
    setRegenerating(false);
    if (!res.ok) {
      setError("Couldn't reach the AI just now");
      return;
    }
    const data = await res.json();
    setTitle(data.resource.title || "");
    setSummary(data.resource.summary || "");
    setTags(data.resource.tags || []);
    onSaved(data.resource);
    if (!data.described) {
      setError(
        data.queued
          ? "The AI was busy — it'll try again within the hour."
          : "The AI couldn't describe this one."
      );
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/resources/${resource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, summary, notes }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't save those changes");
      return;
    }
    const data = await res.json();
    onSaved({ ...data.resource, tags });
    onClose();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/resources/${resource.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't delete that");
      return;
    }
    onDeleted(resource.id);
  }

  const available = allTags.filter(
    (t) => t.facet === FACET && t.is_approved && !tags.some((at) => at.id === t.id)
  );

  return (
    <ModalShell label="Edit resource" wide onClose={onClose}>
      <div className="modal-head">
        <h2>Edit resource</h2>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="modal-body">
        {error && <p className="error">{error}</p>}

        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <a className="resource-modal-link" href={resource.url} target="_blank" rel="noopener noreferrer">
          {resource.url} ↗
        </a>

        <label className="field">
          <span>Summary</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
        </label>

        <div className="field">
          <span>Type</span>
          <div className="facet-row">
            <TagCombobox
              assigned={tags}
              available={available}
              onAdd={addTag}
              onRemove={removeTag}
              onCreate={createTag}
            />
          </div>
        </div>

        <label className="field">
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <button className="link-btn" onClick={regenerate} disabled={regenerating}>
          <Sparkles size={14} />
          {regenerating ? "Asking…" : "Regenerate summary and type"}
        </button>
      </div>

      <div className="modal-foot">
        {confirmDelete ? (
          <>
            <button onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </button>
            <button className="danger-btn" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete for good"}
            </button>
          </>
        ) : (
          <>
            <button className="danger-btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 size={14} />
              Delete
            </button>
            <button className="modal-apply" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
