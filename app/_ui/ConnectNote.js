"use client";
import { useEffect, useState } from "react";
import { Plug, X } from "lucide-react";
import { useIsDemo } from "./demoState";
import { noteVisible, retireAll, retireNote } from "./connectPrompts";

// "New: your AI can search this." Once, on the dashboard, for the people who
// were saving here before Kivli could be connected to anything.
//
// On the dashboard rather than a bar across the top of every page: the top
// band is the demo banner's, two stacked bands read as an alarm, and a setup
// you do once does not warrant interrupting every screen. Not in the demo at
// all, where the first visit already has a tour to sit through.
//
// It asks the server whether an app is connected before it draws anything,
// so someone who set this up from another browser is never told about it.
export default function ConnectNote() {
  const demo = useIsDemo();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (demo || !noteVisible()) return;
    let cancelled = false;
    fetch("/api/account/connections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // The demo flag can arrive a render late, so the server's answer is
        // the backstop: a demo account is never told to connect.
        if (cancelled || !data || data.unavailable || data.demo) return;
        if (data.grants?.length) retireAll();
        else setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [demo]);

  if (!show) return null;

  function close() {
    retireNote();
    setShow(false);
  }

  return (
    <aside className="connect-note-card" aria-label="New feature">
      <Plug size={18} className="connect-note-icon" aria-hidden="true" />
      <p>
        <strong>New: ask Claude or ChatGPT about your library.</strong> Connect Kivli once and your AI
        can search your saves and see their screenshots.
      </p>
      <a className="connect-note-link" href="/connect" onClick={retireNote}>
        Set it up
      </a>
      <button type="button" className="icon-btn connect-note-close" onClick={close} aria-label="Dismiss">
        <X size={16} />
      </button>
    </aside>
  );
}
