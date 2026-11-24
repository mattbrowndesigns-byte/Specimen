"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UtilityBar from "../../../_ui/UtilityBar";
import SiteFooter from "../../../_ui/SiteFooter";
import CropTool from "../../../_ui/CropTool";
import Favicon from "../../../_ui/Favicon";
import PickLoading from "../../../_ui/PickLoading";
import { explainCaptureFailure } from "@/lib/captureFailure";
import { describeComponent } from "@/lib/uploadClient";

// Where a component is cut out of a page or an image. The component's version
// of the visuals picker, and the same three beats: the loading bar over grey
// shapes while it's being captured, the thing to choose from, then the save.
//
// It was a panel on the dashboard's Components tab, under the headline and the
// tabs, which made a step in saving something look like the home page.

// The capture's own estimate: install, two viewports, upload, call back.
const ESTIMATE_SECONDS = 75;
const POLL_MS = 3000;

function titleOf(capture) {
  return capture.domain || capture.file_name || "Uploaded image";
}

export default function CropPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [capture, setCapture] = useState(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/components/capture/${id}`).catch(() => null);
    if (res?.status === 404) {
      setMissing(true);
      return null;
    }
    // Anything else is a blip: the next poll asks again.
    if (!res?.ok) return null;
    const { capture: row } = await res.json();
    setCapture(row);
    return row;
  }, [id]);

  const waiting = !missing && (!capture || capture.status === "pending");
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  // To the list this stays on, so nothing is lost by leaving.
  const leave = () => router.push("/?tab=components");

  async function save(cropRect) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentCaptureId: id, cropRect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save that component");
        setSaving(false);
        return;
      }
      // An upload is saved before it's described. It is queued either way, so
      // an AI too busy to answer now costs nothing but the wait.
      if (!capture.url) await describeComponent(data.component.id).catch(() => {});
      router.push(`/components/${data.component.id}`);
    } catch {
      setError("Couldn't reach the server");
      setSaving(false);
    }
  }

  const uploaded = capture && !capture.url;
  const spent = uploaded && capture.cropped_at;

  return (
    <>
      <UtilityBar onError={setError} />
      <main className="page pick-page crop-page">
        {error && <p className="error">{error}</p>}

        {waiting && (
          <>
            <PickLoading
              seconds={capture ? ESTIMATE_SECONDS : 3}
              label={capture ? `Capturing ${titleOf(capture)}` : "Opening the capture"}
              note={capture ? "You can leave. It'll be waiting in Components, ready to crop." : null}
            />
            <div className="crop-skeleton" role="status" aria-label="Capturing the page">
              <span className="visual-skeleton-tile" />
              <span className="visual-skeleton-tile" />
              <span className="visual-skeleton-tile" />
              <span className="visual-skeleton-tile" />
            </div>
          </>
        )}

        {(missing || spent) && (
          <div className="empty-state empty-state-search">
            <h2 className="empty-state-headline">
              {spent ? "This image is already a component." : "There’s nothing to crop here."}
            </h2>
            <p className="empty-state-body">
              {spent ? "You’ll find it with the rest of your components." : "It may have been discarded."}
            </p>
            <button className="pick-cancel" onClick={leave}>
              Go to Components
            </button>
          </div>
        )}

        {capture?.status === "failed" && (
          <div className="empty-state empty-state-search">
            <h2 className="empty-state-headline">{titleOf(capture)} couldn&rsquo;t be captured.</h2>
            <p className="empty-state-body">{explainCaptureFailure(capture.capture_error)}</p>
            <button className="pick-cancel" onClick={leave}>
              Go to Components
            </button>
          </div>
        )}

        {capture?.status === "ready" && !spent && (
          <>
            <div className="pick-head">
              <Favicon url={capture.url} alt={titleOf(capture)} />
              <div className="pick-head-text">
                <h1>{titleOf(capture)}</h1>
              </div>
            </div>
            <CropTool
              page
              imageUrl={capture.full_url}
              onCancel={leave}
              onSave={save}
              onKeep={uploaded ? () => save(null) : undefined}
              saving={saving}
            />
          </>
        )}
      </main>
      {/* Not under the action bar, where its links would be half covered. */}
      {!(capture?.status === "ready" && !spent) && <SiteFooter />}
    </>
  );
}
