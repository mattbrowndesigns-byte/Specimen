"use client";
import { useEffect } from "react";
import { isDemoBrowser } from "./demoState";

// Microsoft Clarity, in the demo and nowhere else: session recordings and
// heatmaps, for what Vercel Analytics can't say -- how long someone stayed and
// where they gave up. Free.
//
// The id comes from clarity.microsoft.com and is public once it loads, so it
// lives here rather than in an environment variable. Empty means it never loads.
const CLARITY_ID = "zi84v7q9e8";

// Pages a demo browser can reach that aren't the demo: signing in, and other
// people's shared libraries. A recording must not start on either.
const NOT_THE_DEMO = ["/login", "/reset-password", "/oauth", "/share"];

const OPT_OUT_KEY = "specimen.notrack";

// Signing in is a full page load and middleware clears the demo flag on the
// way, so a recording can't carry over into a real account. `?notrack` on any
// page opts a browser out for good, `?track` undoes it: the owner's signed-in
// browser is never in the demo, but a phone that isn't signed in is.
function shouldRecord() {
  if (!CLARITY_ID || !isDemoBrowser() || navigator.webdriver) return false;
  const { hostname, pathname, search } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  if (NOT_THE_DEMO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  try {
    const params = new URLSearchParams(search);
    if (params.has("notrack")) localStorage.setItem(OPT_OUT_KEY, "1");
    if (params.has("track")) localStorage.removeItem(OPT_OUT_KEY);
    return localStorage.getItem(OPT_OUT_KEY) !== "1";
  } catch {
    // Nowhere to remember an opt-out means nobody has opted out here.
    return true;
  }
}

export default function DemoClarity() {
  useEffect(() => {
    if (window.clarity || !shouldRecord()) return;
    window.clarity = (...args) => {
      (window.clarity.q = window.clarity.q || []).push(args);
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    document.head.appendChild(script);
  }, []);
  return null;
}
