"use client";
import { X } from "lucide-react";

// "8 sites" never said which 8. Search here filters live, so there is no
// submit to mark the moment the results changed: the count quietly becomes a
// different number while you are still looking at the box you typed into, and
// the grid below changes without anything saying why.
//
// So the term is echoed where the answer is, and is removable there -- the
// affordance lands where the eye already went to check the number. It stays in
// the field too, on purpose: the field is where it is still editable, and
// "minimal" wanting to become "minimalist" should be four keystrokes rather
// than a delete and a retype.
export default function ResultCount({ count, noun, query, onClear }) {
  const term = (query || "").trim();
  return (
    <span className="result-count">
      <span>
        {count} {count === 1 ? noun : `${noun}s`}
      </span>
      {term && (
        <>
          <span>for</span>
          <button
            type="button"
            className="result-query"
            onClick={onClear}
            title={`Stop searching for "${term}"`}
            aria-label={`Stop searching for "${term}"`}
          >
            {term}
            <X size={13} />
          </button>
        </>
      )}
    </span>
  );
}
