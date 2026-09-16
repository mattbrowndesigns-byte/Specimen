"use client";
import { useCallback, useEffect, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";
import RecordGrid from "../_ui/RecordGrid";
import SiteFooter from "../_ui/SiteFooter";

export default function FavoritesPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [sitesRes, componentsRes, resourcesRes] = await Promise.all([
      fetch("/api/sites"),
      fetch("/api/components"),
      fetch("/api/resources"),
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
    // Resources carry the same heart as everything else, so leaving them out
    // here would have made that button quietly do nothing you could find again.
    if (resourcesRes.ok) {
      const data = await resourcesRes.json();
      for (const r of data.resources || []) {
        if (r.is_favorite) found.push({ kind: "resource", item: r });
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
      <SiteFooter />
    </>
  );
}
