import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public: the login screen, the auth callback, and the capture callback that
// GitHub Actions posts to (authenticated by CALLBACK_SECRET, not a session).
const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/auth", "/api/capture-callback"];

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

  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
