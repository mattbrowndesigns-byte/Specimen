"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";

// Every modal in the app renders through here, and the portal is the whole
// point of it.
//
// `position: fixed` doesn't resolve against the viewport if any ancestor has a
// transform, filter or backdrop-filter -- that ancestor becomes the containing
// block instead. A card has two of those (`transform` on :hover, and
// `backdrop-filter` on the save buttons overlaid on its thumbnail) plus
// `overflow: hidden`, so a modal opened from a card rendered 64px wide inside
// the card and got clipped. Mounting at <body> means no ancestor can capture
// it, whatever styling the trigger's surroundings pick up later.
export default function ModalShell({ label, wide, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? " modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
