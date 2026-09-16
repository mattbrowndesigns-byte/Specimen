"use client";
import { useEffect, useState } from "react";
import ModalShell from "./ModalShell";

// The one account setting there is. It exists because of the share page: that
// title reads "Matt's inspiration library", and an account that signed up
// before the field existed needs somewhere to correct the guess made from its
// email.
export default function NameModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // A guessed name goes in the placeholder, not the field: pre-filling it
        // would make a value nobody chose look like one they did, and then
        // every account looks like it has been set up when none of them have.
        setName(data.hasName ? data.displayName : "");
        setGuess(data.displayName);
        setBusy(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load your account");
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save that");
      return;
    }
    const data = await res.json();
    onSaved?.(data.displayName);
    onClose();
  }

  return (
    <ModalShell label="Your name" onClose={onClose}>
      <div className="modal-head">
        <h2>Your name</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="modal-body">
        {error && <p className="error">{error}</p>}

        <p className="share-note">
          Shown on any page you share, so people know whose library they&rsquo;re looking at. It
          isn&rsquo;t shown anywhere else, and leaving it blank falls back to your email address.
        </p>

        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={guess}
            maxLength={40}
            disabled={busy}
          />
          <small className="field-hint">
            Shared pages will say &ldquo;{(name.trim() || guess) + "’s"} inspiration
            library&rdquo;.
          </small>
        </label>
      </div>

      <div className="modal-foot">
        <button onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="modal-apply" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
