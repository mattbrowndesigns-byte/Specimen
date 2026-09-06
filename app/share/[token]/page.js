"use client";
import { useEffect, useState, use as usePromise } from "react";
import { ArrowUpRight } from "lucide-react";
import Favicon from "../../_ui/Favicon";
import TagRow from "../../_ui/TagRow";
import { latestCapture } from "@/lib/captures";

// What someone without an account sees.
//
// Read-only by construction rather than by hiding buttons: this page has no
// mutating call in it at all, and the API behind it returns a narrower row than
// the owner's own view -- no notes, no review state, nothing hidden.
export default function SharedPage({ params }) {
  const { token } = usePromise(params);
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    fetch(`/api/shared/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setState({ status: "gone", message: data.error });
        setState({ status: "ready", ...data });
      })
      .catch(() => setState({ status: "gone" }));
  }, [token]);

  if (state.status === "loading") {
    return (
      <main className="page page-wide shared-page">
        <p className="empty-small">Loading…</p>
      </main>
    );
  }

  if (state.status === "gone") {
    return (
      <main className="page shared-page shared-gone">
        <h1 className="wordmark shared-mark">Kivli</h1>
        <h2>This link isn&rsquo;t available</h2>
        <p>{state.message || "It may have been revoked by whoever shared it."}</p>
      </main>
    );
  }

  const sites = state.sites || [];

  return (
    <>
      {/* Not the utility bar: none of what's in it applies to someone without
          an account, and offering Add to a reader who can't save is worse than
          offering nothing. */}
      <header className="shared-bar">
        <div className="shared-bar-inner">
          <a className="shared-brand" href="/">
            <span className="wordmark shared-mark">Kivli</span>
          </a>
          <span className="shared-bar-meta">
            {sites.length} {sites.length === 1 ? "site" : "sites"}, shared with you
          </span>
        </div>
      </header>

      <main className="page page-wide shared-page">
        <h1 className="page-hero shared-title">{state.title}</h1>

        {sites.length === 0 ? (
          <p className="empty">Nothing has been added to this yet.</p>
        ) : (
          <div className="grid grid-medium">
            {sites.map((site) => {
              const thumb = latestCapture(site.capture, "desktop")?.thumb_url;
              return (
                <div className="card" key={site.id}>
                  <div className="card-media">
                    <a
                      className="thumb"
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={site.name || site.domain} />
                      ) : (
                        <div className="placeholder">No capture</div>
                      )}
                    </a>
                  </div>
                  <div className="card-footer">
                    <span className="card-title">
                      <Favicon
                        url={site.url}
                        faviconUrl={site.favicon_url}
                        fills={site.favicon_fills !== false}
                        alt={site.name || site.domain}
                      />
                      <span className="name">{site.name || site.domain}</span>
                    </span>
                    <a
                      className="visit"
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      title="Open the site"
                    >
                      <ArrowUpRight size={15} />
                    </a>
                  </div>
                  <TagRow tags={site.tags || []} href={site.url} />
                </div>
              );
            })}
          </div>
        )}

        <p className="shared-foot">
          Collected in <a href="/">Kivli</a>, a visual inspiration library for UI, UX and product
          designers.
        </p>
      </main>
    </>
  );
}
