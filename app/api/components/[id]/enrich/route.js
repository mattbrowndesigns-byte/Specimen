import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enrichAndSaveComponent } from "@/lib/componentCrop";
import { currentUser } from "@/lib/supabaseServer";
import { UNAUTHORIZED, NOT_FOUND, ownsComponent, ownsTag } from "@/lib/ownership";

// Re-runs the AI pass over the component's existing desktop crop: name,
// summary, and tags from the current approved vocabulary. Used by Regenerate,
// and as the retry when enrichment failed at save time.
export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();

  const { id } = await params;
  const supabase = supabaseAdmin();
  if (!(await ownsComponent(supabase, id, user.id))) return NOT_FOUND();

  const { data: component, error } = await supabase
    .from("component")
    .select("id, source_url, image_url")
    .eq("id", id)
    .single();

  if (error || !component?.image_url) {
    return NextResponse.json({ error: "Component or its crop not found" }, { status: 404 });
  }

  try {
    const res = await fetch(component.image_url);
    if (!res.ok) throw new Error(`Couldn't read the stored crop (${res.status})`);
    const croppedBuffer = Buffer.from(await res.arrayBuffer());

    await enrichAndSaveComponent({
      componentId: id,
      sourceUrl: component.source_url,
      croppedBuffer,
      clearExistingTags: true,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
