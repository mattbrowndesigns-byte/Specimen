"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// One tooltip for the whole app: the grey pill the lightbox's icons
// introduced, now drawn for anything carrying `data-tip`.
//
// It lives here, mounted once in the root layout, rather than as a CSS
// ::after on each control, for two reasons that both bit. A card clips its
// contents (`overflow: hidden`, for the rounded thumbnail), so a pseudo-element
// tooltip on the card's heart was cut off at the card's edge; drawn into
// <body> at a fixed position, nothing can clip it. And half the app's
// controls already spend their ::after on something else -- the stretched
// links in a row are an ::after -- so a second job for it would have collided.
//
// The native `title` tooltip it replaces waits a second and a half, can't be
// styled, and was a different shape from the pill on every screen that had
// one. Controls now say `data-tip` and keep their `aria-label`, which is what a
// screen reader reads; the tip is for the eye.
//
// Shows after a short beat, so running the pointer across a row of icons
// doesn't flash every name; below the control, or above it near the bottom of
// the window; on keyboard focus as well as hover. Touch gets nothing: a tap is
// a press, and a tooltip that appears under a finger is one you can't read.
const DELAY_MS = 250;
const GAP = 8;

export default function Tooltips() {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);
  const current = useRef(null);
  const node = useRef(null);

  useEffect(() => {
    function hide() {
      clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    }

    function show(el) {
      if (current.current === el) return;
      clearTimeout(timer.current);
      current.current = el;
      setTip(null);
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const text = el.getAttribute("data-tip");
        if (!text) return;
        const rect = el.getBoundingClientRect();
        const below = rect.bottom + 48 < window.innerHeight;
        setTip({
          text,
          x: rect.left + rect.width / 2,
          y: below ? rect.bottom + GAP : rect.top - GAP,
          below,
        });
      }, DELAY_MS);
    }

    function onOver(e) {
      if (e.pointerType === "touch") return;
      const el = e.target.closest?.("[data-tip]");
      if (el) show(el);
      else if (current.current) hide();
    }

    function onFocus(e) {
      // Only for keyboard focus; a click also focuses, and the tip would
      // then sit over whatever the click opened.
      const el = e.target.closest?.("[data-tip]");
      if (el && el.matches(":focus-visible")) show(el);
    }

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // A tip whose text changes while it's showing (Copy for AI's "Copied")
  // follows along rather than holding the old words.
  useEffect(() => {
    if (!tip || !current.current) return undefined;
    const el = current.current;
    const observer = new MutationObserver(() => {
      const text = el.getAttribute("data-tip");
      if (!text) setTip(null);
      else setTip((t) => (t ? { ...t, text } : t));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-tip"] });
    return () => observer.disconnect();
  }, [tip]);

  // Kept inside the window: a control at the far right of the bar (the menu,
  // Visit site) would otherwise push half its tip off the edge.
  useLayoutEffect(() => {
    const el = node.current;
    if (!el || !tip) return;
    const half = el.offsetWidth / 2;
    const x = Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8);
    el.style.left = `${x}px`;
    // A summary that wraps to three lines is not a pill; it gets corners.
    el.classList.toggle("app-tip-multi", el.offsetHeight > 30);
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={node}
      className={`app-tip${tip.below ? "" : " app-tip-above"}`}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.text}
    </div>,
    document.body
  );
}
