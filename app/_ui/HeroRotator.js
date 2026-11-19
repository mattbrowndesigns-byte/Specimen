"use client";
import { useEffect, useState } from "react";
import { useIsDemo } from "./demoState";

// The rotating top line of the dashboard hero's one sentence:
//
//   [Save any website]
//   and let AI sort it all.
//
// The whole top line changes, in the brand purple, the way Dribbble's hero
// does ("Browse client briefs / and get hired"); the bottom line holds still
// in ink. The split follows what Kivli is: the top names one kind of save,
// the bottom says the part nobody else does -- the AI files it for you.
// Speed was the wrong promise ("find them in seconds"): half the time you're
// browsing, not hunting.
//
// The fixed line has no "it" or "them" pointing back at the top line, only
// "it all", so it reads right after any line, singular or plural. Lines are
// kept to "Verb any [thing]": short enough to land in a glance, and "any"
// says you save what you choose without a clause saying so. This replaced two
// sentences ("Save what inspires you. / Find it when you need it."), which
// said the same thing twice; one sentence that names a different thing each
// time describes the product instead.
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
  { text: "Save any website" },
  { text: "Crop any detail" },
  // Visuals aren't in the demo yet, so neither is the line about them.
  { text: "Keep any image", demo: false },
  { text: "File any tool" },
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
      <span className="sr-only">Save any website, detail, image or tool</span>
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
