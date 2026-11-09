import { enterDemo } from "@/lib/demoEntry";

// The demo with the Elevated design: the same data and the same controls,
// recomposed -- a sticky command bar on the dashboard, a viewer and inspector
// on a site's page. See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "elevated");
}
