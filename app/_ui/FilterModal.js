"use client";
import { useState } from "react";
import { X } from "lucide-react";
import ModalShell from "./ModalShell";

// `groups` is the sections, in order: what the caller's kind of save is tagged
// with, from groupsFor.
//
// Edits a draft copy so closing without applying leaves the grid untouched.
export default function FilterModal({ allTags, selectedTagIds, onApply, onClose, groups }) {
  const [draft, setDraft] = useState(new Set(selectedTagIds));

  function toggle(id) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ModalShell label="Filters" onClose={onClose}>
      <div className="modal-head">
        <h2>Filters</h2>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="modal-body">
        {groups.map((group) => {
          // A word nothing is filed under can only filter the grid down to
          // nothing, so it isn't offered. It stays in the vocabulary -- the AI
          // still picks from it -- it just has no business in a filter yet.
          // One that is already applied stays, or there'd be no way to lift it.
          const tags = allTags.filter(
            (t) => t.facet === group.key && ((t.usage_count || 0) > 0 || selectedTagIds.has(t.id))
          );
          if (!tags.length) return null;
          return (
            <section key={group.key}>
              <h3>{group.label}</h3>
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
    </ModalShell>
  );
}
