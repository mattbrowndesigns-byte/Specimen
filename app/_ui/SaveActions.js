"use client";
import { useState } from "react";
import { Bookmark, Heart } from "lucide-react";
import CollectionModal from "./CollectionModal";

// The favorite/collection pair, used both overlaid on a card and inline in a
// detail page's action row. The heart writes straight through and holds its
// own optimistic state; the bookmark opens the collection picker.
//
// `kind` is "site" or "component", which is also the API path segment once
// pluralised.
export default function SaveActions({ kind, id, name, isFavorite, onFavoriteChange, className }) {
  const [favorite, setFavorite] = useState(Boolean(isFavorite));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleFavorite(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const next = !favorite;
    setFavorite(next);
    setBusy(true);
    const res = await fetch(`/api/${kind}s/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setFavorite(!next); // Put it back; nothing was saved.
      return;
    }
    onFavoriteChange?.(next);
  }

  function openPicker(e) {
    e.preventDefault();
    e.stopPropagation();
    setPicking(true);
  }

  // data-favorite rather than a class, so a card can keep the buttons visible
  // at rest when something is favorited without the parent having to re-render
  // for it: this component owns that state.
  return (
    <span className={`save-actions${className ? ` ${className}` : ""}`} data-favorite={favorite ? "true" : "false"}>
      <button
        className={`icon-btn${favorite ? " icon-btn-on" : ""}`}
        onClick={toggleFavorite}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={favorite}
      >
        <Heart size={15} fill={favorite ? "currentColor" : "none"} />
      </button>
      <button className="icon-btn" onClick={openPicker} title="Add to a collection" aria-label="Add to a collection">
        <Bookmark size={15} />
      </button>

      {picking && (
        <CollectionModal kind={kind} id={id} name={name} onClose={() => setPicking(false)} />
      )}
    </span>
  );
}
