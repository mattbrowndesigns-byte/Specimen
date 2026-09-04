import { NextResponse } from "next/server";

// Resolves a real archived snapshot instead of linking at
// web.archive.org/web/<date>/<url>. That path makes archive.org resolve a
// redirect on every click and is aggressively rate-limited -- it starts
// answering 429 after a handful of clicks. This availability endpoint isn't,
// and it hands back the exact snapshot URL, which loads directly.
export async function GET(request) {
  const url = request.nextUrl.searchParams.get("url");
  const timestamp = request.nextUrl.searchParams.get("timestamp");

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const query = new URLSearchParams({ url });
  if (timestamp) query.set("timestamp", timestamp);

  try {
    const res = await fetch(`https://archive.org/wayback/available?${query}`, {
      headers: { "User-Agent": "Specimen/1.0 (personal design library)" },
    });
    if (!res.ok) {
      return NextResponse.json({ available: false, reason: `archive.org returned ${res.status}` });
    }

    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;

    if (!snapshot?.available || !snapshot.url) {
      return NextResponse.json({ available: false, reason: "no snapshot" });
    }

    return NextResponse.json({
      available: true,
      url: snapshot.url.replace(/^http:/, "https:"),
      timestamp: snapshot.timestamp || null,
    });
  } catch (err) {
    return NextResponse.json({ available: false, reason: err.message });
  }
}
