"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ImageUp, Plus } from "lucide-react";
import { KINDS } from "./kinds";
import { startComponentUpload, startVisualUpload } from "./uploads";
import { ACCEPT_ATTR, UPLOAD_HINT, hasFiles } from "@/lib/uploadClient";

// Lives in the page header so saving never depends on which tab is open.
// Three kinds: a website (full record, appears in the grid), a component
// (a page capture you then crop a region out of), or a resource -- a link
// saved for what it does rather than how it looks, which takes no capture at
// all and so is the one Add that finishes while you're still looking at it.
export const URL_LABELS = {
  website: "Website URL",
  component: "Page to crop from",
  resource: "Link to save",
  visual: "Page with images",
};

// The two kinds that are pictures have a second way in: a file that never lived
// on a page. Where each goes, and what the box says about it.
const UPLOADS = {
  component: { start: startComponentUpload, tab: "components", over: "Let go to add it to Components" },
  visual: { start: startVisualUpload, tab: "visuals", over: "Let go to add them to Visuals" },
};

// It hands the files to the upload store and closes, the way submitting a link
// does -- the panel at the top of the dashboard reports it from there.
export default function AddMenu({ onSubmit, variant }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // What the library already has at this address, said in the box: shown
  // anywhere else it was behind the box, and the save looked broken.
  const [existing, setExisting] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
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
    setDragOver(false);
    setExisting(null);
  }

  // While this is open, a file dropped beside the box goes nowhere instead of
  // replacing the page with itself, which is what a browser does with a file
  // nothing has claimed. Anything that has claimed it -- the box, or a tab that
  // takes a drop anywhere -- has already said so by the
  // time a drag reaches the window.
  useEffect(() => {
    if (!open) return undefined;
    function guard(e) {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.type === "dragover") e.dataTransfer.dropEffect = "none";
    }
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, [open]);

  function upload(files) {
    if (!files.length) return;
    const { start, tab } = UPLOADS[kind];
    start(files);
    close();
    // The dashboard switches tab itself when an upload starts. From
    // anywhere else, go there with the router and not the address bar: a full
    // page load would throw away the files on their way up.
    if (pathname !== "/") router.push(`/?tab=${tab}`);
  }

  function chooseFiles(e) {
    // Copied before the input is cleared: clearing it empties the same list.
    const files = [...(e.target.files || [])];
    e.target.value = "";
    upload(files);
  }

  // dragover has to be cancelled on every event, not just the first: that is
  // how a page tells the browser it will take the drop, and an element that
  // doesn't is refused however much it looks like a target.
  function onBoxDrag(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragOver(true);
  }

  function onBoxDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragOver(false);
    upload([...e.dataTransfer.files]);
  }

  async function submit(e, options) {
    e?.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    const result = await onSubmit(kind, url.trim(), options);
    setBusy(false);
    if (result?.existing) setExisting(result.existing);
    else if (result) close();
  }

  function show() {
    const href = existing.href;
    close();
    window.location.href = href;
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
            onChange={(e) => {
              setUrl(e.target.value);
              setExisting(null);
            }}
            placeholder="https://"
            disabled={busy}
          />
          {existing ? (
            <>
              <p className="add-pop-note" role="status">
                {existing.savedAt
                  ? `You saved this page on ${new Date(existing.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
                  : existing.message}
              </p>
              {/* A page you've captured can give up another block, so there
                  the other answer is a second capture rather than Cancel. */}
              <div className="add-pop-actions">
                {existing.kind === "component" ? (
                  <button type="button" onClick={(e) => submit(e, { again: true })} disabled={busy} aria-busy={busy}>
                    {busy ? "Starting…" : "Capture Again"}
                  </button>
                ) : (
                  <button type="button" onClick={close}>
                    Cancel
                  </button>
                )}
                <button type="button" className="primary" onClick={show} disabled={busy} autoFocus>
                  {existing.kind === "component" ? "Crop From It" : existing.kind === "site" ? "Open It" : "Show It"}
                </button>
              </div>
            </>
          ) : (
            <div className="add-pop-actions">
              <button type="button" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
                {busy ? "Starting…" : "Submit"}
              </button>
            </div>
          )}

          {UPLOADS[kind] && (
            <div className="add-pop-upload">
              <span className="add-pop-or">or</span>
              {/* data-drop-box tells a tab's own drop handler that
                  this drop is taken, or a file would be uploaded twice. */}
              <button
                type="button"
                className={`drop-box${dragOver ? " drop-box-over" : ""}`}
                data-drop-box
                onClick={() => fileRef.current?.click()}
                onDragEnter={onBoxDrag}
                onDragOver={onBoxDrag}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
                }}
                onDrop={onBoxDrop}
                disabled={busy}
              >
                <ImageUp size={24} />
                <strong>{dragOver ? "Drop to upload" : "Drop images or clips here"}</strong>
                <span>{dragOver ? UPLOADS[kind].over : "or click to choose files"}</span>
                <small>{UPLOAD_HINT}</small>
              </button>
              <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={chooseFiles} />
            </div>
          )}
        </form>
      )}
    </div>
  );
}
