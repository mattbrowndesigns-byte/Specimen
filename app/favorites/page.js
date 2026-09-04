"use client";
import { useCallback, useEffect, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";
import RecordGrid from "../_ui/RecordGrid";

export default function FavoritesPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [sitesRes, componentsRes] = await Promise.all([
      fetch("/api/sites"),
      fetch("/api/components"),
    ]);
    const found = [];
    if (sitesRes.ok) {
      const data = await sitesRes.json();
      for (const site of data.sites || []) {
        if (site.is_favorite) found.push({ kind: "site", item: site });
      }
    }
    if (componentsRes.ok) {
      const data = await componentsRes.json();
      for (const c of data.components || []) {
        if (c.is_favorite) found.push({ kind: "component", item: c });
      }
    }
    setEntries(found);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Favorites</h1>
        </div>

        {error && <p className="error">{error}</p>}

        {entries === null ? (
          <p className="empty-small">Loading…</p>
        ) : (
          <>
            <p className="results-bar">
              <span>
                {entries.length} {entries.length === 1 ? "item" : "items"}
              </span>
            </p>
            <RecordGrid
              entries={entries}
              emptyMessage="Nothing favorited yet — tap the heart on any card or detail page."
            />
          </>
        )}
      </main>
    </>
  );
}
