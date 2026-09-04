"use client";
import { useEffect, useMemo, useState } from "react";
import CropTool from "./CropTool";
import LibraryBrowser from "./LibraryBrowser";

const ADAPTER = {
  kind: "component",
  href: (c) => `/components/${c.id}`,
  externalUrl: (c) => c.source_url,
  name: (c) => c.name || "Untitled component",
  meta: (c) => {
    try {
      return new URL(c.source_url).hostname.replace(/^www\./, "");
    } catch {
      return c.source_url;
    }
  },
  thumb: (c) => c.image_url || null,
  pendingLabel: "Processing…",
  naturalThumb: true,
};

export default function ComponentsTab({ allTags, pendingCapture, setPendingCapture, refreshKey }) {
  const [components, setComponents] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function loadComponents() {
    const res = await fetch("/api/components");
    if (res.ok) {
      const data = await res.json();
      setComponents(data.components || []);
    }
  }

  useEffect(() => {
    loadComponents();
  }, [refreshKey]);

  async function handleSaveCrop(cropRect) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentCaptureId: pendingCapture.id, cropRect }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save component");
        return;
      }
      setPendingCapture(null);
      setComponents((prev) => [data.component, ...prev]);
      if (data.enrichmentError) {
        setError(
          "Crop saved, but the AI couldn't describe it just now. Open the component and hit Regenerate."
        );
      }
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSaving(false);
    }
  }

  // Components are few enough to filter in the browser; sites go through the
  // Postgres search function instead.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return components;
    return components.filter((c) =>
      [c.name, c.summary, c.notes, c.source_url, ...(c.tags || []).map((t) => t.label)]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [components, query]);

  if (pendingCapture?.status === "ready") {
    return (
      <>
        {error && <p className="error">{error}</p>}
        <CropTool
          imageUrl={pendingCapture.full_url}
          onCancel={() => setPendingCapture(null)}
          onSave={handleSaveCrop}
          saving={saving}
        />
      </>
    );
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      {pendingCapture?.status === "failed" && (
        <p className="error">
          That page couldn't be captured.{" "}
          <button onClick={() => setPendingCapture(null)}>Dismiss</button>
        </p>
      )}
      <LibraryBrowser
        items={filtered}
        allTags={allTags}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search components by name, summary, notes or tag…"
        emptyMessage="No components yet — use Add to capture a page and crop one out."
        noun="component"
        adapter={ADAPTER}
        storageKey="specimen.view.components"
      />
    </>
  );
}
