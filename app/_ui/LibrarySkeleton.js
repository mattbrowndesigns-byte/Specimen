"use client";

// What a tab shows between opening and its first answer. Before this it
// showed the empty state, because "no items yet" and "no items" were the same
// empty array -- so switching back to Websites told a library of 150 saves to
// start itself, for as long as the fetch took.
//
// Built from the real containers (.grid and .card, .row-item, .headline-item,
// .resource-row) and only filled, the same rule the style panels' placeholders
// follow, so the shape before the answer is the shape after it and nothing
// jumps when the rows land.
const COUNT = { cards: 8, list: 4, headlines: 8, resources: 6 };

export default function LibrarySkeleton({ view, size = "medium", noun }) {
  const slots = Array.from({ length: COUNT[view] || 6 }, (_, i) => i);

  return (
    <div className="library-loading" role="status" aria-label={`Loading ${noun}s`}>
      {view === "cards" && (
        <div className={`grid grid-${size}`}>
          {slots.map((i) => (
            <div className="card" key={i}>
              <div className="thumb" />
              <div className="card-footer">
                <span className="skeleton-disc" />
                <span className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="row-list">
          {slots.map((i) => (
            <div className="row-item" key={i}>
              <div className="row-thumb" />
              <div className="row-body skeleton-lines">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "headlines" && (
        <div className="headline-list">
          {slots.map((i) => (
            <div className="headline-item" key={i}>
              <span className="skeleton-disc" />
              <span className="skeleton-line" />
            </div>
          ))}
        </div>
      )}

      {view === "resources" && (
        <div className="resource-list">
          {slots.map((i) => (
            <div className="resource-row" key={i}>
              <span className="skeleton-disc" />
              <div className="resource-body skeleton-lines">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
