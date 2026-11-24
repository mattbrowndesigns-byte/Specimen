"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import Favicon from "./Favicon";
import Lightbox from "./Lightbox";
import SaveActions from "./SaveActions";
import VisualMedia, { ClipBadge } from "./VisualMedia";
import { GAP, MasonrySkeleton, SEQUENCE_KEY, layout, useColumns } from "./masonry";
import { holdDemoVisuals } from "./demoState";

// What you just kept, on its own. Saving used to land you on the whole board,
// where the four images you'd picked were somewhere among two hundred; this is
// the same project, the same layout you chose them on, and nothing else.
//
// The newest save from the page comes first: one insert stamps every row of a
// save alike, so the rows sharing the latest time are it. Anything kept from
// the page earlier sits under its own heading.
export default function SavedVisuals({ project, justSaved }) {
  const [all, setAll] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/visuals").catch(() => null);
      const data = await res?.json().catch(() => ({}));
      if (cancelled) return;
      if (!res?.ok) setError(data?.error || "Couldn't load your visuals");
      else setAll(holdDemoVisuals(data.visuals || []).filter((v) => v.project_id === project.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const { fresh, earlier } = useMemo(() => {
    if (!all) return { fresh: [], earlier: [] };
    if (!justSaved) return { fresh: all, earlier: [] };
    const latest = all.reduce((t, v) => (v.saved_at > t ? v.saved_at : t), "");
    return { fresh: all.filter((v) => v.saved_at === latest), earlier: all.filter((v) => v.saved_at !== latest) };
  }, [all, justSaved]);

  // The same lightbox the board opens, over this page, so closing it comes
  // back here. The address follows the open image, and Back closes it.
  function openLightbox(e, id) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const sequence = [...fresh, ...earlier].map((v) => v.id);
    try {
      sessionStorage.setItem(SEQUENCE_KEY, JSON.stringify(sequence));
    } catch {
      // Only matters for a refresh mid-lightbox.
    }
    window.history.pushState({ lightbox: true }, "", `/visuals/${id}`);
    setLightbox({ startId: id, sequence });
  }

  useEffect(() => {
    const onPop = () => setLightbox(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function closeLightbox() {
    if (window.history.state?.lightbox) window.history.back();
    else setLightbox(null);
  }

  const n = fresh.length;
  const label = !justSaved
    ? `${n} ${n === 1 ? "visual" : "visuals"} from this page`
    : `Saved ${n} ${n === 1 ? "visual" : "visuals"}. Titles and tags fill in on their own.`;

  return (
    <>
      <div className="pick-head saved-head">
        <Favicon
          url={project.url}
          faviconUrl={project.favicon_url}
          fills={project.favicon_fills !== false}
          alt={project.domain || project.title}
        />
        <div className="pick-head-text">
          <h1>{project.title || project.domain || "Your files"}</h1>
          {all && <p className="pick-head-note">{label}</p>}
        </div>
        <a className="visit-btn saved-all" href="/?tab=visuals">
          All Visuals
          <ArrowRight size={15} />
        </a>
      </div>

      {error && <p className="error">{error}</p>}
      {!all && !error && <MasonrySkeleton label="Loading what you saved" />}
      {all && n === 0 && (
        <div className="empty-state empty-state-search">
          <h2 className="empty-state-headline">Nothing from this page is in your library.</h2>
        </div>
      )}

      {n > 0 && <Board visuals={fresh} onOpen={openLightbox} setAll={setAll} />}
      {earlier.length > 0 && (
        <>
          <h2 className="saved-earlier">Saved from this page before</h2>
          <Board visuals={earlier} onOpen={openLightbox} setAll={setAll} />
        </>
      )}

      {lightbox && (
        <Lightbox
          items={all}
          sequence={lightbox.sequence}
          startId={lightbox.startId}
          onClose={closeLightbox}
          onChange={(id) => window.history.replaceState({ lightbox: true }, "", `/visuals/${id}`)}
          onUpdated={(updated) => setAll((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)))}
          onDeleted={(id) => setAll((prev) => prev.filter((v) => v.id !== id))}
        />
      )}
    </>
  );
}

function Board({ visuals, onOpen, setAll }) {
  const [el, setEl] = useState(null);
  const columns = useColumns(el);
  const laidOut = useMemo(() => layout(visuals, columns), [visuals, columns]);
  return (
    <div className="visual-board" ref={setEl} style={{ "--board-gap": `${GAP}px` }}>
      {laidOut.map((column, i) => (
        <div className="visual-column" key={i}>
          {column.map((v) => (
            <div key={v.id} className="visual-card-wrap">
              <a className="visual-card" href={`/visuals/${v.id}`} onClick={(e) => onOpen(e, v.id)}>
                <VisualMedia visual={v} src={v.thumb_url} alt={v.title || "Visual"} loading="lazy" />
                {v.video_url && <ClipBadge />}
                <span className="visual-card-caption">
                  <span className="visual-card-title">{v.title || "Untitled"}</span>
                </span>
              </a>
              <SaveActions
                key={`${v.id}:${Boolean(v.is_favorite)}`}
                className="card-actions"
                kind="visual"
                id={v.id}
                name={v.title || "Visual"}
                isFavorite={v.is_favorite}
                onFavoriteChange={(next) =>
                  setAll((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_favorite: next } : x)))
                }
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
