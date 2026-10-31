import { NextResponse } from "next/server";
import { DEMO_FLAG_COOKIE, DEMO_PASS_COOKIE } from "@/lib/demo";

// Leaving the demo is the demo's sign-out: both cookies go, and the visitor
// lands on the page that explains what they were just looking at.
export async function GET(request) {
  const to = request.nextUrl.clone();
  to.search = "";
  to.pathname = "/features";
  const response = NextResponse.redirect(to);
  response.cookies.delete(DEMO_PASS_COOKIE);
  response.cookies.delete(DEMO_FLAG_COOKIE);
  return response;
}
