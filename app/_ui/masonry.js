"use client";
import { useEffect, useState } from "react";

// The masonry used by the Visuals board and the picker, so the two read as
// one object: you choose on the same layout you'll browse on.

export const GAP = 16;

// The ids on screen when a card is opened, in board order, so the lightbox's
// arrows walk what you were looking at -- a search or a tag filter included
// -- rather than the whole library. Here rather than in the tab so the
// lightbox doesn't import the board to read one string.
export const SEQUENCE_KEY = "specimen.visuals.sequence";

// Each size is one number, the narrowest a column may get -- the same idea
// as the card grid's --card-min-* -- and the window decides how many fit.
// Medium is Pinterest's own width, near enough: five across at 1440.
export const SIZES = { small: 180, medium: 240, large: 360 };
export const MIN_COLUMN = SIZES.medium;

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

// Takes the element itself (from a callback ref held in state), not a ref
// object: an effect keyed on a ref object never re-runs when the element
// appears later, so the picker's grid, which mounts after loading, was
// measured as nothing and stayed at the default four columns.
export function useColumns(el, minColumn = MIN_COLUMN) {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      setColumns(Math.max(1, Math.floor((el.clientWidth + GAP) / (minColumn + GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, minColumn]);
  return columns;
}

// Shapes for the loading tiles: a believable mix of portrait, landscape and
// square, so the placeholder board looks like a board rather than a grid.
const SKELETON_RATIOS = [1.25, 0.66, 1, 1.5, 0.75, 1.25, 0.56, 1, 1.33, 0.8, 1.2, 0.66];

// Grey tiles that pulse while a board or a picker is waiting, laid out by
// the same rule as the real thing so nothing jumps when the images land.
export function MasonrySkeleton({ minColumn = MIN_COLUMN, label = "Loading" }) {
  const [el, setEl] = useState(null);
  const columns = useColumns(el, minColumn);

  const tiles = SKELETON_RATIOS.map((ratio, i) => ({ id: i, width: 100, height: Math.round(ratio * 100) }));
  return (
    <div
      className="visual-board visual-skeleton"
      ref={setEl}
      role="status"
      aria-label={label}
      style={{ "--board-gap": `${GAP}px` }}
    >
      {layout(tiles, columns).map((column, i) => (
        <div className="visual-column" key={i}>
          {column.map((t) => (
            <span
              key={t.id}
              className="visual-skeleton-tile"
              style={{ aspectRatio: `${t.width} / ${t.height}`, animationDelay: `${(t.id % 5) * 0.12}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
