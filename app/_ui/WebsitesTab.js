"use client";
import { useEffect, useMemo, useState } from "react";
import { latestCapture } from "@/lib/captures";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

export default function WebsitesTab() {
  const [sites, setSites] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

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
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadSites(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const interval = setInterval(() => loadSites(query), 5000);
    return () => clearInterval(interval);
  }, [query]);

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

  const tagsByFacet = useMemo(
    () => FACETS.map((facet) => ({ facet, tags: allTags.filter((t) => t.facet === facet) })),
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

  function desktopThumb(site) {
    return latestCapture(site.capture, "desktop")?.thumb_url || null;
  }

  return (
    <>
      <form className="save-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Paste a URL and press Enter…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>

      <input
        type="text"
        className="search-input"
        placeholder="Search name, summary, notes, tags, discovered pages…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {allTags.length > 0 && (
        <div className="filter-chips">
          {tagsByFacet.map(
            ({ facet, tags }) =>
              tags.length > 0 && (
                <div className="filter-facet" key={facet}>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`chip chip-filter${selectedTagIds.has(tag.id) ? " chip-selected" : ""}`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              )
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loaded && sites.length === 0 && (
        <p className="empty">Paste your first URL above to start your library.</p>
      )}
      {loaded && sites.length > 0 && visibleSites.length === 0 && (
        <p className="empty">Nothing matches those filters.</p>
      )}

      <div className="grid">
        {visibleSites.map((site) => {
          const thumb = desktopThumb(site);
          return (
            <div className="card" key={site.id}>
              <a className="thumb" href={`/sites/${site.id}`}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={site.name || site.domain} />
                ) : (
                  <div className="placeholder">Capturing…</div>
                )}
              </a>
              <div className="card-footer">
                <a className="name" href={`/sites/${site.id}`} title={site.summary || undefined}>
                  {site.name || site.domain}
                </a>
                <a
                  className="visit"
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Visit live site"
                >
                  ↗
                </a>
              </div>
              {site.tags?.length > 0 && (
                <div className="card-tags">
                  {site.tags.map((tag, i) => (
                    <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
