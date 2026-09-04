"use client";
import { useCallback, useEffect, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";

export default function CollectionsPage() {
  const [collections, setCollections] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/collections");
    if (!res.ok) {
      setError("Couldn't load your collections");
      setCollections([]);
      return;
    }
    const data = await res.json();
    setCollections(data.collections || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't create that collection");
      return;
    }
    setName("");
    await load();
  }

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Collections</h1>
        </div>

        {error && <p className="error">{error}</p>}

        <form className="save-form collection-new" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection name…"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </button>
        </form>

        {collections === null && <p className="empty-small">Loading…</p>}

        {collections !== null && collections.length === 0 && (
          <p className="empty">
            No collections yet. Name one above, or use the bookmark button on any card.
          </p>
        )}

        {collections !== null && collections.length > 0 && (
          <div className="tag-list">
            {collections.map((collection) => (
              <div className="tag-row" key={collection.id}>
                <a className="tag-label" href={`/collections/${collection.id}`}>
                  {collection.name}
                </a>
                <span className="tag-facet">
                  {collection.item_count} {collection.item_count === 1 ? "item" : "items"}
                </span>
                <a className="promote-btn" href={`/collections/${collection.id}`}>
                  Open collection →
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
