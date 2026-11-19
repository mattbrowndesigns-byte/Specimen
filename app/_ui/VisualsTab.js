"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Grid3x3, LayoutGrid, Square } from "lucide-react";
import SearchField from "./SearchField";
import ResultCount from "./ResultCount";
import NoMatches from "./NoMatches";
import Favicon from "./Favicon";
import useEdgeFade from "./useEdgeFade";
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
    visual.agency_name,
    visual.domain,
    visual.summary,
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

export default function VisualsTab({ allTags }) {
  const [visuals, setVisuals] = useState([]);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [size, setSize] = useState("medium");
  const [boardEl, setBoardEl] = useState(null);
  const columns = useColumns(boardEl, SIZES[size]);

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

  function rememberSequence() {
    try {
      sessionStorage.setItem(SEQUENCE_KEY, JSON.stringify(visible.map((v) => v.id)));
    } catch {
      // The lightbox falls back to the whole library's order.
    }
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
      setVisuals(data.visuals || []);
      setPending(data.pending || []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Medium chips, counted over visuals rather than over the whole account --
  // the tags endpoint counts every kind of record, and a chip promising 4
  // that finds 1 is worse than no count.
  const chips = useMemo(() => {
    const counts = new Map();
    for (const v of visuals) {
      for (const t of v.tags || []) {
        if (t.facet === "medium") counts.set(t.id, (counts.get(t.id) || 0) + 1);
      }
    }
    return allTags
      .filter((t) => t.facet === "medium" && counts.get(t.id))
      .map((t) => ({ ...t, count: counts.get(t.id) }))
      .sort((a, b) => b.count - a.count);
  }, [visuals, allTags]);

  const [stripRef, stripFade] = useEdgeFade([chips.length, selected.size]);

  const searchTerms = useMemo(() => {
    const words = [
      ...chips.map((c) => c.label),
      ...allTags.filter((t) => t.facet !== "medium").map((t) => t.label),
      ...visuals.map((v) => v.agency_name),
      ...visuals.map((v) => v.title),
    ].filter(Boolean);
    return [...new Set(words)];
  }, [chips, allTags, visuals]);

  const visible = useMemo(
    () =>
      visuals.filter(
        (v) =>
          matches(v, query.trim()) &&
          [...selected].every((id) => (v.tags || []).some((t) => t.id === id))
      ),
    [visuals, query, selected]
  );

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

      {pending.length > 0 && (
        <div className="visual-pending">
          <h3>Waiting for your picks</h3>
          {pending.map((p) => (
            <a key={p.id} className="visual-pending-row" href={`/visuals/projects/${p.id}`}>
              <Favicon url={p.url} faviconUrl={p.favicon_url} fills={p.favicon_fills !== false} alt={p.domain} />
              <span className="visual-pending-name">
                <strong>{p.title || p.domain}</strong>
                <small>
                  {p.state === "failed"
                    ? "Couldn't read that page"
                    : p.state === "extracting"
                      ? "Not finished finding images"
                      : `${p.agency_name || p.domain} · ready to pick`}
                </small>
              </span>
              <ArrowRight size={16} />
            </a>
          ))}
        </div>
      )}

      <div className="toolbar">
        <SearchField
          placeholder="Search visuals, agencies, tags"
          value={query}
          onChange={setQuery}
          historyKey="specimen.recent.visuals"
          terms={searchTerms}
        />
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
                title={label}
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
            Choose Visuals in Add and paste any page with images worth keeping. Each one you pick
            becomes its own card, tagged and credited.
          </p>
        </div>
      )}

      {loaded && searching && visible.length === 0 && <NoMatches noun="visual" query={query} />}

      <div className="visual-board" ref={setBoardEl} style={{ "--board-gap": `${GAP}px` }}>
        {laidOut.map((column, i) => (
          <div className="visual-column" key={i}>
            {column.map((v) => (
              <a key={v.id} className="visual-card" href={`/visuals/${v.id}`} onClick={rememberSequence}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.thumb_url}
                  alt={v.title || "Visual"}
                  width={v.width || undefined}
                  height={v.height || undefined}
                  loading="lazy"
                />
                <span className="visual-card-caption">
                  <span className="visual-card-title">{v.title || "Untitled"}</span>
                  {/* Credit on every card, always. */}
                  <span className="visual-card-credit">{v.agency_name || v.domain}</span>
                </span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
