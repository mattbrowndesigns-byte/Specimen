"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Globe, Crop, Link2 } from "lucide-react";

// Lives in the page header so saving never depends on which tab is open.
// Three kinds: a website (full record, appears in the grid), a component
// (a page capture you then crop a region out of), or a resource -- a link
// saved for what it does rather than how it looks, which takes no capture at
// all and so is the one Add that finishes while you're still looking at it.
const URL_LABELS = {
  website: "Website URL",
  component: "Page to crop from",
  resource: "Link to save",
};

export default function AddMenu({ onSubmit, variant }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (kind) inputRef.current?.focus();
  }, [kind]);

  function close() {
    setOpen(false);
    setKind(null);
    setUrl("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(kind, url.trim());
    setBusy(false);
    if (ok) close();
  }

  return (
    <div className={`add-menu${variant === "hero" ? " add-menu-hero" : ""}`} ref={wrapRef}>
      <button className="add-btn" onClick={() => (open ? close() : setOpen(true))}>
        <Plus size={16} />
        Add
      </button>

      {open && !kind && (
        <div className="add-pop">
          <button className="add-option" onClick={() => setKind("website")}>
            <Globe size={18} />
            <span>
              <strong>Website</strong>
              <small>Capture and tag a whole page</small>
            </span>
          </button>
          <button className="add-option" onClick={() => setKind("component")}>
            <Crop size={18} />
            <span>
              <strong>Component</strong>
              <small>Capture a page, then crop a region</small>
            </span>
          </button>
          <button className="add-option" onClick={() => setKind("resource")}>
            <Link2 size={18} />
            <span>
              <strong>Resource</strong>
              <small>Save a tool or reference — no screenshot</small>
            </span>
          </button>
        </div>
      )}

      {open && kind && (
        <form className="add-pop add-pop-form" onSubmit={submit}>
          <label htmlFor="add-url">{URL_LABELS[kind]}</label>
          <input
            id="add-url"
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            disabled={busy}
          />
          <div className="add-pop-actions">
            <button type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Starting…" : "Submit"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
