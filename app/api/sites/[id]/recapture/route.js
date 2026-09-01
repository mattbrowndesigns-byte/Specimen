import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCapture } from "@/lib/github";

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: site, error } = await supabase.from("site").select("id, url").eq("id", id).single();
  if (error || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  try {
    await dispatchCapture({ siteId: site.id, url: site.url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
