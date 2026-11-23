"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import FeatureRotator from "./FeatureRotator";
import { useAnnounceWork } from "./workInFlight";
import { dismissUpload } from "./uploads";

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

// What a finished one says about the files that made it.
function outcome({ kind, items, queued }) {
  const n = items.length;
  const clips = items.filter((item) => item.video_url).length;
  if (kind === "component") {
    const images = n - clips;
    const kept = clips && `✓ ${clips === 1 ? "Clip" : `${clips} clips`} saved.`;
    const crop =
      images === 1
        ? "✓ Image uploaded. Crop it, or use it as it is."
        : images > 1 && `✓ ${images} images uploaded. Crop each one, or use it as it is.`;
    return [kept, crop].filter(Boolean).join(" ");
  }
  const thing = clips === 0 ? "image" : clips === n ? "clip" : "file";
  const word = kind === "describe" ? "component" : thing;
  const what = n === 1 ? word[0].toUpperCase() + word.slice(1) : `${n} ${word}s`;
  const words = kind === "describe" ? "the name and tags are" : "the title and tags are";
  return queued
    ? `✓ ${what} saved. The AI hasn’t answered yet, so ${words} queued and will fill in on their own.`
    : `✓ ${what} saved and described.`;
}

function describing({ kind, total, described, items }) {
  if (kind === "describe") {
    return total === 1
      ? "Writing a name, summary and tags. Safe to leave this page."
      : `Writing names, summaries and tags: ${described} of ${total} done. Safe to leave this page.`;
  }
  return `Writing ${items.length === 1 ? "a title, description and tags" : "titles, descriptions and tags"}. Safe to leave this page.`;
}

// Files that didn't upload, or components the AI couldn't describe.
function failure({ kind, failed }) {
  return kind === "describe"
    ? `${plural(failed.length, "component")} couldn’t be described. Open ${failed.length === 1 ? "it" : "one"} and press Regenerate to try again.`
    : `${plural(failed.length, "file")} couldn’t be added.`;
}

export default function UploadProgress({ upload }) {
  const { id, label, total, sent, phase, items, failed, queued } = upload;
  const done = phase === "done";
  const added = items.length;
  const described = upload.kind !== "describe" || failed.length < added;

  useAnnounceWork(!done);

  // A clean result takes itself away, as a capture's does. Anything that
  // failed stays until it's been read: the file is nowhere else.
  useEffect(() => {
    if (!done || failed.length) return undefined;
    const timer = setTimeout(() => dismissUpload(id), queued ? QUEUED_HOLD : DONE_HOLD);
    return () => clearTimeout(timer);
  }, [done, failed.length, queued, id]);

  if (done) {
    const tone = failed.length ? "capture-status-failed" : queued ? "capture-status-queued" : "";
    return (
      <div className={`capture-status capture-status-done ${tone}`.trim()} role={failed.length ? "alert" : "status"}>
        <p>
          <span>
            {added > 0 && described && outcome(upload)}
            {added > 0 && described && failed.length > 0 && " "}
            {failed.length > 0 && failure(upload)}
          </span>
          {failed.length > 0 && (
            <button type="button" className="icon-btn visual-upload-dismiss" onClick={() => dismissUpload(id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          )}
        </p>
        {failed.length > 0 && (
          <ul className="visual-upload-failed">
            {[...new Set(failed)].map((line) => (
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
        aria-label={label ? `Uploading ${label}` : "Describing"}
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
          {phase === "reading" && `Opening ${label}…`}
          {phase === "uploading" && `Uploading ${label}: ${Math.floor(sent * 100)}%. Keep this page open.`}
          {phase === "saving" && `Saving ${label}${total > 1 ? `: ${added} of ${total} done` : ""}…`}
          {phase === "describing" && describing(upload)}
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
