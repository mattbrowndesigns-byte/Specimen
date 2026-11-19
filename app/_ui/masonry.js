"use client";
import { useEffect, useState } from "react";

// The masonry used by the Visuals board and the picker, so the two read as
// one object: you choose on the same layout you'll browse on.

// The narrowest a column may get. Pinterest's own is about 236; 240 gives
// five across at 1440 inside the page margins, and two on a phone.
export const MIN_COLUMN = 240;
export const GAP = 16;

// Shortest-column-first, so items read across the top the way a list reads,
// not down the first column the way CSS columns would put them. Every item
// knows its own width and height, so nothing has to load before it's placed.
export function layout(items, columns) {
  const cols = Array.from({ length: columns }, () => ({ height: 0, items: [] }));
  for (const item of items) {
    const ratio = item.width && item.height ? item.height / item.width : 1;
    const shortest = cols.reduce((a, b) => (b.height < a.height ? b : a));
    shortest.items.push(item);
    shortest.height += ratio;
  }
  return cols.map((c) => c.items);
}

export function useColumns(ref) {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      setColumns(Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN_COLUMN + GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}
