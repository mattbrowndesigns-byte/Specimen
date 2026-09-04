"use client";
import { useEffect, useState } from "react";

const PHRASES = ["Your visual inspiration library", "Save what inspires you. Find it when you need it."];

// One CSS animation carries the whole cycle -- fade up in, hold, fade up out --
// and `key={index}` remounts the span so it restarts cleanly on each swap.
// Doing it with transitions instead would need the element to jump back below
// the line between phrases, which is a frame of visible flicker.
//
// The interval is slightly longer than the animation so the outgoing phrase has
// certainly reached opacity 0 before it's replaced; the small gap is invisible
// because there's nothing on screen during it.
const CYCLE_MS = 5100;
const SWAP_MS = 5300;

export default function BrandTagline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), SWAP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="brand-tagline">
      <span
        className="brand-tagline-phrase"
        key={index}
        style={{ animationDuration: `${CYCLE_MS}ms` }}
      >
        {PHRASES[index]}
      </span>
    </span>
  );
}
