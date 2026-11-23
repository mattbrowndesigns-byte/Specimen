import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED } from "@/lib/ownership";
import { tidyUrl } from "@/lib/importLinks";
import { lookup } from "@/lib/extensionData";

export const dynamic = "force-dynamic";

// A read, but a POST: the address of the page someone is on belongs in a body,
// not in a query string that ends up in a server's log. It also means a demo
// pass is refused at the door like any other POST, so the panel asks a demo
// visitor to sign in rather than showing them someone else's library.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { url } = await request.json();
  try {
    return NextResponse.json(await lookup(supabaseAdmin(), user, url ? tidyUrl(url) : null));
  } catch (err) {
    console.error("Extension lookup failed:", err.message);
    return NextResponse.json({ error: "Couldn't read your library" }, { status: 500 });
  }
}
