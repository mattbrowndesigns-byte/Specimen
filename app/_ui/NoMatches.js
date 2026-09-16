"use client";

// A search that finds nothing gets the same grey panel an empty library does.
// It used to be one grey sentence floating where the grid had been, which read
// like the page had failed rather than like an answer -- and it gave the
// cross-tab nudge nowhere to sit that looked deliberate.
//
// The headline names what was looked for, because by the time you have read
// "nothing matches" your eye has already left the search box and the term is
// the thing you are about to doubt.
export default function NoMatches({ noun, query, children }) {
  const term = (query || "").trim();
  return (
    <div className="empty-state empty-state-search">
      <h2 className="empty-state-headline">
        {term ? (
          <>
            No {noun}s match &ldquo;{term}&rdquo;.
          </>
        ) : (
          "Nothing matches those filters."
        )}
      </h2>
      <p className="empty-state-body">
        Try a different word, or clear the filters to see everything.
      </p>
      {children}
    </div>
  );
}
