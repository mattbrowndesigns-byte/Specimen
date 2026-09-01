"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [sites, setSites] = useState([]);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  async function loadSites() {
    const res = await fetch("/api/sites");
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites || []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    loadSites();
    const interval = setInterval(loadSites, 5000);
    return () => clearInterval(interval);
  }, []);

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
    } catch (err) {
      setError("Couldn't reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  function desktopThumb(site) {
    const capture = (site.capture || []).find((c) => c.viewport === "desktop");
    return capture?.thumb_url || null;
  }

  return (
    <main className="page">
      <div className="top-nav">
        <h1>Inspiration Library</h1>
        <a href="/tags">Manage tags →</a>
      </div>
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
      {error && <p className="error">{error}</p>}

      {loaded && sites.length === 0 && (
        <p className="empty">Paste your first URL above to start your library.</p>
      )}

      <div className="grid">
        {sites.map((site) => {
          const thumb = desktopThumb(site);
          return (
            <div className="card" key={site.id}>
              <div className="thumb">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={site.name || site.domain} />
                ) : (
                  <div className="placeholder">Capturing…</div>
                )}
              </div>
              <div className="card-footer">
                <span className="name" title={site.summary || undefined}>
                  {site.name || site.domain}
                </span>
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
    </main>
  );
}
