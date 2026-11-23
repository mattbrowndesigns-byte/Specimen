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
  const kind = batch?.kind;
  // Whether the machine still has something to do. The other half of a
  // component or visuals import -- cropping, picking -- is yours, and does
  // not need this page polling every twenty seconds to wait for it.
  const working =
    batch &&
    (kind === "visual"
      ? batch.awaitingRead > 0 || batch.reading > 0 || batch.awaitingSort > 0
      : batch.awaitingCapture > 0 || batch.capturing > 0 || batch.awaitingTags > 0);
  const waitingOnYou = batch && (batch.readyToCrop > 0 || batch.readyToPick > 0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => refresh.current?.(), POLL_MS);
    return () => clearInterval(timer);
  }, [working]);

  if (!batch) return null;

  // A finished batch is news the day it finishes and furniture after that. An
  // import from weeks ago was still sitting at the top of the page with two
  // full bars, which read as something still loading. Once nothing is left to
  // do it stays for the rest of the day it was imported, then goes; anything
  // that needs a look is in the review queue, which is where it belongs.
  //
  // Pages waiting for a crop or a pick are not finished, whatever day it is:
  // they are holding storage, and this is the panel that says so.
  const finishedLongAgo =
    !working &&
    !waitingOnYou &&
    new Date(batch.importedAt).toDateString() !== new Date().toDateString();
  if (finishedLongAgo) return null;

  const tracks =
    kind === "component"
      ? componentTracks(batch, account)
      : kind === "visual"
        ? visualTracks(batch, account)
        : libraryTracks(batch, account);

  return (
    <section className="import-status">
      <div className="import-status-head">
        <h2>{headline(batch)}</h2>
        {working && <span className="import-status-live">Still working</span>}
      </div>

      {tracks.map((track) => (
        <Track key={track.label} {...track} />
      ))}

      {batch.readyToCrop > 0 && (
        <p className="import-status-next">
          {batch.readyToCrop} {batch.readyToCrop === 1 ? "page" : "pages"} captured, ready to crop.{" "}
          <a href="/?tab=components">Open Components</a>
        </p>
      )}
      {batch.readyToPick > 0 && (
        <p className="import-status-next">
          {batch.readyToPick} {batch.readyToPick === 1 ? "project" : "projects"} ready to pick from.{" "}
          <a href="/?tab=visuals">Open Visuals</a>
        </p>
      )}

      {batch.stuck > 0 && <p className="import-status-stuck">{stuckLine(batch)}</p>}

      {!working && !waitingOnYou && (
        <p className="import-status-done">
          Nothing left to do on this batch. Anything marked for review is in the review queue.
        </p>
      )}
    </section>
  );
}

const NOUNS = { site: "websites", resource: "resources", component: "components", visual: "visuals" };

function headline(batch) {
  const when = day(batch.importedAt);
  // A component or visuals import is a list of pages, not yet a list of
  // components or visuals -- those are what you make from them.
  if (batch.kind === "component" || batch.kind === "visual") {
    return `${batch.total} ${batch.total === 1 ? "page" : "pages"} imported for ${NOUNS[batch.kind]} ${when}`;
  }
  return `${batch.total} ${NOUNS[batch.kind]} imported ${when}`;
}

function stuckLine(batch) {
  const n = batch.stuck;
  const pages = n === 1 ? "page" : "pages";
  const they = n === 1 ? "It is" : "They are";
  if (batch.kind === "component") {
    return `${n} ${pages} couldn't be captured. ${they} on the Components tab with the reason, where you can dismiss ${n === 1 ? "it" : "them"}.`;
  }
  if (batch.kind === "visual") {
    return `${n} ${pages} couldn't be read. ${they} on the Visuals tab with the reason, and Try Again is there.`;
  }
  return `${n} ${n === 1 ? "link" : "links"} gave up after repeated failures. They are in your library with whatever did land, and Re-read will try again.`;
}

function libraryTracks(batch, account) {
  const captured = batch.total - batch.awaitingCapture - batch.capturing;
  const tracks = [];
  if (batch.kind === "site") {
    tracks.push({
      label: "Screenshots",
      done: captured,
      total: batch.total,
      detail:
        batch.awaitingCapture > 0
          ? `${batch.awaitingCapture} still queued, about 30 an hour`
          : batch.capturing > 0
            ? `${batch.capturing} being taken now`
            : "All in",
    });
  }
  tracks.push({
    label: "Summaries and tags",
    done: batch.done,
    total: batch.total,
    detail:
      batch.awaitingTags > 0
        ? waitLine(batch.awaitingTags, batch.nextDue, account.quotaUntil, "three")
        : batch.done === batch.total
          ? "All in"
          : "Waiting on screenshots",
  });
  return tracks;
}

// Two different reasons for the same bar not moving, and only one of them is
// the queue's: "being captured" is the machine, "waiting until you crop" is a
// ceiling on how much sits in storage uncropped, and it lifts when you crop.
function componentTracks(batch, account) {
  const ahead = account.cropAhead || 12;
  const captured = batch.total - batch.awaitingCapture - batch.capturing;
  return [
    {
      label: "Screenshots",
      done: captured,
      total: batch.total,
      detail:
        batch.awaitingCapture > 0
          ? batch.held
            ? `${batch.awaitingCapture} waiting until you crop. Kivli keeps ${ahead} captured ahead of you, because each one holds two full-page screenshots in storage until it's cropped.`
            : `${batch.awaitingCapture} still queued, a few every fifteen minutes`
          : batch.capturing > 0
            ? `${batch.capturing} being taken now`
            : "All in",
    },
    {
      label: "Cropped",
      done: batch.cropped,
      total: batch.total,
      detail:
        batch.cropped === batch.total
          ? "All cropped"
          : batch.readyToCrop > 0
            ? "Yours to do, on the Components tab"
            : "Waiting on screenshots",
    },
  ];
}

// Two machine steps rationed by different things -- reading a page costs
// storage, sorting it costs one of the day's AI requests -- so two bars, and
// the owner's step after them.
function visualTracks(batch, account) {
  const ahead = account.pickAhead || 5;
  const found = batch.total - batch.awaitingRead - batch.reading;
  const readable = batch.read;
  return [
    {
      label: "Images found",
      done: found,
      total: batch.total,
      detail:
        batch.awaitingRead > 0
          ? batch.held
            ? `${batch.awaitingRead} waiting until you pick. Kivli reads ${ahead} pages ahead of you, because each one holds its images in storage until you choose.`
            : `${batch.awaitingRead} still queued, three every fifteen minutes`
          : batch.reading > 0
            ? `${batch.reading} being read now`
            : "All in",
    },
    {
      label: "Sorted by the AI",
      done: batch.sorted,
      total: readable || batch.total,
      detail:
        batch.awaitingSort > 0
          ? waitLine(batch.awaitingSort, batch.nextDue, account.quotaUntil, "two")
          : readable && batch.sorted >= readable
            ? found === batch.total
              ? "All in"
              : "Every page read so far is sorted"
            : "Waiting on pages to be read",
    },
  ];
}

// The one sentence a bulk import exists to be able to say: not "pending", but
// what it is waiting for and when it stops waiting.
function waitLine(count, nextDue, quotaUntil, perRun) {
  const left = `${count} waiting`;
  if (quotaUntil) return `${left}. Today's AI budget is spent, resuming ${time(quotaUntil)}.`;
  if (nextDue) {
    const due = new Date(nextDue);
    if (due > new Date()) return `${left}. Next try at ${time(nextDue)}.`;
  }
  return `${left}. The queue picks ${perRun} up every fifteen minutes.`;
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
