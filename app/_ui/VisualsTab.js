"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Grid3x3, LayoutGrid, SlidersHorizontal, Square } from "lucide-react";
import SearchField from "./SearchField";
import ResultCount from "./ResultCount";
import NoMatches from "./NoMatches";
import SearchElsewhere from "./SearchElsewhere";
import Favicon from "./Favicon";
import useEdgeFade from "./useEdgeFade";
import Lightbox from "./Lightbox";
import FilterModal from "./FilterModal";
import SaveActions from "./SaveActions";
import VisualMedia, { ClipBadge } from "./VisualMedia";
import useFileDrop, { DropOverlay } from "./useFileDrop";
import { startVisualUpload, useUploads } from "./uploads";
import { useDemoVisuals, useIsDemo } from "./demoState";

import { GAP, SEQUENCE_KEY, SIZES, MasonrySkeleton, layout, useColumns } from "./masonry";

// Same three sizes and icons as the other tabs' card grids.
const SIZE_OPTIONS = [
  { id: "small", label: "Small", Icon: Grid3x3 },
  { id: "medium", label: "Medium", Icon: LayoutGrid },
  { id: "large", label: "Large", Icon: Square },
];
const SIZE_KEY = "specimen.visuals.size";


// The fourth library: every image kept from a page, each its own card,
// at its own shape. A board rather than a grid of projects, because seeing
// everything is the point -- a logo and that logo on a bus are two findings,
// and grouping happens on a visual's own page instead.

function matches(visual, term) {
  if (!term) return true;
  const haystack = [
    visual.title,
    visual.project_title,
    visual.agency_name,
    visual.domain,
    visual.summary,
    visual.notes,
    ...(visual.tags || []).map((t) => t.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

// A fresh read of the board, plus any upload that landed after it was sent.
function keepLanded(rows, prev, landed) {
  const ids = new Set(rows.map((v) => v.id));
  return [...prev.filter((v) => landed.has(v.id) && !ids.has(v.id)), ...rows];
}

export default function VisualsTab({ allTags, groups, incomingQuery, onIncomingUsed, onSearchElsewhere }) {
  const [loadedVisuals, setVisuals] = useState([]);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [size, setSize] = useState("medium");
  const [boardEl, setBoardEl] = useState(null);
  const columns = useColumns(boardEl, SIZES[size]);

  // In the demo, the project the Add replays is on the board only as far as
  // it has been picked; outside it, this is the list as it came.
  const visuals = useDemoVisuals(loadedVisuals);

  // A per-browser preference, like the other tabs' view switches.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      if (saved && SIZES[saved]) setSize(saved);
    } catch {
      // No storage means the default size, not a broken board.
    }
  }, []);

  function chooseSize(next) {
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, next);
    } catch {
      // Not remembering a size is not worth an error.
    }
  }

  // The lightbox opens over the board rather than navigating away, so
  // closing it lands you where you were, scrolled where you were. The address
  // bar follows the open image (a refresh or a shared link opens it again
  // through /visuals/[id]), and Back closes it.
  const [lightbox, setLightbox] = useState(null);

  function openLightbox(e, id) {
    // Cmd-, Ctrl-, Shift- and middle-click keep their meaning: a new tab.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const sequence = visible.map((v) => v.id);
    try {
      sessionStorage.setItem(SEQUENCE_KEY, JSON.stringify(sequence));
    } catch {
      // Only matters for a refresh mid-lightbox.
    }
    window.history.pushState({ lightbox: true }, "", `/visuals/${id}`);
    setLightbox({ startId: id, sequence });
  }

  useEffect(() => {
    function onPop() {
      setLightbox(null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function closeLightbox() {
    if (window.history.state?.lightbox) window.history.back();
    else setLightbox(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/visuals");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error || "Couldn't load your visuals");
        return;
      }
      // An upload can land while this first read is out; keep what it brought.
      setVisuals((prev) => keepLanded(data.visuals || [], prev, seen.current));
      setPending(data.pending || []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const demo = useIsDemo();
  const dragging = useFileDrop(demo ? null : startVisualUpload);

  // Each uploaded image lands on the board the moment it's encoded, untitled,
  // so a drop has an answer before the AI does. `seen` is what stops one you
  // delete while its batch is still going from being put back.
  const uploads = useUploads("visual");
  const seen = useRef(new Set());
  useEffect(() => {
    const landed = uploads.flatMap((u) => u.items).filter((v) => !seen.current.has(v.id));
    if (!landed.length) return;
    landed.forEach((v) => seen.current.add(v.id));
    setVisuals((prev) => {
      const ids = new Set(prev.map((v) => v.id));
      return [...landed.filter((v) => !ids.has(v.id)).reverse(), ...prev];
    });
  }, [uploads]);

  // Then the titles, descriptions and tags, whether the AI answered or queued:
  // a reload shows whichever is true.
  const finished = uploads.filter((u) => u.phase === "done" && u.items.length).length;
  useEffect(() => {
    if (!finished) return undefined;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/visuals");
      if (!res.ok || cancelled) return;
      const rows = (await res.json()).visuals || [];
      if (!cancelled) setVisuals((prev) => keepLanded(rows, prev, seen.current));
    })();
    return () => {
      cancelled = true;
    };
  }, [finished]);

  const chipGroup = groups[0]?.key;

  // The first group's chips -- Medium, unless it's hidden -- counted over visuals rather than over the whole account --
  // the tags endpoint counts every kind of record, and a chip promising 4
  // that finds 1 is worse than no count.
  const chips = useMemo(() => {
    const counts = new Map();
    for (const v of visuals) {
      for (const t of v.tags || []) {
        if (t.facet === chipGroup) counts.set(t.id, (counts.get(t.id) || 0) + 1);
      }
    }
    return allTags
      .filter((t) => t.facet === chipGroup && counts.get(t.id))
      .map((t) => ({ ...t, count: counts.get(t.id) }))
      .sort((a, b) => b.count - a.count);
  }, [visuals, allTags, chipGroup]);

  const [stripRef, stripFade] = useEdgeFade([chips.length, selected.size]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Every visual tag with a count over visuals -- the modal hides the ones
  // nothing uses, the same rule the other tabs' filters follow.
  const filterOptions = useMemo(() => {
    const counts = new Map();
    for (const v of visuals) for (const t of v.tags || []) counts.set(t.id, (counts.get(t.id) || 0) + 1);
    return allTags.map((t) => ({ ...t, usage_count: counts.get(t.id) || 0 }));
  }, [visuals, allTags]);

  const searchTerms = useMemo(() => {
    const words = [
      ...chips.map((c) => c.label),
      ...allTags.filter((t) => t.facet !== chipGroup).map((t) => t.label),
      ...visuals.map((v) => v.project_title),
      ...visuals.map((v) => v.agency_name),
      ...visuals.map((v) => v.title),
    ].filter(Boolean);
    return [...new Set(words)];
  }, [chips, allTags, visuals, chipGroup]);

  // Within one facet the chosen tags are alternatives, across facets they all
  // have to hold -- Signage or Editorial, and Minimal -- which is how the
  // Websites and Components filters already work. This used to require every
  // chosen tag at once, so picking a second medium could only ever narrow to
  // the few images that were somehow both, and usually to nothing.
  const visible = useMemo(() => {
    const byFacet = {};
    for (const tag of allTags) {
      if (selected.has(tag.id)) (byFacet[tag.facet] ||= new Set()).add(tag.id);
    }
    const groups = Object.values(byFacet);
    return visuals.filter((v) => {
      if (!matches(v, query.trim())) return false;
      const ids = new Set((v.tags || []).map((t) => t.id));
      return groups.every((group) => [...group].some((id) => ids.has(id)));
    });
  }, [visuals, query, selected, allTags]);

  // A search carried over from another tab's empty result.
  useEffect(() => {
    if (incomingQuery == null) return;
    setQuery(incomingQuery);
    onIncomingUsed?.();
  }, [incomingQuery, onIncomingUsed]);

  const laidOut = useMemo(() => layout(visible, columns), [visible, columns]);
  const searching = Boolean(query.trim()) || selected.size > 0;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {error && <p className="error">{error}</p>}

      {dragging && <DropOverlay label="Visuals" />}

      {pending.length > 0 && (
        <div className="visual-pending">
          <h3>Waiting for your picks</h3>
          {pending.map((p) => (
            <a key={p.id} className="visual-pending-row" href={`/visuals/projects/${p.id}`}>
              <Favicon url={p.url} faviconUrl={p.favicon_url} fills={p.favicon_fills !== false} alt={p.domain} />
              <span className="visual-pending-name">
                <strong>{p.title || p.domain}</strong>
                <small>
                  {pendingLabel(p)}
                </small>
              </span>
              <ArrowRight size={16} />
            </a>
          ))}
        </div>
      )}

      <div className="toolbar">
        <SearchField
          placeholder="Search visuals, projects, agencies, tags"
          value={query}
          onChange={setQuery}
          historyKey="specimen.recent.visuals"
          terms={searchTerms}
        />
        <button className="filters-btn" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={15} />
          Filters{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {chips.length > 0 && (
        <div className={`chip-strip${stripFade}`} ref={stripRef}>
          {selected.size > 0 && (
            <button className="chip chip-filter chip-clear" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          )}
          {chips.map((tag) => (
            <button
              key={tag.id}
              className={`chip chip-filter${selected.has(tag.id) ? " chip-selected" : ""}`}
              onClick={() => toggle(tag.id)}
            >
              {tag.label}
              <span className="chip-count">{tag.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="results-bar">
        {loaded ? (
          <ResultCount count={visible.length} noun="visual" query={query} onClear={() => setQuery("")} />
        ) : (
          <span className="result-count result-count-loading">Loading visuals…</span>
        )}
        <div className="results-controls">
          <div className="size-switch">
            {SIZE_OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={size === id ? "active" : ""}
                onClick={() => chooseSize(id)}
                data-tip={label}
                aria-label={`${label} tiles`}
                aria-pressed={size === id}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loaded && !error && <MasonrySkeleton minColumn={SIZES[size]} label="Loading visuals" />}

      {loaded && visuals.length === 0 && !pending.length && (
        <div className="empty-state">
          <h2 className="empty-state-headline">Start your board.</h2>
          <p className="empty-state-body">
            Choose Visuals in Add and paste any page with images or looping videos worth keeping, or
            drop your own screenshots and clips anywhere on this page. Each one becomes its own card, tagged
            and credited.
          </p>
        </div>
      )}

      {loaded && searching && visible.length === 0 && (
        <NoMatches noun="visual" query={query}>
          {onSearchElsewhere && query.trim() && (
            <SearchElsewhere query={query} kind="visual" onGo={onSearchElsewhere} />
          )}
        </NoMatches>
      )}

      <div className="visual-board" ref={setBoardEl} style={{ "--board-gap": `${GAP}px` }}>
        {laidOut.map((column, i) => (
          <div className="visual-column" key={i}>
            {/* The heart and bookmark sit beside the link, not inside it: a
                button inside an anchor is invalid, and a click on one would
                also open the lightbox. Keyed on the favourite as well as the
                id, because the heart holds its own state and the lightbox can
                change it underneath. */}
            {column.map((v) => (
              <div key={v.id} className="visual-card-wrap">
              <a className="visual-card" href={`/visuals/${v.id}`} onClick={(e) => openLightbox(e, v.id)}>
                <VisualMedia visual={v} src={v.thumb_url} alt={v.title || "Visual"} loading="lazy" />
                {v.video_url && <ClipBadge />}
                {/* Just what it is. Who made it is one click away, in the
                    lightbox caption, where there's room to say it properly. */}
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
                  setVisuals((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_favorite: next } : x)))
                }
              />
              </div>
            ))}
          </div>
        ))}
      </div>

      {filtersOpen && (
        <FilterModal
          allTags={filterOptions}
          groups={groups}
          selectedTagIds={selected}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setSelected(next);
            setFiltersOpen(false);
          }}
        />
      )}

      {lightbox && (
        <Lightbox
          items={visuals}
          sequence={lightbox.sequence}
          startId={lightbox.startId}
          onClose={closeLightbox}
          onChange={(id) => window.history.replaceState({ lightbox: true }, "", `/visuals/${id}`)}
          onUpdated={(updated) =>
            setVisuals((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)))
          }
          onDeleted={(id) => setVisuals((prev) => prev.filter((v) => v.id !== id))}
        />
      )}
    </>
  );
}

// What a project not yet picked from is waiting for. An imported one has two
// states a project saved from the Add menu never sits in: queued behind the
// five-ahead ceiling, and read but not yet sorted because the day's AI
// allowance ran out. Both are still openable -- opening one reads it now, or
// shows the piles unsorted -- so the label says what is pending, not "wait".
function pendingLabel(p) {
  const who = p.agency_name || p.domain;
  if (p.state === "failed") return "Couldn't read that page";
  if (p.state === "queued") return "Waiting its turn to be read · open to read it now";
  if (p.state === "extracting") return "Not finished finding images";
  if (p.ai_state === "queued") return `${who} · ready to pick, AI sort still to come`;
  return `${who} · ready to pick`;
}
