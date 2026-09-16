"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { KINDS } from "./kinds";

// The way out of a dead end.
//
// Searching, finding nothing, and concluding you never saved it is the worst
// failure this app has -- it breaks the only promise it makes -- and the most
// likely cause is that the thing is one tab over. A grid of geometric type
// specimens is a Resource; you went looking for it on Websites because that is
// where you were standing.
//
// Deliberately not a merged result list. The three tabs are three ways of
// looking, not three drawers: websites are screenshots you scan, components
// are crops you compare, resources are rows you read. One list has to pick one
// shape, and whichever it picks two thirds of the results arrive in the wrong
// one. A pointer costs nothing and loses nothing.
//
// It only appears at zero. With results on screen you are not lost, and a line
// under every search saying where else you could have looked is wallpaper
// inside a week.
export default function SearchElsewhere({ query, kind, onGo }) {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setCounts(null);
      return undefined;
    }

    let cancelled = false;
    // The same 300ms the sites search waits, plus a little: this one is a
    // courtesy, so it should never be the reason a keystroke feels slow.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-counts?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCounts(data.counts || null);
      } catch {
        // A nudge that doesn't arrive is just no nudge. Nothing here is worth
        // an error message on top of an empty result.
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const elsewhere = KINDS.filter((other) => other.id !== kind && (counts?.[other.id] || 0) > 0);
  if (!elsewhere.length) return null;

  return (
    <div className="search-elsewhere">
      {elsewhere.map(({ id, tab, label, one, Icon }) => {
        const count = counts[id];
        return (
          <button
            key={id}
            type="button"
            className="search-elsewhere-go"
            onClick={() => onGo(tab, query)}
          >
            <Icon size={16} />
            <span>
              <strong>{count}</strong>{" "}
              {count === 1 ? `${one.toLowerCase()} matches` : `${label.toLowerCase()} match`}
            </span>
            <ArrowRight size={15} />
          </button>
        );
      })}
    </div>
  );
}
