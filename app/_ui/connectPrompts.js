// When to tell someone their AI can search Kivli by itself.
//
// Two prompts, both quiet and both finite. The nudge after Copy for AI is the
// strongest moment there is -- that person is carrying the library into an AI
// by hand right now -- but it shows three times at most, and never again once
// it has been closed, followed, or someone has connected an app. The dashboard
// note is for people who were using Kivli before this existed, and goes for
// good the first time it is closed. A setup you do once does not earn a
// prompt that stays.
//
// localStorage, like the view switches and the search history: a per-browser
// convenience, read and written through try/catch so a blocked store means
// no prompt rather than a broken page.

const NUDGE_KEY = "specimen.connect.nudge";
const NOTE_KEY = "specimen.connect.note";
const NUDGE_LIMIT = 3;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No store, no memory of it: the worst case is seeing a prompt again.
  }
}

export function claimNudge() {
  const state = read(NUDGE_KEY) || { shown: 0, off: false };
  if (state.off || state.shown >= NUDGE_LIMIT) return false;
  write(NUDGE_KEY, { ...state, shown: state.shown + 1 });
  return true;
}

export function noteVisible() {
  return !read(NOTE_KEY)?.off;
}

export function retireNudge() {
  write(NUDGE_KEY, { shown: NUDGE_LIMIT, off: true });
}

export function retireNote() {
  write(NOTE_KEY, { off: true });
}

// Someone with an app connected has nothing left to be told.
export function retireAll() {
  retireNudge();
  retireNote();
}
