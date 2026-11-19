"use client";
import { useCallback, useEffect, useState, use as usePromise } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import TagCombobox from "../../_ui/TagCombobox";
import UtilityBar from "../../_ui/UtilityBar";
import Favicon from "../../_ui/Favicon";
import SiteFooter from "../../_ui/SiteFooter";
import { rankRelated } from "@/lib/related";

// One image kept from a case study. Its own page so search can land on it,
// with the rest of the project underneath -- a logo and the logo on a bus are
// two findings, but you will want to see one from the other.
//
// The credit is not a field. Who made it and where it came from are shown
// above everything you can edit, and nothing on this page can change them.

const FACET_LABELS = {
  medium: "Medium",
  aesthetic: "Aesthetic",
  vertical: "Industry",
};
const FACETS = Object.keys(FACET_LABELS);

export default function VisualDetailPage({ params }) {
  const { id } = usePromise(params);

  const [visual, setVisual] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [project, setProject] = useState(null);
  const [similar, setSimilar] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [savingField, setSavingField] = useState(null);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visuals/${id}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setVisual(data.visual);
    setSiblings(data.siblings || []);
    setProject(data.project);
    setTitleDraft(data.visual.title || "");
    setSummaryDraft(data.visual.summary || "");
    setNotesDraft(data.visual.notes || "");
  }, [id]);

  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) setAllTags((await res.json()).tags || []);
  }, []);

  useEffect(() => {
    load();
    loadTags();
  }, [load, loadTags]);

  // Similar: the closest visuals from OTHER projects, by shared tags and then
  // wording. The siblings are already shown above it, and a "similar" row
  // that is mostly the same case study tells you nothing new.
  const tagKey = (visual?.tags || []).map((t) => t.id).join(",");
  useEffect(() => {
    if (!visual) return undefined;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/visuals");
      if (!res.ok) return;
      const data = await res.json();
      const pool = (data.visuals || [])
        .filter((v) => v.project_id !== visual.project_id)
        .map((v) => ({ kind: "visual", item: { ...v, name: v.title } }));
      const ranked = rankRelated({ kind: "visual", item: { ...visual, name: visual.title } }, pool, 8);
      if (!cancelled) setSimilar(ranked);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual?.id, tagKey]);

  async function saveField(field, value) {
    setSavingField(field);
    setError(null);
    const res = await fetch(`/api/visuals/${id}`, {
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

  async function addTag(tagId) {
    if (!tagId) return;
    setError(null);
    const res = await fetch(`/api/visuals/${id}/tags`, {
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
    const res = await fetch(`/api/visuals/${id}/tags/${tagId}`, { method: "DELETE" });
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
    await addTag(data.tag.id);
    await loadTags();
  }

  // Describes the whole project again in one request -- the siblings share a
  // summary and get their titles and tags in the same pass. Only fills what's
  // empty, so nothing you've typed is overwritten.
  async function regenerate() {
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/visuals/projects/${visual.project_id}/describe`, { method: "POST" });
    setRegenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't describe this project");
      return;
    }
    await load();
    await loadTags();
  }

  async function handleDelete() {
    if (!confirm("Delete this visual? The image is removed from your library and from storage.")) return;
    const res = await fetch(`/api/visuals/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/?tab=visuals";
  }

  if (missing || !visual) {
    return (
      <>
        <UtilityBar onError={setError} />
        <main className="page detail-page">
          <p>{missing ? "That visual isn't in your library." : "Loading…"}</p>
        </main>
      </>
    );
  }

  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (visual.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(visual.tags || []).some((vt) => vt.id === t.id)
    ),
  }));
  const credit = visual.agency_name || visual.domain;

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page detail-page">
        {error && <p className="error">{error}</p>}

        <div className="detail-header">
          <Favicon
            url={visual.url}
            faviconUrl={project?.favicon_url}
            fills={project?.favicon_fills !== false}
            alt={credit}
          />
          <input
            className="name-input"
            value={titleDraft}
            placeholder="Untitled"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => titleDraft !== (visual.title || "") && saveField("title", titleDraft)}
          />
          <div className="detail-actions">
            {visual.needs_review && (
              <button onClick={() => saveField("needs_review", false)}>Mark Reviewed</button>
            )}
            <a className="visit-btn" href={visual.url} target="_blank" rel="noopener noreferrer">
              Visit Source
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>

        <p className="meta-line visual-credit-line">
          {project?.title ? `${project.title} · ` : ""}
          By {credit} · Saved {new Date(visual.saved_at).toLocaleDateString()}
        </p>

        <div className="detail-columns">
          <div className="detail-main">
            <div className="visual-stage">
              <a href={visual.image_url} target="_blank" rel="noopener noreferrer" title="Open the full image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visual.image_url}
                  alt={visual.title || "Visual"}
                  width={visual.width || undefined}
                  height={visual.height || undefined}
                />
              </a>
            </div>
          </div>

          <aside className="detail-side">
            <section className="detail-section visual-credit">
              <h2>Credit</h2>
              <p>
                <strong>{credit}</strong>
                {project?.title ? <> · {project.title}</> : null}
              </p>
              <p className="visual-credit-links">
                <a href={visual.url} target="_blank" rel="noopener noreferrer">
                  {visual.domain}
                  <ArrowUpRight size={13} />
                </a>
                {visual.source_image_url && (
                  <a href={visual.source_image_url} target="_blank" rel="noopener noreferrer">
                    Original file
                    <ArrowUpRight size={13} />
                  </a>
                )}
              </p>
            </section>

            <section className="detail-section">
              <h2 className="ai-heading">
                <Sparkles size={15} />
                AI Summary
              </h2>
              {editingSummary ? (
                <>
                  <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={4} />
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
                        setSummaryDraft(visual.summary || "");
                        setEditingSummary(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="summary-text">
                    {visual.summary || (
                      <span className="summary-empty">
                        No summary yet. Use Regenerate to describe this project and tag its images.
                      </span>
                    )}
                  </p>
                  <div className="section-head-actions section-actions-below">
                    <button onClick={() => setEditingSummary(true)}>Edit</button>
                    <button className="link-btn" onClick={regenerate} disabled={regenerating}>
                      {regenerating ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                </>
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
                    onAdd={(tagId) => addTag(tagId)}
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
                {savingField === "notes" ? "Saving…" : "Save Notes"}
              </button>
            </section>

            <div className="detail-danger">
              <button className="danger-btn" onClick={handleDelete}>
                Delete Visual
              </button>
            </div>
          </aside>
        </div>

        {siblings.length > 1 && (
          <section className="detail-section page-band visual-strip-section">
            <h2>More from this project</h2>
            <div className="visual-strip">
              {siblings.map((s) => (
                <a
                  key={s.id}
                  href={`/visuals/${s.id}`}
                  className={`visual-strip-item${s.id === visual.id ? " visual-strip-current" : ""}`}
                  aria-current={s.id === visual.id ? "page" : undefined}
                  title={s.title || undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb_url} alt={s.title || "Visual"} loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        )}

        {similar && similar.length > 0 && (
          <section className="detail-section page-band">
            <h2>Similar</h2>
            <p className="related-hint">From other projects, closest by shared tags.</p>
            <div className="visual-similar">
              {similar.map(({ item }) => (
                <a key={item.id} className="visual-card" href={`/visuals/${item.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumb_url} alt={item.title || "Visual"} loading="lazy" />
                  <span className="visual-card-caption">
                    <span className="visual-card-title">{item.title || "Untitled"}</span>
                    <span className="visual-card-credit">{item.agency_name || item.domain}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
