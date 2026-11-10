import { enterDemo } from "@/lib/demoEntry";

// The link that goes on LinkedIn. The app's current design, always: entering
// here clears any comparison choice a browser picked up from /demo-original or
// /demo-elevated. What the pass is and who gets one is in lib/demoEntry.js.
export async function GET(request) {
  return enterDemo(request, null);
}
