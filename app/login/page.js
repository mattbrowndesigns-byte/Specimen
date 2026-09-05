"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      // Signing up goes through our own route so the invite code is checked
      // and consumed server-side; Supabase's signup endpoint knows nothing
      // about codes. Signing in afterwards is ordinary Supabase auth.
      if (mode === "invite") {
        const res = await fetch("/api/auth/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Couldn't create that account");
          return;
        }
      }

      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        setError(
          /invalid/i.test(signInError.message)
            ? "That email and password don't match an account."
            : signInError.message
        );
        return;
      }

      // One-time: hands the pre-accounts library to the owner's real account.
      // Does nothing for anyone else, and nothing on later sign-ins.
      await fetch("/api/auth/claim", { method: "POST" }).catch(() => {});

      // Full navigation, not router.push: the session cookie was just set and
      // the middleware needs to see it on a fresh request.
      window.location.href = next;
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="wordmark auth-wordmark">Kivli</h1>
        <p className="auth-tagline">Your visual inspiration library</p>

        <div className="auth-switch">
          <button
            className={mode === "signin" ? "active" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "invite" ? "active" : ""}
            onClick={() => {
              setMode("invite");
              setError(null);
            }}
            type="button"
          >
            I have an invite
          </button>
        </div>

        <form onSubmit={submit}>
          {error && <p className="error">{error}</p>}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </label>

          {mode === "invite" && (
            <label className="field">
              <span>Invite code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                required
              />
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "invite" ? "new-password" : "current-password"}
              minLength={mode === "invite" ? 8 : undefined}
              required
            />
            {mode === "invite" && <small className="field-hint">At least 8 characters.</small>}
          </label>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "invite" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="auth-footnote">
          {mode === "signin"
            ? "Kivli is invite-only. Ask Matt for a code if you don't have one."
            : "Your code works once, and it's yours — it can't be shared on."}
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
