"use client";
import { useEffect, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";

// The vocabulary, and the only place it can be edited by hand.
//
// Four design facets plus the resource types, which are what the Resources tab
// draws as folders. Those were missing here, so a folder could be filled by
// the AI and never renamed by anyone.
//
// There is no facet picker any more. It let one stray selection move a word
// into a facet it can't mean -- and a facet is not a label, it's the question
// the tag answers, which is what the AI reads when it decides what it may pick
// next time. Nothing on this page needs to change that, and a tag filed under
// the wrong question is fixed by deleting it and typing it again.
const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
  resource_type: "Folders",
};
const FACETS = Object.keys(FACET_LABELS);

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState(null);
  // What the last merge would take to put back. Held here rather than in a
  // table: the regret arrives about ten seconds after the mistake, and a table
  // for it would want a user_id, RLS, a policy, a scoped query and something
  // to sweep rows nobody will ever use.
  const [undo, setUndo] = useState(null);

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

  async function deleteTag(tag) {
    const used = tag.usage_count || 0;
    if (
      !confirm(
        used
          ? `Delete "${tag.label}"? It comes off ${used} ${used === 1 ? "save" : "saves"}, which keep everything else they're tagged with.`
          : `Delete "${tag.label}"? Nothing is tagged with it.`
      )
    )
      return;
    setError(null);
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  // Merge is for the one thing that splits a library in half: two words for the
  // same idea. Filter Minimal and get 12 when 19 saves are minimal, because
  // seven of them say Minimalist. So it's a confirm that says what will happen
  // in plain numbers, and an undo afterwards, because the word it deletes is
  // something you might not notice is gone for weeks.
  async function mergeTags(source, target) {
    const moved = source.usage_count || 0;
    const ok = confirm(
      `Move ${moved} ${moved === 1 ? "save" : "saves"} from "${source.label}" onto "${target.label}", then delete "${source.label}"?`
    );
    if (!ok) {
      setMergeSourceId(null);
      return;
    }

    setError(null);
    const res = await fetch("/api/tags/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id, targetId: target.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Merge failed");
      return;
    }
    setMergeSourceId(null);
    setUndo({ ...data.undo, from: source.label, into: target.label, moved: data.moved });
    await load();
  }

  async function undoMerge() {
    setError(null);
    const res = await fetch("/api/tags/merge/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag: undo.tag,
        targetId: undo.targetId,
        links: undo.links,
        added: undo.added,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't undo that merge");
      return;
    }
    setUndo(null);
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
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Tags</h1>
        </div>

        <p className="tag-page-note">
          This is the vocabulary the AI picks from. Rename a tag and every save wearing it follows;
          merge two and the next pass uses the one you kept.
        </p>

        {error && <p className="error">{error}</p>}

        {/* Stays until you undo it or leave the page. A toast that fades after
            five seconds is no use for a change you only notice was wrong once
            you go looking for the word. */}
        {undo && (
          <div className="tag-undo">
            <span>
              Moved {undo.moved} {undo.moved === 1 ? "save" : "saves"} from{" "}
              <strong>{undo.from}</strong> onto <strong>{undo.into}</strong>, and deleted{" "}
              <strong>{undo.from}</strong>.
            </span>
            <button className="link-btn" onClick={undoMerge}>
              Undo
            </button>
          </div>
        )}

        {loaded && pending.length > 0 && (
          <section className="tag-section">
            <h2>Pending Approval ({pending.length})</h2>
            <div className="tag-list">
              {pending.map((tag) => (
                <div className="tag-row" key={tag.id}>
                  <span className="tag-facet">{FACET_LABELS[tag.facet]}</span>
                  <span className="tag-label">{tag.label}</span>
                  <div className="tag-actions">
                    <button onClick={() => updateTag(tag.id, { is_approved: true })}>Approve</button>
                    <button onClick={() => deleteTag(tag)}>Reject</button>
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

                    <div className="tag-actions">
                      {editingId === tag.id ? (
                        <button onClick={() => saveEdit(tag.id)}>Save</button>
                      ) : (
                        <button onClick={() => startEdit(tag)}>Rename</button>
                      )}

                      {/* Only ever into a tag answering the same question.
                          Across facets it isn't a merge, it's a facet change
                          wearing a merge's clothes -- and that is the control
                          this page just gave up. */}
                      {mergeSourceId === tag.id ? (
                        <select
                          className="tag-merge-select"
                          defaultValue=""
                          onChange={(e) => {
                            const target = facetTags.find((t) => t.id === e.target.value);
                            if (target) mergeTags(tag, target);
                          }}
                        >
                          <option value="" disabled>
                            Merge into…
                          </option>
                          {facetTags
                            .filter((t) => t.id !== tag.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} ({t.usage_count || 0})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setMergeSourceId(tag.id)}
                          disabled={facetTags.length < 2}
                          title={
                            facetTags.length < 2
                              ? "Nothing else in this facet to merge into"
                              : `Move everything tagged "${tag.label}" onto another tag and delete it`
                          }
                        >
                          Merge
                        </button>
                      )}

                      <button onClick={() => deleteTag(tag)}>Delete</button>
                    </div>
                  </div>
                ))}
                {facetTags.length === 0 && <p className="empty-small">No tags in this facet.</p>}
              </div>
            </section>
          );
        })}
      </main>
      <SiteFooter />
    </>
  );
}
