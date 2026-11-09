import { enterDemo } from "@/lib/demoEntry";

// The link that goes on LinkedIn. The original design, always: entering here
// clears any variant a browser picked up from /demo-refined or /demo-elevated.
// What the pass is and who gets one is in lib/demoEntry.js.
export async function GET(request) {
  return enterDemo(request, null);
}
