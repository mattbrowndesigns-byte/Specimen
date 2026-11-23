"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { KINDS } from "./kinds";
import { ACCEPT_ATTR, UPLOAD_HINT } from "@/lib/visualUploadClient";

// Lives in the page header so saving never depends on which tab is open.
// Three kinds: a website (full record, appears in the grid), a component
// (a page capture you then crop a region out of), or a resource -- a link
// saved for what it does rather than how it looks, which takes no capture at
// all and so is the one Add that finishes while you're still looking at it.
const URL_LABELS = {
  website: "Website URL",
  component: "Page to crop from",
  resource: "Link to save",
  visual: "Page with images",
};

// `onUpload(files, onProgress)` takes images from the visual's file picker --
// a screenshot that doesn't live on any page -- and resolves true when the
// menu can close. Without it the Upload button isn't offered.
export default function AddMenu({ onSubmit, onUpload, variant }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

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
    setProgress(null);
  }

  async function chooseFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length || busy) return;
    setBusy(true);
    const ok = await onUpload(files, setProgress);
    setBusy(false);
    setProgress(null);
    if (ok) close();
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
          {/* One loop over the shared kind list, so the icon a Website wears
              here is the same one it wears on every tab in the app. */}
          {KINDS.map(({ add, one, blurb, Icon }) => (
            <button className="add-option" key={add} onClick={() => setKind(add)}>
              <span className="add-option-icon">
                <Icon size={17} />
              </span>
              <span>
                <strong>{one}</strong>
                <small>{blurb}</small>
              </span>
            </button>
          ))}
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
              {busy && !progress ? "Starting…" : "Submit"}
            </button>
          </div>

          {/* The other way in for a visual: a file that never lived on a
              page. Below the URL rather than beside it, because pasting a
              link is still the common case and this is the alternative to
              it, not a second field to fill in. */}
          {kind === "visual" && onUpload && (
            <div className="add-pop-upload">
              <span className="add-pop-or">or</span>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={15} />
                {progress ? progress : "Upload Images"}
              </button>
              <small>{UPLOAD_HINT}. Or drop them on the Visuals tab.</small>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                multiple
                hidden
                onChange={chooseFiles}
              />
            </div>
          )}
        </form>
      )}
    </div>
  );
}
