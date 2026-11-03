"use client";
import { Analytics } from "@vercel/analytics/next";
import { isDemoBrowser } from "./demoState";

// Vercel Web Analytics, free on Hobby and cookieless, so no consent banner.
//
// A demo visitor and the owner both land on `/`, so the dashboard could not
// tell them apart. A page view from a browser carrying the demo flag is filed
// under `/demo` instead -- `/` becomes `/demo`, `/site/abc` becomes
// `/demo/site/abc` -- and "has anyone used the demo link" is a filter on paths
// starting with /demo. The flag is the plain cookie, not the signed pass, which
// is fine here: forging it only mislabels your own page views.
function tagDemo(event) {
  if (!isDemoBrowser()) return event;
  const url = new URL(event.url);
  url.pathname = url.pathname === "/" ? "/demo" : `/demo${url.pathname}`;
  return { ...event, url: url.toString() };
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={tagDemo} />;
}
