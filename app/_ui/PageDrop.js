"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageUp, Play } from "lucide-react";
import { ACCEPT_ATTR, UPLOAD_HINT, describeUpload, hasFiles, readClips, sendVisuals, sortFiles } from "@/lib/uploadClient";
import { guessMaker } from "@/lib/platforms";

// Adding a page's images by hand, on the screen that has just said Kivli
// couldn't read it. The link is already here, so everything dropped or pasted
// is filed under that page with its credit, instead of starting again as an
// upload with no source.
//
// Each file is saved as it lands rather than at the end: collecting from a page
// means going back and forth to it, and a tab closed halfway keeps what it has.

export default function PageDrop({ project, children }) {
  const [items, setItems] = useState([]);
  const [problems, setProblems] = useState([]);
  const [waiting, setWaiting] = useState(0);
  const [over, setOver] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const guess = guessMaker(project.url);
  const [maker, setMaker] = useState(project.agency_name || guess.name);
  const [link, setLink] = useState(project.creator_url || guess.url);
  const fileRef = useRef(null);
  // One batch after another: two at once would be given the same places.
  const queue = useRef(Promise.resolve());
  const credit = useRef({});
  credit.current = { agency_name: maker, creator_url: link };

  const add = useCallback(
    (fileList) => {
      const { ok, skipped } = sortFiles(fileList);
      setProblems(skipped);
      if (!ok.length) return;
      setWaiting((n) => n + ok.length);
      queue.current = queue.current.then(async () => {
        try {
          const { ready, clips, failed } = await readClips(ok);
          if (failed.length) setProblems((p) => [...p, ...failed]);
          if (ready.length) {
            const result = await sendVisuals(ready, {
              clips,
              start: { projectId: project.id, credit: credit.current },
              onItem: (item) => setItems((all) => [...all, item]),
            });
            if (result.failed.length) setProblems((p) => [...p, ...result.failed]);
          }
        } catch (err) {
          setProblems((p) => [...p, err.message || "That couldn't be added."]);
        } finally {
          setWaiting((n) => n - ok.length);
        }
      });
    },
    [project.id]
  );

  // The whole window takes a drop, and a paste needs nothing focused: Copy
  // Image on the page, then straight back here.
  useEffect(() => {
    const drag = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setOver(true);
    };
    const out = (e) => {
      if (!e.relatedTarget) setOver(false);
    };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(false);
      add([...e.dataTransfer.files]);
    };
    const paste = (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      add(files);
    };
    window.addEventListener("dragover", drag);
    window.addEventListener("dragleave", out);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragover", drag);
      window.removeEventListener("dragleave", out);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, [add]);

  useEffect(() => {
    if (!waiting) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [waiting]);

  async function done() {
    setLeaving(true);
    setProblems([]);
    // What was typed after the first file went up. needs_review is passed so
    // naming the maker doesn't count as having read the AI's work.
    const res = await fetch(`/api/visuals/${items[0].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credit.current, needs_review: true }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setProblems([data?.error || "The credit couldn't be saved. Try again."]);
      setLeaving(false);
      return;
    }
    // It's queued already; this is only the fast path, and outlives the page.
    describeUpload(project.id);
    window.location.href = "/?tab=visuals";
  }

  return (
    <div className="page-drop">
      <button
        type="button"
        className={`drop-box${over ? " drop-box-over" : ""}`}
        data-drop-box
        onClick={() => fileRef.current?.click()}
      >
        <ImageUp size={24} />
        <strong>{over ? "Drop to add" : "Drop or paste images and clips here"}</strong>
        <span>On the page, right-click an image, choose Copy Image, then paste it here.</span>
        <small>{UPLOAD_HINT}</small>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])];
          e.target.value = "";
          add(files);
        }}
      />

      {problems.map((problem, i) => (
        <p className="error" key={i}>
          {problem}
        </p>
      ))}

      {(items.length > 0 || waiting > 0) && (
        <div className="page-drop-items" role="status" aria-label={`${items.length} added`}>
          {items.map((item) => (
            <span className="page-drop-item" key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumb_url} alt="" />
              <span className="page-drop-mark">
                {item.video_url ? <Play size={10} fill="currentColor" /> : <Check size={12} strokeWidth={3} />}
              </span>
            </span>
          ))}
          {Array.from({ length: waiting }, (_, i) => (
            <span className="page-drop-item page-drop-waiting" key={`waiting-${i}`} />
          ))}
        </div>
      )}

      <div className="page-drop-credit">
        <label>
          <span>Made by</span>
          <input value={maker} onChange={(e) => setMaker(e.target.value)} placeholder="Person or studio" />
        </label>
        <label>
          <span>Their link</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Optional" inputMode="url" />
        </label>
      </div>

      <div className="pick-failed-actions">
        {items.length > 0 ? (
          <button type="button" className="primary" onClick={done} disabled={leaving || waiting > 0} aria-busy={leaving || waiting > 0}>
            {waiting > 0 ? "Adding…" : leaving ? "Saving…" : `Save ${items.length} Visual${items.length === 1 ? "" : "s"}`}
          </button>
        ) : (
          waiting === 0 && children
        )}
      </div>
    </div>
  );
}
