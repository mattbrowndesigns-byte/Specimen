"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import FeatureRotator from "./FeatureRotator";
import { useAnnounceWork } from "./workInFlight";
import { dismissVisualUpload } from "./visualUploads";

// An upload's panel: the capture panel's, at the top of the page, for the
// same reason -- it is the same kind of wait as any other save.
//
// What it doesn't borrow is the clock. A capture is paced by an estimate
// because there is nothing else to pace it by; an upload knows exactly how
// many bytes have left, so the bar is that and nothing else. After the last
// byte there is no number to show -- the server encodes, then the AI looks --
// so the bar stops claiming one and only says that work is going on.
const DONE_HOLD = 2500;
const QUEUED_HOLD = 9000;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function VisualUploadProgress({ upload }) {
  const { id, label, total, sent, phase, visuals, failed, queued } = upload;
  const done = phase === "done";
  const added = visuals.length;

  useAnnounceWork(!done);

  // A clean result takes itself away, as a capture's does. Anything that
  // failed stays until it's been read: the file is nowhere else.
  useEffect(() => {
    if (!done || failed.length) return undefined;
    const timer = setTimeout(() => dismissVisualUpload(id), queued ? QUEUED_HOLD : DONE_HOLD);
    return () => clearTimeout(timer);
  }, [done, failed.length, queued, id]);

  if (done) {
    const tone = failed.length ? "capture-status-failed" : queued ? "capture-status-queued" : "";
    const what = added === 1 ? "Image" : plural(added, "image");
    return (
      <div className={`capture-status capture-status-done ${tone}`.trim()} role={failed.length ? "alert" : "status"}>
        <p>
          <span>
            {added > 0 &&
              (queued ? (
                <>
                  ✓ {what} saved. The AI hasn&rsquo;t answered yet, so the title and tags are queued and will fill in
                  on their own.
                </>
              ) : (
                <>✓ {what} saved and described.</>
              ))}
            {added > 0 && failed.length > 0 && " "}
            {failed.length > 0 && `${plural(failed.length, "file")} couldn’t be added.`}
          </span>
          {failed.length > 0 && (
            <button type="button" className="icon-btn visual-upload-dismiss" onClick={() => dismissVisualUpload(id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          )}
        </p>
        {failed.length > 0 && (
          <ul className="visual-upload-failed">
            {failed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const known = phase === "uploading";
  return (
    <div className="capture-status capture-status-quick" role="status">
      <div
        className="capture-status-bar"
        role="progressbar"
        aria-label={`Uploading ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(sent * 100) : undefined}
      >
        <div
          className={`capture-status-fill${known ? "" : " capture-status-fill-unknown"}`}
          style={known ? { width: `${sent * 100}%` } : undefined}
        />
      </div>
      <div className="capture-status-row">
        <p>
          {phase === "uploading" && `Uploading ${label}: ${Math.floor(sent * 100)}%. Keep this page open.`}
          {phase === "saving" && `Saving ${label}${total > 1 ? `: ${added} of ${total} done` : ""}…`}
          {phase === "describing" &&
            `Writing ${added === 1 ? "a title, description and tags" : "titles, descriptions and tags"}. Safe to leave this page.`}
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
