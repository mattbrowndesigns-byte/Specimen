"use client";
import { useEffect, useRef, useState } from "react";

// A strip that scrolls sideways fades at whichever edge still has something
// past it, and stops fading once you reach the end -- which is what tells you
// there is nothing more to scroll to. A fade that is always on says "there's
// more" forever and stops meaning anything.
//
// `watch` is what changes the strip's *contents* without changing its box.
// The ResizeObserver catches the window getting narrower, but adding a folder
// to a strip that was already full changes scrollWidth and nothing else, so
// the observer never fires. React needs that array to be the same length on
// every render, which it is: each caller passes a fixed list of numbers.
export default function useEdgeFade(watch = []) {
  const ref = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    function update() {
      const overflow = el.scrollWidth - el.clientWidth;
      setFade({
        left: el.scrollLeft > 4,
        right: overflow > 4 && el.scrollLeft < overflow - 4,
      });
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);

  const className = `${fade.left ? " strip-fade-left" : ""}${fade.right ? " strip-fade-right" : ""}`;
  return [ref, className];
}
