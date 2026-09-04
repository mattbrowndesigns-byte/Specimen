"use client";
import { useEffect, useState } from "react";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

// Edits a draft copy so closing without applying leaves the grid untouched.
export default function FilterModal({ allTags, selectedTagIds, onApply, onClose }) {
  const [draft, setDraft] = useState(new Set(selectedTagIds));

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(id) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
        <div className="modal-head">
          <h2>Filters</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {FACETS.map((facet) => {
            const tags = allTags.filter((t) => t.facet === facet);
            if (!tags.length) return null;
            return (
              <section key={facet}>
                <h3>{FACET_LABELS[facet]}</h3>
                <div className="modal-options">
                  {tags.map((tag) => (
                    <label key={tag.id}>
                      <input type="checkbox" checked={draft.has(tag.id)} onChange={() => toggle(tag.id)} />
                      <span>{tag.label}</span>
                      <span className="modal-count">{tag.usage_count || 0}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="modal-foot">
          <button onClick={() => setDraft(new Set())}>Clear</button>
          <button className="modal-apply" onClick={() => onApply(draft)}>
            Apply filters{draft.size > 0 ? ` (${draft.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
