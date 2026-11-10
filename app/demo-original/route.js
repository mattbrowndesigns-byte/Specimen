import { enterDemo } from "@/lib/demoEntry";

// The demo as it was designed before the redesign, kept for documentation and
// the case study. Rendered by globals.css alone: no variant rule can match it.
// See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "original");
}
