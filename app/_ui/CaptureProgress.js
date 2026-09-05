"use client";
import { useEffect, useState } from "react";
import FeatureRotator from "./FeatureRotator";

// Observed Actions round trip: install deps, run Playwright over both
// viewports, upload, call back. Only paces the estimate -- completion comes
// from polling for the real result, never from this clock running out.
const ESTIMATE_SECONDS = 75;

export default function CaptureProgress({ job, onDone }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = setInterval(async () => {
      try {
        if (job.kind === "website") {
          const res = await fetch(`/api/sites/${job.id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (!cancelled && (data.site.capture || []).length > 0) {
            setDone(true);
            clearInterval(poll);
            setTimeout(() => onDone(null), 2500);
          }
        } else {
          const res = await fetch(`/api/components/capture/${job.id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (!cancelled && data.capture.status !== "pending") {
            setDone(true);
            clearInterval(poll);
            setTimeout(() => onDone(data.capture), 1200);
          }
        }
      } catch {
        // A failed poll just means we try again on the next tick.
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [job, onDone]);

  if (done) {
    return (
      <div className="capture-status capture-status-done">
        <p>
          ✓ {job.label} captured
          {job.kind === "component" ? " — ready to crop." : " and tagged."}
        </p>
      </div>
    );
  }

  return (
    <div className="capture-status">
      <div className="capture-status-bar">
        <div
          className="capture-status-fill"
          style={{ width: `${Math.min(95, (elapsed / ESTIMATE_SECONDS) * 100)}%` }}
        />
      </div>
      <div className="capture-status-row">
        <p>
          Capturing {job.label} —{" "}
          {elapsed < ESTIMATE_SECONDS ? `about ${ESTIMATE_SECONDS - elapsed}s remaining` : "finishing up"}
          . Safe to leave this page.
        </p>
        <FeatureRotator className="capture-status-rotator" />
      </div>
    </div>
  );
}
