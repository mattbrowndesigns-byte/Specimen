"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Info, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import CopyForAI from "./CopyForAI";
import ModalShell from "./ModalShell";
import SaveActions from "./SaveActions";
import TagCombobox from "./TagCombobox";
import VisualMedia from "./VisualMedia";
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
// Matches the close transition in globals.css; the panel stays mounted this
// long after Hide so it can slide out rather than vanish.
const PANEL_EXIT_MS = 380;

// `items` is the board's list (for instant image, title and credit while the
// full record loads), `sequence` the ids to walk, `startId` the one opened.
// `onChange(id)` lets the host keep the address bar in step; `onDeleted(id)`
// and `onUpdated(visual)` keep the board in step with edits made here.
// "By Favor the Brave · favorthebrave.com", the same line in the caption and
// at the top of Details: who made it, and the page it came from.
//
// An upload has no page and no maker on record, so there's no link to make
// and nothing to say "By" in front of -- it says where it came from instead,
// quietly, so the missing credit reads as a fact and not as an omission.
function Credit({ credit, visual, withOriginal = false }) {
  if (!visual.url) {
    return (
      <span className="lightbox-caption-credit">
        {credit ? <span>By {credit}</span> : <span className="lightbox-uploaded">Uploaded from your files</span>}
      </span>
    );
  }
  return (
    <span className="lightbox-caption-credit">
      <a href={visual.url} target="_blank" rel="noopener noreferrer">
        By {credit}
        <ArrowUpRight size={12} />
      </a>
      {/* The agency's own file, often larger than the copy kept here: the
          way to the best version of the image, so it stays, but quietly --
          the same size as the credit and in grey, so the two read as one
          line with the maker first rather than as a footnote beside it. */}
      {withOriginal && visual.source_image_url && (
        <>
          {" · "}
          <a className="lightbox-original" href={visual.source_image_url} target="_blank" rel="noopener noreferrer">
            Original file
            <ArrowUpRight size={12} />
          </a>
        </>
      )}
    </span>
  );
}

// The note at the top of Details when the AI hasn't finished with this
// image, or couldn't: what's happening, why, and what you can do. In place,
// not a pop-up -- it's about the panel you're looking at, and it should
// still be there when you look back.
function AiStatus({ project, working, failure, onRetry }) {
  if (working) {
    return (
      <div className="ai-status ai-status-working" role="status">
        <span className="ai-status-dot" />
        <span>{working}</span>
      </div>
    );
  }
  if (failure) {
    return (
      <div className="ai-status ai-status-failed" role="alert">
        <p>
          <strong>{failure}</strong> Nothing was changed.
        </p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (project?.ai_state === "queued" || project?.ai_state === "pending") {
    return (
      <div className="ai-status ai-status-queued" role="status">
        <p>
          <strong>Description and tags are on their way.</strong>{" "}
          {project.error ? `${project.error} ` : "The AI didn't answer when this was saved. "}
          It&rsquo;s trying again on its own and usually fills in within the hour.
        </p>
        <button type="button" onClick={onRetry}>
          Try now
        </button>
      </div>
    );
  }
  if (project?.ai_state === "failed") {
    return (
      <div className="ai-status ai-status-failed" role="alert">
        <p>
          <strong>The AI couldn&rsquo;t describe this project.</strong> {project.error || ""} It has stopped trying
          on its own.
        </p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return null;
}

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
  // What the AI is doing right now (a sentence), and why the last request
  // failed (a sentence) -- both shown in the AiStatus note.
  const [aiWorking, setAiWorking] = useState(null);
  const [aiFailure, setAiFailure] = useState(null);
  const [failedField, setFailedField] = useState(null);
  const [order, setOrder] = useState(sequence);
  // The panel outlives detailsOpen by one transition: mounted while it slides
  // out, unmounted once it has. `panelShown` is what the CSS animates on,
  // set a frame after mounting so the opening has a "from" to start at.
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const exitTimer = useRef(null);

  const byId = useMemo(() => new Map(items.map((v) => [v.id, v])), [items]);

  // Jumping to a sibling or a similar visual that the board wasn't showing
  // adds it to the walk, so the counter and arrows keep working from there.
  const jump = useCallback((target) => {
    setOrder((prev) => (prev.includes(target) ? prev : [...prev, target]));
    setId(target);
  }, []);

  // The thumbnails are links, not buttons: each goes to another image, so
  // Cmd-click opening it in a new tab is right -- and a <button> inside a
  // .detail-section is caught by refined.css's capsule-button rule, which
  // rounded every square thumbnail into a pill.
  function thumbClick(e, target) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    jump(target);
  }

  // Full screen is the screen's, not a bigger image in a new tab: the
  // lightbox fills the display, the arrows and keys still step, and Esc or
  // the same button hands the screen back. The browser owns the state, so
  // it's read from fullscreenchange rather than tracked here.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      // Closing the lightbox gives the screen back too.
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  function toggleFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else {
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      request?.call(root)?.catch?.(() => {});
    }
  }
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

  useEffect(() => {
    clearTimeout(exitTimer.current);
    if (detailsOpen) {
      setPanelMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPanelShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setPanelShown(false);
    exitTimer.current = setTimeout(() => setPanelMounted(false), PANEL_EXIT_MS);
    return () => clearTimeout(exitTimer.current);
  }, [detailsOpen]);

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
  // `field` is "summary" or "tags" for one image's Regenerate -- each
  // section has its own, so a description you like survives re-picking the
  // tags -- or null for the whole project (the status note's Try now).
  async function regenerate(field) {
    setBusy(field ? `regenerate-${field}` : "regenerate");
    setAiFailure(null);
    setFailedField(field);
    setAiWorking(
      field === "summary"
        ? "Writing a new description…"
        : field === "tags"
          ? "Picking new tags…"
          : "Writing descriptions and tags for this project…"
    );
    const res = await fetch(`/api/visuals/projects/${visual.project_id}/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(field ? { visualId: id, field } : {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setAiWorking(null);
    // A one-image failure is shown here; a whole-project one is recorded on
    // the project, and the note reads that once the detail reloads.
    if ((!res.ok || !data.ok) && field) setAiFailure(data.error || "The AI couldn't describe this.");
    const detailData = await loadDetail(id);
    if (detailData) {
      setTitleDraft(detailData.visual.title || "");
      setSummaryDraft(detailData.visual.summary || "");
      onUpdated?.(detailData.visual);
    }
  }

  // While a project is waiting in the queue, look again every minute, so the
  // note gives way to the description without anyone refreshing.
  useEffect(() => {
    if (!detailsOpen || detail?.project?.ai_state !== "queued") return undefined;
    const timer = setInterval(() => loadDetail(id), 60000);
    return () => clearInterval(timer);
  }, [detailsOpen, detail?.project?.ai_state, id, loadDetail]);

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
  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (visual.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(visual.tags || []).some((vt) => vt.id === t.id)
    ),
  }));

  return (
    <ModalShell label={visual.title || "Visual"} className={`lightbox${panelShown ? " lightbox-with-details" : ""}`} onClose={onClose}>
      <div className="lightbox-view">
        <div className="lightbox-top">
          {/* Tooltips are data-tip rather than title: a native title waits a
              second and a half and can't be styled, and these icons need
              naming the first time you look at them. */}
          <div className="lightbox-top-actions">
            <button
              type="button"
              className="lightbox-icon"
              onClick={toggleDetails}
              aria-pressed={detailsOpen}
              aria-label={detailsOpen ? "Hide details" : "Details"}
              data-tip={detailsOpen ? "Hide details" : "Details"}
            >
              <Info size={17} />
            </button>
            <button
              type="button"
              className="lightbox-icon"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              data-tip={fullscreen ? "Exit full screen" : "Full screen"}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            {/* No tooltip: an X says what it does. */}
            <button type="button" className="lightbox-icon" onClick={onClose} aria-label="Close">
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
            {/* A video plays as the case study played it: muted, looping,
                inline. It keeps the browser's controls here and nowhere
                else -- this is where you'd want to pause on a frame or
                scrub back, and they're the only way to start it for
                someone whose system asks for less motion. */}
            <VisualMedia
              key={visual.id}
              className="lightbox-image"
              visual={visual}
              src={visual.image_url}
              alt={visual.title || "Visual"}
              playInView={false}
              controls
            />
            <figcaption className="lightbox-caption">
              <span className="lightbox-caption-title">{visual.title || "Untitled"}</span>
              <Credit credit={credit} visual={visual} />
            </figcaption>
          </figure>

          {prevId && (
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={() => setId(prevId)}
              aria-label="Previous visual"
              data-tip="Previous (←)"
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
              data-tip="Next (→)"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      </div>

      {/* The holder's width eases open and shut, so the picture resizes with
          it instead of jumping; the panel inside slides in from the right
          and fades, on the same curve. */}
      {panelMounted && (
        <div className={`lightbox-panel-holder${panelShown ? " is-shown" : ""}`}>
        <aside className="lightbox-panel" aria-label="Details" inert={!panelShown}>
          {/* Its own row above the title, in a holding shape like the
              lightbox's buttons, rather than floating beside the heading. */}
          <div className="lightbox-panel-bar">
            <button type="button" className="lightbox-panel-close" onClick={toggleDetails} aria-label="Hide details">
              <X size={18} />
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <section className="lightbox-panel-section lightbox-panel-head">
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
              <Credit credit={credit} visual={visual} withOriginal />
            </p>
            {/* What you do with the picture rather than to its record: keep
                it, file it, carry it into an AI. Copy for AI lived on the
                dark bar over the image, where it was one more unlabelled
                circle; here it has its words, beside the two it belongs
                with, the way a site's header has them. Keyed on the visual
                because the heart holds its own state. */}
            <div className="detail-actions lightbox-panel-actions">
              <SaveActions
                key={visual.id}
                className="detail-save-actions"
                kind="visual"
                id={visual.id}
                name={visual.title || "Visual"}
                isFavorite={visual.is_favorite}
                onFavoriteChange={(next) => onUpdated?.({ ...visual, is_favorite: next })}
              />
              <CopyForAI url={`/api/export/visual/${visual.id}`} />
            </div>
          </section>

          <AiStatus
            project={project}
            working={aiWorking}
            failure={aiFailure}
            onRetry={() => regenerate(aiFailure ? failedField : null)}
          />

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
                    <span className="summary-empty">No description yet.</span>
                  )}
                </p>
                {/* The image's own sentence above, the project's paragraph
                    here -- once, not copied onto every image. */}
                {project?.summary && project.summary !== visual.summary && (
                  <div className="lightbox-about">
                    <span className="lightbox-about-label">About the project</span>
                    <p>{project.summary}</p>
                  </div>
                )}
                <div className="section-head-actions section-actions-below">
                  <button onClick={() => setEditingSummary(true)}>Edit</button>
                  <button className="link-btn" onClick={() => regenerate("summary")} disabled={Boolean(busy)}>
                    {busy === "regenerate-summary" ? "Regenerating…" : "Regenerate"}
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
            {/* Its own Regenerate, so re-picking tags never costs a
                description you liked. Under the last field and on the left,
                where the summary's sits: it was at the right of the heading,
                which put it a few pixels under the summary's own Regenerate
                and read as belonging to that section instead. */}
            <div className="section-head-actions section-actions-below">
              <button
                className="link-btn"
                onClick={() => regenerate("tags")}
                disabled={Boolean(busy)}
                data-tip="Replaces this image's medium, aesthetic and industry tags"
              >
                {busy === "regenerate-tags" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
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
                  <a
                    key={s.id}
                    href={`/visuals/${s.id}`}
                    className={`lightbox-thumb${s.id === id ? " current" : ""}`}
                    onClick={(e) => thumbClick(e, s.id)}
                    data-tip={s.title || undefined}
                    aria-current={s.id === id ? "true" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumb_url} alt={s.title || "Visual"} loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {similar.length > 0 && (
            <section className="lightbox-panel-section detail-section">
              <h2>Similar</h2>
              <div className="lightbox-thumbs">
                {similar.map(({ item }) => (
                  <a
                    key={item.id}
                    href={`/visuals/${item.id}`}
                    className="lightbox-thumb"
                    onClick={(e) => thumbClick(e, item.id)}
                    data-tip={[item.title || "Untitled", item.agency_name || item.domain].filter(Boolean).join(" · ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb_url} alt={item.title || "Visual"} loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="lightbox-panel-section lightbox-panel-foot">
            <span className="meta-line">Saved {new Date(visual.saved_at).toLocaleDateString()}</span>
            <div className="lightbox-detail-actions">
              <button className="danger-btn" onClick={handleDelete}>
                Delete Visual
              </button>
            </div>
          </section>
        </aside>
        </div>
      )}
    </ModalShell>
  );
}
