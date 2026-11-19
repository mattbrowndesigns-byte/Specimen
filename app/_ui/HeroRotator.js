"use client";
import { useEffect, useState } from "react";
import { useIsDemo } from "./demoState";

// The dashboard hero's second line, rotating through what Kivli keeps. The
// top line stays; this one names one kind of thing at a time, so the hero
// describes the product instead of repeating its promise.
//
// Calm on purpose -- it's the first thing on the page you come back to every
// day. A line holds for five seconds, then fades out drifting up a few
// pixels while the next fades in beneath it. Every line sits in the same
// grid cell, so the hero is as wide and as tall as its longest line from the
// first paint and nothing below it moves when the words change.
//
// It stops entirely for anyone who has asked for reduced motion, and pauses
// while the tab is hidden, so coming back never lands mid-fade on a line
// you didn't see arrive. The first line is the same on the server and the
// browser -- no random start -- or every load would be a hydration mismatch.
const LINES = [
  { text: "Websites, captured whole." },
  { text: "Components, cropped clean." },
  // Visuals aren't in the demo yet, so neither is the line about them.
  { text: "Brand work, image by image.", demo: false },
  { text: "Tools, filed for later." },
];

const HOLD_MS = 5000;

export default function HeroRotator() {
  const demo = useIsDemo();
  const lines = demo ? LINES.filter((l) => l.demo !== false) : LINES;
  const [index, setIndex] = useState(0);
  // The line that just left, so it can go up while the waiting ones sit
  // below: one direction of travel, in at the bottom and out at the top.
  const [leaving, setLeaving] = useState(null);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // Treat an unknown preference as no preference.
    }
    if (reduced) return undefined;

    const timer = setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => {
        setLeaving(i);
        return (i + 1) % lines.length;
      });
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [lines.length]);

  const active = index % lines.length;

  return (
    <span className="hero-rotator">
      {/* Read once, as a sentence, rather than announced every five
          seconds: the rotating copies are hidden from screen readers. */}
      <span className="sr-only">Websites, components, brand work and tools, all in one place.</span>
      {lines.map((line, i) => (
        <span
          key={line.text}
          className={`hero-rotator-line${i === active ? " is-active" : i === leaving ? " is-leaving" : ""}`}
          aria-hidden="true"
        >
          {line.text}
        </span>
      ))}
    </span>
  );
}
