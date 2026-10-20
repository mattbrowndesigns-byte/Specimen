"use client";
import { useEffect, useRef } from "react";

// How a bulk import is getting on, in the only terms that are true.
//
// A progress bar normally answers "how long until this is done", and that is a
// question this cannot answer: a hundred websites is two hundred model calls
// against a free tier that allows sixty a day, so the honest answer is "some
// of it tonight, the rest tomorrow, and the screenshots long before the tags".
// A single percentage would average those two into a number that is wrong
// about both.
//
// So there are two bars, because there are two jobs running at different
// speeds for different reasons. Screenshots cost free runner minutes and
// finish in hours. Tags cost the thing that is actually scarce and finish when
// the quota lets them. Keeping them apart is what lets this say "all your
// screenshots are in, tagging resumes at midnight" instead of "61%".
const POLL_MS = 20000;

const time = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
};

const day = (iso) => {
  try {
    const then = new Date(iso);
    const sameDay = then.toDateString() === new Date().toDateString();
    return sameDay
      ? `today at ${time(iso)}`
      : then.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "recently";
  }
};

export default function ImportStatus({ account, onRefresh }) {
  const batch = account?.batch;
  // Captures are the only half that moves on its own schedule rather than on
  // the queue's, so "is anything still happening" is both of them together.
  const working =
    batch && (batch.awaitingCapture > 0 || batch.capturing > 0 || batch.awaitingTags > 0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => refresh.current?.(), POLL_MS);
    return () => clearInterval(timer);
  }, [working]);

  if (!batch) return null;

  const isSites = batch.kind === "site";
  const captured = batch.total - batch.awaitingCapture - batch.capturing;
  const tagged = batch.done;

  return (
    <section className="import-status">
      <div className="import-status-head">
        <h2>
          {batch.total} {isSites ? "websites" : "resources"} imported {day(batch.importedAt)}
        </h2>
        {working && <span className="import-status-live">Still working</span>}
      </div>

      {isSites && (
        <Track
          label="Screenshots"
          done={captured}
          total={batch.total}
          detail={
            batch.awaitingCapture > 0
              ? `${batch.awaitingCapture} still queued, about 30 an hour`
              : batch.capturing > 0
                ? `${batch.capturing} being taken now`
                : "All in"
          }
        />
      )}

      <Track
        label="Summaries and tags"
        done={tagged}
        total={batch.total}
        detail={
          batch.awaitingTags > 0
            ? waitLine(batch, account.quotaUntil)
            : tagged === batch.total
              ? "All in"
              : "Waiting on screenshots"
        }
      />

      {batch.stuck > 0 && (
        <p className="import-status-stuck">
          {batch.stuck} {batch.stuck === 1 ? "link" : "links"} gave up after repeated failures. They
          are in your library with whatever did land, and Re-read will try again.
        </p>
      )}

      {!working && (
        <p className="import-status-done">
          Nothing left to do on this batch. Anything marked for review is in the review queue.
        </p>
      )}
    </section>
  );
}

// The one sentence a bulk import exists to be able to say: not "pending", but
// what it is waiting for and when it stops waiting.
function waitLine(batch, quotaUntil) {
  const left = `${batch.awaitingTags} waiting`;
  if (quotaUntil) return `${left}. Today's AI budget is spent, resuming ${time(quotaUntil)}.`;
  if (batch.nextDue) {
    const due = new Date(batch.nextDue);
    if (due > new Date()) return `${left}. Next try at ${time(batch.nextDue)}.`;
  }
  return `${left}. The queue picks three up every fifteen minutes.`;
}

// The capture bar's own gradient at the capture bar's own thickness, because
// this is the same object doing the same job over a longer stretch.
function Track({ label, done, total, detail }) {
  const pct = total ? Math.round((Math.min(done, total) / total) * 100) : 0;
  return (
    <div className="import-track">
      <div className="import-track-head">
        <span className="import-track-label">{label}</span>
        <span className="import-track-count">
          {Math.min(done, total)} of {total}
        </span>
      </div>
      <div
        className="import-track-rail"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span className="import-track-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="import-track-detail">{detail}</p>
    </div>
  );
}
