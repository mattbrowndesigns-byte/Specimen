"use client";
import { useRef, useState } from "react";

export default function CropTool({ imageUrl, onCancel, onSave, saving, initialRect }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  function handleImageLoad() {
    if (!initialRect || !imgRef.current) return;
    const scale = imgRef.current.clientWidth / imgRef.current.naturalWidth;
    setRect({
      x: initialRect.x * scale,
      y: initialRect.y * scale,
      width: initialRect.width * scale,
      height: initialRect.height * scale,
    });
  }

  function getPoint(e) {
    const container = containerRef.current;
    const bounds = container.getBoundingClientRect();
    return {
      x: e.clientX - bounds.left + container.scrollLeft,
      y: e.clientY - bounds.top + container.scrollTop,
    };
  }

  function handleMouseDown(e) {
    const point = getPoint(e);
    setDragStart(point);
    setRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handleMouseMove(e) {
    if (!dragStart) return;
    const point = getPoint(e);
    setRect({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    });
  }

  function handleMouseUp() {
    setDragStart(null);
  }

  function handleSave() {
    if (!rect || !imgRef.current || rect.width < 5 || rect.height < 5) return;
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
      <p className="crop-hint">Drag a rectangle over the region you want to save as a component.</p>
      <div
        className="crop-container"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageUrl} alt="Page capture" draggable={false} onLoad={handleImageLoad} />
        {rect && (
          <div className="crop-rect" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
        )}
      </div>
      <div className="crop-actions">
        <button onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          className="crop-save"
          onClick={handleSave}
          disabled={saving || !rect || rect.width < 5 || rect.height < 5}
        >
          {saving ? "Saving…" : "Save component"}
        </button>
      </div>
    </div>
  );
}
