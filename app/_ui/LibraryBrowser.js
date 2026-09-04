"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List, AlignJustify, SlidersHorizontal } from "lucide-react";
import FilterModal from "./FilterModal";
import SaveActions from "./SaveActions";
import Favicon from "./Favicon";

const VIEWS = [
  { id: "cards", label: "Cards", Icon: LayoutGrid },
  { id: "list", label: "List", Icon: List },
  { id: "headlines", label: "Headlines", Icon: AlignJustify },
];

// Cards keep tags to two rows; four labels plus a "+N more" chip is what
// reliably fits at the grid's column width.
const CARD_TAG_LIMIT = 4;

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
  noun,
  adapter,
  storageKey,
}) {
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [view, setView] = useState("cards");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stripFade, setStripFade] = useState({ left: false, right: false });
  const stripRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
    } catch {
      // localStorage can be unavailable; the default view is fine.
    }
  }, [storageKey]);

  function chooseView(id) {
    setView(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      // Not persisting the choice is survivable.
    }
  }

  // The tag strip scrolls sideways, so it fades out at whichever edge still has
  // chips beyond it -- and stops fading once you reach the end, which is what
  // tells you there's nothing more to scroll to.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    function update() {
      const overflow = el.scrollWidth - el.clientWidth;
      setStripFade({
        left: el.scrollLeft > 4,
        right: overflow > 4 && el.scrollLeft < overflow - 4,
      });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [allTags.length, selectedTagIds.size]);

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

  function renderTags(item, limit) {
    const tags = item.tags || [];
    if (!tags.length) return null;
    const shown = limit ? tags.slice(0, limit) : tags;
    const hidden = tags.length - shown.length;
    return (
      <div className={`card-tags${limit ? " card-tags-clamped" : ""}`}>
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
        <input
          type="search"
          className="search-input"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button className="filters-btn" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={15} />
          Filters{selectedTagIds.size > 0 ? ` (${selectedTagIds.size})` : ""}
        </button>
      </div>

      {sortedTags.length > 0 && (
        <div
          className={`chip-strip${stripFade.left ? " chip-strip-fade-left" : ""}${
            stripFade.right ? " chip-strip-fade-right" : ""
          }`}
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
        <span>
          {visible.length} {visible.length === 1 ? noun : `${noun}s`}
        </span>
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
      </div>

      {items.length === 0 && <p className="empty">{emptyMessage}</p>}
      {items.length > 0 && visible.length === 0 && <p className="empty">Nothing matches those filters.</p>}

      {view === "cards" && (
        <div className="grid">
          {visible.map((item) => (
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
                  ↗
                </a>
              </div>
              {renderTags(item, CARD_TAG_LIMIT)}
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="row-list">
          {visible.map((item) => (
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
                {renderTags(item, CARD_TAG_LIMIT)}
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
                ↗
              </a>
            </div>
          ))}
        </div>
      )}

      {view === "headlines" && (
        <div className="headline-list">
          {visible.map((item) => (
            <div className="headline-item" key={item.id}>
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
              <a
                className="visit"
                href={adapter.externalUrl(item)}
                target="_blank"
                rel="noopener noreferrer"
                title="Launch site"
              >
                ↗
              </a>
            </div>
          ))}
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
