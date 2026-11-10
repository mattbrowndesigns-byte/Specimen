import { enterDemo } from "@/lib/demoEntry";

// The app's current design, chosen explicitly -- the same page /demo shows.
// Kept so the three comparison links are a set. See lib/variant.js.
export async function GET(request) {
  return enterDemo(request, "refined");
}
