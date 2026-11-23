import { KIVLI } from "./config.js";

// Every request carries the browser's own Kivli session: nothing is signed in
// here and no token is kept. Anything that isn't Kivli's own JSON comes back as
// a plain sentence rather than as a parse error.
export async function post(path, body) {
  let res;
  try {
    res = await fetch(`${KIVLI}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Kivli. Check your connection and try again." };
  }
  const data = await res.json().catch(() => null);
  // A demo pass reads as signed in to the app and is refused here: there is no
  // library of your own behind it.
  if (res.status === 401 || data?.demo) return { ok: false, signedOut: true, error: "Sign in to Kivli to save this." };
  if (!res.ok || !data) return { ok: false, error: data?.error || "Kivli couldn't do that just now. Try again." };
  return { ok: true, data };
}
