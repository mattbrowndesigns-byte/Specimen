"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crop } from "lucide-react";
import CropTool from "./CropTool";
import Favicon from "./Favicon";
import LibraryBrowser from "./LibraryBrowser";
import { explainCaptureFailure } from "@/lib/captureFailure";
import { useDemoHold } from "./demoState";

const ADAPTER = {
  kind: "component",
  date: (c) => c.created_at,
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
  // Components have no stored icon; Favicon derives one from the source URL.
  faviconUrl: (c) => c.favicon_url || null,
  pendingLabel: () => "Processing…",
  naturalThumb: true,
};

export default function ComponentsTab({
  allTags,
  pendingCapture,
  setPendingCapture,
  refreshKey,
  onAdd,
  incomingQuery,
  onIncomingUsed,
  onSearchElsewhere,
}) {
  const [components, setComponents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function loadComponents() {
    const res = await fetch("/api/components");
    if (res.ok) {
      const data = await res.json();
      setComponents(data.components || []);
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadComponents();
  }, [refreshKey]);

  // Imported pages, captured and waiting for a crop. Asked for separately
  // from the library because it changes on the capture queue's schedule, not
  // on yours, and polled only while something is still on its way.
  const [crops, setCrops] = useState(null);
  const loadCrops = useCallback(async () => {
    const res = await fetch("/api/components/capture");
    if (res.ok) setCrops(await res.json());
  }, []);

  useEffect(() => {
    loadCrops();
  }, [loadCrops, refreshKey]);

  const cropsMoving = crops && (crops.queued > 0 || crops.capturing > 0);
  useEffect(() => {
    if (!cropsMoving) return;
    const timer = setInterval(loadCrops, 30000);
    return () => clearInterval(timer);
  }, [cropsMoving, loadCrops]);

  async function discardCapture(capture) {
    setError(null);
    const res = await fetch(`/api/components/capture/${capture.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't discard that page");
    }
    if (pendingCapture?.id === capture.id) setPendingCapture(null);
    loadCrops();
  }

  // A query handed over from another tab's dead end. It arrives once, is
  // applied once, and is cleared by the parent so switching back later doesn't
  // re-run a search you have since moved on from.
  useEffect(() => {
    if (incomingQuery == null) return;
    setQuery(incomingQuery);
    onIncomingUsed?.();
  }, [incomingQuery, onIncomingUsed]);

  async function handleSaveCrop(cropRect) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentCaptureId: pendingCapture.id,
          cropRect,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save component");
        return;
      }
      setPendingCapture(null);
      setComponents((prev) => [data.component, ...prev]);
      // A crop from the list takes that page off it.
      loadCrops();
      if (data.enrichmentError) {
        setError(
          "Crop saved, but the AI couldn't describe it just now. Open the component and hit Regenerate.",
        );
      }
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSaving(false);
    }
  }

  // In the demo, the Ramp block the staged Add replays arrives as a new card,
  // with no image while it runs -- the card's "Processing…" state.
  const held = useDemoHold("component", components, {
    dateField: "created_at",
    inFlight: (c) => ({ ...c, image_url: null, tags: [] }),
  });

  // Components are few enough to filter in the browser; sites go through the
  // Postgres search function instead.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return held;
    return held.filter((c) =>
      [
        c.name,
        c.summary,
        c.notes,
        c.source_url,
        ...(c.tags || []).map((t) => t.label),
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q)),
    );
  }, [held, query]);

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
          <strong>{pendingCapture.domain} couldn&rsquo;t be captured.</strong>{" "}
          {explainCaptureFailure(pendingCapture.capture_error)}{" "}
          <button onClick={() => setPendingCapture(null)}>Dismiss</button>
        </p>
      )}
      <CropQueue crops={crops} onCrop={setPendingCapture} onDiscard={discardCapture} />
      <LibraryBrowser
        items={filtered}
        allTags={allTags}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search components by name, summary, notes or tag…"
        emptyHeadline="Save the parts, not just the page."
        emptyMessage="Capture any page, then crop out the one block worth keeping: a pricing table, a nav, a hero."
        noun="component"
        adapter={ADAPTER}
        onAdd={onAdd}
        storageKey="specimen.view.components"
        onSearchElsewhere={onSearchElsewhere}
        loaded={loaded}
      />
    </>
  );
}

// What an import of component pages left for you: each captured page is a
// crop you haven't drawn yet. First on the tab for the same reason a visuals
// project waiting to be picked is -- it is holding storage until you act on
// it -- and because cropping one is what lets the queue capture the next.
function CropQueue({ crops, onCrop, onDiscard }) {
  if (!crops) return null;
  const ready = crops.captures.filter((c) => c.status === "ready" && c.capture_state !== "failed");
  const failed = crops.captures.filter((c) => c.status === "failed" || c.capture_state === "failed");
  const coming = crops.queued + crops.capturing;
  if (!ready.length && !failed.length && !coming) return null;

  // The queue stops this many short of what is waiting, so if the list is
  // that long, the reason nothing new is arriving is the list itself.
  const held = crops.queued > 0 && ready.length + crops.capturing >= crops.cropAhead;

  return (
    <div className="visual-pending crop-queue">
      <h3>Ready to crop</h3>
      {ready.map((capture) => (
        <div key={capture.id} className="crop-queue-row">
          <button type="button" className="visual-pending-row crop-queue-open" onClick={() => onCrop(capture)}>
            <Favicon url={capture.url} alt={capture.domain} />
            <span className="visual-pending-name">
              <strong>{capture.domain}</strong>
              <small>{pathOf(capture.url)}</small>
            </span>
            <span className="crop-queue-action">
              <Crop size={15} aria-hidden="true" />
              Crop
            </span>
          </button>
          <button type="button" className="danger-btn crop-queue-discard" onClick={() => onDiscard(capture)}>
            Discard
          </button>
        </div>
      ))}
      {failed.map((capture) => (
        <div key={capture.id} className="crop-queue-row">
          <div className="visual-pending-row crop-queue-failed">
            <Favicon url={capture.url} alt={capture.domain} />
            <span className="visual-pending-name">
              <strong>{capture.domain}</strong>
              <small>
                Couldn&rsquo;t be captured.{" "}
                {capture.capture_state === "failed"
                  ? "GitHub wouldn't start the capture after five tries."
                  : explainCaptureFailure(capture.capture_error)}
              </small>
            </span>
          </div>
          <button type="button" className="danger-btn crop-queue-discard" onClick={() => onDiscard(capture)}>
            Dismiss
          </button>
        </div>
      ))}
      {coming > 0 && (
        <p className="crop-queue-note">
          {crops.capturing > 0 && `${crops.capturing} being captured now. `}
          {crops.queued > 0 &&
            (held
              ? `${crops.queued} more waiting until you crop: Kivli keeps ${crops.cropAhead} captured ahead of you, because each one holds two full-page screenshots in storage until it's cropped.`
              : `${crops.queued} more waiting their turn, a few every fifteen minutes.`)}
        </p>
      )}
    </div>
  );
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}
