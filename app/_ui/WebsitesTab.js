"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { latestCapture } from "@/lib/captures";
import FilterModal from "./FilterModal";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

const VIEWS = [
  { id: "cards", label: "Cards" },
  { id: "list", label: "List" },
  { id: "headlines", label: "Headlines" },
];

// Cards show at most this many tags before collapsing into a "+N more" link.
const CARD_TAG_LIMIT = 6;

export default function WebsitesTab() {
  const [sites, setSites] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("cards");
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const addInputRef = useRef(null);

  async function loadSites(q) {
    const res = await fetch(`/api/sites${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites || []);
    }
    setLoaded(true);
  }

  async function loadTags() {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags((data.tags || []).filter((t) => t.is_approved));
    }
  }

  useEffect(() => {
    loadTags();
    try {
      const saved = localStorage.getItem("specimen.view");
      if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
    } catch {
      // localStorage can be unavailable; the default view is fine.
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadSites(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const interval = setInterval(() => loadSites(query), 5000);
    return () => clearInterval(interval);
  }, [query]);

  useEffect(() => {
    if (addOpen) addInputRef.current?.focus();
  }, [addOpen]);

  function chooseView(id) {
    setView(id);
    try {
      localStorage.setItem("specimen.view", id);
    } catch {
      // Not persisting the choice is survivable.
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSites((prev) => [data.site, ...prev]);
      setUrl("");
      setAddOpen(false);
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSubmitting(false);
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

  const visibleSites = useMemo(() => {
    if (selectedTagIds.size === 0) return sites;
    const selectedByFacet = {};
    for (const tag of allTags) {
      if (selectedTagIds.has(tag.id)) {
        (selectedByFacet[tag.facet] ||= new Set()).add(tag.id);
      }
    }
    return sites.filter((site) => {
      const siteTagIds = new Set((site.tags || []).map((t) => t.id));
      return Object.values(selectedByFacet).every((ids) => [...ids].some((id) => siteTagIds.has(id)));
    });
  }, [sites, selectedTagIds, allTags]);

  function thumbFor(site) {
    return latestCapture(site.capture, "desktop")?.thumb_url || null;
  }

  function renderTags(site, limit) {
    const tags = site.tags || [];
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
          <a className="chip chip-more" href={`/sites/${site.id}`}>
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
          placeholder="Search name, summary, notes, tags, discovered pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="filters-btn" onClick={() => setFiltersOpen(true)}>
          Filters{selectedTagIds.size > 0 ? ` (${selectedTagIds.size})` : ""}
        </button>
        <button className="add-btn" onClick={() => setAddOpen((v) => !v)}>
          + Add
        </button>
      </div>

      {addOpen && (
        <form className="add-form" onSubmit={handleSubmit}>
          <input
            ref={addInputRef}
            type="text"
            placeholder="Paste a URL and press Enter…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setAddOpen(false)} disabled={submitting}>
            Cancel
          </button>
        </form>
      )}

      {sortedTags.length > 0 && (
        <div className="chip-strip">
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
          {visibleSites.length} {visibleSites.length === 1 ? "site" : "sites"}
        </span>
        <div className="view-switch">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "active" : ""}
              onClick={() => chooseView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loaded && sites.length === 0 && (
        <p className="empty">Nothing saved yet — hit Add to save your first URL.</p>
      )}
      {loaded && sites.length > 0 && visibleSites.length === 0 && (
        <p className="empty">Nothing matches those filters.</p>
      )}

      {view === "cards" && (
        <div className="grid">
          {visibleSites.map((site) => (
            <div className="card" key={site.id}>
              <a className="thumb" href={`/sites/${site.id}`}>
                {thumbFor(site) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbFor(site)} alt={site.name || site.domain} />
                ) : (
                  <div className="placeholder">Capturing…</div>
                )}
              </a>
              <div className="card-footer">
                <a className="name" href={`/sites/${site.id}`} title={site.summary || undefined}>
                  {site.name || site.domain}
                </a>
                <a className="visit" href={site.url} target="_blank" rel="noopener noreferrer" title="Visit live site">
                  ↗
                </a>
              </div>
              {renderTags(site, CARD_TAG_LIMIT)}
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="row-list">
          {visibleSites.map((site) => (
            <div className="row-item" key={site.id}>
              <a className="row-thumb" href={`/sites/${site.id}`}>
                {thumbFor(site) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbFor(site)} alt={site.name || site.domain} />
                ) : (
                  <div className="placeholder">…</div>
                )}
              </a>
              <div className="row-body">
                <a className="row-name" href={`/sites/${site.id}`}>
                  {site.name || site.domain}
                </a>
                <span className="row-domain">{site.domain}</span>
                {site.summary && <p className="row-summary">{site.summary}</p>}
                {renderTags(site, CARD_TAG_LIMIT)}
              </div>
              <a className="visit" href={site.url} target="_blank" rel="noopener noreferrer" title="Visit live site">
                ↗
              </a>
            </div>
          ))}
        </div>
      )}

      {view === "headlines" && (
        <div className="headline-list">
          {visibleSites.map((site) => (
            <div className="headline-item" key={site.id}>
              <a className="row-name" href={`/sites/${site.id}`}>
                {site.name || site.domain}
              </a>
              <span className="row-domain">{site.domain}</span>
              <a className="visit" href={site.url} target="_blank" rel="noopener noreferrer" title="Visit live site">
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
