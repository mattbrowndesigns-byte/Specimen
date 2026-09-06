"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import ModalShell from "./ModalShell";

// Creating, copying and revoking a share link.
//
// The link is created on open rather than behind a second click: there is no
// meaningful decision between "share this" and "yes really", and a modal whose
// only content is a button to make the thing you asked for is a wasted step.
// Revoking is one click away in the same place, which is the actual decision.
export default function ShareModal({ kind, targetId, title, onClose }) {
  const [share, setShare] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);

  const query = kind === "collection" ? `?kind=collection&targetId=${targetId}` : "?kind=library";

  useEffect(() => {
    let cancelled = false;
    async function open() {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(data.error || "Couldn't create a link");
      else setShare(data.share);
      setBusy(false);
    }
    open();
    return () => {
      cancelled = true;
    };
  }, [kind, targetId]);

  const url = share ? `${window.location.origin}/share/${share.token}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The link is on screen and selectable either way.
    }
  }

  async function revoke() {
    setBusy(true);
    const res = await fetch(`/api/share${query}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't revoke that link");
      return;
    }
    onClose();
  }

  return (
    <ModalShell label="Share" onClose={onClose}>
      <div className="modal-head">
        <h2>Share {title}</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="modal-body">
        {error && <p className="error">{error}</p>}

        <p className="share-note">
          Anyone with this link can see what&rsquo;s in here without an account. They can&rsquo;t
          change anything, and they won&rsquo;t see your notes or anything you&rsquo;ve hidden.
        </p>

        {busy && !share ? (
          <p className="empty-small">Making a link…</p>
        ) : (
          share && (
            <>
              <div className="share-link">
                <Link2 size={15} />
                <input value={url} readOnly onFocus={(e) => e.target.select()} />
                <button className="share-copy" onClick={copy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <button className="link-btn share-revoke" onClick={revoke} disabled={busy}>
                Revoke this link
              </button>
            </>
          )
        )}
      </div>
    </ModalShell>
  );
}
