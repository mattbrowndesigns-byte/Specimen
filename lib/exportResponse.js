import { NextResponse } from "next/server";
import { exportFilename } from "@/lib/exportMarkdown";

// A Markdown export, as text the browser can copy or as a file it saves.
//
// ?download=1 is the only difference: it adds Content-Disposition so a plain
// link downloads under a stable name -- the same thing always saves as the
// same file, which is what lets a fresh copy replace a stale one in a project
// folder. Never cached: the point of exporting again is to get what is true
// now.
export function markdownResponse(request, markdown, kind, name) {
  const headers = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (new URL(request.url).searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${exportFilename(kind, name)}"`;
  }
  return new NextResponse(markdown, { headers });
}

export const exportFailed = (err) => {
  console.error("Export failed:", err?.message || err);
  return NextResponse.json({ error: "Couldn't put that together. Try again in a moment." }, { status: 500 });
};
