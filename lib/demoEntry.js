import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabaseServer";
import { DEMO_FLAG_COOKIE, DEMO_MAX_AGE, DEMO_PASS_COOKIE, demoPassValue } from "@/lib/demo";
import { COMPARE_COOKIE, VARIANT_COOKIE, VARIANT_MAX_AGE, isVariant } from "@/lib/variant";

// The front door for every demo link. /demo is the one that goes on LinkedIn
// and shows the app's design; /demo-original, /demo-refined and /demo-elevated
// are the same door with a design chosen on the way through (lib/variant.js).
// One function, so they cannot drift apart on the part that matters, which is
// the pass.
//
// Hands out the demo pass and opens the real dashboard on the demo account;
// see lib/demo.js for what the pass can and cannot do. If the two variables
// aren't set there is no demo to enter, so it goes to the features page rather
// than to a login screen a stranger can't use.
//
// Someone already signed in gets their own library and no pass: the demo is for
// people without an account, and handing the owner a pass would put the demo's
// interface over their real data in their own browser. The variant still
// applies to them, so the owner can compare the three on their own library.
export async function enterDemo(request, variant = null) {
  const { data } = await (await supabaseSession()).auth.getUser();
  const to = request.nextUrl.clone();
  to.search = "";
  const secure = to.protocol === "https:";

  let response;
  if (data?.user) {
    to.pathname = "/";
    response = NextResponse.redirect(to);
  } else {
    const pass = await demoPassValue();
    to.pathname = pass ? "/" : "/features";
    response = NextResponse.redirect(to);
    if (pass) {
      const common = { path: "/", sameSite: "lax", secure, maxAge: DEMO_MAX_AGE };
      response.cookies.set(DEMO_PASS_COOKIE, pass, { ...common, httpOnly: true });
      response.cookies.set(DEMO_FLAG_COOKIE, "1", common);
    }
  }

  // Readable by the browser on purpose: the boot script stamps it before
  // paint and the switcher rewrites it. It decides nothing but styling.
  if (isVariant(variant)) {
    const common = { path: "/", sameSite: "lax", secure, maxAge: VARIANT_MAX_AGE };
    response.cookies.set(VARIANT_COOKIE, variant, common);
    response.cookies.set(COMPARE_COOKIE, "1", common);
  } else if (request.cookies.has(VARIANT_COOKIE)) {
    // /demo is the app's own design, always -- including for a browser that
    // opened the Original or Elevated last week. Only touched when there is
    // something to clear.
    response.cookies.delete(VARIANT_COOKIE);
  }

  return response;
}
