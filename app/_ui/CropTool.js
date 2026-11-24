"use client";
import { useEffect, useRef, useState } from "react";

// Drawing a box over an image.
//
// The box is kept as fractions of the image (0 to 1) and never in pixels on
// screen. It used to be pixels, measured once when the image loaded: zoom the
// page, resize the window or let a scrollbar appear and the box, the dimming
// and how far you could drag were all working to a size the image no longer
// was. The dimming missed a whole side of the picture and the box stopped short
// of its edge. A fraction is right at any size, and the browser lays it out.
//
// The pointer is captured for the length of a drag, so sliding off the image,
// under the bar or out of the window carries on instead of dropping the box
// where it was, and holding it near the top or bottom scrolls the page.

const HANDLES = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

const HANDLE_CURSORS = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  w: "ew-resize",
  e: "ew-resize",
  sw: "nesw-resize",
  s: "ns-resize",
  se: "nwse-resize",
};

// The smallest box, in pixels on screen: below it there is nothing to grab.
const MIN = 16;
// A press that moves less than this is a click, and a click draws nothing.
const SLOP = 4;
// How near the top or bottom edge starts the page moving, and how fast.
const EDGE = 72;
const MAX_STEP = 22;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// `onKeep` is the way past cropping for an uploaded image, which is often
// already just the component. A captured page never gets it: a whole page
// isn't one.
//
// `quick` is a save that doesn't wait for the AI (an upload is described after
// it lands), so the bar under it must not promise a description.
//
// `page` is the tool as a page of its own rather than a panel inside one: the
// actions go in the bar along the foot of the window, where the picker's are.
export default function CropTool({
  imageUrl,
  onCancel,
  onSave,
  onKeep,
  saving,
  quick,
  initialRect,
  page = false,
  saveLabel = "Save Component",
  cancelLabel = "Cancel",
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveElapsed, setSaveElapsed] = useState(0);
  const drag = useRef(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!saving) {
      setSaveElapsed(0);
      return undefined;
    }
    const tick = setInterval(() => setSaveElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [saving]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // An image out of the cache can be loaded before anything is listening.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) handleImageLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    setReady(true);
    if (initialRect) {
      const w = clamp(initialRect.width / img.naturalWidth, 0, 1);
      const h = clamp(initialRect.height / img.naturalHeight, 0, 1);
      setRect({
        x: clamp(initialRect.x / img.naturalWidth, 0, 1 - w),
        y: clamp(initialRect.y / img.naturalHeight, 0, 1 - h),
        w,
        h,
      });
    }
  }

  // Where a pointer is on the image, as fractions, held to its edges. Read
  // fresh each time, so a scroll or a resize mid-drag is simply true.
  function at(clientX, clientY) {
    const box = imgRef.current.getBoundingClientRect();
    return {
      x: clamp((clientX - box.left) / box.width, 0, 1),
      y: clamp((clientY - box.top) / box.height, 0, 1),
      minW: Math.min(1, MIN / box.width),
      minH: Math.min(1, MIN / box.height),
    };
  }

  // Not dragging: an edge may pass the one opposite and carry on as it, which
  // is what every other crop tool does and what a hand expects.
  function span(a, b, min) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo >= min) return [lo, hi - lo];
    return b >= a ? [Math.min(a, 1 - min), min] : [Math.max(0, a - min), min];
  }

  function apply() {
    const d = drag.current;
    if (!d) return;
    const p = at(d.clientX, d.clientY);
    if (d.mode === "draw") {
      const [x, w] = span(d.start.x, p.x, p.minW);
      const [y, h] = span(d.start.y, p.y, p.minH);
      setRect({ x, y, w, h });
    } else if (d.mode === "move") {
      setRect({
        ...d.base,
        x: clamp(d.base.x + p.x - d.start.x, 0, 1 - d.base.w),
        y: clamp(d.base.y + p.y - d.start.y, 0, 1 - d.base.h),
      });
    } else {
      const next = { ...d.base };
      const right = d.base.x + d.base.w;
      const bottom = d.base.y + d.base.h;
      // The grab offset, so the edge doesn't jump to the pointer by the few
      // pixels the handle was missed by.
      const px = clamp(p.x + d.offset.x, 0, 1);
      const py = clamp(p.y + d.offset.y, 0, 1);
      if (d.handle.includes("w")) [next.x, next.w] = span(right, px, p.minW);
      if (d.handle.includes("e")) [next.x, next.w] = span(d.base.x, px, p.minW);
      if (d.handle.includes("n")) [next.y, next.h] = span(bottom, py, p.minH);
      if (d.handle.includes("s")) [next.y, next.h] = span(d.base.y, py, p.minH);
      setRect(next);
    }
  }

  // Held near an edge of the window, the page comes to meet the pointer. The
  // foot of the window is the action bar's, so the edge there is above it.
  function follow() {
    const d = drag.current;
    if (!d) return;
    const top = 56 + EDGE;
    const bottom = window.innerHeight - 72 - EDGE;
    let step = 0;
    if (d.clientY < top) step = -Math.ceil(((top - d.clientY) / EDGE) * 10);
    else if (d.clientY > bottom) step = Math.ceil(((d.clientY - bottom) / EDGE) * 10);
    if (step && d.moved) {
      window.scrollBy(0, clamp(step, -MAX_STEP, MAX_STEP));
      apply();
    }
    frame.current = requestAnimationFrame(follow);
  }

  function begin(e, state) {
    if (e.button !== 0 || !ready || saving) return;
    e.preventDefault();
    e.stopPropagation();
    containerRef.current.setPointerCapture(e.pointerId);
    drag.current = {
      ...state,
      start: at(e.clientX, e.clientY),
      from: { x: e.clientX, y: e.clientY },
      clientX: e.clientX,
      clientY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(follow);
  }

  // On the image itself: a new box, whether or not there is one already.
  function startDraw(e) {
    begin(e, { mode: "draw" });
  }

  function startMove(e) {
    begin(e, { mode: "move", base: rect });
  }

  function startResize(handle) {
    return (e) => {
      const p = at(e.clientX, e.clientY);
      const edge = {
        x: handle.includes("w") ? rect.x : handle.includes("e") ? rect.x + rect.w : p.x,
        y: handle.includes("n") ? rect.y : handle.includes("s") ? rect.y + rect.h : p.y,
      };
      begin(e, { mode: "resize", handle, base: rect, offset: { x: edge.x - p.x, y: edge.y - p.y } });
    };
  }

  function handleMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.clientX = e.clientX;
    d.clientY = e.clientY;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < SLOP) return;
      d.moved = true;
      if (d.mode === "draw") setDrawing(true);
    }
    apply();
  }

  function handleUp(e) {
    if (!drag.current || e.pointerId !== drag.current.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    setDrawing(false);
  }

  // Arrow keys move the box by a pixel of the image, ten with Shift.
  function handleKey(e) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir || !rect || saving) return;
    e.preventDefault();
    const by = e.shiftKey ? 10 : 1;
    const { naturalWidth, naturalHeight } = imgRef.current;
    setRect((r) => ({
      ...r,
      x: clamp(r.x + (dir[0] * by) / naturalWidth, 0, 1 - r.w),
      y: clamp(r.y + (dir[1] * by) / naturalHeight, 0, 1 - r.h),
    }));
  }

  function handleSave() {
    const img = imgRef.current;
    if (!rect || !img) return;
    // Whole pixels, and never past the image: the crop is refused outright if
    // rounding takes it one over.
    const x = clamp(Math.round(rect.x * img.naturalWidth), 0, img.naturalWidth - 1);
    const y = clamp(Math.round(rect.y * img.naturalHeight), 0, img.naturalHeight - 1);
    onSave({
      x,
      y,
      width: clamp(Math.round(rect.w * img.naturalWidth), 1, img.naturalWidth - x),
      height: clamp(Math.round(rect.h * img.naturalHeight), 1, img.naturalHeight - y),
    });
  }

  const pc = (n) => `${n * 100}%`;

  return (
    <div className={`crop-tool${page ? " crop-tool-page" : ""}`}>
      <p className="crop-hint">
        {rect
          ? "Drag the handles to resize, or drag inside the box to move it. Drag anywhere else to start again."
          : onKeep
            ? "Drag a rectangle over the part you want, or use the whole image as it is."
            : "Drag a rectangle over the part you want to save as a component."}
      </p>
      <div
        className={`crop-container${drawing ? " crop-busy" : ""}`}
        ref={containerRef}
        onPointerDown={startDraw}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageUrl} alt={onKeep ? "Uploaded image" : "Page capture"} draggable={false} onLoad={handleImageLoad} />
        {rect && (
          <>
            {/* Four panes around the box rather than one sheet with a hole cut
                in it: the hole was a polygon worked out by hand, and it is what
                went wrong when the sizes disagreed. */}
            <div className="crop-mask" style={{ left: 0, right: 0, top: 0, height: pc(rect.y) }} />
            <div className="crop-mask" style={{ left: 0, right: 0, top: pc(rect.y + rect.h), bottom: 0 }} />
            <div className="crop-mask" style={{ left: 0, width: pc(rect.x), top: pc(rect.y), height: pc(rect.h) }} />
            <div className="crop-mask" style={{ left: pc(rect.x + rect.w), right: 0, top: pc(rect.y), height: pc(rect.h) }} />
            <div
              className="crop-rect"
              style={{ left: pc(rect.x), top: pc(rect.y), width: pc(rect.w), height: pc(rect.h) }}
              onPointerDown={startMove}
              onKeyDown={handleKey}
              tabIndex={0}
              role="group"
              aria-label="Crop box. Arrow keys move it."
            >
              {HANDLES.map((h) => (
                <div
                  key={h}
                  className={`crop-handle crop-handle-${h}`}
                  style={{ cursor: HANDLE_CURSORS[h] }}
                  onPointerDown={startResize(h)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {/* Stays in reach: these screenshots run thousands of pixels tall, and
          saving shouldn't be a long scroll away from wherever you drew. */}
      <div className={`crop-actions${page ? " crop-actions-page" : ""}`}>
        {saving ? (
          <div className="crop-saving">
            <div className="capture-status-bar">
              <div
                className="capture-status-fill"
                style={{ width: `${Math.min(95, (saveElapsed / (quick ? 3 : 15)) * 100)}%` }}
              />
            </div>
            <span>
              {quick
                ? "Saving the component…"
                : saveElapsed < 15
                  ? "Cropping and describing it with AI…"
                  : "Still working. The AI service is busy, retrying…"}
            </span>
          </div>
        ) : (
          <>
            {/* Cancel and Redraw at the left, what saves at the right, the
                way the visuals picker's bar is laid out. */}
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
            {rect && (
              <button type="button" className="crop-reset" onClick={() => setRect(null)}>
                Redraw
              </button>
            )}
            <span className="crop-actions-gap" />
            {onKeep && (
              <button type="button" onClick={onKeep}>
                Use As Is
              </button>
            )}
            <button type="button" className="crop-save" onClick={handleSave} disabled={!rect}>
              {saveLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
