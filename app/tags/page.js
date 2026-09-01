"use client";
import { useEffect, useState } from "react";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState(null);

  async function load() {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setTags(data.tags || []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

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

  async function deleteTag(id) {
    if (!confirm("Delete this tag? It will be removed from everything it's attached to.")) return;
    setError(null);
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  async function mergeTags(sourceId, targetId) {
    setError(null);
    const res = await fetch("/api/tags/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Merge failed");
      return;
    }
    setMergeSourceId(null);
    await load();
  }

  function startEdit(tag) {
    setEditingId(tag.id);
    setEditLabel(tag.label);
  }

  async function saveEdit(id) {
    await updateTag(id, { label: editLabel });
    setEditingId(null);
  }

  const pending = tags.filter((t) => !t.is_approved);

  return (
    <main className="page">
      <div className="top-nav">
        <h1>Tags</h1>
        <a href="/">← Back to library</a>
      </div>

      {error && <p className="error">{error}</p>}

      {loaded && pending.length > 0 && (
        <section className="tag-section">
          <h2>Pending approval ({pending.length})</h2>
          <div className="tag-list">
            {pending.map((tag) => (
              <div className="tag-row" key={tag.id}>
                <span className="tag-facet">{FACET_LABELS[tag.facet]}</span>
                <span className="tag-label">{tag.label}</span>
                <div className="tag-actions">
                  <button onClick={() => updateTag(tag.id, { is_approved: true })}>Approve</button>
                  <button onClick={() => deleteTag(tag.id)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {FACETS.map((facet) => {
        const facetTags = tags.filter((t) => t.facet === facet && t.is_approved);
        if (!loaded) return null;
        return (
          <section className="tag-section" key={facet}>
            <h2>{FACET_LABELS[facet]}</h2>
            <div className="tag-list">
              {facetTags.map((tag) => (
                <div className="tag-row" key={tag.id}>
                  {editingId === tag.id ? (
                    <input
                      className="tag-edit-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(tag.id)}
                      autoFocus
                    />
                  ) : (
                    <span className="tag-label">{tag.label}</span>
                  )}

                  <select
                    className="tag-facet-select"
                    value={tag.facet}
                    onChange={(e) => updateTag(tag.id, { facet: e.target.value })}
                  >
                    {FACETS.map((f) => (
                      <option key={f} value={f}>
                        {FACET_LABELS[f]}
                      </option>
                    ))}
                  </select>

                  <div className="tag-actions">
                    {editingId === tag.id ? (
                      <button onClick={() => saveEdit(tag.id)}>Save</button>
                    ) : (
                      <button onClick={() => startEdit(tag)}>Rename</button>
                    )}

                    {mergeSourceId === tag.id ? (
                      <select
                        className="tag-merge-select"
                        defaultValue=""
                        onChange={(e) => e.target.value && mergeTags(tag.id, e.target.value)}
                      >
                        <option value="" disabled>
                          Merge into…
                        </option>
                        {tags
                          .filter((t) => t.id !== tag.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {FACET_LABELS[t.facet]} / {t.label}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <button onClick={() => setMergeSourceId(tag.id)}>Merge</button>
                    )}

                    <button onClick={() => deleteTag(tag.id)}>Delete</button>
                  </div>
                </div>
              ))}
              {facetTags.length === 0 && <p className="empty-small">No tags in this facet.</p>}
            </div>
          </section>
        );
      })}
    </main>
  );
}
