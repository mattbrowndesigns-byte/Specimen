"use client";
import { useCallback, useEffect, useState } from "react";
import UtilityBar from "../_ui/UtilityBar";

export default function InvitesPage() {
  const [invites, setInvites] = useState(null);
  const [note, setNote] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/invites");
    if (res.status === 404) {
      setError("Invites are managed by the library owner.");
      setInvites([]);
      return;
    }
    if (!res.ok) {
      setError("Couldn't load your invite codes");
      setInvites([]);
      return;
    }
    const data = await res.json();
    setInvites(data.invites || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() || null, count }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't create those codes");
      return;
    }
    setNote("");
    await load();
  }

  async function withdraw(invite) {
    setError(null);
    const res = await fetch(`/api/invites?id=${invite.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't withdraw that code");
      return;
    }
    await load();
  }

  async function copy(invite) {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(invite.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Couldn't reach the clipboard — select the code and copy it by hand.");
    }
  }

  const unused = (invites || []).filter((i) => !i.used_at);
  const used = (invites || []).filter((i) => i.used_at);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Invites</h1>
        </div>

        {error && <p className="error">{error}</p>}

        <p className="placeholder-page">
          Each code works once. Whoever redeems it gets their own private library — they can&rsquo;t
          see yours, and you can&rsquo;t see theirs.
        </p>

        <form className="save-form invite-form" onSubmit={generate}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who's this for? (optional)"
            disabled={busy}
          />
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
            {[1, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} code{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </button>
        </form>

        {invites === null && <p className="empty-small">Loading…</p>}

        {invites !== null && (
          <>
            <div className="bulk-bar">
              <h2>Unused ({unused.length})</h2>
            </div>
            {unused.length === 0 ? (
              <p className="empty-small">No codes waiting. Generate one above.</p>
            ) : (
              <div className="tag-list">
                {unused.map((invite) => (
                  <div className="tag-row" key={invite.id}>
                    <code className="invite-code">{invite.code}</code>
                    <span className="tag-label">{invite.note || "—"}</span>
                    <div className="tag-actions">
                      <button onClick={() => copy(invite)}>
                        {copied === invite.id ? "Copied" : "Copy"}
                      </button>
                      <button onClick={() => withdraw(invite)}>Withdraw</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {used.length > 0 && (
              <>
                <div className="bulk-bar">
                  <h2>Redeemed ({used.length})</h2>
                </div>
                <div className="tag-list">
                  {used.map((invite) => (
                    <div className="tag-row" key={invite.id}>
                      <code className="invite-code invite-code-used">{invite.code}</code>
                      <span className="tag-label">{invite.note || "—"}</span>
                      <span className="tag-facet">
                        {new Date(invite.used_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
