import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_FLAG_COOKIE, DEMO_PASS_COOKIE, DEMO_REFUSAL, isValidDemoPass } from "./lib/demo";

// Public: the login screen, the auth callback, and the two callbacks GitHub
// Actions posts to (both authenticated by CALLBACK_SECRET, not a session --
// the runner has no session to offer, so leaving either out of this list means
// the job's results are rejected at the door).
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/api/auth",
  "/api/capture-callback",
  "/api/analyze-callback",
  "/api/enrich-queue",
  "/api/capture-queue",
  // A share link is meant to be opened by someone without an account, so the
  // page and the read behind it are both public. The token is the whole of the
  // authorisation, and /api/share -- managing your own links -- is deliberately
  // a different path, since this list matches by prefix.
  "/share",
  "/api/shared",
  // Linked from the shared footer and from the invite panel, so these are the
  // three pages a stranger is actually sent to. They bounced to /login until
  // their chrome learned to render without a session (app/_ui/ProseShell.js),
  // which is why they were on the known-and-unfixed list rather than here.
  "/features",
  "/about",
  "/faq",
  // Written about the project rather than for the people using it, and the
  // one page meant to be linked to from outside.
  "/case-study",
  // Hands out the demo pass. Everything past it is the real app, let through
  // below by the pass rather than by this list.
  "/demo",
  // The same door with a design chosen on the way in (lib/variant.js). Listed
  // separately because this list matches "/demo" exactly or as a prefix
  // followed by a slash, so "/demo-refined" is not covered by it.
  "/demo-original",
  "/demo-refined",
  "/demo-elevated",
];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  // Reading the user here is what refreshes an expiring access token and
  // writes the new cookies onto the response. Without this the session would
  // silently expire an hour after signing in.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // A stranger from the demo link: no session, a valid pass. They may read
  // anything the demo account can, and change nothing -- one rule at the door
  // rather than one per route, so a write route added later is covered too.
  const demo = !user && !isPublic && (await isValidDemoPass(request.cookies.get(DEMO_PASS_COOKIE)?.value));
  if (demo) {
    if (pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.json({ error: DEMO_REFUSAL, demo: true }, { status: 403 });
    }
    return response;
  }

  if (!user && !isPublic) {
    // API routes answer 401 so the client can show an error; pages redirect,
    // carrying where you were headed so sign-in lands you back there.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  // A real session ends the demo. The pass already loses to a session on the
  // server, but the browser's own flag cookie decides which Add, banner and
  // menu it draws, so a signed-in owner whose browser once opened /demo saw
  // the demo's interface over their own library. Signing in is the moment to
  // hand both cookies back.
  const clearDemo = (res) => {
    if (user && (request.cookies.has(DEMO_FLAG_COOKIE) || request.cookies.has(DEMO_PASS_COOKIE))) {
      res.cookies.delete(DEMO_FLAG_COOKIE);
      res.cookies.delete(DEMO_PASS_COOKIE);
    }
    return res;
  };

  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return clearDemo(NextResponse.redirect(home));
  }

  return clearDemo(response);
}

export const config = {
  // _vercel is the analytics script and its beacon. Through here, a signed-out
  // visitor's would be redirected to /login and never counted.
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
