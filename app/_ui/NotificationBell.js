"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

const PREVIEW_LIMIT = 6;

// Replaces the "N to review" pill. The dot says something's waiting; the
// popover says what, and links straight to the record so a single stray tag
// can be fixed without going through the queue.
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sitesRes, componentsRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/components"),
      ]);
      const pending = [];
      if (sitesRes.ok) {
        const data = await sitesRes.json();
        for (const site of data.sites || []) {
          if (site.needs_review) {
            pending.push({
              key: `site-${site.id}`,
              href: `/sites/${site.id}`,
              name: site.name || site.domain,
              kind: "Website",
              missing: !site.summary,
            });
          }
        }
      }
      if (componentsRes.ok) {
        const data = await componentsRes.json();
        for (const c of data.components || []) {
          if (c.needs_review) {
            pending.push({
              key: `component-${c.id}`,
              href: `/components/${c.id}`,
              name: c.name || "Untitled component",
              kind: "Component",
              missing: !c.summary,
            });
          }
        }
      }
      if (!cancelled) setItems(pending);
    }
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const shown = items.slice(0, PREVIEW_LIMIT);
  const hidden = items.length - shown.length;

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        className={`icon-btn bell-btn${items.length > 0 ? " bell-btn-unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={items.length > 0 ? `${items.length} to review` : "Nothing to review"}
        aria-label={items.length > 0 ? `${items.length} to review` : "Nothing to review"}
      >
        <Bell size={16} />
      </button>

      {open && (
        <div className="bell-pop">
          <div className="bell-pop-head">
            <strong>{items.length > 0 ? `${items.length} to review` : "All caught up"}</strong>
          </div>

          {items.length === 0 && <p className="empty-small">Nothing needs review.</p>}

          {shown.map((item) => (
            <a className="bell-item" key={item.key} href={item.href}>
              <span className="bell-item-name">{item.name}</span>
              <span className="bell-item-meta">
                {item.kind}
                {item.missing ? " · no summary" : ""}
              </span>
            </a>
          ))}

          {hidden > 0 && <p className="bell-more">and {hidden} more</p>}

          {items.length > 0 && (
            <a className="bell-pop-foot" href="/review">
              Open the review queue →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
