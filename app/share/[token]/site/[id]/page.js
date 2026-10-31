"use client";
import { useEffect, useState, use as usePromise } from "react";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import Favicon from "../../../../_ui/Favicon";
import PublicBar from "../../../../_ui/PublicBar";
import SharedFooter from "../../../../_ui/SharedFooter";
import Wordmark from "../../../../_ui/Wordmark";
import SiteStyle from "../../../../_ui/SiteStyle";
import DiscoveredPages from "../../../../_ui/DiscoveredPages";
import { captureTimeline, formatCaptureDate } from "@/lib/captures";

// One saved site, as a stranger sees it.
//
// The share page used to send every card straight out to the live site, which
// meant the only thing a reader ever saw of this app was a grid of
// screenshots. Everything it had actually worked out -- the palette weighted
// by painted area, the typefaces identified from their letterforms, the pages
// it found, the captures it has kept -- was in the database and on nobody's
// screen.
//
// Read-only by construction, which is the same rule the list page follows:
// there is no mutating call anywhere in this file, and the API behind it
// returns a narrower row than the owner's own. The controls that are left all
// act on what you are looking at rather than on the record -- switching
// viewport, stepping back through the timeline, expanding the screenshot.

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

export default function SharedSitePage({ params, searchParams }) {
  const { token, id } = usePromise(params);
  // Opened from /demo, the way back goes to the demo, not to the plain share
  // link underneath it -- that page has no Add and would read as a different
  // place.
  const fromDemo = usePromise(searchParams)?.from === "demo";
  const [state, setState] = useState({ status: "loading" });
  const [viewport, setViewport] = useState("desktop");
  const [selectedRun, setSelectedRun] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/shared/${token}/site/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setState({ status: "gone", message: data.error });
        setState({ status: "ready", ...data });
      })
      .catch(() => setState({ status: "gone" }));
  }, [token, id]);

  if (state.status === "loading") {
    return (
      <main className="page page-wide shared-page">
        <p className="empty-small">Loading…</p>
      </main>
    );
  }

  // The same treatment the list page gives a dead link, deliberately: one
  // situation should not have two appearances depending on which URL in it you
  // happened to open.
  if (state.status === "gone") {
    return (
      <main className="page shared-page shared-gone">
        <a className="shared-brand wordmark-link" href="/">
          <Wordmark className="shared-mark" />
        </a>
        <h2>This link isn&rsquo;t available</h2>
        <p>{state.message || "It may have been revoked by whoever shared it."}</p>
      </main>
    );
  }

  const site = state.site;
  const timeline = captureTimeline(site.capture);
  const activeRun = timeline.find((r) => r.capturedAt === selectedRun) || timeline[0];
  const capture = activeRun?.byViewport[viewport] || null;
  const hasMobile = Boolean(activeRun?.byViewport.mobile);

  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (site.tags || []).filter((t) => t.facet === facet),
  })).filter(({ assigned }) => assigned.length > 0);

  const name = site.name || site.domain;

  return (
    <>
      <PublicBar />

      <main className="page detail-page">
        {/* The way back, and it has to be here rather than in the bar: the
            bar's two ends are the mark and the invitation, and a third thing
            between them pulls both off the edges they belong on. */}
        <a className="shared-back" href={fromDemo ? "/demo" : `/share/${token}`}>
          <ArrowLeft size={15} />
          {fromDemo ? "Back to the demo" : state.backTitle || "Back to the library"}
        </a>

        <div className="detail-header">
          <Favicon
            url={site.url}
            faviconUrl={site.favicon_url}
            fills={site.favicon_fills !== false}
            alt={name}
          />
          {/* A heading, not a text field. The owner's copy of this page puts an
              input here, which is most of why this page is its own file. */}
          <h1 className="shared-detail-title">{name}</h1>
          <div className="detail-actions">
            <a className="visit-btn" href={site.url} target="_blank" rel="noopener noreferrer nofollow">
              Visit site
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>

        <p className="meta-line">Saved {formatCaptureDate(site.saved_at)}</p>

        <div className="detail-columns">
          <div className="detail-main">
            <div className="capture-panel">
              {timeline.length > 1 && (
                <div className="capture-timeline">
                  {timeline
                    .slice()
                    .reverse()
                    .map((run, i, arr) => {
                      const isLatest = i === arr.length - 1;
                      return (
                        <button
                          key={run.capturedAt}
                          className={run.capturedAt === activeRun?.capturedAt ? "active" : ""}
                          onClick={() => setSelectedRun(run.capturedAt)}
                          title={new Date(run.capturedAt).toLocaleString()}
                        >
                          {formatCaptureDate(run.capturedAt)}
                          {isLatest && <span className="timeline-latest">Latest</span>}
                        </button>
                      );
                    })}
                </div>
              )}

              {/* No Wayback link and no delete. The first needs a route that
                  takes a session; the second is the owner's to press. */}
              {activeRun && (
                <p className="capture-meta">Captured {formatCaptureDate(activeRun.capturedAt)}</p>
              )}

              {hasMobile && (
                <div className="view-switch viewport-toggle">
                  <button
                    className={viewport === "desktop" ? "active" : ""}
                    onClick={() => setViewport("desktop")}
                  >
                    Desktop
                  </button>
                  <button
                    className={viewport === "mobile" ? "active" : ""}
                    onClick={() => setViewport("mobile")}
                  >
                    Mobile
                  </button>
                </div>
              )}

              <div
                className={`detail-capture${expanded ? "" : " detail-capture-collapsed"}${
                  viewport === "mobile" ? " detail-capture-mobile" : ""
                }`}
              >
                {capture?.full_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capture.full_url} alt={name} />
                ) : (
                  <div className="placeholder">No capture</div>
                )}
                {!expanded && capture?.full_url && <div className="capture-fade" />}
              </div>

              {capture?.full_url && (
                <button className="capture-expand" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Collapse Screenshot" : "Expand Full Screenshot"}
                </button>
              )}
            </div>
          </div>

          <aside className="detail-side">
            {site.summary && (
              <section className="detail-section">
                <h2 className="ai-heading">
                  <Sparkles size={15} />
                  AI Summary
                </h2>
                <p className="summary-text">{site.summary}</p>
                {site.enriched_at && (
                  <div className="section-head-actions section-actions-below">
                    <span className="style-read-at">
                      Written {formatCaptureDate(site.enriched_at)}
                    </span>
                  </div>
                )}
              </section>
            )}

            {tagsByFacet.length > 0 && (
              <section className="detail-section">
                <h2>Tags</h2>
                {/* Grouped by facet rather than run together, because the
                    facets are the point: what it is for, what kind of page,
                    what is on it, how it looks. A flat row of words loses the
                    only structural decision this library makes. */}
                {tagsByFacet.map(({ facet, assigned }) => (
                  <div className="facet-row" key={facet}>
                    <span className="facet-name">{FACET_LABELS[facet]}</span>
                    <span className="facet-tags">
                      {assigned.map((tag) => (
                        <span className="chip" key={tag.id}>
                          {tag.label}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <SiteStyle site={site} readOnly />

            <DiscoveredPages pages={site.pages || []} siteUrl={site.url} />
          </aside>
        </div>

        <section className="shared-invite">
          <h2>Want one of your own?</h2>
          <p>
            Kivli captures any site you paste, reads its colours and typefaces, tags it for you, and
            finds it again months later in about five seconds. It&rsquo;s invite-only while
            it&rsquo;s still being built.
          </p>
          <div className="shared-invite-actions">
            <a className="shared-invite-primary" href="/login">
              Create Your Library
            </a>
            <a className="shared-invite-secondary" href="/features">
              See what it does
            </a>
          </div>
        </section>
      </main>
      <SharedFooter />
    </>
  );
}
