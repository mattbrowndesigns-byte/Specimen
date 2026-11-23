"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import PickLoading from "../_ui/PickLoading";
import { MasonrySkeleton } from "../_ui/masonry";
import { copyText } from "../_ui/CopyForAI";
import { saveButtonHref } from "@/lib/saveButton";

// Two pages at one address. Opened by the Save Button it carries a page's list
// of images in the fragment, and is only the wait before the picker. Opened any
// other way it is where the button is kept, to be dragged to the bookmarks bar.

const KEY = "specimen.save.key";

// Any site can open this address, so the button carries a word this browser
// made up, and a list without it waits for a click. Only in this browser: a
// bookmark synced to another one asks there, which is all the word is for.
function saveKey() {
  try {
    let key = localStorage.getItem(KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}

function readFragment() {
  try {
    const raw = window.location.hash.slice(1);
    const payload = raw ? JSON.parse(decodeURIComponent(raw)) : null;
    return payload?.url ? payload : null;
  } catch {
    return null;
  }
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "that page";
  }
};

function Arriving({ payload, trusted }) {
  const [started, setStarted] = useState(trusted);
  const [error, setError] = useState(null);
  const sent = useRef(false);

  useEffect(() => {
    if (!started || sent.current) return;
    sent.current = true;
    (async () => {
      const res = await fetch("/api/visuals/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) || {};
      if (!res?.ok) {
        setError(data.error || "Couldn't save that page. Try the button again.");
        return;
      }
      window.location.replace(`/visuals/projects/${data.project.id}`);
    })();
  }, [started, payload]);

  if (error) {
    return (
      <div className="empty-state empty-state-search">
        <h2 className="empty-state-headline">Nothing was saved.</h2>
        <p className="empty-state-body">{error}</p>
        <div className="pick-failed-actions">
          <a className="pick-cancel" href={payload.url}>
            Back to {hostOf(payload.url)}
          </a>
        </div>
      </div>
    );
  }
  if (!started) {
    const count = (payload.images?.length || 0) + (payload.videos?.length || 0);
    return (
      <div className="empty-state empty-state-search">
        <h2 className="empty-state-headline">Save from {hostOf(payload.url)}?</h2>
        <p className="empty-state-body">
          {count} {count === 1 ? "image or video" : "images and videos"} to choose from.
        </p>
        <div className="pick-failed-actions">
          <button className="primary" onClick={() => setStarted(true)}>
            Choose What to Keep
          </button>
          <a className="pick-cancel" href="/?tab=visuals">
            Cancel
          </a>
        </div>
      </div>
    );
  }
  return (
    <>
      <PickLoading phase="extracting" seconds={20} />
      <MasonrySkeleton label="Finding images" />
    </>
  );
}

function Install() {
  const [href, setHref] = useState(null);
  const [hint, setHint] = useState(false);
  const [copied, setCopied] = useState(null);
  const link = useRef(null);

  useEffect(() => setHref(saveButtonHref(window.location.origin, saveKey())), []);

  // Set by hand: React refuses to render a javascript: address, rightly, and
  // this is the one place that is the point.
  useEffect(() => {
    if (href) link.current?.setAttribute("href", href);
  }, [href]);

  async function copy() {
    try {
      await copyText(href);
      setCopied("Copied");
    } catch {
      setCopied("Couldn’t copy");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <div className="top-nav">
        <h1>Save Button</h1>
      </div>
      <p className="connect-lede">
        Some sites won&rsquo;t let Kivli read their pages, and neither will most social apps. This button reads the page
        from your own browser instead, and sends its images and videos here to choose from.
      </p>
      <ol className="connect-setup">
        <li className="connect-step">
          <span className="connect-step-number" aria-hidden="true">1</span>
          <div className="connect-step-body">
            <h3>Show your bookmarks bar</h3>
            <p className="connect-step-text">
              Press Shift, Command and B. On Windows it&rsquo;s Shift, Control and B.
            </p>
          </div>
        </li>
        <li className="connect-step">
          <span className="connect-step-number" aria-hidden="true">2</span>
          <div className="connect-step-body">
            <h3>Drag this onto it</h3>
            <a
              ref={link}
              className="save-button"
              draggable="true"
              onClick={(e) => {
                e.preventDefault();
                setHint(true);
              }}
            >
              <Bookmark size={15} />
              Save to Kivli
            </a>
            <p className="connect-note" role="status">
              {hint ? "Not here: drag it up to your bookmarks bar, then click it on the page you want to save." : "Can’t drag it? Copy its code and paste it as the address of a new bookmark."}{" "}
              <button type="button" className="link-btn" onClick={copy} disabled={!href}>
                {copied || "Copy Code"}
              </button>
            </p>
          </div>
        </li>
        <li className="connect-step">
          <span className="connect-step-number" aria-hidden="true">3</span>
          <div className="connect-step-body">
            <h3>Click it on any page</h3>
            <p className="connect-step-text">
              Scroll to the end first, so everything has loaded. Kivli opens in a new tab with what it found, credited to
              whoever made it. Add or fix the credit in Details afterwards.
            </p>
          </div>
        </li>
      </ol>
      <section className="connect-panel">
        <h2>When it can&rsquo;t</h2>
        <p className="connect-note">
          Videos that only stream, like most on Instagram, YouTube and Vimeo, have no file to save. Record the screen,
          then add the recording under Visuals and use Add Credit.
        </p>
      </section>
    </>
  );
}

export default function SavePage() {
  // undefined until the fragment has been looked at, which only a browser can.
  const [arrival, setArrival] = useState(undefined);

  useEffect(() => {
    const read = () => {
      const payload = readFragment();
      const key = saveKey();
      setArrival(payload ? { payload, trusted: Boolean(key) && payload.k === key } : null);
      // Off the address, so a reload isn't a second save.
      if (payload) window.history.replaceState(window.history.state, "", "/save");
    };
    read();
    // The button used again in the tab it opened: only the fragment changes.
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <>
      <UtilityBar />
      <main className="page page-wide">
        {arrival && <Arriving key={arrival.payload.url} payload={arrival.payload} trusted={arrival.trusted} />}
        {arrival === null && <Install />}
      </main>
      <SiteFooter />
    </>
  );
}
