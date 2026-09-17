"use client";
import { useEffect, useState } from "react";
import { useAnnounceWork } from "./workInFlight";

// A resource has nothing to poll for. The row exists the moment the save
// returns, and the only outstanding work is one text-only Gemini call, so this
// is driven by the request itself rather than by a clock racing a GitHub
// Actions job. It wears the capture bar's clothes because it means the same
// thing -- something is happening, you can leave -- but the estimate is eight
// seconds and not seventy-five.
const ESTIMATE_SECONDS = 8;

export default function ResourceProgress({ label, done, queued }) {
  const [elapsed, setElapsed] = useState(0);

  useAnnounceWork(!done);

  useEffect(() => {
    if (done) return;
    const tick = setInterval(() => setElapsed((s) => s + 0.25), 250);
    return () => clearInterval(tick);
  }, [done]);

  if (done) {
    return (
      <div className={`capture-status capture-status-done${queued ? " capture-status-queued" : ""}`}>
        <p>
          {queued ? (
            <>
              ✓ {label} saved — its summary and type are queued. The AI is at its limit right now;
              they&rsquo;ll fill in on their own.
            </>
          ) : (
            <>✓ {label} saved and described.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="capture-status capture-status-quick">
      <div className="capture-status-bar">
        {/* Quarter-second ticks, because the whole thing is usually over in
            three: a bar that moved once a second would show two positions. */}
        <div
          className="capture-status-fill"
          style={{ width: `${Math.min(95, (elapsed / ESTIMATE_SECONDS) * 100)}%` }}
        />
      </div>
      <div className="capture-status-row">
        <p>Reading {label} and asking what it&rsquo;s for…</p>
      </div>
    </div>
  );
}
