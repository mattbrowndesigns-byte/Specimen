"use client";
import { useCallback, useEffect, useState, use as usePromise } from "react";
import UtilityBar from "../../_ui/UtilityBar";
import RecordGrid from "../../_ui/RecordGrid";

export default function CollectionDetailPage({ params }) {
  const { id } = usePromise(params);
  const [collection, setCollection] = useState(null);
  const [entries, setEntries] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [error, setError] = useState(null);

  // The membership rows are ids only, so the records come from the two library
  // endpoints and get matched up here -- the same shape RelatedSection uses.
  const load = useCallback(async () => {
    const [collectionRes, sitesRes, componentsRes] = await Promise.all([
      fetch(`/api/collections/${id}`),
      fetch("/api/sites"),
      fetch("/api/components"),
    ]);

    if (!collectionRes.ok) {
      setError("That collection doesn't exist");
      setEntries([]);
      return;
    }
    const { collection: found, items } = await collectionRes.json();
    setCollection(found);
    setNameDraft(found.name);

    const sites = new Map();
    const components = new Map();
    if (sitesRes.ok) {
      const data = await sitesRes.json();
      for (const site of data.sites || []) sites.set(site.id, site);
    }
    if (componentsRes.ok) {
      const data = await componentsRes.json();
      for (const c of data.components || []) components.set(c.id, c);
    }

    setEntries(
      (items || [])
        .map((row) => {
          const item = row.target_type === "site" ? sites.get(row.target_id) : components.get(row.target_id);
          return item ? { kind: row.target_type, item } : null;
        })
        .filter(Boolean)
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function rename() {
    if (!nameDraft.trim() || nameDraft === collection?.name) return;
    setError(null);
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't rename that collection");
      setNameDraft(collection.name);
      return;
    }
    await load();
  }

  async function remove(kind, targetId) {
    setError(null);
    const res = await fetch(
      `/api/collections/${id}/items?targetType=${kind}&targetId=${targetId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't remove that item");
      return;
    }
    await load();
  }

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="detail-header">
          <input
            className="name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={rename}
            aria-label="Collection name"
          />
          <div className="detail-actions">
            <a className="promote-btn" href="/collections">
              All collections
            </a>
          </div>
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
              emptyMessage="Nothing in this collection yet — use the bookmark button on any card."
              onRemove={remove}
              removeLabel="Remove from collection"
            />
          </>
        )}
      </main>
    </>
  );
}
