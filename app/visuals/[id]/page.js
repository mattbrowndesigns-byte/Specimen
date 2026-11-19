"use client";
import { useCallback, useEffect, useMemo, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Maximize2, Sparkles, X } from "lucide-react";
import TagCombobox from "../../_ui/TagCombobox";
import UtilityBar from "../../_ui/UtilityBar";
import Favicon from "../../_ui/Favicon";
import SiteFooter from "../../_ui/SiteFooter";
import { SEQUENCE_KEY } from "../../_ui/masonry";
import { rankRelated } from "@/lib/related";

// One saved image, shown the way an image wants to be shown: a lightbox.
//
// The first version put it in the detail page's two columns, where a tall
// poster ran off the bottom of the screen and you scrolled to see the rest of
// a picture. Now the image always fits the viewport, the essentials sit in a
// caption under it, and everything else -- summary, tag editing, notes,
// delete -- is behind Details, because most visits are looking, not editing.
//
// Left and right walk the board in the order you were looking at it (the ids
// the board stored when you opened the card, so a search or a tag filter is
// respected), with the arrow keys doing the same and Escape going back.
//
// The credit is not a field. Who made it and where it came from are in the
// caption and nothing on this page can change them.

const FACET_LABELS = {
  medium: "Medium",
  aesthetic: "Aesthetic",
  vertical: "Industry",
};
const FACETS = Object.keys(FACET_LABELS);
const DETAILS_KEY = "specimen.visuals.details";

function readSequence() {
  try {
    const ids = JSON.parse(sessionStorage.getItem(SEQUENCE_KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export default function VisualDetailPage({ params }) {
  const { id } = usePromise(params);
  const router = useRouter();

  const [visual, setVisual] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [project, setProject] = useState(null);
  const [library, setLibrary] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [savingField, setSavingField] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visuals/${id}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setMissing(false);
    setVisual(data.visual);
    setSiblings(data.siblings || []);
    setProject(data.project);
    setTitleDraft(data.visual.title || "");
    setSummaryDraft(data.visual.summary || "");
    setNotesDraft(data.visual.notes || "");
    setEditingSummary(false);
  }, [id]);

  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) setAllTags((await res.json()).tags || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The library once per visit, not once per image: it's the fallback order
  // for the arrows and the pool for "similar".
  useEffect(() => {
    loadTags();
    (async () => {
      const res = await fetch("/api/visuals");
      if (res.ok) setLibrary((await res.json()).visuals || []);
    })();
    try {
      setDetailsOpen(localStorage.getItem(DETAILS_KEY) === "open");
    } catch {
      // Closed by default.
    }
  }, [loadTags]);

  function toggleDetails() {
    setDetailsOpen((open) => {
      try {
        localStorage.setItem(DETAILS_KEY, open ? "closed" : "open");
      } catch {
        // Not remembered, still toggled.
      }
      return !open;
    });
  }

  // The walk order: what the board showed when you opened a card, or the
  // whole library if this page was reached some other way.
  const sequence = useMemo(() => {
    const stored = readSequence();
    if (stored.includes(id)) return stored;
    return library.map((v) => v.id);
  }, [id, library]);
  const index = sequence.indexOf(id);
  const prevId = index > 0 ? sequence[index - 1] : null;
  const nextId = index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : null;

  const go = useCallback((target) => target && router.push(`/visuals/${target}`), [router]);

  // Arrow keys step, Escape goes back to the board -- except while typing,
  // where the arrow keys belong to the text.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "ArrowLeft") go(prevId);
      else if (e.key === "ArrowRight") go(nextId);
      else if (e.key === "Escape") window.location.href = "/?tab=visuals";
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prevId, nextId]);

  // Fetch the neighbours' full images ahead of time, so stepping is instant.
  useEffect(() => {
    for (const neighbour of [prevId, nextId]) {
      const v = library.find((item) => item.id === neighbour);
      if (v?.image_url) new window.Image().src = v.image_url;
    }
  }, [prevId, nextId, library]);

  // Similar: the closest visuals from OTHER projects, by shared tags then
  // wording. The siblings already have their own row.
  const similar = useMemo(() => {
    if (!visual) return [];
    const pool = library
      .filter((v) => v.project_id !== visual.project_id)
      .map((v) => ({ kind: "visual", item: { ...v, name: v.title } }));
    return rankRelated({ kind: "visual", item: { ...visual, name: visual.title } }, pool, 8);
  }, [visual, library]);

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
  // empty, so nothing typed by hand is overwritten.
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
    if (!res.ok) return;
    // Straight on to the next one, the way deleting in a photo viewer works.
    if (nextId) router.push(`/visuals/${nextId}`);
    else if (prevId) router.push(`/visuals/${prevId}`);
    else window.location.href = "/?tab=visuals";
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
  const chips = (visual.tags || []).filter((t) => t.facet === "medium" || t.facet === "aesthetic");

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page lightbox-page">
        {error && <p className="error">{error}</p>}

        <section className="lightbox-stage" aria-label={visual.title || "Visual"}>
          {/* key forces a fresh <img> per visual, so stepping never shows the
              last image stretched to the next one's shape for a frame. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={visual.id}
            className="lightbox-image"
            src={visual.image_url}
            alt={visual.title || "Visual"}
            width={visual.width || undefined}
            height={visual.height || undefined}
          />

          <div className="lightbox-corner">
            {index >= 0 && sequence.length > 1 && (
              <span className="lightbox-counter">
                {index + 1} / {sequence.length}
              </span>
            )}
            <a
              className="lightbox-icon"
              href={visual.image_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full size"
              aria-label="Open full size"
            >
              <Maximize2 size={16} />
            </a>
            <a className="lightbox-icon" href="/?tab=visuals" title="Back to the board (Esc)" aria-label="Back to the board">
              <X size={18} />
            </a>
          </div>

          {prevId && (
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={() => go(prevId)}
              aria-label="Previous visual"
              title="Previous (←)"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {nextId && (
            <button
              type="button"
              className="lightbox-nav lightbox-next"
              onClick={() => go(nextId)}
              aria-label="Next visual"
              title="Next (→)"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </section>

        <div className="lightbox-caption">
          <Favicon url={visual.url} faviconUrl={project?.favicon_url} fills={project?.favicon_fills !== false} alt={credit} />
          <div className="lightbox-caption-text">
            <input
              className="lightbox-title"
              value={titleDraft}
              placeholder="Untitled"
              aria-label="Title"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => titleDraft !== (visual.title || "") && saveField("title", titleDraft)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <p className="lightbox-credit">
              By <strong>{credit}</strong>
              {project?.title ? ` · ${project.title}` : ""} ·{" "}
              <a href={visual.url} target="_blank" rel="noopener noreferrer">
                {visual.domain}
                <ArrowUpRight size={12} />
              </a>
            </p>
            {chips.length > 0 && (
              <div className="lightbox-chips">
                {chips.map((t) => (
                  <span className="chip" key={t.id}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="lightbox-actions">
            <button
              type="button"
              className={`lightbox-details-toggle${detailsOpen ? " open" : ""}`}
              onClick={toggleDetails}
              aria-expanded={detailsOpen}
            >
              Details
              <ChevronDown size={15} />
            </button>
            <a className="visit-btn" href={visual.url} target="_blank" rel="noopener noreferrer">
              Visit Source
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>

        {detailsOpen && (
          <div className="lightbox-details">
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

            <section className="detail-section">
              <h2>Credit</h2>
              <p className="lightbox-credit-detail">
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
              <p className="meta-line">Saved {new Date(visual.saved_at).toLocaleDateString()}</p>
              <div className="lightbox-detail-actions">
                {visual.needs_review && (
                  <button onClick={() => saveField("needs_review", false)}>Mark Reviewed</button>
                )}
                <button className="danger-btn" onClick={handleDelete}>
                  Delete Visual
                </button>
              </div>
            </section>
          </div>
        )}

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
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.id);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb_url} alt={s.title || "Visual"} loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="detail-section page-band">
            <h2>Similar</h2>
            <p className="related-hint">From other projects, closest by shared tags.</p>
            <div className="visual-similar">
              {similar.map(({ item }) => (
                <a
                  key={item.id}
                  className="visual-card"
                  href={`/visuals/${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(item.id);
                  }}
                >
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
