"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { KINDS } from "./kinds";
import { useAnnounceWork } from "./workInFlight";
import FeatureRotator from "./FeatureRotator";

// The demo's Add, and why it is staged rather than real.
//
// A real save spends two of the day's twenty Gemini requests, and that pool is
// the owner's as well. A link on LinkedIn that thirty people try would spend
// the day's budget by lunchtime and leave the library's own saves untagged.
// So the demo saves one thing, ramp.com, by replaying the save Kivli already
// made of it: every screenshot, tag and colour on the page it opens is real
// output, and the field says plainly that every save in the demo is that one.
// Nothing is written anywhere, so any number of people can try it at once.
//
// One go per browser. After it, Add explains itself instead of saving again.

export const DEMO_DOMAIN = "ramp.com";
const DEMO_URL = "https://ramp.com";
const DEMO_LABEL = "Ramp";

const SAVED_KEY = "specimen.demo.saved";

export function readDemoSaved() {
  try {
    return localStorage.getItem(SAVED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDemoSaved() {
  try {
    localStorage.setItem(SAVED_KEY, "1");
  } catch {
    // A blocked store means the demo can be run again, which costs nothing.
  }
}

export default function DemoAdd({ used, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(false);
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
    setForm(false);
  }

  function submit(e) {
    e.preventDefault();
    close();
    onSave();
  }

  return (
    <div className="add-menu" ref={wrapRef}>
      <button className="add-btn" onClick={() => (open ? close() : setOpen(true))}>
        <Plus size={16} />
        Add
      </button>

      {open && used && (
        <div className="add-pop add-pop-form demo-used">
          <p>That was the demo&rsquo;s one save. A library of your own saves anything you paste.</p>
          <div className="add-pop-actions">
            <button type="button" onClick={close}>
              Close
            </button>
            <a className="primary" href="/login">
              Create Your Own
            </a>
          </div>
        </div>
      )}

      {/* The real menu's three kinds, so the demo still shows what the app
          holds. Only a website can be replayed; the other two say so rather
          than disappearing. */}
      {open && !used && !form && (
        <div className="add-pop">
          {KINDS.map(({ add, one, blurb, Icon }) => {
            const live = add === "website";
            return (
              <button
                className="add-option"
                key={add}
                onClick={() => live && setForm(true)}
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

      {open && !used && form && (
        <form className="add-pop add-pop-form" onSubmit={submit}>
          <label htmlFor="demo-url">Website URL</label>
          <input id="demo-url" value={DEMO_URL} readOnly aria-describedby="demo-url-note" />
          <p className="add-pop-note" id="demo-url-note">
            In the demo, every save is ramp.com.
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
// clock is the whole of it. Twelve seconds rather than the real seventy-five,
// because the point is to see the shape of a save, not to sit through one --
// and the line says so, so nobody leaves thinking a capture takes twelve.
const DEMO_SECONDS = 12;
const DONE_HOLD = 3500;

export function DemoProgress({ onDone, onHidden }) {
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
        <p>✓ {DEMO_LABEL} captured and tagged. Open its card to see what Kivli read from it.</p>
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
        <p>
          Capturing {DEMO_LABEL}: about {DEMO_SECONDS - elapsed}s remaining. Sped up for the demo;
          a real save takes about a minute.
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
