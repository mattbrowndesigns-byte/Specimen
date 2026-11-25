"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crop } from "lucide-react";
import Favicon from "./Favicon";
import LibraryBrowser from "./LibraryBrowser";
import { explainCaptureFailure } from "@/lib/captureFailure";
import { cropUrl } from "@/lib/addItem";
import { useDemoHold, useIsDemo } from "./demoState";
import useFileDrop, { DropOverlay } from "./useFileDrop";
import { describeComponents, startComponentUpload, useUploads } from "./uploads";

const ADAPTER = {
  kind: "component",
  date: (c) => c.created_at,
  href: (c) => `/components/${c.id}`,
  externalUrl: (c) => c.source_url,
  name: (c) => c.name || "Untitled component",
  // An upload has no page behind it, so it says where it did come from.
  meta: (c) => {
    if (!c.source_url) return "Uploaded";
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

// Uploads that have already been opened in the crop tool. Outside the
// component, because the store keeps an upload's panel for a few seconds after
// it finishes and leaving the tab and coming back must not reopen it.
const openedUploads = new Set();

export default function ComponentsTab({
  allTags,
  groups,
  refreshKey,
  onAdd,
  incomingQuery,
  onIncomingUsed,
  onSearchElsewhere,
}) {
  const [components, setComponents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
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

  // Files dropped anywhere on the window while this tab is open.
  const demo = useIsDemo();
  const dragging = useFileDrop(demo ? null : startComponentUpload);

  // Uploaded images land on the crop list as they're encoded. One on its own
  // opens the crop page, which is where a captured page goes; a batch waits on the list, where each can be cropped or kept as it is.
  const uploads = useUploads("component");
  // A clip has nothing to crop and is on the board as soon as it lands.
  const landed = uploads.reduce((n, u) => n + u.items.length, 0);
  useEffect(() => {
    if (!landed) return;
    loadCrops();
    loadComponents();
  }, [landed, loadCrops]);
  useEffect(() => {
    const single = uploads.find(
      (u) =>
        u.phase === "done" &&
        u.total === 1 &&
        u.items.length === 1 &&
        !u.items[0].video_url &&
        !openedUploads.has(u.id)
    );
    if (!single) return;
    openedUploads.add(single.id);
    router.push(cropUrl(single.items[0].id));
  }, [uploads, router]);

  // Names, summaries and tags, as each saved upload gets them. A read rather
  // than a patch, so one that was queued instead shows that truth too.
  const described = useUploads("describe").reduce((n, u) => n + u.described, 0);
  const lastDescribed = useRef(0);
  useEffect(() => {
    if (described > lastDescribed.current) loadComponents();
    lastDescribed.current = described;
  }, [described]);

  // Saves uploads whole, then has them all described in the background.
  const [keeping, setKeeping] = useState(null);
  async function keepAsIs(captures) {
    if (keeping) return;
    setKeeping(captures.length > 1 ? "all" : captures[0].id);
    setError(null);
    const saved = [];
    try {
      for (const capture of captures) {
        const res = await fetch("/api/components", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ componentCaptureId: capture.id, cropRect: null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(`${capture.file_name || "That image"} couldn't be saved: ${data.error || "the server refused it"}`);
          continue;
        }
        saved.push(data.component);
        setComponents((prev) => [data.component, ...prev]);
        setCrops((prev) => prev && { ...prev, captures: prev.captures.filter((c) => c.id !== capture.id) });
      }
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setKeeping(null);
      loadCrops();
      describeComponents(saved);
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

  return (
    <>
      {error && <p className="error">{error}</p>}
      {dragging && <DropOverlay label="Components" />}
      <CropQueue
        crops={crops}
                onKeep={keepAsIs}
        keeping={keeping}
        onDiscard={discardCapture}
      />
      <LibraryBrowser
        items={filtered}
        allTags={allTags}
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search components by name, summary, notes or tag…"
        emptyHeadline="Save the parts, not just the page."
        emptyMessage="Capture any page, then crop out the one block worth keeping: a pricing table, a nav, a hero. Or drop a screenshot or a recording of one anywhere on this page."
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

// What is waiting on you: pages an import captured, and images you uploaded,
// each one a crop you haven't drawn yet. First on the tab for the same reason a visuals
// project waiting to be picked is -- it is holding storage until you act on
// it -- and because cropping one is what lets the queue capture the next.
function CropQueue({ crops, onKeep, keeping, onDiscard }) {
  if (!crops) return null;
  const ready = crops.captures.filter((c) => c.status === "ready" && c.capture_state !== "failed");
  const failed = crops.captures.filter((c) => c.status === "failed" || c.capture_state === "failed");
  const uploads = ready.filter((c) => !c.url);
  const coming = crops.queued + crops.capturing;
  if (!ready.length && !failed.length && !coming) return null;

  // The queue stops this many short of what is waiting, so if the list is
  // that long, the reason nothing new is arriving is the list itself.
  // Uploads and screen grabs don't count: it never captured them ahead.
  const held = crops.queued > 0 && ready.filter((c) => c.imported_at).length + crops.capturing >= crops.cropAhead;

  return (
    <div className="visual-pending crop-queue">
      <div className="crop-queue-head">
        <h3>Ready to crop</h3>
        {uploads.length > 1 && (
          <button type="button" onClick={() => onKeep(uploads)} disabled={Boolean(keeping)} aria-busy={keeping === "all"}>
            {keeping === "all" ? "Saving…" : `Use All ${uploads.length} As Is`}
          </button>
        )}
      </div>
      {ready.map((capture) => (
        <div key={capture.id} className="crop-queue-row">
          <a className="visual-pending-row crop-queue-open" href={cropUrl(capture.id)}>
            {capture.url ? (
              <Favicon url={capture.url} alt={capture.domain} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="crop-queue-thumb" src={capture.full_url} alt="" loading="lazy" />
            )}
            <span className="visual-pending-name">
              <strong>{capture.url ? capture.domain : capture.file_name || "Uploaded image"}</strong>
              <small>{capture.url ? pathOf(capture.url) : "Uploaded"}</small>
            </span>
            <span className="crop-queue-action">
              <Crop size={15} aria-hidden="true" />
              Crop
            </span>
          </a>
          {!capture.url && (
            <button
              type="button"
              className="crop-queue-keep"
              onClick={() => onKeep([capture])}
              disabled={Boolean(keeping)}
              aria-busy={keeping === capture.id}
            >
              {keeping === capture.id ? "Saving…" : "Use As Is"}
            </button>
          )}
          <button
            type="button"
            className="danger-btn crop-queue-discard"
            onClick={() => onDiscard(capture)}
            disabled={Boolean(keeping)}
          >
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
