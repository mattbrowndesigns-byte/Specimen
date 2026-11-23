"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, Plug, X } from "lucide-react";
import { claimNudge, retireNudge } from "./connectPrompts";

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

// Plain text, from the page rather than from a route: the same fallbacks.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    if (!legacyCopy(text)) throw err;
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
      timer.current = setTimeout(() => setState("idle"), 2400);
      return true;
    } catch (err) {
      setState("error");
      setMessage(err?.message && err.message !== "Failed to fetch" ? err.message : "Couldn’t copy that");
      timer.current = setTimeout(() => setState("idle"), 2400);
      return false;
    }
  }
  return { state, message, run };
}

// "Copy for AI" names the job rather than the format: plenty of designers have
// never heard of Markdown, and everyone knows what an AI chat is.
//
// One capsule with two parts. The label copies, in one click, because that is
// the common use. The arrow beside it opens a short menu holding both ways out
// -- copy, or download the same Markdown as a file for a project folder. The
// download used to be a bare icon beside the button, a second shape in every
// row it sat in with nothing holding it; now the two are one control. The
// download is still a plain link, so the browser saves it under the stable name
// the route sets rather than whatever a blob URL would be called.
//
// A successful copy is also the one moment someone is certainly carrying the
// library into an AI by hand, so it is where they hear that the AI could come
// and get it instead (connectPrompts.js says how often). A card under the
// button rather than a line beside it, so nothing in the row moves.
export default function CopyForAI({ url, label = "Copy for AI", className = "" }) {
  const { state, message, run } = useCopyState();
  const [nudge, setNudge] = useState(false);
  const nudgeTimer = useRef(null);
  const nudgeRef = useRef(null);
  // The button sits at the right of a site's header and the left of a
  // collection's, so the card opens away from whichever edge is nearer.
  const [nudgeEnd, setNudgeEnd] = useState(false);
  const join = url.includes("?") ? "&" : "?";
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => () => clearTimeout(nudgeTimer.current), []);
  // The menu closes on a click anywhere else or on Escape, like every menu.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  useLayoutEffect(() => {
    if (!nudge || !nudgeRef.current) return;
    const rect = nudgeRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) setNudgeEnd(true);
  }, [nudge]);

  async function copy() {
    setMenuOpen(false);
    if (!(await run(url)) || nudge || !claimNudge()) return;
    setNudgeEnd(false);
    setNudge(true);
    // Long enough to read twice; it is a suggestion, not something to dismiss.
    nudgeTimer.current = setTimeout(() => setNudge(false), 9000);
  }

  function closeNudge() {
    retireNudge();
    clearTimeout(nudgeTimer.current);
    setNudge(false);
  }

  return (
    <span ref={wrapRef} className={`copy-ai ${className}`.trim()}>
      <span className="copy-ai-split">
        <button
          type="button"
          className="copy-ai-btn"
          onClick={copy}
          disabled={state === "copying"}
          data-tip="Copies everything Kivli knows about this, ready to paste into ChatGPT, Claude or any other AI"
        >
          {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
          {state === "copied" ? "Copied" : state === "error" ? "Couldn’t copy" : state === "copying" ? "Copying…" : label}
        </button>
        <button
          type="button"
          className="copy-ai-more"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="More ways to export"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-tip={menuOpen ? undefined : "Copy or download"}
        >
          <ChevronDown size={15} />
        </button>
      </span>
      {menuOpen && (
        <span className="more-pop copy-ai-menu" role="menu">
          <button type="button" role="menuitem" className="more-item more-item-button" onClick={copy}>
            <Copy size={15} />
            <span>
              <strong>Copy for AI</strong>
              <small>Paste into ChatGPT, Claude or any AI</small>
            </span>
          </button>
          <a role="menuitem" className="more-item" href={`${url}${join}download=1`} download onClick={() => setMenuOpen(false)}>
            <Download size={15} />
            <span>
              <strong>Download file</strong>
              <small>The same, as a Markdown file</small>
            </span>
          </a>
        </span>
      )}
      <span className="sr-only" role="status">
        {state === "copied" || state === "error" ? message : ""}
      </span>
      {nudge && (
        <span ref={nudgeRef} className={`copy-ai-nudge${nudgeEnd ? " copy-ai-nudge-end" : ""}`} role="note">
          <Plug size={15} aria-hidden="true" />
          <span>
            Want your AI to search Kivli on its own?{" "}
            <a href="/connect" onClick={retireNudge}>
              Connect it
            </a>
          </span>
          <button type="button" className="icon-btn copy-ai-nudge-close" onClick={closeNudge} aria-label="Don’t show this again">
            <X size={14} />
          </button>
        </span>
      )}
    </span>
  );
}
