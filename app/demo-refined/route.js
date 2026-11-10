import { enterDemo } from "@/lib/demoEntry";

// The app's current design, chosen explicitly -- the same page /demo shows,
// but it turns the comparison switcher on. See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "refined");
}
