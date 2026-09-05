"use client";
import { useState } from "react";
import ModalShell from "./ModalShell";
import { formatCaptureDate } from "@/lib/captures";

const PREVIEW_LIMIT = 4;

// Discovered pages, curated.
//
// A nav mega-menu yields every flavour of every product, which for a store
// meant thirty near-identical links running down the page. Enrichment now
// flags the handful that stand for the site's distinct templates -- the shop
// archive, one product detail, pricing, an FAQ -- and those are what shows.
// The rest are kept, not deleted, and sit behind "Show all" under their own
// heading.
//
// A site with nothing flagged (enrichment hasn't run, or failed) falls back to
// showing everything, so discovery never looks empty when it isn't.
// What a page is called here is what it does, not what its own nav called it.
// A site writes "Why us" or "Get started free" to sell to its visitors; this
// library is for comparing one site's page set against another's, and that
// only works if a demo request is called Request A Demo on both.
const pageName = (page) => page.utility_label || page.label || page.url;

export default function DiscoveredPages({
  pages,
  pageTypeLabel,
  promoted,
  promoting,
  onPromote,
  onRefresh,
  refreshing,
  readAt,
}) {
  const [open, setOpen] = useState(false);

  if (!pages || pages.length === 0) return null;

  const flagged = pages.filter((p) => p.is_representative);
  const key = flagged.length > 0 ? flagged : pages;
  const rest = flagged.length > 0 ? pages.filter((p) => !p.is_representative) : [];

  const preview = key.slice(0, PREVIEW_LIMIT);
  const hasMore = key.length > preview.length || rest.length > 0;

  const groups = groupByType(key, pageTypeLabel);

  return (
    <section className="detail-section">
      {/* Count inline after the heading, the same place the palette and the
          typefaces put theirs. */}
      <h2>
        {flagged.length > 0 ? "Key Pages" : "Discovered Pages"}{" "}
        <span className="section-count">{key.length}</span>
      </h2>

      <ul className="page-list page-list-compact">
        {preview.map((page) => (
          <li key={page.id}>
            <a href={page.url} target="_blank" rel="noopener noreferrer" title={page.label || page.url}>
              {pageName(page)}
            </a>
            {page.page_type && <span className="page-type-badge">{pageTypeLabel(page.page_type)}</span>}
          </li>
        ))}
      </ul>

      {/* Two buttons that looked identical were asking for the same attention.
          Opening the list is what you came to do; re-reading it is maintenance,
          so it steps back to match the style panel's own re-read control. */}
      <div className="page-list-actions">
        <button className="page-list-open" onClick={() => setOpen(true)}>
          {hasMore ? `Show All ${pages.length} Pages` : "Open All Pages"}
        </button>
        {onRefresh && (
          <button className="link-btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Re-reading…" : "Re-read Pages"}
          </button>
        )}
        {readAt && !refreshing && <span className="style-read-at">Read {formatCaptureDate(readAt)}</span>}
      </div>

      {open && (
        <ModalShell label="Discovered pages" wide onClose={() => setOpen(false)}>
          <div className="modal-head">
            <h2>Discovered Pages ({pages.length})</h2>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="modal-body">
            {flagged.length > 0 && <h3 className="page-section-head">Key Pages</h3>}
            {groups.map(([typeSlug, group]) => (
              <div className="page-group" key={typeSlug || "none"}>
                <h3>{pageTypeLabel(typeSlug)}</h3>
                <PageList
                  pages={group}
                  promoted={promoted}
                  promoting={promoting}
                  onPromote={onPromote}
                />
              </div>
            ))}

            {rest.length > 0 && (
              <div className="page-group">
                <h3 className="page-section-head">Everything Else Found ({rest.length})</h3>
                <PageList
                  pages={rest}
                  promoted={promoted}
                  promoting={promoting}
                  onPromote={onPromote}
                />
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </section>
  );
}

function groupByType(pages, pageTypeLabel) {
  const byType = new Map();
  for (const page of pages) {
    const slug = page.page_type || "";
    if (!byType.has(slug)) byType.set(slug, []);
    byType.get(slug).push(page);
  }
  return [...byType.entries()].sort((a, b) => pageTypeLabel(a[0]).localeCompare(pageTypeLabel(b[0])));
}

function PageList({ pages, promoted, promoting, onPromote }) {
  return (
    <ul className="page-list">
      {pages.map((page) => (
        <li key={page.id}>
          <a href={page.url} target="_blank" rel="noopener noreferrer" title={page.label || page.url}>
            {pageName(page)}
          </a>
          {promoted[page.id] ? (
            <a className="promote-link" href={`/sites/${promoted[page.id]}`}>
              View Full Capture →
            </a>
          ) : (
            <button
              className="promote-btn"
              disabled={promoting === page.id}
              onClick={() => onPromote(page)}
            >
              {promoting === page.id ? "Capturing…" : "Promote To Full Capture"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
