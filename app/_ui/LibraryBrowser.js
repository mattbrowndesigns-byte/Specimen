"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  List,
  AlignJustify,
  SlidersHorizontal,
  ArrowDownUp,
  Check,
  Grid3x3,
  Square,
  ArrowUpRight,
} from "lucide-react";
import FilterModal from "./FilterModal";
import SearchField from "./SearchField";
import ResultCount from "./ResultCount";
import SearchElsewhere from "./SearchElsewhere";
import NoMatches from "./NoMatches";
import useEdgeFade from "./useEdgeFade";
import SaveActions from "./SaveActions";
import Favicon from "./Favicon";
import AddMenu from "./AddMenu";
import FeatureRotator from "./FeatureRotator";
import TagRow from "./TagRow";

const VIEWS = [
  { id: "cards", label: "Cards", Icon: LayoutGrid },
  { id: "list", label: "List", Icon: List },
  { id: "headlines", label: "Headlines", Icon: AlignJustify },
];

// List rows are one wide column, so a fixed count holds its line. Cards are
// not: their width changes with the size switch and again at every grid
// breakpoint, so TagRow measures instead of counting.
const ROW_TAG_LIMIT = 4;

// A first screenful and a bit, then it asks. A library that grows past a few
// hundred saves shouldn't render all of them to show you the newest twelve,
// and an endless scroll would take the footer with it.
const PAGE_SIZE = 24;

// `date` reads whichever timestamp the adapter exposes, so sites (saved_at) and
// components (created_at) sort the same way without the browser knowing which
// it's holding.
// Card size, Finder-style but in three steps rather than a slider -- a
// continuous control would need a continuous grid, and the column count is what
// actually changes. Denser icon means smaller cards.
const SIZES = [
  { id: "small", label: "Small Cards", Icon: Grid3x3 },
  { id: "medium", label: "Medium Cards", Icon: LayoutGrid },
  { id: "large", label: "Large Cards", Icon: Square },
];

const SORTS = [
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "az", label: "Name A–Z" },
  { id: "za", label: "Name Z–A" },
];

function sortItems(items, sortId, adapter) {
  const byName = (a, b) =>
    adapter.name(a).localeCompare(adapter.name(b), undefined, { sensitivity: "base" });
  const byDate = (a, b) => new Date(adapter.date?.(b) || 0) - new Date(adapter.date?.(a) || 0);

  const sorted = [...items];
  if (sortId === "az") return sorted.sort(byName);
  if (sortId === "za") return sorted.sort((a, b) => byName(b, a));
  if (sortId === "oldest") return sorted.sort((a, b) => byDate(b, a));
  return sorted.sort(byDate);
}

// Shared browse surface for both the Websites and Components tabs: search,
// tag chips, filter modal and view modes. The parent owns the data and says
// how to read a name/thumbnail/link off an item, since sites and components
// don't share a shape.
export default function LibraryBrowser({
  items,
  allTags,
  query,
  onQueryChange,
  searchPlaceholder,
  emptyMessage,
  emptyHeadline,
  noun,
  adapter,
  onAdd,
  storageKey,
  onSearchElsewhere,
}) {
  // The recents list is per tab, and the tab already has a storage key, so it
  // derives from that rather than adding a prop every caller has to remember
  // to pass.
  const historyKey = storageKey?.replace(".view.", ".recent.");

  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [view, setView] = useState("cards");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("newest");
  const [size, setSize] = useState("medium");
  const [sortOpen, setSortOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const sortRef = useRef(null);
  const [stripRef, stripFade] = useEdgeFade([allTags.length, selectedTagIds.size]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
      const savedSort = localStorage.getItem(`${storageKey}.sort`);
      if (savedSort && SORTS.some((o) => o.id === savedSort)) setSort(savedSort);
      const savedSize = localStorage.getItem(`${storageKey}.size`);
      if (savedSize && SIZES.some((o) => o.id === savedSize)) setSize(savedSize);
    } catch {
      // localStorage can be unavailable; the defaults are fine.
    }
  }, [storageKey]);

  useEffect(() => {
    function onDocClick(e) {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setSortOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function chooseSize(id) {
    setSize(id);
    try {
      localStorage.setItem(`${storageKey}.size`, id);
    } catch {
      // Not persisting the choice is survivable.
    }
  }

  function chooseSort(id) {
    setSort(id);
    setSortOpen(false);
    try {
      localStorage.setItem(`${storageKey}.sort`, id);
    } catch {
      // Not persisting the choice is survivable.
    }
  }

  function chooseView(id) {
    setView(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      // Not persisting the choice is survivable.
    }
  }


  function toggleTag(id) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedTags = useMemo(
    () =>
      [...allTags].sort(
        (a, b) => (b.usage_count || 0) - (a.usage_count || 0) || a.label.localeCompare(b.label)
      ),
    [allTags]
  );

  // Chips within a facet are an OR; across facets they're an AND.
  const visible = useMemo(() => {
    if (selectedTagIds.size === 0) return items;
    const byFacet = {};
    for (const tag of allTags) {
      if (selectedTagIds.has(tag.id)) (byFacet[tag.facet] ||= new Set()).add(tag.id);
    }
    return items.filter((item) => {
      const ids = new Set((item.tags || []).map((t) => t.id));
      return Object.values(byFacet).every((set) => [...set].some((id) => ids.has(id)));
    });
  }, [items, selectedTagIds, allTags]);

  const ordered = useMemo(() => sortItems(visible, sort, adapter), [visible, sort, adapter]);

  // Back to the first page whenever the list itself changes underneath -- a
  // search that narrows to eight results shouldn't remember that you'd loaded
  // ninety-six of something else.
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [query, sort, selectedTagIds, items.length]);

  // What the search box may suggest. Tags lead and are ranked by how many
  // saves carry them, which is what makes the empty-field list read as
  // "what this library is mostly about" rather than as an alphabet. Names come
  // after, because a tag finds a shelf and a name finds one thing.
  const searchTerms = useMemo(() => {
    const tags = [...allTags]
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .map((tag) => tag.label);
    const names = items.map((item) => adapter.name(item)).filter(Boolean);
    const seen = new Set();
    return [...tags, ...names].filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allTags, items, adapter]);

  // "Nothing here yet" and "nothing matches" are different answers, and the
  // difference is whether you asked a question -- not how many rows came back.
  const searching = Boolean(query.trim()) || selectedTagIds.size > 0;

  const page = useMemo(() => ordered.slice(0, shown), [ordered, shown]);
  const remaining = ordered.length - page.length;

  function renderTags(item, limit) {
    const tags = item.tags || [];
    if (!tags.length) return null;
    const shown = limit ? tags.slice(0, limit) : tags;
    const hidden = tags.length - shown.length;
    return (
      <div className="card-tags">
        {shown.map((tag, i) => (
          <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
            {tag.label}
          </span>
        ))}
        {hidden > 0 && (
          <a className="chip chip-more" href={adapter.href(item)}>
            +{hidden} more
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <SearchField
          placeholder={searchPlaceholder}
          value={query}
          onChange={onQueryChange}
          historyKey={historyKey}
          terms={searchTerms}
        />
        <button className="filters-btn" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={15} />
          Filters{selectedTagIds.size > 0 ? ` (${selectedTagIds.size})` : ""}
        </button>
      </div>

      {sortedTags.length > 0 && (
        <div
          className={`chip-strip${stripFade}`}
          ref={stripRef}
        >
          {selectedTagIds.size > 0 && (
            <button className="chip chip-filter chip-clear" onClick={() => setSelectedTagIds(new Set())}>
              Clear
            </button>
          )}
          {sortedTags.map((tag) => (
            <button
              key={tag.id}
              className={`chip chip-filter${selectedTagIds.has(tag.id) ? " chip-selected" : ""}`}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.label}
              <span className="chip-count">{tag.usage_count || 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="results-bar">
        <ResultCount
          count={visible.length}
          noun={noun}
          query={query}
          onClear={() => onQueryChange("")}
        />
        <div className="results-controls">
          {view === "cards" && (
            <div className="size-switch">
              {SIZES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={size === id ? "active" : ""}
                  onClick={() => chooseSize(id)}
                  title={label}
                  aria-label={label}
                  aria-pressed={size === id}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          )}

          <div className="view-switch">
            {VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => chooseView(id)}
                title={label}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="sort-menu" ref={sortRef}>
            <button className="sort-btn" onClick={() => setSortOpen((v) => !v)} aria-expanded={sortOpen}>
              <ArrowDownUp size={14} />
              {SORTS.find((o) => o.id === sort)?.label}
            </button>
            {sortOpen && (
              <div className="sort-pop">
                <span className="sort-pop-head">Sort By</span>
                {SORTS.map((option) => (
                  <button
                    key={option.id}
                    className={`sort-option${sort === option.id ? " sort-option-on" : ""}`}
                    onClick={() => chooseSort(option.id)}
                  >
                    <span className="sort-check">{sort === option.id && <Check size={13} />}</span>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* An empty library is the first thing a new account sees, so it gets the
          panel the cards would have filled rather than one grey sentence. The
          filtered-to-nothing case stays a plain line -- that's a dead end you
          back out of, not a place to be welcomed.
          
          Which of the two you get turns on whether you are searching, not on
          how many items came back. Sites search on the server, so `items` IS
          the result: a search that found nothing left the list empty and this
          told you to start your library -- the one message guaranteed to be
          wrong, since you were looking for something you knew was in there.
          Components never hit it because they filter in the browser and keep
          the full list in `items`. */}
      {visible.length === 0 &&
        (searching ? (
          <NoMatches noun={noun} query={query}>
            {onSearchElsewhere && query.trim() && (
              <SearchElsewhere query={query} kind={adapter.kind} onGo={onSearchElsewhere} />
            )}
          </NoMatches>
        ) : (
          <div className="empty-state">
            <h2 className="empty-state-headline">{emptyHeadline}</h2>
            <p className="empty-state-body">{emptyMessage}</p>
            {onAdd && <AddMenu onSubmit={onAdd} variant="hero" />}
            <FeatureRotator className="empty-state-rotator" />
          </div>
        ))}

      {view === "cards" && (
        <div className={`grid grid-${size}`}>
          {page.map((item) => (
            <div className="card" key={item.id}>
              <div className="card-media">
                <a className={`thumb${adapter.naturalThumb ? " thumb-natural" : ""}`} href={adapter.href(item)}>
                  {adapter.thumb(item) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={adapter.thumb(item)} alt={adapter.name(item)} />
                  ) : (
                    <div className="placeholder">{adapter.pendingLabel}</div>
                  )}
                </a>
                <SaveActions
                  className="card-actions"
                  kind={adapter.kind}
                  id={item.id}
                  name={adapter.name(item)}
                  isFavorite={item.is_favorite}
                />
              </div>
              <div className="card-footer">
                <span className="card-title">
                  <Favicon
                    url={adapter.externalUrl(item)}
                    faviconUrl={adapter.faviconUrl?.(item)}
                    fills={item.favicon_fills !== false}
                    alt={adapter.name(item)}
                  />
                  <a className="name" href={adapter.href(item)} title={item.summary || undefined}>
                    {adapter.name(item)}
                  </a>
                </span>
                <a
                  className="visit"
                  href={adapter.externalUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Launch site"
                >
                  <ArrowUpRight size={15} />
                </a>
              </div>
              <TagRow tags={item.tags || []} href={adapter.href(item)} />
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="row-list">
          {page.map((item) => (
            <div className="row-item" key={item.id}>
              <a className="row-thumb" href={adapter.href(item)}>
                {adapter.thumb(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={adapter.thumb(item)} alt={adapter.name(item)} />
                ) : (
                  <div className="placeholder">…</div>
                )}
              </a>
              <div className="row-body">
                <span className="row-title">
                  <Favicon
                    url={adapter.externalUrl(item)}
                    faviconUrl={adapter.faviconUrl?.(item)}
                    fills={item.favicon_fills !== false}
                    alt={adapter.name(item)}
                  />
                  <a className="row-name" href={adapter.href(item)}>
                    {adapter.name(item)}
                  </a>
                  <span className="row-domain">{adapter.meta(item)}</span>
                </span>
                {item.summary && <p className="row-summary">{item.summary}</p>}
                {renderTags(item, ROW_TAG_LIMIT)}
              </div>
              <SaveActions
                kind={adapter.kind}
                id={item.id}
                name={adapter.name(item)}
                isFavorite={item.is_favorite}
              />
              <a
                className="visit"
                href={adapter.externalUrl(item)}
                target="_blank"
                rel="noopener noreferrer"
                title="Launch site"
              >
                <ArrowUpRight size={15} />
              </a>
            </div>
          ))}
        </div>
      )}

      {view === "headlines" && (
        <div className="headline-list">
          {page.map((item) => (
            <div className="headline-item" key={item.id}>
              <Favicon
                url={adapter.externalUrl(item)}
                faviconUrl={adapter.faviconUrl?.(item)}
                fills={item.favicon_fills !== false}
                alt={adapter.name(item)}
              />
              <a className="row-name stretch-link" href={adapter.href(item)}>
                {adapter.name(item)}
              </a>
              <span className="row-domain">{adapter.meta(item)}</span>
              <a
                className="visit"
                href={adapter.externalUrl(item)}
                target="_blank"
                rel="noopener noreferrer"
                title="Launch site"
              >
                <ArrowUpRight size={15} />
              </a>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="load-more-row">
          <button className="load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Load More
          </button>
          <span className="load-more-count">
            Showing {page.length} of {ordered.length}
          </span>
        </div>
      )}

      {filtersOpen && (
        <FilterModal
          allTags={sortedTags}
          selectedTagIds={selectedTagIds}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setSelectedTagIds(next);
            setFiltersOpen(false);
          }}
        />
      )}
    </>
  );
}
