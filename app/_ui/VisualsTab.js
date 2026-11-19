"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import SearchField from "./SearchField";
import ResultCount from "./ResultCount";
import NoMatches from "./NoMatches";
import Favicon from "./Favicon";
import useEdgeFade from "./useEdgeFade";

// The fourth library: every image kept from a case study, each its own card,
// at its own shape. A board rather than a grid of projects, because seeing
// everything is the point -- a logo and that logo on a bus are two findings,
// and grouping happens on a visual's own page instead.

// The narrowest a column may get. Pinterest's own is about 236; 240 gives
// five across at 1440 inside the page margins, and two on a phone.
const MIN_COLUMN = 240;
const GAP = 16;

// Shortest-column-first, so the newest saves read across the top the way a
// list reads, not down the first column the way CSS columns would put them.
// Every visual knows its own width and height, so this needs no image to
// load before it can place one.
function layout(items, columns) {
  const cols = Array.from({ length: columns }, () => ({ height: 0, items: [] }));
  for (const item of items) {
    const ratio = item.width && item.height ? item.height / item.width : 1;
    const shortest = cols.reduce((a, b) => (b.height < a.height ? b : a));
    shortest.items.push(item);
    shortest.height += ratio;
  }
  return cols.map((c) => c.items);
}

function useColumns(ref) {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const width = el.clientWidth;
      setColumns(Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

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
  const boardRef = useRef(null);
  const columns = useColumns(boardRef);

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
      </div>

      {loaded && visuals.length === 0 && !pending.length && (
        <div className="empty-state">
          <h2 className="empty-state-headline">Start your board.</h2>
          <p className="empty-state-body">
            Paste an agency case study into Add, choose Visuals, and every piece of work on the page
            becomes its own card, tagged and credited.
          </p>
        </div>
      )}

      {loaded && searching && visible.length === 0 && <NoMatches noun="visual" query={query} />}

      <div className="visual-board" ref={boardRef} style={{ "--board-gap": `${GAP}px` }}>
        {laidOut.map((column, i) => (
          <div className="visual-column" key={i}>
            {column.map((v) => (
              <a key={v.id} className="visual-card" href={`/visuals/${v.id}`}>
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
