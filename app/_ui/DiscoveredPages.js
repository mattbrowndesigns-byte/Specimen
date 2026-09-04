"use client";
import { useState } from "react";
import ModalShell from "./ModalShell";

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
export default function DiscoveredPages({
  pages,
  pageTypeLabel,
  promoted,
  promoting,
  onPromote,
  onRefresh,
  refreshing,
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
      <div className="section-head">
        <h2>{flagged.length > 0 ? "Key pages" : "Discovered pages"}</h2>
        <span className="section-count">{key.length}</span>
      </div>

      <ul className="page-list page-list-compact">
        {preview.map((page) => (
          <li key={page.id}>
            <a href={page.url} target="_blank" rel="noopener noreferrer">
              {page.label || page.url}
            </a>
            {page.page_type && <span className="page-type-badge">{pageTypeLabel(page.page_type)}</span>}
          </li>
        ))}
      </ul>

      <div className="page-list-actions">
        <button className="link-btn" onClick={() => setOpen(true)}>
          {hasMore ? `Show all ${pages.length} pages` : "Open all pages"}
        </button>
        {onRefresh && (
          <button className="link-btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Re-reading…" : "Refresh pages"}
          </button>
        )}
      </div>

      {open && (
        <ModalShell label="Discovered pages" wide onClose={() => setOpen(false)}>
          <div className="modal-head">
            <h2>Discovered pages ({pages.length})</h2>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="modal-body">
            {flagged.length > 0 && <h3 className="page-section-head">Key pages</h3>}
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
                <h3 className="page-section-head">Everything else found ({rest.length})</h3>
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
          <a href={page.url} target="_blank" rel="noopener noreferrer">
            {page.label || page.url}
          </a>
          {promoted[page.id] ? (
            <a className="promote-link" href={`/sites/${promoted[page.id]}`}>
              View full capture →
            </a>
          ) : (
            <button
              className="promote-btn"
              disabled={promoting === page.id}
              onClick={() => onPromote(page)}
            >
              {promoting === page.id ? "Capturing…" : "Promote to full capture"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
