"use client";
import AddMenu from "./AddMenu";
import MoreMenu from "./MoreMenu";
import NotificationBell from "./NotificationBell";
import { addItem, jobHandoffUrl } from "@/lib/addItem";

// The library's chrome, the same on every page: identity (which doubles as the
// way home), the review bell, Add, and a menu holding everything that isn't a
// constant reach -- including the theme, which is a preference you set once and
// not an action you take, so it lives under Settings in that menu.
//
// The dashboard passes `onAdd` because it can show capture progress inline.
// Everywhere else, a save hands the job to the dashboard through the query
// string and navigates there, so you always end up watching the capture.
export default function UtilityBar({ onAdd, onError }) {
  async function handleAdd(kind, url) {
    if (onAdd) return onAdd(kind, url);
    const result = await addItem(kind, url);
    if (result.error) {
      onError?.(result.error);
      return false;
    }
    window.location.href = jobHandoffUrl(result.job);
    return true;
  }

  return (
    <header className="utility-bar">
      <div className="utility-bar-inner">
        <div className="brand">
          <a className="utility-bar-title" href="/">
            {/* One span per letter, so the warm sweep can run through them in
                order, and each i drawn twice and clipped -- stem below the cut,
                dot above it -- so its dot can hop while the stem stays put.
                The duplicate carries aria-hidden, so the accessible name is
                still "Kivli". Only the i wrappers are inline-block; the plain
                letters stay inline, which leaves the kerning untouched. */}
            <h1 className="wordmark">
              <span className="wordmark-letter" style={{ "--step": 0 }}>
                K
              </span>
              <span className="wordmark-letter wordmark-i" style={{ "--step": 1 }}>
                <span className="wordmark-i-stem">i</span>
                <span className="wordmark-i-dot" aria-hidden="true">i</span>
              </span>
              <span className="wordmark-letter" style={{ "--step": 2 }}>
                v
              </span>
              <span className="wordmark-letter" style={{ "--step": 3 }}>
                l
              </span>
              <span className="wordmark-letter wordmark-i" style={{ "--step": 4 }}>
                <span className="wordmark-i-stem">i</span>
                <span className="wordmark-i-dot" aria-hidden="true">i</span>
              </span>
            </h1>
          </a>
          {/* Outside the link: the wordmark is the target, the tagline is
              description, and a hover that greyed both would read as one word. */}
          <span className="brand-tagline">Your visual inspiration library</span>
        </div>
        <div className="nav-links">
          <NotificationBell />
          <AddMenu onSubmit={handleAdd} />
          <MoreMenu />
        </div>
      </div>
    </header>
  );
}
