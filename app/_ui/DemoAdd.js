"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { KINDS } from "./kinds";
import { URL_LABELS } from "./AddMenu";
import { useAnnounceWork } from "./workInFlight";
import FeatureRotator from "./FeatureRotator";
import { DEMO_SAVES, setDemoPhase, useDemoPhase } from "./demoState";

// The demo's Add, and why it is staged rather than real.
//
// A real save spends two of the day's twenty Gemini requests, and that pool is
// the owner's as well. A link on LinkedIn that thirty people try would spend
// the day's budget by lunchtime and leave the library's own saves untagged --
// and the demo account refuses writes anyway. So the demo saves one thing,
// ramp.com, by replaying the save the demo account already holds: every
// screenshot, tag and colour on the page it opens is real output. The same goes
// for a component (a block from Stripe), a resource (Lucide) and visuals (one
// Uber project) -- one replayed save per kind, listed in DEMO_SAVES.
//
// It stands in for AddMenu in the utility bar. From any page but the
// dashboard it starts the save and goes there, the same way a real Add hands
// its job to the dashboard to be watched.

// Every word here is the real app's, down to the label on the field. The tour
// is where a visitor is told this is a demo and that its saves are staged and
// sped up; repeating that on each control made the app read as a brochure for
// itself.
const RUNNING_LINES = {
  website: (label, left) => `Capturing ${label}: about ${left}s remaining. Safe to leave this page.`,
  component: (label, left) => `Capturing ${label}: about ${left}s remaining. Safe to leave this page.`,
  resource: (label) => `Reading ${label} and asking what it’s for…`,
};

const DONE_LINES = {
  website: (label) => `${label} captured and tagged.`,
  component: (label) => `${label} captured and cropped.`,
  resource: (label) => `${label} saved and described.`,
};

export default function DemoAdd() {
  const [open, setOpen] = useState(false);
  // The kind whose form is open, or null for the menu.
  const [form, setForm] = useState(null);
  const save = form && DEMO_SAVES[form];
  const wrapRef = useRef(null);
  const submitRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // The field is locked, so focus goes to the one thing there is to press.
  useEffect(() => {
    if (form) submitRef.current?.focus();
  }, [form]);

  function close() {
    setOpen(false);
    setForm(null);
  }

  function submit(e) {
    e.preventDefault();
    close();
    // Visuals go to the picker, the same as the real Add: the next thing that
    // happens is you choosing.
    if (save.projectId) {
      window.location.href = `/visuals/projects/${save.projectId}`;
      return;
    }
    setDemoPhase(form, "capturing");
    if (window.location.pathname !== "/") window.location.href = "/";
  }

  return (
    <div className="add-menu" ref={wrapRef}>
      <button className="add-btn" data-tour="add" onClick={() => (open ? close() : setOpen(true))}>
        <Plus size={16} />
        Add
      </button>

      {open && !form && (
        <div className="add-pop">
          {KINDS.map(({ add, one, blurb, Icon }) => (
            <button className="add-option" key={add} onClick={() => setForm(add)}>
              <span className="add-option-icon">
                <Icon size={17} />
              </span>
              <span>
                <strong>{one}</strong>
                <small>{blurb}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && form && (
        <form className="add-pop add-pop-form" onSubmit={submit}>
          <label htmlFor="demo-url">{URL_LABELS[form]}</label>
          <input id="demo-url" value={save.url} readOnly />
          <div className="add-pop-actions">
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="primary" ref={submitRef}>
              Submit
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// CaptureProgress without the polling: there is no job to wait for, so the
// clock is the whole of it. Twelve seconds rather than the real seventy-five
// for a capture, because the point is to see the shape of a save, not to sit
// through one; the tour says it is sped up. A resource has no capture and runs
// close to its real length.
const DONE_HOLD = 3500;

export function DemoProgress({ kind, onHidden }) {
  const { label, seconds: DEMO_SECONDS } = DEMO_SAVES[kind];
  const onDone = () => setDemoPhase(kind, "saved");
  const [elapsed, setElapsed] = useState(0);
  const done = elapsed >= DEMO_SECONDS;
  // Held in refs so a parent re-rendering mid-run can't restart the timers.
  const callbacks = useRef({ onDone, onHidden });
  callbacks.current = { onDone, onHidden };

  // Added again while the confirmation is still up: start over, or the panel
  // would close on a save that never lands.
  const phase = useDemoPhase(kind);
  const landed = useRef(false);
  useEffect(() => {
    if (phase === "saved") landed.current = true;
    else if (phase === "capturing" && landed.current) {
      landed.current = false;
      setElapsed(0);
    }
  }, [phase]);

  useAnnounceWork(!done);

  useEffect(() => {
    if (done) return;
    const tick = setTimeout(() => setElapsed((s) => s + 1), 1000);
    return () => clearTimeout(tick);
  }, [elapsed, done]);

  // The card lands just after the bar fills, and the confirmation stays a
  // moment longer, the same order the real save happens in.
  useEffect(() => {
    if (!done) return;
    const land = setTimeout(() => callbacks.current.onDone(), 600);
    const hide = setTimeout(() => callbacks.current.onHidden(), DONE_HOLD);
    return () => {
      clearTimeout(land);
      clearTimeout(hide);
    };
  }, [done]);

  if (done) {
    return (
      <div className="capture-status capture-status-done">
        <p>✓ {DONE_LINES[kind](label)}</p>
      </div>
    );
  }

  return (
    <div className="capture-status">
      <div className="capture-status-bar">
        <div
          className="capture-status-fill"
          style={{ width: `${Math.min(95, (elapsed / DEMO_SECONDS) * 100)}%` }}
        />
      </div>
      <div className="capture-status-row">
        <p>{RUNNING_LINES[kind](label, DEMO_SECONDS - elapsed)}</p>
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
