"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GripVertical, Plus } from "lucide-react";

// One group's tags, small enough that a big group fits on a screen or two.
// That is what makes dragging one onto another possible at all: as full-width
// rows the eighty-one block patterns ran to nearly four thousand pixels.
//
// A press selects and a drag merges. Selecting is the same merge by another
// route, for a keyboard, for a finger (which has to be able to scroll the page
// by dragging on it), and for more than two at once.

// A press that wobbles is still a press.
const DRAG_PX = 6;
// How near the window's edge a drag starts scrolling it, and how fast.
const EDGE_PX = 70;
const SCROLL_PX = 14;

export default function TagBoard({
  families,
  empty,
  selected,
  onToggle,
  onMerge,
  onAdd,
  unused,
  unusedLabel,
  showUnused,
  onShowUnused,
}) {
  const [drag, setDrag] = useState(null); // { ids, label }
  const [over, setOver] = useState(null);
  const ghostRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  // The click that follows a drag isn't a press.
  const swallowClick = useRef(false);

  const place = useCallback(() => {
    const el = ghostRef.current;
    if (el) el.style.transform = `translate(${pointer.current.x + 12}px, ${pointer.current.y + 8}px)`;
  }, []);

  function start(event, tag) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const from = { x: event.clientX, y: event.clientY };
    const ids = selected.has(tag.id) ? [...selected] : [tag.id];
    let dragging = false;
    let target = null;
    let frame = 0;

    const aim = () => {
      const el = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest?.("[data-tag-id]");
      const id = el?.dataset.tagId;
      target = id && !ids.includes(id) ? id : null;
      setOver(target);
    };
    const scroll = () => {
      const { y } = pointer.current;
      const step = y < EDGE_PX ? -SCROLL_PX : y > window.innerHeight - EDGE_PX ? SCROLL_PX : 0;
      if (step) {
        window.scrollBy(0, step);
        aim();
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (e) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!dragging) {
        if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_PX) return;
        dragging = true;
        setDrag({ ids, label: tag.label, count: tag.here });
        frame = requestAnimationFrame(scroll);
      }
      place();
      aim();
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", key, true);
      cancelAnimationFrame(frame);
      setDrag(null);
      setOver(null);
    };
    const up = () => {
      stop();
      if (!dragging) return;
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 0);
      if (target) onMerge(ids, target);
    };
    const key = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      stop();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", key, true);
  }

  // Where the ghost starts, before the first move after it's drawn.
  useEffect(place, [drag, place]);

  const tile = (tag) => (
    <button
      key={tag.id}
      type="button"
      data-tag-id={tag.id}
      className={[
        "tag-tile",
        selected.has(tag.id) && "tag-tile-on",
        !tag.here && "tag-tile-unused",
        !tag.is_approved && "tag-tile-pending",
        drag?.ids.includes(tag.id) && "tag-tile-lifted",
        over === tag.id && "tag-tile-over",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={selected.has(tag.id)}
      onPointerDown={(e) => start(e, tag)}
      onClick={() => !swallowClick.current && onToggle(tag.id)}
    >
      <GripVertical className="tag-tile-grip" size={14} aria-hidden="true" />
      <span className="tag-tile-name">{tag.label}</span>
      {tag.here > 0 && <span className="tag-tile-count">{tag.here}</span>}
    </button>
  );

  return (
    <div className={`tag-board${drag ? " tag-board-dragging" : ""}`}>
      {families.map(({ name, tags: list }) => (
        <div className="tag-family" key={name || "all"}>
          {name && <h3>{name}</h3>}
          <div className="tag-tiles">
            {list.map(tile)}
            {!name && <AddTag onAdd={onAdd} />}
          </div>
        </div>
      ))}
      {!families.some((f) => !f.name) && (
        <div className="tag-family">
          <div className="tag-tiles">
            <AddTag onAdd={onAdd} />
          </div>
        </div>
      )}
      {unused.length > 0 && (
        <div className="tag-unused">
          <button type="button" className="tag-unused-toggle" aria-expanded={showUnused} onClick={onShowUnused}>
            <ChevronDown size={16} aria-hidden="true" />
            {unusedLabel} ({unused.length})
          </button>
          {showUnused && (
            <>
              <p className="tag-hint">The AI can still pick these. Delete one to stop it.</p>
              <div className="tag-tiles">{unused.map(tile)}</div>
            </>
          )}
        </div>
      )}
      {empty && <p className="empty-small">No tags here yet. Add the first one.</p>}

      {drag &&
        createPortal(
          <div className="tag-ghost" ref={ghostRef} aria-hidden="true">
            {/* The tile itself, tilted, small enough and far enough off the
                pointer that the one underneath can still be read. Its own
                element, because the outer one's transform is the pointer. */}
            <div className={`tag-ghost-tile${drag.ids.length > 1 ? " tag-ghost-stack" : ""}`}>
              <span className="tag-tile-name">{drag.label}</span>
              {drag.ids.length > 1 ? (
                <span className="tag-ghost-more">+{drag.ids.length - 1}</span>
              ) : (
                drag.count > 0 && <span className="tag-tile-count">{drag.count}</span>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function AddTag({ onAdd }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    const label = value.trim();
    if (!label || busy) return;
    setBusy(true);
    const added = await onAdd(label);
    setBusy(false);
    if (added) setValue("");
  }

  if (!open) {
    return (
      <button type="button" className="tag-tile tag-tile-add" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Add Tag
      </button>
    );
  }
  return (
    <input
      className="tag-add-input"
      value={value}
      maxLength={60}
      placeholder="New tag"
      aria-label="New tag"
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") add();
        if (e.key === "Escape") {
          setValue("");
          setOpen(false);
        }
      }}
      onBlur={() => !value.trim() && setOpen(false)}
    />
  );
}

// Block / Pattern is written family-then-variety -- Hero Carousel, Hero Split --
// so its first word is a heading. A family of one isn't a family, and neither
// is a group with hardly any.
export function familiesOf(tags, group) {
  if (group.key !== "block_pattern") return [{ name: null, tags }];
  const byWord = new Map();
  for (const tag of tags) {
    const word = tag.label.split(/[\s/]/)[0];
    if (!byWord.has(word)) byWord.set(word, []);
    byWord.get(word).push(tag);
  }
  const named = [];
  const rest = [];
  for (const [name, list] of byWord) {
    if (list.length > 1) named.push({ name, tags: list });
    else rest.push(...list);
  }
  if (!named.length) return [{ name: null, tags }];
  return rest.length ? [...named, { name: "Everything Else", tags: rest }] : named;
}
