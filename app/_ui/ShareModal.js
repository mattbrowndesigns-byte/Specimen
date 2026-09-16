"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import ModalShell from "./ModalShell";
import { SHARE_SCOPES } from "@/lib/shareKinds";

// Creating, copying and revoking a share link.
//
// A collection or a folder names one thing, so its modal still makes the link
// on open -- there is no meaningful decision between "share this" and "yes
// really". The library does have a decision now: sending someone your
// component crops is no reason to hand over 150 saved websites, so the scope
// picker comes first and nothing is created until a scope is chosen.
//
// Each scope keeps its own link. Switching between them shows what already
// exists rather than minting anything, and revoking one leaves the others
// working -- which is the whole reason they're separate rows.
export default function ShareModal({ kind, targetId, title, onClose }) {
  const scoped = kind !== "library";
  const [scope, setScope] = useState(scoped ? kind : null);
  const [live, setLive] = useState(null);
  const [share, setShare] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);

  const query = (k) =>
    targetId ? `?kind=${k}&targetId=${targetId}` : `?kind=${k}`;

  const open = useCallback(
    async (k) => {
      setBusy(true);
      setError(null);
      setCopied(false);
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: k, targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Couldn't create a link");
      else {
        setShare(data.share);
        setLive((prev) => (prev ? [...prev.filter((s) => s.kind !== k), data.share] : prev));
      }
      setBusy(false);
    },
    [targetId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Which scopes are already live, so the picker can mark them before the
      // reader picks one.
      const res = await fetch("/api/share?list=1");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLive(res.ok ? data.shares || [] : []);
      if (scoped) await open(kind);
      else setBusy(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [kind, scoped, open]);

  const url = share ? `${window.location.origin}/share/${share.token}` : "";
  const liveKinds = new Set(
    (live || []).filter((s) => (targetId ? s.target_id === targetId : !s.target_id)).map((s) => s.kind)
  );

  function choose(k) {
    setScope(k);
    setShare(null);
    open(k);
  }

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
    const res = await fetch(`/api/share${query(scope)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't revoke that link");
      return;
    }
    setLive((prev) => (prev || []).filter((s) => s.kind !== scope));
    setShare(null);
    if (scoped) onClose();
    else setScope(null);
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

        {!scoped && (
          <div className="share-scopes">
            {SHARE_SCOPES.map((option) => (
              <button
                key={option.kind}
                className={`share-scope${scope === option.kind ? " share-scope-on" : ""}`}
                onClick={() => choose(option.kind)}
                aria-pressed={scope === option.kind}
              >
                <span className="share-scope-text">
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
                {liveKinds.has(option.kind) && <span className="share-scope-live">Link live</span>}
              </button>
            ))}
          </div>
        )}

        {busy && !share ? (
          <p className="empty-small">{scope ? "Making a link…" : " "}</p>
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
