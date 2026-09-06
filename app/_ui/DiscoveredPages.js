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
// A page is named after its own URL.
//
// Link text is written to persuade -- "Our mission and team", "Get started
// free" -- and a nav link built from two spans comes back as one run-on string
// with no space in it. The path is the site's own plain name for the page, and
// /about-us is About Us on every site there has ever been. The AI's label is
// the fallback for a path that says nothing (an id, a slug like /p/9f2c), and
// the raw link text is the last resort.
const TITLE_SKIP = new Set(["a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "at", "by"]);

function fromPath(url) {
  let segments;
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
  if (!segments.length) return "Home";

  const last = decodeURIComponent(segments[segments.length - 1]).replace(/\.\w{2,5}$/, "");
  // An id, a date, a hash -- nothing a reader would recognise as a name.
  if (!/[a-z]/i.test(last) || /^[0-9a-f]{8,}$/i.test(last) || last.length > 40) return null;

  const words = last.split(/[-_+]+/).filter(Boolean);
  if (!words.length) return null;

  return words
    .map((w, i) =>
      i > 0 && TITLE_SKIP.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

const pageName = (page) => fromPath(page.url) || page.utility_label || page.label || page.url;

// How central the page is, which is the question you have when you're deciding
// what to look at. What template it happens to be is not.
const TIERS = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["tertiary", "Tertiary"],
];
const tierRank = (page) => {
  const i = TIERS.findIndex(([key]) => key === page.tier);
  return i === -1 ? TIERS.length : i;
};

export default function DiscoveredPages({
  pages,
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

  const byTier = [...key].sort((a, b) => tierRank(a) - tierRank(b));
  const preview = byTier.slice(0, PREVIEW_LIMIT);
  const hasMore = key.length > preview.length || rest.length > 0;

  const groups = TIERS.map(([key_, label]) => [label, byTier.filter((p) => p.tier === key_)])
    .concat([["Other", byTier.filter((p) => !p.tier)]])
    .filter(([, list]) => list.length);

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
            {page.tier && <span className={`page-tier page-tier-${page.tier}`}>{page.tier}</span>}
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
            <h2>
              Pages <span className="section-count">{pages.length}</span>
            </h2>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="modal-body">
            {groups.map(([label, group]) => (
              <div className="page-group" key={label}>
                <h3>{label}</h3>
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
