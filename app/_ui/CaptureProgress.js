"use client";
import { useEffect, useState } from "react";
import FeatureRotator from "./FeatureRotator";

// Observed Actions round trip: install deps, run Playwright over both
// viewports, upload, call back. Only paces the estimate -- completion comes
// from polling for the real result, never from this clock running out.
const ESTIMATE_SECONDS = 75;

// A queued result needs longer on screen than a clean one: it's the only place
// that message appears, and it's asking the reader to do nothing rather than
// telling them everything is finished.
const queuedHold = (state) => (state === "queued" ? 9000 : 2500);

export default function CaptureProgress({ job, onDone }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [queued, setQueued] = useState(false);

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
            // The screenshots are in either way; the tagging pass may still be
            // waiting on the AI's free tier. Saying so is the difference
            // between "it worked" and "half of it silently didn't".
            setQueued(data.site.enrichment_state === "queued");
            setDone(true);
            clearInterval(poll);
            setTimeout(() => onDone(null), queuedHold(data.site.enrichment_state));
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
      <div className={`capture-status capture-status-done${queued ? " capture-status-queued" : ""}`}>
        <p>
          {queued ? (
            <>
              ✓ {job.label} captured — tags and summary are queued. The AI is at its limit right now;
              they&rsquo;ll fill in on their own, so feel free to carry on.
            </>
          ) : (
            <>
              ✓ {job.label} captured
              {job.kind === "component" ? " — ready to crop." : " and tagged."}
            </>
          )}
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
