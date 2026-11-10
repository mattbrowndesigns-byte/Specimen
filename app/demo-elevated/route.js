import { enterDemo } from "@/lib/demoEntry";

// The Elevated exploration, kept for documentation: the same data and the same
// controls, recomposed -- a sticky command bar on the dashboard, a viewer and a
// tabbed inspector on a site's page. Refined took its fields, its rounded
// buttons and its viewer row, and left the rest. See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "elevated");
}
