"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Wordmark from "../_ui/Wordmark";

// Where a password-reset email lands. Until this existed the app had nowhere
// for that link to go, so a forgotten password was a locked door for everyone,
// owner included.
//
// The link signs you in for one purpose: arriving here with a one-time code
// (or, from a link sent out of the Supabase dashboard, tokens in the hash).
// Once that session exists, the form sets a new password on it and sends you
// home.

function readHash() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    error: hash.get("error_description"),
  };
}

export default function ResetPasswordPage() {
  const [status, setStatus] = useState("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const query = new URLSearchParams(window.location.search);
      const hash = readHash();

      if (hash.error || query.get("error_description")) {
        setStatus("expired");
        return;
      }

      // The browser client trades a ?code= for a session by itself when it
      // starts, so ask for the session first and only trade it here if that
      // didn't happen -- a code works once, and trading it twice fails.
      let { data } = await supabase.auth.getSession();
      if (!data.session && query.get("code")) {
        await supabase.auth.exchangeCodeForSession(query.get("code"));
        ({ data } = await supabase.auth.getSession());
      }
      if (!data.session && hash.accessToken && hash.refreshToken) {
        await supabase.auth.setSession({ access_token: hash.accessToken, refresh_token: hash.refreshToken });
        ({ data } = await supabase.auth.getSession());
      }

      // Tokens out of the address bar once they've been used.
      window.history.replaceState({}, "", "/reset-password");
      setStatus(data.session ? "ready" : "expired");
    })();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // Full navigation so the middleware sees the session on a fresh request.
    window.location.href = "/";
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Wordmark className="auth-wordmark" />
        <p className="auth-tagline">Set a new password</p>

        {status === "checking" && <p className="auth-notice">Checking your link…</p>}

        {status === "expired" && (
          <>
            <p className="auth-notice">
              This link has expired or has already been used. Reset links work once, for about an hour.
            </p>
            <a className="auth-submit auth-submit-link" href="/login">
              Back to sign in
            </a>
          </>
        )}

        {status === "ready" && (
          <form onSubmit={submit}>
            {error && <p className="error">{error}</p>}
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                aria-invalid={Boolean(error) && password.length < 8}
                required
                autoFocus
              />
              <small className="field-hint">At least 8 characters.</small>
            </label>
            <label className="field">
              <span>Type it again</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={Boolean(error) && password !== confirm}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save password and sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
