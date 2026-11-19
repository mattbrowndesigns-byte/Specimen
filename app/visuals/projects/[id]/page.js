"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import UtilityBar from "../../../_ui/UtilityBar";
import SiteFooter from "../../../_ui/SiteFooter";
import Favicon from "../../../_ui/Favicon";

// Where a case study's images are sorted before anything is saved.
//
// The machine makes the first pass -- which images are the work and which are
// the agency's own furniture -- and the owner makes the decision. Two piles,
// one click to move an image between them, and Save keeps one pile and
// deletes the other. Nothing reaches the board until this page says so.
//
// The page also drives the work: it calls extraction, then sorting, and shows
// which of the two it is waiting on. Each is its own request so neither gets
// near a route's 60 seconds, and reopening a half-finished project picks up
// where it stopped.

function Tile({ candidate, kept, onToggle }) {
  return (
    <button
      type="button"
      className={`pick-tile${kept ? " pick-tile-kept" : ""}`}
      onClick={() => onToggle(candidate.key)}
      aria-pressed={kept}
      title={candidate.reason || undefined}
    >
      <span className="pick-tile-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={candidate.thumb_url} alt={candidate.title || candidate.alt || "Candidate image"} loading="lazy" />
      </span>
      <span className="pick-tile-caption">
        <span className="pick-tile-title">{candidate.title || `${candidate.width} × ${candidate.height}`}</span>
        {candidate.reason && <span className="pick-tile-reason">{candidate.reason}</span>}
      </span>
      <span className="pick-tile-action">{kept ? "Move to floor" : "Keep"}</span>
    </button>
  );
}

export default function PickProjectPage({ params }) {
  const { id } = use(params);
  const [project, setProject] = useState(null);
  const [keep, setKeep] = useState(new Set());
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visuals/projects/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't load this project");
      setPhase("error");
      return null;
    }
    setProject(data.project);
    setKeep(new Set((data.project.candidates || []).filter((c) => c.keep).map((c) => c.key)));
    return data.project;
  }, [id]);

  const extract = useCallback(async () => {
    setPhase("extracting");
    setError(null);
    await fetch(`/api/visuals/projects/${id}/extract`, { method: "POST" });
    return load();
  }, [id, load]);

  const sort = useCallback(async () => {
    setPhase("sorting");
    await fetch(`/api/visuals/projects/${id}/select`, { method: "POST" });
    return load();
  }, [id, load]);

  // Drive whatever is left to do, once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let p = await load();
      if (!p) return;
      if (p.state === "saved") {
        window.location.href = "/?tab=visuals";
        return;
      }
      if (p.state === "extracting") p = await extract();
      if (p?.state === "picking" && p.ai_state === "pending") p = await sort();
      setPhase(p?.state === "failed" ? "failed" : "picking");
    })();
  }, [load, extract, sort]);

  async function retryAi() {
    const p = await sort();
    setPhase(p?.state === "failed" ? "failed" : "picking");
  }

  async function retryExtract() {
    let p = await extract();
    if (p?.state === "picking") p = await sort();
    setPhase(p?.state === "failed" ? "failed" : "picking");
  }

  function toggle(key) {
    setKeep((prev) => {
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
      body: JSON.stringify({ keep: [...keep] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't save these");
      setSaving(false);
      return;
    }
    window.location.href = "/?tab=visuals";
  }

  async function discard() {
    if (!window.confirm("Discard this project? Every image found on the page will be deleted.")) return;
    const res = await fetch(`/api/visuals/projects/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/?tab=visuals";
  }

  const candidates = useMemo(() => project?.candidates || [], [project]);
  const kept = candidates.filter((c) => keep.has(c.key));
  const floor = candidates.filter((c) => !keep.has(c.key));
  const busy = phase === "loading" || phase === "extracting" || phase === "sorting";

  return (
    <>
      <UtilityBar onError={setError} />
      <main className="page pick-page">
        {project && (
          <div className="pick-head">
            <Favicon
              url={project.url}
              faviconUrl={project.favicon_url}
              fills={project.favicon_fills !== false}
              alt={project.domain}
            />
            <div className="pick-head-text">
              <h1>{project.title || project.domain}</h1>
              <p className="pick-credit">
                By {project.agency_name || project.domain} ·{" "}
                <a href={project.url} target="_blank" rel="noopener noreferrer">
                  {project.domain}
                  <ArrowUpRight size={13} />
                </a>
              </p>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {busy && (
          <div className="pick-status" role="status">
            <span className="pick-status-dot" />
            {phase === "extracting"
              ? "Finding the images on the page…"
              : phase === "sorting"
                ? "Sorting the work from the rest of the page…"
                : "Loading…"}
          </div>
        )}

        {phase === "failed" && project && (
          <div className="empty-state empty-state-search">
            <h2 className="empty-state-headline">Nothing to pick from.</h2>
            <p className="empty-state-body">{project.error || "That page couldn't be read."}</p>
            <div className="pick-failed-actions">
              <button className="primary" onClick={retryExtract}>
                Try Again
              </button>
              <button className="danger-btn" onClick={discard}>
                Discard
              </button>
            </div>
          </div>
        )}

        {project?.state === "picking" && phase !== "extracting" && (
          <>
            {project.summary && (
              <p className="pick-summary">
                <Sparkles size={14} />
                {project.summary}
              </p>
            )}
            {project.ai_state === "failed" && phase !== "sorting" && (
              <p className="pick-note">
                {project.error || "The AI didn't sort these."}{" "}
                <button className="link-btn" onClick={retryAi}>
                  Try the AI again
                </button>
              </p>
            )}

            <section className="pick-section">
              <h2>
                Keeping <span className="pick-count">{kept.length}</span>
              </h2>
              {kept.length ? (
                <div className="pick-grid">
                  {kept.map((c) => (
                    <Tile key={c.key} candidate={c} kept onToggle={toggle} />
                  ))}
                </div>
              ) : (
                <p className="pick-empty">Nothing kept yet. Click an image on the floor to keep it.</p>
              )}
            </section>

            <section className="pick-section pick-floor">
              <h2>
                Cutting room floor <span className="pick-count">{floor.length}</span>
              </h2>
              <p className="pick-hint">
                What looked like the agency&rsquo;s own site rather than the work. Deleted when you save.
              </p>
              {floor.length ? (
                <div className="pick-grid">
                  {floor.map((c) => (
                    <Tile key={c.key} candidate={c} kept={false} onToggle={toggle} />
                  ))}
                </div>
              ) : (
                <p className="pick-empty">Everything on the page is being kept.</p>
              )}
            </section>

            <div className="pick-bar">
              <button className="danger-btn" onClick={discard} disabled={saving}>
                Discard Project
              </button>
              <button className="primary" onClick={save} disabled={saving || busy || kept.length === 0}>
                {saving ? "Saving…" : `Save ${kept.length} Visual${kept.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
