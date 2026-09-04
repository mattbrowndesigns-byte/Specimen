"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";
import CollectionCard, { makeResolver } from "../_ui/CollectionCard";

export default function CollectionsPage() {
  const [collections, setCollections] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [library, setLibrary] = useState({ sites: new Map(), components: new Map() });

  // The collection rows carry member ids only, so the covers come from the two
  // library lists -- the same resolve-on-the-client shape the collection detail
  // page and Related use.
  const load = useCallback(async () => {
    const [res, sitesRes, componentsRes] = await Promise.all([
      fetch("/api/collections"),
      fetch("/api/sites"),
      fetch("/api/components"),
    ]);
    if (!res.ok) {
      setError("Couldn't load your collections");
      setCollections([]);
      return;
    }
    const data = await res.json();
    setCollections(data.collections || []);

    const sites = new Map();
    const components = new Map();
    if (sitesRes.ok) {
      const payload = await sitesRes.json();
      for (const site of payload.sites || []) sites.set(site.id, site);
    }
    if (componentsRes.ok) {
      const payload = await componentsRes.json();
      for (const c of payload.components || []) components.set(c.id, c);
    }
    setLibrary({ sites, components });
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

  const resolve = useMemo(
    () => makeResolver(library.sites, library.components),
    [library]
  );

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
          <div className="collection-grid">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} resolve={resolve} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
