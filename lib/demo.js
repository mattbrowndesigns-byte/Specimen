// The demo pass: how a stranger from a LinkedIn link gets into the real app
// without an account, and why they can look at everything and change nothing.
//
// A visitor to /demo gets two cookies. `kivli_demo_pass` is httpOnly and
// signed with DEMO_SECRET; it is the only thing the server trusts, and it
// resolves to DEMO_USER_ID -- a separate account seeded with a copy of the
// showcase library by scripts/seed-demo.js. `kivli_demo` is a plain flag the
// browser can read, and it decides nothing but whether the banner shows.
//
// Deliberately NOT a Supabase session for the demo account. resource and share
// have owner policies under RLS, so a real login handed to strangers would let
// anyone with the anon key edit those rows straight through the REST API,
// around this app entirely. A pass the server checks has nothing to go around.
//
// Every change is refused in middleware.js, in one rule, rather than route by
// route: there are thirty-nine routes that write, and a rule at the door also
// covers the fortieth.
//
// Web Crypto rather than node:crypto, because middleware runs on the edge.

export const DEMO_PASS_COOKIE = "kivli_demo_pass";
export const DEMO_FLAG_COOKIE = "kivli_demo";
export const DEMO_MAX_AGE = 60 * 60 * 24 * 7;

// What a blocked change says, in the app's own error shape.
export const DEMO_REFUSAL = "This is a demo, so changes aren't saved.";

const SIGNED = "kivli-demo-v1";

function configured() {
  return Boolean(process.env.DEMO_SECRET && process.env.DEMO_USER_ID);
}

async function sign() {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.DEMO_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SIGNED));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function demoPassValue() {
  return configured() ? sign() : null;
}

// Fails closed: no secret, no user id, or a value that doesn't match means no
// demo, which for a signed-out visitor means the login screen.
export async function isValidDemoPass(value) {
  if (!value || !configured()) return false;
  const expected = await sign();
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Shaped like the parts of a Supabase user the routes read: an id for every
// scoped query, no email (so nothing owner-only matches it), and a name for
// the share payload and the account menu.
export function demoUser() {
  return {
    id: process.env.DEMO_USER_ID,
    email: null,
    user_metadata: { display_name: "Demo" },
    is_demo: true,
  };
}
