"use client";
import { useEffect, useState } from "react";
import { Monitor, History, FolderOpen, Search, Crop, Tags, Compass } from "lucide-react";

// Things worth knowing about Kivli, shown a line at a time.
//
// Used in the two places where someone is looking at nothing in particular: an
// empty library, and the minute a capture takes to come back. Lucide icons
// rather than emoji, so it matches the rest of the app's iconography.
const FEATURES = [
  { Icon: Monitor, text: "Every save captures desktop and mobile" },
  { Icon: History, text: "Re-capture any time — earlier versions are kept" },
  { Icon: FolderOpen, text: "Group saves into collections for a project" },
  { Icon: Tags, text: "Tags are written for you, then yours to edit" },
  { Icon: Search, text: "Search summaries, notes and tags at once" },
  { Icon: Crop, text: "Crop a single component out of any page" },
  { Icon: Compass, text: "Kivli finds a site's key pages for you" },
];

// One CSS animation carries the whole cycle -- rise in, hold, rise out -- and
// `key` remounts the line to restart it. The interval is a little longer than
// the animation so the outgoing line has certainly faded before it's replaced.
const CYCLE_MS = 4600;
const SWAP_MS = 4800;

export default function FeatureRotator({ className = "" }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * FEATURES.length));

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % FEATURES.length), SWAP_MS);
    return () => clearInterval(timer);
  }, []);

  const { Icon, text } = FEATURES[index];

  return (
    <p className={`feature-rotator ${className}`.trim()}>
      <span className="feature-rotator-line" key={index} style={{ animationDuration: `${CYCLE_MS}ms` }}>
        <Icon size={15} />
        {text}
      </span>
    </p>
  );
}
