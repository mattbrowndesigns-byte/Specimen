"use client";
import { useEffect, useState } from "react";
import { useAnnounceWork } from "./workInFlight";
import FeatureRotator from "./FeatureRotator";

// Observed Actions round trip: install deps, run Playwright over both
// viewports, upload, call back. Only paces the estimate -- completion comes
// from polling for the real result, never from this clock running out.
const ESTIMATE_SECONDS = 75;

// A queued result needs longer on screen than a clean one: it's the only place
// that message appears, and it's asking the reader to do nothing rather than
// telling them everything is finished.
const queuedHold = (state) => (state === "queued" ? 9000 : 2500);

// Longer still for a failure: it is the one outcome that leaves something for
// you to do. The card in the grid carries it from there, so this does not have
// to stay forever.
const FAILED_HOLD = 13000;

export default function CaptureProgress({ job, onDone }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [queued, setQueued] = useState(false);
  const [failed, setFailed] = useState(false);

  // Says "something is happening" to anything that wants to know, which is
  // how the arcade launcher knows to appear without this panel owning it.
  useAnnounceWork(!done);

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
          const captures = data.site.capture || [];
          if (!cancelled && captures.length > 0) {
            // Any row means the run is over, because the callback writes every
            // viewport of a run in a single insert. So a run that arrives
            // without a desktop shot isn't going to produce one -- and the
            // callback also skips enrichment without one, which is why a
            // half-delivered save has no summary and no tags either.
            //
            // Declaring victory on `captures.length > 0` was the bug behind
            // "the bar said it was done and the card still says Capturing":
            // a mobile-only delivery satisfied it.
            const shot = captures.some((capture) => capture.viewport === "desktop");
            // The screenshots are in either way; the tagging pass may still be
            // waiting on the AI's free tier. Saying so is the difference
            // between "it worked" and "half of it silently didn't".
            setFailed(!shot);
            setQueued(shot && data.site.enrichment_state === "queued");
            setDone(true);
            clearInterval(poll);
            setTimeout(
              () => onDone(null),
              shot ? queuedHold(data.site.enrichment_state) : FAILED_HOLD,
            );
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

  if (done && failed) {
    return (
      <div className="capture-status capture-status-done capture-status-failed">
        <p>
          {job.label} is saved, but its desktop screenshot didn&rsquo;t come back, so it has no
          summary or tags. A very tall page is the usual cause. Its mobile capture is on its page.
        </p>
      </div>
    );
  }

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
        <span className="capture-status-aside">
          <FeatureRotator className="capture-status-rotator" />
          <a className="feature-rotator-more" href="/features">
            All features
          </a>
        </span>
      </div>
    </div>
  );
}
