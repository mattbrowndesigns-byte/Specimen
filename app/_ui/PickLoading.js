"use client";
import { useEffect, useState } from "react";
import FeatureRotator from "./FeatureRotator";
import { useAnnounceWork } from "./workInFlight";

// The wait before a page's images can be chosen, in the picker and while the
// Save Button's page is being read: the loading bar every other save uses.
export default function PickLoading({ phase, seconds }) {
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
          {phase === "sorting"
            ? "Picking out the work from the rest of the page"
            : phase === "posters"
              ? "Looking through each video"
              : "Finding the images and videos on the page"}
          {elapsed < seconds ? `: about ${Math.ceil(seconds - elapsed)}s remaining.` : ": finishing up."}
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
