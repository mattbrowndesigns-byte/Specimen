import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabaseServer";
import { DEMO_FLAG_COOKIE, DEMO_MAX_AGE, DEMO_PASS_COOKIE, demoPassValue } from "@/lib/demo";

// The link that goes on LinkedIn. Hands out the demo pass and opens the real
// dashboard on the demo account; see lib/demo.js for what the pass can and
// cannot do. If the two variables aren't set there is no demo to enter, so it
// goes to the features page rather than to a login screen a stranger can't use.
//
// Someone already signed in gets their own library and no pass: the demo is for
// people without an account, and handing the owner a pass would put the demo's
// interface over their real data in their own browser.
export async function GET(request) {
  const { data } = await (await supabaseSession()).auth.getUser();
  if (data?.user) {
    const home = request.nextUrl.clone();
    home.search = "";
    home.pathname = "/";
    return NextResponse.redirect(home);
  }

  const pass = await demoPassValue();
  const to = request.nextUrl.clone();
  to.search = "";
  to.pathname = pass ? "/" : "/features";
  const response = NextResponse.redirect(to);
  if (!pass) return response;

  const common = { path: "/", sameSite: "lax", secure: to.protocol === "https:", maxAge: DEMO_MAX_AGE };
  response.cookies.set(DEMO_PASS_COOKIE, pass, { ...common, httpOnly: true });
  response.cookies.set(DEMO_FLAG_COOKIE, "1", common);
  return response;
}
