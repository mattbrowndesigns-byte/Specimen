import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("component_capture")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) return NOT_FOUND();
  return NextResponse.json({ capture: data });
}
