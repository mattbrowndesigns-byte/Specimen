import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// The consent page's two buttons. Supabase does the OAuth work on either
// answer and returns the URL to send the person back to -- with a code on a
// yes, with access_denied on a no -- so all this does is relay the choice.
//
// A POST from a signed-in browser: middleware.js has already turned away a
// demo pass, which may read but never write.
export async function POST(request) {
  const form = await request.formData();
  const authorizationId = form.get("authorization_id");
  const decision = form.get("decision");
  if (!authorizationId) {
    return NextResponse.json({ error: "That request is missing its id." }, { status: 400 });
  }

  const supabase = await supabaseSession();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const options = { skipBrowserRedirect: true };
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, options);
  if (error || !data?.redirect_url) {
    return NextResponse.json({ error: error?.message || "That request has expired." }, { status: 400 });
  }
  // 303 so the browser follows with a GET, whatever the client's callback is.
  return NextResponse.redirect(data.redirect_url, 303);
}
