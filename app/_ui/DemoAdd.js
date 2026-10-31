"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { KINDS } from "./kinds";
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
// screenshot, tag and colour on the page it opens is real output, and the
// field says plainly that every save in the demo is that one. The same goes
// for a component (a block from ramp.com) and a resource (Lucide) -- one
// replayed save per kind, listed in DEMO_SAVES.
//
// It stands in for AddMenu in the utility bar. From any page but the
// dashboard it starts the save and goes there, the same way a real Add hands
// its job to the dashboard to be watched.

// The real AddMenu's labels, so the locked field reads like the real one.
const URL_LABELS = {
  website: "Website URL",
  component: "Page to crop from",
  resource: "Link to save",
};

const RUNNING_LINES = {
  website: (label, left) =>
    `Capturing ${label}: about ${left}s remaining. Sped up for the demo; a real save takes about a minute.`,
  component: (label, left) =>
    `Capturing ${label} and cropping a block: about ${left}s remaining. Sped up for the demo; in the real app you crop it yourself once the capture lands.`,
  resource: (label, left) => `Saving ${label} and sorting it into a folder: about ${left}s remaining.`,
};

const DONE_LINES = {
  website: (label) => `${label} captured and tagged. Open its card to see what Kivli read from it.`,
  component: (label) => `A block from ${label} saved and described. Open its card to see it.`,
  resource: (label) => `${label} saved, summarised and filed.`,
};

export default function DemoAdd() {
  const phases = {
    website: useDemoPhase("website"),
    component: useDemoPhase("component"),
    resource: useDemoPhase("resource"),
  };
  const [open, setOpen] = useState(false);
  // The kind whose form is open, or null for the menu.
  const [form, setForm] = useState(null);
  const save = form && DEMO_SAVES[form];
  const used = form && phases[form] !== "idle";
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
    setDemoPhase(form, "capturing");
    if (window.location.pathname !== "/") window.location.href = "/";
  }

  return (
    <div className="add-menu" ref={wrapRef}>
      <button className="add-btn" onClick={() => (open ? close() : setOpen(true))}>
        <Plus size={16} />
        Add
      </button>

      {open && form && used && (
        <div className="add-pop add-pop-form demo-used">
          <p>That was the demo&rsquo;s one {form} save. In the real app, Add saves anything you paste.</p>
          <div className="add-pop-actions">
            <button type="button" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* The real menu's three kinds. A kind with nothing to replay says so
          rather than disappearing. */}
      {open && !form && (
        <div className="add-pop">
          {KINDS.map(({ add, one, blurb, Icon }) => {
            const live = Boolean(DEMO_SAVES[add]);
            return (
              <button
                className="add-option"
                key={add}
                onClick={() => live && setForm(add)}
                disabled={!live}
              >
                <span className="add-option-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{one}</strong>
                  <small>{live ? blurb : "Not in the demo"}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && form && !used && (
        <form className="add-pop add-pop-form" onSubmit={submit}>
          <label htmlFor="demo-url">{URL_LABELS[form]}</label>
          <input id="demo-url" value={save.url} readOnly aria-describedby="demo-url-note" />
          <p className="add-pop-note" id="demo-url-note">
            {save.note}
          </p>
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
// through one -- and the line says so, so nobody leaves thinking a capture
// takes twelve. A resource has no capture and runs close to its real length.
const DONE_HOLD = 3500;

export function DemoProgress({ kind, onHidden }) {
  const { label, seconds: DEMO_SECONDS } = DEMO_SAVES[kind];
  const onDone = () => setDemoPhase(kind, "saved");
  const [elapsed, setElapsed] = useState(0);
  const done = elapsed >= DEMO_SECONDS;
  // Held in refs so a parent re-rendering mid-run can't restart the timers.
  const callbacks = useRef({ onDone, onHidden });
  callbacks.current = { onDone, onHidden };

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
