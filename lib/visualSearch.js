import { allRows, allRowsIn } from "@/lib/paging";

// The visuals whose project is called this. A visual's own title says what is
// in the picture ("Bus stop wayfinding sign") and the client's name is on the
// project, so searching "Uber" for the Uber work found nothing.
//
// `pattern` is an ilike pattern, already wrapped in %.
export async function visualIdsByProject(supabase, userId, pattern) {
  const projects = await allRows(
    () => supabase.from("visual_project").select("id").eq("user_id", userId).ilike("title", pattern),
    "matching projects"
  );
  const visuals = await allRowsIn(
    projects.map((project) => project.id),
    (chunk) => supabase.from("visual").select("id").eq("user_id", userId).in("project_id", chunk),
    "visuals by project"
  );
  return visuals.map((visual) => visual.id);
}
