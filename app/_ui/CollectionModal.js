"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import ModalShell from "./ModalShell";

// "Add this to a collection": the list is a set of toggles rather than a form
// you submit, so each row writes immediately and Done just closes. Creating a
// collection from here also adds the record to it, since that's the only
// reason you'd be creating one at this moment.
export default function CollectionModal({ kind, id, name, onClose }) {
  const [collections, setCollections] = useState(null);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function load() {
    const res = await fetch(`/api/collections?targetType=${kind}&targetId=${id}`);
    if (!res.ok) {
      setError("Couldn't load your collections");
      setCollections([]);
      return;
    }
    const data = await res.json();
    setCollections(data.collections || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  async function toggle(collection) {
    setBusyId(collection.id);
    setError(null);
    const res = collection.contains_target
      ? await fetch(`/api/collections/${collection.id}/items?targetType=${kind}&targetId=${id}`, {
          method: "DELETE",
        })
      : await fetch(`/api/collections/${collection.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType: kind, targetId: id }),
        });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't update that collection");
      return;
    }
    await load();
  }

  async function createAndAdd() {
    const label = filter.trim();
    // The field doubles as filter and name-a-new-one, so an empty click gets
    // pointed back at it rather than silently doing nothing.
    if (!label) {
      setError("Type a name in the field above, then create it.");
      inputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);

    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreating(false);
      setError(data.error || "Couldn't create that collection");
      return;
    }

    await fetch(`/api/collections/${data.collection.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: kind, targetId: id }),
    });
    setCreating(false);
    setFilter("");
    await load();
  }

  const needle = filter.trim().toLowerCase();
  const shown = (collections || []).filter((c) => c.name.toLowerCase().includes(needle));
  const exactExists = (collections || []).some((c) => c.name.toLowerCase() === needle);

  return (
    <ModalShell label="Add to a collection" onClose={onClose}>
      <div className="modal-head">
        <h2>Add to a collection</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="modal-body">
        {error && <p className="error">{error}</p>}
        <p className="collection-modal-target">{name}</p>

        <input
          className="search-input"
          ref={inputRef}
          placeholder="Filter or name a new collection…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />

        {collections === null && <p className="empty-small">Loading…</p>}

        {collections !== null && (
          <div className="collection-picker">
            {shown.map((collection) => (
              <button
                key={collection.id}
                className={`collection-option${collection.contains_target ? " collection-option-in" : ""}`}
                onClick={() => toggle(collection)}
                disabled={busyId === collection.id}
              >
                <span className="collection-check">{collection.contains_target && <Check size={14} />}</span>
                <span className="collection-option-text">
                  <strong>{collection.name}</strong>
                  <small>
                    {collection.item_count} {collection.item_count === 1 ? "item" : "items"}
                  </small>
                </span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="empty-small">
                {collections.length === 0 ? "No collections yet." : "Nothing matches that."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button
          onClick={createAndAdd}
          disabled={exactExists || creating}
          title={exactExists ? "You already have a collection with that name" : undefined}
        >
          <Plus size={14} />
          {needle && !exactExists ? `Create “${filter.trim()}”` : "Create a new collection"}
        </button>
        <button className="modal-apply" onClick={onClose}>
          Done
        </button>
      </div>
    </ModalShell>
  );
}
