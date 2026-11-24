"use client";
import { useEffect, useState } from "react";
import FeatureRotator from "./FeatureRotator";
import { useAnnounceWork } from "./workInFlight";

// The wait before there is something to choose from, in the visuals picker and
// on the crop page: the loading bar every other save uses. `label` and `note`
// are for a wait that isn't the picker's own.
export default function PickLoading({ phase, seconds, label, note }) {
  const [elapsed, setElapsed] = useState(0);
  useAnnounceWork(true);
  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 0.25), 250);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="capture-status capture-status-quick pick-loading">
      <div className="capture-status-bar">
        <div
          className="capture-status-fill"
          style={{ width: `${Math.min(95, (elapsed / seconds) * 100)}%` }}
        />
      </div>
      <div className="capture-status-row">
        <p>
          {label
            ? label
            : phase === "sorting"
            ? "Picking out the work from the rest of the page"
            : phase === "posters"
              ? "Looking through each video"
              : "Finding the images and videos on the page"}
          {elapsed < seconds ? `: about ${Math.ceil(seconds - elapsed)}s remaining.` : ": finishing up."}
          {note && ` ${note}`}
        </p>
        {/* The same aside the capture bar carries, so a visuals save reads as
            the same kind of wait as every other save. */}
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
