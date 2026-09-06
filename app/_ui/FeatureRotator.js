"use client";
import { useEffect, useState } from "react";
import { FEATURES } from "@/lib/features";

// Things worth knowing about Kivli, shown a line at a time.
//
// Used in the two places where someone is looking at nothing in particular: an
// empty library, and the minute a capture takes to come back. The lines come
// from the same list /features lays out in full, so the two can't drift.

// One CSS animation carries the whole cycle -- rise in, hold, rise out -- and
// `key` remounts the line to restart it. The interval is a little longer than
// the animation so the outgoing line has certainly faded before it's replaced.
const CYCLE_MS = 4600;
const SWAP_MS = 4800;

export default function FeatureRotator({ className = "" }) {
  const [index, setIndex] = useState(0);

  // Randomised after mount, not in the initial state. Picking at render time
  // means the server renders one line and the browser renders a different one,
  // which is a hydration mismatch -- React then throws away the server's HTML
  // for this subtree and logs an error on every page that shows a rotator.
  useEffect(() => {
    setIndex(Math.floor(Math.random() * FEATURES.length));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % FEATURES.length), SWAP_MS);
    return () => clearInterval(timer);
  }, []);

  const { Icon, short } = FEATURES[index];

  return (
    <p className={`feature-rotator ${className}`.trim()}>
      <span className="feature-rotator-line" key={index} style={{ animationDuration: `${CYCLE_MS}ms` }}>
        <Icon size={15} />
        {short}
      </span>
    </p>
  );
}
