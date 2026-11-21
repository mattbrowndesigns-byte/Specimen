"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

// Puts the Markdown an export route returns on the clipboard.
//
// Safari only lets a page write to the clipboard during the click that asked
// for it, and the wait for the server ends that window -- so `fetch, then
// writeText` fails there with nothing on screen to say so. Handing the
// clipboard a ClipboardItem whose contents are a *promise* is the way through:
// the write is started inside the click and the text arrives when it's ready.
// Chrome and Firefox take that too; anything older falls back to waiting for
// the text and writing it plainly.
export async function copyMarkdown(url) {
  const text = fetch(url, { cache: "no-store" }).then(async (res) => {
    if (res.ok) return res.text();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Couldn't put that together");
  });
  // Swallowed here and rethrown below; without this an early failure is
  // reported as unhandled before the clipboard has had its turn.
  text.catch(() => {});

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // Either the text failed (reported below) or this browser doesn't take a
      // promise in a ClipboardItem; try the plain way before giving up.
    }
  }
  const markdown = await text;
  try {
    await navigator.clipboard.writeText(markdown);
  } catch (err) {
    // Some embedded and locked-down browsers refuse the Clipboard API
    // outright. The old selection-and-copy route still works in most of them
    // while the click is recent, so it's the last thing tried.
    if (!legacyCopy(markdown)) throw err;
  }
}

function legacyCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

// The state a copy control shows: what it says for a couple of seconds after
// the click, then back to idle.
export function useCopyState() {
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function run(url) {
    clearTimeout(timer.current);
    setState("copying");
    try {
      await copyMarkdown(url);
      setState("copied");
      setMessage("Copied. Paste it into any AI chat.");
    } catch (err) {
      setState("error");
      setMessage(err?.message && err.message !== "Failed to fetch" ? err.message : "Couldn’t copy that");
    }
    timer.current = setTimeout(() => setState("idle"), 2400);
  }
  return { state, message, run };
}

// "Copy for AI" names the job rather than the format: plenty of designers have
// never heard of Markdown, and everyone knows what an AI chat is. The download
// beside it is for the other use -- a file dropped into a project folder -- and
// is a plain link, so the browser saves it under the stable name the route
// sets rather than whatever a blob URL would be called.
export default function CopyForAI({ url, label = "Copy for AI", className = "" }) {
  const { state, message, run } = useCopyState();
  const join = url.includes("?") ? "&" : "?";

  return (
    <span className={`copy-ai ${className}`.trim()}>
      <button
        type="button"
        className="copy-ai-btn"
        onClick={() => run(url)}
        disabled={state === "copying"}
        title="Copies everything Kivli knows about this, ready to paste into ChatGPT, Claude or any other AI"
      >
        {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
        {state === "copied" ? "Copied" : state === "error" ? "Couldn’t copy" : state === "copying" ? "Copying…" : label}
      </button>
      <a
        className="icon-btn copy-ai-download"
        href={`${url}${join}download=1`}
        download
        title="Download as a Markdown file"
        aria-label="Download as a Markdown file"
      >
        <Download size={16} />
      </a>
      <span className="sr-only" role="status">
        {state === "copied" || state === "error" ? message : ""}
      </span>
    </span>
  );
}
