"use client";
import { useEffect, useState } from "react";

const PREVIEW_LIMIT = 4;

// Discovered pages used to run down the full width of the detail page, which a
// site with thirty links turned into most of the page. In the sidebar it's a
// short preview instead, and the full grouped list -- with the Promote buttons,
// which are the only part that needs room -- moves into a modal.
export default function DiscoveredPages({ groups, pageTypeLabel, promoted, promoting, onPromote }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const all = groups.flatMap(([, pages]) => pages);
  if (all.length === 0) return null;

  const preview = all.slice(0, PREVIEW_LIMIT);
  const hidden = all.length - preview.length;

  return (
    <section className="detail-section">
      <div className="section-head">
        <h2>Discovered pages</h2>
        <span className="section-count">{all.length}</span>
      </div>

      <ul className="page-list page-list-compact">
        {preview.map((page) => (
          <li key={page.id}>
            <a href={page.url} target="_blank" rel="noopener noreferrer">
              {page.label || page.url}
            </a>
          </li>
        ))}
      </ul>

      <button className="link-btn" onClick={() => setOpen(true)}>
        {hidden > 0 ? `Show all ${all.length} pages` : "Open all pages"}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Discovered pages"
          >
            <div className="modal-head">
              <h2>Discovered pages ({all.length})</h2>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              {groups.map(([typeSlug, pages]) => (
                <div className="page-group" key={typeSlug || "none"}>
                  <h3>{pageTypeLabel(typeSlug)}</h3>
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
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
