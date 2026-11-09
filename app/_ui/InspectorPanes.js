"use client";
import { Children, isValidElement, useEffect, useState } from "react";

// The Elevated variant's site inspector: the side panel's seven sections sorted
// into three panes behind one segmented control, so the panel fits beside the
// screenshot instead of running a second page down the right of it.
//
// Off -- the original and Refined -- this renders its children exactly as they
// were written, in the order they were written, inside nothing: each <Pane> is
// a fragment and InspectorPanes adds no element of its own. The page's DOM is
// therefore identical to what it was before this file existed, which is the
// promise the variants make (lib/variant.js).
//
// On, children are grouped by their pane in PANES order, and every pane stays
// mounted with the inactive ones `hidden`. Unmounting would cost real state:
// SiteStyle polls while a reading lands, and a half-written note would vanish
// on a tab switch.
export const PANES = [
  { id: "overview", label: "Overview" },
  { id: "style", label: "Style" },
  { id: "pages", label: "Pages" },
];

const KEY = "specimen.inspector.pane";

export function Pane({ children }) {
  return <>{children}</>;
}

export default function InspectorPanes({ enabled, children }) {
  const [active, setActive] = useState("overview");

  // Remembered per browser: comparing the palettes of five sites in a row is a
  // real thing to do here, and landing back on Overview each time fights it.
  useEffect(() => {
    if (!enabled) return;
    try {
      const saved = localStorage.getItem(KEY);
      if (PANES.some((p) => p.id === saved)) setActive(saved);
    } catch {
      // Overview is a fine default.
    }
  }, [enabled]);

  if (!enabled) return children;

  function choose(id) {
    setActive(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Not remembering is survivable.
    }
  }

  const groups = Object.fromEntries(PANES.map((p) => [p.id, []]));
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    (groups[child.props.id] || groups.overview).push(child);
  });

  return (
    <>
      <div className="inspector-tabs" role="tablist" aria-label="Site details">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`inspector-tab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`inspector-pane-${p.id}`}
            className={active === p.id ? "active" : ""}
            onClick={() => choose(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {PANES.map((p) => (
        <div
          key={p.id}
          className="inspector-pane"
          role="tabpanel"
          id={`inspector-pane-${p.id}`}
          aria-labelledby={`inspector-tab-${p.id}`}
          hidden={active !== p.id}
        >
          {groups[p.id]}
        </div>
      ))}
    </>
  );
}
