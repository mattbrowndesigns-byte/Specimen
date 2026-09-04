"use client";
import { useCallback, useEffect, useState, use as usePromise } from "react";
import UtilityBar from "../../_ui/UtilityBar";
import RecordGrid from "../../_ui/RecordGrid";
import ModalShell from "../../_ui/ModalShell";

export default function CollectionDetailPage({ params }) {
  const { id } = usePromise(params);
  const [collection, setCollection] = useState(null);
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(false);
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

  async function remove() {
    if (
      !confirm(
        `Delete “${collection?.name}”? The sites and components in it stay in your library.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't delete that collection");
      return;
    }
    window.location.href = "/collections";
  }

  async function removeItem(kind, targetId) {
    setError(null);
    const res = await fetch(`/api/collections/${id}/items?targetType=${kind}&targetId=${targetId}`, {
      method: "DELETE",
    });
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
        <div className="top-nav">
          <a href="/collections">← All collections</a>
        </div>

        {/* Renaming and deleting live here rather than in the archive: the
            archive is for finding a collection, this page is the collection. */}
        <div className="detail-header">
          <h1 className="collection-title">{collection?.name || "…"}</h1>
          <div className="detail-actions">
            <button onClick={() => setEditing(true)} disabled={!collection}>
              Edit collection
            </button>
            <button onClick={remove} disabled={!collection}>
              Delete collection
            </button>
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
              onRemove={removeItem}
              removeLabel="Remove from collection"
            />
          </>
        )}

        {editing && collection && (
          <EditCollectionModal
            collection={collection}
            onClose={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await load();
            }}
            onError={setError}
          />
        )}
      </main>
    </>
  );
}

function EditCollectionModal({ collection, onClose, onSaved, onError }) {
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setLocalError(null);
    const res = await fetch(`/api/collections/${collection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLocalError(data.error || "Couldn't rename that collection");
      return;
    }
    onError?.(null);
    onSaved();
  }

  return (
    <ModalShell label="Edit collection" onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-head">
          <h2>Edit collection</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {localError && <p className="error">{localError}</p>}
          <label className="field">
            <span>Collection name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="modal-apply" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Update"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
