"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import UtilityBar from "../../../_ui/UtilityBar";
import SiteFooter from "../../../_ui/SiteFooter";
import Favicon from "../../../_ui/Favicon";
import { useAnnounceWork } from "../../../_ui/workInFlight";
import FeatureRotator from "../../../_ui/FeatureRotator";
import { GAP, layout, useColumns } from "../../../_ui/masonry";

// Where a case study's images are chosen before anything is saved.
//
// Two states and nothing in between. While the page is being read and the AI
// is sorting, there is only the loading bar every other save uses -- no
// title, no images. The first version showed the images under a "sorting"
// line, so you could start choosing, and then the AI's answer landed and
// reset every choice you'd made. Nothing is shown until it can't change.
//
// Then the avatar, the title and one grid -- the same masonry as the board,
// with every image the page had. No summary or instructions above it; the
// ticks explain themselves. The AI's picks arrive ticked; a click ticks or unticks. Save keeps the
// ticked ones and deletes the rest from storage.

// Finding the images is ~4s and the AI sort ~12s on a real case study.
const ESTIMATE_SECONDS = 18;

function Loading({ phase }) {
  const [elapsed, setElapsed] = useState(0);
  useAnnounceWork(true);
  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 0.25), 250);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="capture-status capture-status-quick pick-loading">
      <div className="capture-status-bar">
        <div
          className="capture-status-fill"
          style={{ width: `${Math.min(95, (elapsed / ESTIMATE_SECONDS) * 100)}%` }}
        />
      </div>
      <div className="capture-status-row">
        <p>
          {phase === "sorting" ? "Picking out the work from the rest of the page" : "Finding the images on the page"}
          {elapsed < ESTIMATE_SECONDS ? `: about ${Math.ceil(ESTIMATE_SECONDS - elapsed)}s remaining.` : ": finishing up."}
        </p>
        {/* The same aside the capture bar carries, so a visuals save reads as
            the same kind of wait as every other save. */}
        <span className="capture-status-aside">
          <FeatureRotator className="capture-status-rotator" />
          <a className="feature-rotator-more" href="/features">
            All features
          </a>
        </span>
      </div>
    </div>
  );
}

function Tile({ candidate, selected, onToggle }) {
  // Already in the library from an earlier pull of this page: shown so you
  // can see what you have, but it can't be chosen again.
  if (candidate.saved) {
    return (
      <div className="pick-tile pick-tile-saved" aria-label={`Already saved: ${candidate.title || "image"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={candidate.thumb_url}
          alt=""
          width={candidate.width || undefined}
          height={candidate.height || undefined}
          loading="lazy"
        />
        <span className="pick-saved-badge">In your library</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`pick-tile${selected ? " pick-tile-selected" : ""}`}
      onClick={() => onToggle(candidate.key)}
      aria-pressed={selected}
      aria-label={`${selected ? "Selected" : "Not selected"}: ${candidate.title || candidate.alt || "image"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidate.thumb_url}
        alt=""
        width={candidate.width || undefined}
        height={candidate.height || undefined}
        loading="lazy"
      />
      <span className="pick-check" aria-hidden="true">
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
      {(candidate.title || candidate.reason) && (
        <span className="visual-card-caption pick-caption">
          {candidate.title && <span className="visual-card-title">{candidate.title}</span>}
          {candidate.reason && <span className="visual-card-credit">{candidate.reason}</span>}
        </span>
      )}
    </button>
  );
}

export default function PickProjectPage({ params }) {
  const { id } = use(params);
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const gridRef = useRef(null);
  const columns = useColumns(gridRef);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visuals/projects/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't load this project");
      setPhase("error");
      return null;
    }
    return data.project;
  }, [id]);

  // Picks come from the row only once, when everything is finished, so
  // nothing that arrives later can overwrite a choice you've made.
  const show = useCallback((p) => {
    setProject(p);
    setSelected(new Set((p.candidates || []).filter((c) => c.keep && !c.saved).map((c) => c.key)));
    setPhase(p.state === "failed" ? "failed" : "ready");
  }, []);

  const run = useCallback(
    async (p) => {
      if (p.state === "extracting" || p.state === "failed") {
        setPhase("extracting");
        await fetch(`/api/visuals/projects/${id}/extract`, { method: "POST" });
        p = await load();
        if (!p) return;
      }
      if (p.state === "picking" && p.ai_state === "pending") {
        setPhase("sorting");
        await fetch(`/api/visuals/projects/${id}/select`, { method: "POST" });
        p = await load();
        if (!p) return;
      }
      show(p);
    },
    [id, load, show]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const p = await load();
      if (!p) return;
      if (p.state === "saved") {
        window.location.href = "/?tab=visuals";
        return;
      }
      if (p.state === "failed") {
        show(p);
        return;
      }
      run(p);
    })();
  }, [load, run, show]);

  async function retryAi() {
    setPhase("sorting");
    await fetch(`/api/visuals/projects/${id}/select`, { method: "POST" });
    const p = await load();
    if (p) show(p);
  }

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/visuals/projects/${id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep: [...selected] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't save these");
      setSaving(false);
      return;
    }
    window.location.href = "/?tab=visuals";
  }

  // Leaving without saving. On a first pull that deletes what was found; on a
  // page pulled again, the images already in your library stay where they
  // are and only the new finds are thrown away -- the server decides which.
  async function cancel({ confirm = true } = {}) {
    if (confirm && !hasSaved && !window.confirm("Leave without saving? The images found on this page will be deleted.")) return;
    const res = await fetch(`/api/visuals/projects/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/?tab=visuals";
  }

  const candidates = useMemo(() => project?.candidates || [], [project]);
  const fresh = useMemo(() => candidates.filter((c) => !c.saved), [candidates]);
  const hasSaved = fresh.length < candidates.length;
  const laidOut = useMemo(() => layout(candidates, columns), [candidates, columns]);
  const loading = phase === "loading" || phase === "extracting" || phase === "sorting";
  const count = selected.size;

  return (
    <>
      <UtilityBar onError={setError} />
      <main className="page pick-page">
        {error && <p className="error">{error}</p>}

        {loading && <Loading phase={phase} />}

        {phase === "failed" && project && (
          <div className="empty-state empty-state-search">
            <h2 className="empty-state-headline">Nothing to choose from.</h2>
            <p className="empty-state-body">{project.error || "That page couldn't be read."}</p>
            <div className="pick-failed-actions">
              <button className="primary" onClick={() => run(project)}>
                Try Again
              </button>
              {/* Nothing was found, so there's nothing to lose by leaving --
                  and on a page pulled again, your saved images stay put. */}
              <button className="pick-cancel" onClick={() => cancel({ confirm: false })}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "ready" && project && (
          <>
            <div className="pick-head">
              <Favicon
                url={project.url}
                faviconUrl={project.favicon_url}
                fills={project.favicon_fills !== false}
                alt={project.domain}
              />
              <div className="pick-head-text">
                <h1>{project.title || project.domain}</h1>
              </div>
            </div>

            {project.ai_state === "failed" && (
              <p className="pick-note">
                {project.error || "The AI didn't pick these."}{" "}
                <button className="link-btn" onClick={retryAi}>
                  Try the AI again
                </button>
              </p>
            )}

            <div className="visual-board" ref={gridRef} style={{ "--board-gap": `${GAP}px` }}>
              {laidOut.map((column, i) => (
                <div className="visual-column" key={i}>
                  {column.map((c) => (
                    <Tile key={c.key} candidate={c} selected={selected.has(c.key)} onToggle={toggle} />
                  ))}
                </div>
              ))}
            </div>

            <div className="pick-bar">
              <button className={hasSaved ? "pick-cancel" : "danger-btn"} onClick={() => cancel()} disabled={saving}>
                {hasSaved ? "Cancel" : "Discard"}
              </button>
              <span className="pick-bar-count">
                {count} of {fresh.length} {hasSaved ? "new " : ""}selected
                {hasSaved && ` · ${candidates.length - fresh.length} already in your library`}
              </span>
              {fresh.length > 0 && (
                <button
                  className="link-btn"
                  onClick={() => setSelected(count === fresh.length ? new Set() : new Set(fresh.map((c) => c.key)))}
                >
                  {count === fresh.length ? "Select none" : "Select all"}
                </button>
              )}
              <button className="primary" onClick={save} disabled={saving || count === 0}>
                {saving ? "Saving…" : `Save ${count} Visual${count === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
