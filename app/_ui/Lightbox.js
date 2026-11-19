"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Info, Maximize2, Sparkles, X } from "lucide-react";
import ModalShell from "./ModalShell";
import TagCombobox from "./TagCombobox";
import { rankRelated } from "@/lib/related";

// A saved visual, opened the way images are meant to be opened: over the
// board, on a dark ground, fitted to the window, with a short caption under
// it -- what it is, who made it, two or three tags. Arrows at the edges (and
// the arrow keys) step through the board in the order it was showing.
//
// Everything else is behind Details, a panel that slides in from the right
// inside the lightbox: the summary, tag editing, notes, the rest of the
// project, similar work, delete. Most visits are looking, not editing, so the
// picture gets the room and the form stays out of the way until asked for.
//
// It goes through ModalShell like every overlay here, made full-screen by
// `.modal.lightbox`.

const FACET_LABELS = { medium: "Medium", aesthetic: "Aesthetic", vertical: "Industry" };
const FACETS = Object.keys(FACET_LABELS);
const DETAILS_KEY = "specimen.visuals.details";

// `items` is the board's list (for instant image, title and credit while the
// full record loads), `sequence` the ids to walk, `startId` the one opened.
// `onChange(id)` lets the host keep the address bar in step; `onDeleted(id)`
// and `onUpdated(visual)` keep the board in step with edits made here.
export default function Lightbox({ items, sequence, startId, onClose, onChange, onDeleted, onUpdated }) {
  const [id, setId] = useState(startId);
  const [detail, setDetail] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(sequence);

  const byId = useMemo(() => new Map(items.map((v) => [v.id, v])), [items]);

  // Jumping to a sibling or a similar visual that the board wasn't showing
  // adds it to the walk, so the counter and arrows keep working from there.
  const jump = useCallback((target) => {
    setOrder((prev) => (prev.includes(target) ? prev : [...prev, target]));
    setId(target);
  }, []);
  const index = order.indexOf(id);
  const prevId = index > 0 ? order[index - 1] : null;
  const nextId = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  // What can be shown at once comes from the board's copy; the full record
  // (siblings, project, fresh tags) replaces it when it lands.
  const visual = detail?.visual?.id === id ? detail.visual : byId.get(id);
  const project = detail?.visual?.id === id ? detail.project : null;
  const siblings = detail?.visual?.id === id ? detail.siblings : [];

  const loadDetail = useCallback(async (target) => {
    const res = await fetch(`/api/visuals/${target}`);
    if (!res.ok) return null;
    const data = await res.json();
    setDetail(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setEditingSummary(false);
    loadDetail(id).then((data) => {
      if (cancelled || !data) return;
      setTitleDraft(data.visual.title || "");
      setSummaryDraft(data.visual.summary || "");
      setNotesDraft(data.visual.notes || "");
    });
    const fromBoard = byId.get(id);
    if (fromBoard) setTitleDraft(fromBoard.title || "");
    onChange?.(id);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/tags");
      if (res.ok) setAllTags((await res.json()).tags || []);
    })();
    try {
      setDetailsOpen(localStorage.getItem(DETAILS_KEY) === "open");
    } catch {
      // Closed by default.
    }
    // The page behind a lightbox shouldn't scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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

  // Arrow keys step -- except while typing, where they belong to the text.
  // Escape is ModalShell's.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prevId) setId(prevId);
      else if (e.key === "ArrowRight" && nextId) setId(nextId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId]);

  // The neighbours' full images, fetched ahead so stepping is instant.
  useEffect(() => {
    for (const neighbour of [prevId, nextId]) {
      const v = byId.get(neighbour);
      if (v?.image_url) new window.Image().src = v.image_url;
    }
  }, [prevId, nextId, byId]);

  const similar = useMemo(() => {
    if (!visual) return [];
    const pool = items
      .filter((v) => v.project_id !== visual.project_id)
      .map((v) => ({ kind: "visual", item: { ...v, name: v.title } }));
    return rankRelated({ kind: "visual", item: { ...visual, name: visual.title } }, pool, 6);
  }, [visual, items]);

  async function refresh() {
    const data = await loadDetail(id);
    if (data) onUpdated?.(data.visual);
  }

  async function saveField(field, value) {
    setBusy(field);
    setError(null);
    const res = await fetch(`/api/visuals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    await refresh();
  }

  async function addTag(tagId) {
    if (!tagId) return;
    const res = await fetch(`/api/visuals/${id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Failed to add tag");
    await refresh();
  }

  async function removeTag(tagId) {
    const res = await fetch(`/api/visuals/${id}/tags/${tagId}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Failed to remove tag");
    await refresh();
  }

  async function createTag(facet, label) {
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
    setAllTags((prev) => [...prev, data.tag]);
    await addTag(data.tag.id);
  }

  // The whole project again, in one request; only fills what's empty.
  async function regenerate() {
    setBusy("regenerate");
    setError(null);
    const res = await fetch(`/api/visuals/projects/${visual.project_id}/describe`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Couldn't describe this project");
      return;
    }
    const data = await loadDetail(id);
    if (data) {
      setTitleDraft(data.visual.title || "");
      setSummaryDraft(data.visual.summary || "");
      onUpdated?.(data.visual);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this visual? The image is removed from your library and from storage.")) return;
    const res = await fetch(`/api/visuals/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    onDeleted?.(id);
    // On to the next one, the way deleting in a photo viewer works.
    const next = nextId || prevId;
    setOrder((prev) => prev.filter((v) => v !== id));
    if (next) setId(next);
    else onClose();
  }

  if (!visual) return null;

  const credit = visual.agency_name || visual.domain;
  const chips = (visual.tags || []).filter((t) => t.facet === "medium" || t.facet === "aesthetic");
  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (visual.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(visual.tags || []).some((vt) => vt.id === t.id)
    ),
  }));

  return (
    <ModalShell label={visual.title || "Visual"} className={`lightbox${detailsOpen ? " lightbox-with-details" : ""}`} onClose={onClose}>
      <div className="lightbox-view">
        <div className="lightbox-top">
          {order.length > 1 && index >= 0 && (
            <span className="lightbox-counter">
              {index + 1} / {order.length}
            </span>
          )}
          <div className="lightbox-top-actions">
            <button
              type="button"
              className={`lightbox-icon${detailsOpen ? " active" : ""}`}
              onClick={toggleDetails}
              aria-pressed={detailsOpen}
              aria-label="Details"
              title="Details"
            >
              <Info size={17} />
            </button>
            <a
              className="lightbox-icon"
              href={visual.image_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open full size"
              title="Open full size"
            >
              <Maximize2 size={16} />
            </a>
            <button type="button" className="lightbox-icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* A click on the dark ground around the picture closes it, as in
            every lightbox; clicks on the picture and its caption don't. */}
        <div
          className="lightbox-stage"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <figure className="lightbox-figure">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={visual.id}
              className="lightbox-image"
              src={visual.image_url}
              alt={visual.title || "Visual"}
              width={visual.width || undefined}
              height={visual.height || undefined}
            />
            <figcaption className="lightbox-caption">
              <span className="lightbox-caption-title">{visual.title || "Untitled"}</span>
              <span className="lightbox-caption-credit">
                By {credit}
                {project?.title ? ` · ${project.title}` : ""} ·{" "}
                <a href={visual.url} target="_blank" rel="noopener noreferrer">
                  {visual.domain}
                  <ArrowUpRight size={12} />
                </a>
              </span>
              {chips.length > 0 && (
                <span className="lightbox-caption-tags">{chips.map((t) => t.label).join(" · ")}</span>
              )}
            </figcaption>
          </figure>

          {prevId && (
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={() => setId(prevId)}
              aria-label="Previous visual"
              title="Previous (←)"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {nextId && (
            <button
              type="button"
              className="lightbox-nav lightbox-next"
              onClick={() => setId(nextId)}
              aria-label="Next visual"
              title="Next (→)"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      </div>

      {detailsOpen && (
        <aside className="lightbox-panel" aria-label="Details">
          {error && <p className="error">{error}</p>}

          <section className="lightbox-panel-section">
            <input
              className="lightbox-title"
              value={titleDraft}
              placeholder="Untitled"
              aria-label="Title"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => titleDraft !== (visual.title || "") && saveField("title", titleDraft)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <p className="lightbox-panel-credit">
              <strong>{credit}</strong>
              {project?.title ? ` · ${project.title}` : ""}
            </p>
            <p className="visual-credit-links">
              <a href={visual.url} target="_blank" rel="noopener noreferrer">
                Visit source
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

          <section className="lightbox-panel-section detail-section">
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
                    disabled={busy === "summary"}
                    onClick={async () => {
                      await saveField("summary", summaryDraft);
                      setEditingSummary(false);
                    }}
                  >
                    {busy === "summary" ? "Saving…" : "Save"}
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
                    <span className="summary-empty">No summary yet. Regenerate describes the project and tags it.</span>
                  )}
                </p>
                <div className="section-head-actions section-actions-below">
                  <button onClick={() => setEditingSummary(true)}>Edit</button>
                  <button className="link-btn" onClick={regenerate} disabled={busy === "regenerate"}>
                    {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="lightbox-panel-section detail-section">
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

          <section className="lightbox-panel-section detail-section">
            <h2>Notes</h2>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} />
            <button disabled={busy === "notes"} onClick={() => saveField("notes", notesDraft)}>
              {busy === "notes" ? "Saving…" : "Save Notes"}
            </button>
          </section>

          {siblings.length > 1 && (
            <section className="lightbox-panel-section detail-section">
              <h2>More from this project</h2>
              <div className="lightbox-thumbs">
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`lightbox-thumb${s.id === id ? " current" : ""}`}
                    onClick={() => jump(s.id)}
                    title={s.title || undefined}
                    aria-current={s.id === id ? "true" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumb_url} alt={s.title || "Visual"} loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {similar.length > 0 && (
            <section className="lightbox-panel-section detail-section">
              <h2>Similar</h2>
              <div className="lightbox-thumbs">
                {similar.map(({ item }) => (
                  <button
                    key={item.id}
                    type="button"
                    className="lightbox-thumb"
                    onClick={() => jump(item.id)}
                    title={`${item.title || "Untitled"} · ${item.agency_name || item.domain}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb_url} alt={item.title || "Visual"} loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="lightbox-panel-section lightbox-panel-foot">
            <span className="meta-line">Saved {new Date(visual.saved_at).toLocaleDateString()}</span>
            <div className="lightbox-detail-actions">
              {visual.needs_review && <button onClick={() => saveField("needs_review", false)}>Mark Reviewed</button>}
              <button className="danger-btn" onClick={handleDelete}>
                Delete Visual
              </button>
            </div>
          </section>
        </aside>
      )}
    </ModalShell>
  );
}
