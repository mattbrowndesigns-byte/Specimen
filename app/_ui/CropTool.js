"use client";
import { useEffect, useRef, useState } from "react";

const MIN_SIZE = 24;
const HANDLES = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

function clampRect(rect, bounds) {
  const x = Math.max(0, Math.min(rect.x, bounds.width - MIN_SIZE));
  const y = Math.max(0, Math.min(rect.y, bounds.height - MIN_SIZE));
  const width = Math.max(MIN_SIZE, Math.min(rect.width, bounds.width - x));
  const height = Math.max(MIN_SIZE, Math.min(rect.height, bounds.height - y));
  return { x, y, width, height };
}

// Applies a drag delta to one handle of a rect, keeping the opposite edge fixed.
function resizeRect(base, handle, dx, dy) {
  let { x, y, width, height } = base;
  if (handle.includes("w")) {
    width = base.width - dx;
    x = base.x + dx;
  }
  if (handle.includes("e")) {
    width = base.width + dx;
  }
  if (handle.includes("n")) {
    height = base.height - dy;
    y = base.y + dy;
  }
  if (handle.includes("s")) {
    height = base.height + dy;
  }
  if (width < MIN_SIZE) {
    if (handle.includes("w")) x = base.x + base.width - MIN_SIZE;
    width = MIN_SIZE;
  }
  if (height < MIN_SIZE) {
    if (handle.includes("n")) y = base.y + base.height - MIN_SIZE;
    height = MIN_SIZE;
  }
  return { x, y, width, height };
}

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

export default function CropTool({ imageUrl, onCancel, onSave, saving, initialRect }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [imageBounds, setImageBounds] = useState(null);
  const [saveElapsed, setSaveElapsed] = useState(0);
  const dragState = useRef(null);

  useEffect(() => {
    if (!saving) {
      setSaveElapsed(0);
      return;
    }
    const tick = setInterval(() => setSaveElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [saving]);

  // Displayed pixels -> source pixels, for the size readout.
  function scaleToNatural() {
    const img = imgRef.current;
    if (!img || !img.clientWidth) return 1;
    return img.naturalWidth / img.clientWidth;
  }

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const bounds = { width: img.clientWidth, height: img.clientHeight };
    setImageBounds(bounds);
    if (initialRect) {
      const scale = img.clientWidth / img.naturalWidth;
      setRect(
        clampRect(
          {
            x: initialRect.x * scale,
            y: initialRect.y * scale,
            width: initialRect.width * scale,
            height: initialRect.height * scale,
          },
          bounds
        )
      );
    }
  }

  function getPoint(e) {
    const container = containerRef.current;
    const bounds = container.getBoundingClientRect();
    return {
      x: e.clientX - bounds.left + container.scrollLeft,
      y: e.clientY - bounds.top + container.scrollTop,
    };
  }

  function startDraw(e) {
    const point = getPoint(e);
    dragState.current = { mode: "draw", start: point };
    setRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function startMove(e) {
    e.stopPropagation();
    dragState.current = { mode: "move", start: getPoint(e), base: rect };
  }

  function startResize(handle) {
    return (e) => {
      e.stopPropagation();
      dragState.current = { mode: "resize", handle, start: getPoint(e), base: rect };
    };
  }

  function handleMouseMove(e) {
    const drag = dragState.current;
    if (!drag || !imageBounds) return;
    const point = getPoint(e);

    if (drag.mode === "draw") {
      setRect(
        clampRect(
          {
            x: Math.min(drag.start.x, point.x),
            y: Math.min(drag.start.y, point.y),
            width: Math.abs(point.x - drag.start.x),
            height: Math.abs(point.y - drag.start.y),
          },
          imageBounds
        )
      );
    } else if (drag.mode === "move") {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      setRect(clampRect({ ...drag.base, x: drag.base.x + dx, y: drag.base.y + dy }, imageBounds));
    } else if (drag.mode === "resize") {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      setRect(clampRect(resizeRect(drag.base, drag.handle, dx, dy), imageBounds));
    }
  }

  function handleMouseUp() {
    dragState.current = null;
  }

  function handleSave() {
    if (!rect || !imgRef.current || rect.width < MIN_SIZE || rect.height < MIN_SIZE) return;
    const scale = imgRef.current.naturalWidth / imgRef.current.clientWidth;
    onSave({
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
    });
  }

  return (
    <div className="crop-tool">
      <p className="crop-hint">
        {rect
          ? "Drag the handles to resize, or drag inside the box to move it."
          : "Drag a rectangle over the region you want to save as a component."}
      </p>
      <div
        className={`crop-container${rect ? "" : " crop-drawing"}`}
        ref={containerRef}
        onMouseDown={rect ? undefined : startDraw}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageUrl} alt="Page capture" draggable={false} onLoad={handleImageLoad} />
        {rect && (
          <>
            <div className="crop-mask" style={{ clipPath: maskClipPath(rect, imageBounds) }} />
            <div
              className="crop-rect"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={startMove}
            >
              {HANDLES.map((h) => (
                <div
                  key={h}
                  className={`crop-handle crop-handle-${h}`}
                  style={{ cursor: HANDLE_CURSORS[h] }}
                  onMouseDown={startResize(h)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {/* Sticks to the bottom of the viewport: these screenshots run thousands
          of pixels tall, and the save action shouldn't be a long scroll away
          from wherever you drew the box. */}
      <div className="crop-actions">
        {saving ? (
          <div className="crop-saving">
            <div className="capture-status-bar">
              <div
                className="capture-status-fill"
                style={{ width: `${Math.min(95, (saveElapsed / 15) * 100)}%` }}
              />
            </div>
            <span>
              {saveElapsed < 15
                ? "Cropping and describing it with AI…"
                : "Still working — the AI service is busy, retrying…"}
            </span>
          </div>
        ) : (
          <>
            {rect && (
              <span className="crop-size">
                {Math.round(rect.width * scaleToNatural())} × {Math.round(rect.height * scaleToNatural())} px
              </span>
            )}
            {rect && (
              <button className="crop-reset" onClick={() => setRect(null)}>
                Redraw
              </button>
            )}
            <button onClick={onCancel}>Cancel</button>
            <button
              className="crop-save"
              onClick={handleSave}
              disabled={!rect || rect.width < MIN_SIZE || rect.height < MIN_SIZE}
            >
              Save component
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Dims everything outside the current crop rect, like a photo editor's crop mask.
function maskClipPath(rect, bounds) {
  if (!bounds) return undefined;
  const outer = "0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%";
  const x1 = (rect.x / bounds.width) * 100;
  const y1 = (rect.y / bounds.height) * 100;
  const x2 = ((rect.x + rect.width) / bounds.width) * 100;
  const y2 = ((rect.y + rect.height) / bounds.height) * 100;
  const inner = `${x1}% ${y1}%, ${x1}% ${y2}%, ${x2}% ${y2}%, ${x2}% ${y1}%, ${x1}% ${y1}%`;
  return `polygon(evenodd, ${outer}, ${inner})`;
}
