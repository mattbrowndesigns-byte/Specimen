"use client";
import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { UPLOAD_HINT, hasFiles } from "@/lib/uploadClient";

// Dropping files anywhere on the window while a tab is open uploads them.
// The listeners go on the window rather than a wrapper, because a tab renders
// a fragment -- Elevated's command bar is a grid over the dashboard's direct
// children and a wrapping div would take it apart -- and because a drop target
// the size of the window is one nobody misses.
//
// `onFiles` gets the FileList, and is null where the tab takes no drops (the
// demo, which refuses every write). Returns whether files are over the window.
export default function useFileDrop(onFiles) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;
  const enabled = Boolean(onFiles);

  useEffect(() => {
    if (!enabled) return undefined;
    function onEnter(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    }
    function onOver(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    }
    function onLeave(e) {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }
    function onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      // The Add popover's drop box takes its own.
      if (e.target.closest?.("[data-drop-box]")) return;
      handler.current?.(e.dataTransfer.files);
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return dragging;
}

export function DropOverlay({ label }) {
  return (
    <div className="visual-drop" aria-hidden="true">
      <div className="visual-drop-card">
        <Upload size={22} />
        <strong>Drop to add to {label}</strong>
        <small>{UPLOAD_HINT}</small>
      </div>
    </div>
  );
}
