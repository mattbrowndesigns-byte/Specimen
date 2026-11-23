"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play } from "lucide-react";
import UtilityBar from "../../../_ui/UtilityBar";
import SiteFooter from "../../../_ui/SiteFooter";
import Favicon from "../../../_ui/Favicon";
import PageDrop from "../../../_ui/PageDrop";
import PickLoading from "../../../_ui/PickLoading";
import { GAP, MasonrySkeleton, layout, useColumns } from "../../../_ui/masonry";
import VisualMedia from "../../../_ui/VisualMedia";
import { DEMO_SAVES, addDemoPicks, isDemoBrowser, readDemoPicks } from "../../../_ui/demoState";
import { grabClip } from "@/lib/videoFrame";
import { MAX_LOOP_BYTES, toMB } from "@/lib/uploadLimits";

const MAX_VIDEO_MB = toMB(MAX_LOOP_BYTES);
const MAX_PAGE_MB = 40;

// Where a case study's images are chosen before anything is saved.
//
// If the AI can't answer -- the free allowance spent, a slow afternoon -- the
// ticks come from size and position instead, with no banner about it: you
// choose either way, and a saved image without tags can be described later
// from its own page.
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
// How long to spend looking through a page's videos before the AI is asked.
// Past it the rest are sorted on their posters, as they all once were.
const MOMENTS_BUDGET_MS = 30000;

// In the demo the page has already been read and sorted -- for real, once, and
// kept on the demo's project -- so the wait is the only part replayed, at about
// half its length. Choosing and saving work as they do for an owner, except
// that what's ticked is remembered in this browser rather than written.
const DEMO_READ_MS = 4000;
const DEMO_SORT_MS = 5000;
const DEMO_SAVE_MS = 800;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isStaged = (id) => isDemoBrowser() && id === DEMO_SAVES.visual.projectId;

function Tile({ candidate, selected, onToggle }) {
  // Already in the library from an earlier pull of this page: shown so you
  // can see what you have, but it can't be chosen again.
  if (candidate.saved) {
    return (
      <div className="pick-tile pick-tile-saved" aria-label={`Already saved: ${candidate.title || "image"}`}>
        <VisualMedia visual={candidate} src={candidate.thumb_url} alt="" loading="lazy" />
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
      aria-label={`${selected ? "Selected" : "Not selected"}: ${candidate.title || candidate.alt || (candidate.video_url ? "video" : "image")}`}
    >
      {/* A video plays in the picker too: whether it's worth keeping is
          mostly a question of what it does. */}
      <VisualMedia visual={candidate} src={candidate.thumb_url} alt="" loading="lazy" />
      {candidate.video_url && (
        <span className="visual-card-badge" aria-hidden="true">
          <Play size={10} fill="currentColor" />
        </span>
      )}
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
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const [gridEl, setGridEl] = useState(null);
  const columns = useColumns(gridEl);

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
    setSelected(new Set((p.candidates || []).filter((c) => c.keep && !c.saved && !c.needs_poster).map((c) => c.key)));
    setPhase(p.state === "failed" ? "failed" : "ready");
  }, []);

  const run = useCallback(
    async (p) => {
      // 'queued' is an imported project the background reader hasn't got to
      // yet. Opening it is asking for it now, so it's read here instead.
      if (p.state === "extracting" || p.state === "queued" || p.state === "failed") {
        setPhase("extracting");
        await fetch(`/api/visuals/projects/${id}/extract`, { method: "POST" });
        p = await load();
        if (!p) return;
      }
      // Before the AI sorts, each video is looked through here, where there is
      // a decoder: five moments for the model, which can only see stills, and
      // a poster if the page gave none. One at a time, because each write
      // replaces the project's whole candidate list.
      const unseen = (c) => p.ai_state !== "done" && !c.video_frames;
      const needing = (p.candidates || []).filter((c) => c.video_url && !c.saved && (c.needs_poster || unseen(c)));
      if (p.state === "picking" && needing.length) {
        setPhase("posters");
        const until = Date.now() + MOMENTS_BUDGET_MS;
        for (const c of needing) {
          const moments = unseen(c) && Date.now() < until;
          if (!moments && !c.needs_poster) continue;
          const drawn = await grabClip(c.video_url, { poster: Boolean(c.needs_poster), moments });
          // Nothing to add. A video that needs a poster is sent regardless:
          // the server drops one it can't draw rather than offer a blank tile.
          if (!c.needs_poster && !drawn.moments.length) continue;
          const form = new FormData();
          form.append("key", c.key);
          if (drawn.poster) form.append("frame", drawn.poster, `${c.key}.jpg`);
          drawn.moments.forEach((blob, i) => form.append("moment", blob, `${c.key}-${i}.jpg`));
          await fetch(`/api/visuals/projects/${id}/poster`, { method: "POST", body: form }).catch(() => {});
        }
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
      const demo = isStaged(id);
      setStaged(demo);
      const p = await load();
      if (!p) return;
      if (demo) {
        setPhase("extracting");
        await wait(DEMO_READ_MS);
        setPhase("sorting");
        await wait(DEMO_SORT_MS);
        const picked = readDemoPicks();
        show({
          ...p,
          state: "picking",
          candidates: (p.candidates || []).map((c) => ({ ...c, saved: picked.has(c.image_url) })),
        });
        return;
      }
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
  }, [id, load, run, show]);

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
    if (staged) {
      await wait(DEMO_SAVE_MS);
      addDemoPicks(fresh.filter((c) => selected.has(c.key)).map((c) => c.image_url));
      window.location.href = "/?tab=visuals";
      return;
    }
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
    if (staged) {
      window.location.href = "/?tab=visuals";
      return;
    }
    const res = await fetch(`/api/visuals/projects/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/?tab=visuals";
  }

  // A video still without a poster couldn't be drawn or stored; it has no
  // picture to save, so it isn't offered.
  const candidates = useMemo(() => (project?.candidates || []).filter((c) => !c.needs_poster), [project]);
  const fresh = useMemo(() => candidates.filter((c) => !c.saved), [candidates]);
  const hasSaved = fresh.length < candidates.length;
  const laidOut = useMemo(() => layout(candidates, columns), [candidates, columns]);
  const loading = phase === "loading" || phase === "extracting" || phase === "posters" || phase === "sorting";
  const videoCount = fresh.filter((c) => c.video_url).length;
  const tooLarge = project?.videos_too_large || 0;
  const count = selected.size;

  return (
    <>
      <UtilityBar onError={setError} />
      <main className="page pick-page">
        {error && <p className="error">{error}</p>}

        {loading && (
          <>
            <PickLoading phase={phase} seconds={staged ? (DEMO_READ_MS + DEMO_SORT_MS) / 1000 : ESTIMATE_SECONDS} />
            <MasonrySkeleton label="Finding images" />
          </>
        )}

        {phase === "failed" && project && (
          <div className="empty-state empty-state-search">
            <h2 className="empty-state-headline">Nothing to choose from.</h2>
            <p className="empty-state-body">
              {project.error || "That page couldn't be read."} You can add its images yourself, and they'll be saved
              under this link.
            </p>
            <PageDrop project={project}>
              <button className="primary" onClick={() => run(project)}>
                Try Again
              </button>
              {/* Nothing was found, so there's nothing to lose by leaving --
                  and on a page pulled again, your saved images stay put. */}
              <button className="pick-cancel" onClick={() => cancel({ confirm: false })}>
                Cancel
              </button>
            </PageDrop>
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
                {/* An imported project opened before its turn with the AI:
                    the piles are the size-and-position guess, and saying so
                    is the difference between "the AI chose badly" and "the
                    AI hasn't chosen". */}
                {project.ai_state === "queued" && (
                  <p className="pick-note">
                    Sorted by size and position for now. {project.error || "The AI hasn't looked at these yet."} Pick
                    by hand, or come back once it has.
                  </p>
                )}
                {/* The size cap is said wherever a video could be: always
                    when one was left out for it, and as a note beside any
                    that were kept, so it's no surprise next time. */}
                {(tooLarge > 0 || videoCount > 0) && (
                  <p className="pick-head-note">
                    {tooLarge > 0
                      ? `${tooLarge} video${tooLarge === 1 ? " was" : "s were"} left out for size. Videos can be up to ${MAX_VIDEO_MB} MB each, and ${MAX_PAGE_MB} MB for one page.`
                      : `Videos are kept as muted loops, up to ${MAX_VIDEO_MB} MB each.`}
                  </p>
                )}
              </div>
            </div>

            <div className="visual-board" ref={setGridEl} style={{ "--board-gap": `${GAP}px` }}>
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
