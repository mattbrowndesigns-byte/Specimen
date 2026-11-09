import { enterDemo } from "@/lib/demoEntry";

// The demo with the Refined design: the original's layout and information
// architecture, finished more carefully. See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "refined");
}
