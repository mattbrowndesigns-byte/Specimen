"use client";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  Sparkles,
  Share2,
  Heart,
  Layers,
  Tag,
  ListChecks,
  Import,
  UserPlus,
  Info,
  CircleQuestionMark,
  Moon,
  Sun,
  LogOut,
  UserRound,
  Compass,
} from "lucide-react";
import ShareModal from "./ShareModal";
import NameModal from "./NameModal";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { THEME_KEY } from "@/lib/theme";
import { startDemoTour, useIsDemo } from "./demoState";

// Everything that isn't a primary action. Keeping Manage tags in here rather
// than in the bar itself is the point: the bar is for what you reach for
// constantly, this is for the rest.
//
// Every row carries an icon, including Sign out. One lone icon on the last row
// reads as an oversight rather than a decision, so it's all of them or none.
const LINKS = [
  { href: "/favorites", label: "Favorites", Icon: Heart },
  { href: "/collections", label: "Collections", Icon: Layers },
  { href: "/tags", label: "Manage Tags", Icon: Tag },
  { href: "/review", label: "Review Queue", Icon: ListChecks },
  // Last in the group, and in the menu rather than the bar, because it is a
  // thing you do once: on the day you stop using the other bookmarking app.
  { href: "/import", label: "Import Links", Icon: Import },
];

const SECONDARY = [
  { href: "/features", label: "Features", Icon: Sparkles },
  { href: "/about", label: "About", Icon: Info },
  { href: "/faq", label: "FAQ", Icon: CircleQuestionMark },
];

export default function MoreMenu() {
  const demo = useIsDemo();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [theme, setTheme] = useState("light");
  const [sharing, setSharing] = useState(false);
  const [naming, setNaming] = useState(false);
  const wrapRef = useRef(null);

  // The boot script in the document head has already set data-theme from
  // storage or the OS preference; read it back rather than deciding again.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // The theme still applies for this session; it just won't be remembered.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabaseBrowser().auth.getUser();
      if (cancelled) return;
      setAccount(data?.user?.email || null);
      // Whether Invites shows is decided by the server; a 404 here just means
      // this account isn't the owner, and the route refuses it either way.
      const res = await fetch("/api/invites");
      if (!cancelled) setIsOwner(res.ok);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="more-menu" ref={wrapRef}>
      <button
        className="icon-btn"
        data-tour="menu"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close" : "More"}
        aria-label={open ? "Close menu" : "More"}
        aria-expanded={open}
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>

      {open && (
        <div className="more-pop">
          {LINKS.map(({ href, label, Icon }) => (
            <a className="more-item" key={href} href={href}>
              <Icon size={15} />
              {label}
            </a>
          ))}
          {isOwner && (
            <a className="more-item" href="/invites">
              <UserPlus size={15} />
              Invites
            </a>
          )}
          <div className="more-divider" />
          {/* First in the group about the app, for the visitor who skipped the
              tour and then wondered what they were looking at. */}
          {demo && (
            <button
              className="more-item more-item-button"
              onClick={() => {
                setOpen(false);
                startDemoTour();
              }}
            >
              <Compass size={15} />
              Take the Tour
            </button>
          )}
          {SECONDARY.map(({ href, label, Icon }) => (
            <a className="more-item" key={href} href={href}>
              <Icon size={15} />
              {label}
            </a>
          ))}

          {/* A preference, not an action -- and the section it opens is where
              the next preference goes, rather than back out in the bar.
              Neither this nor Your Name is offered in the demo: both open a
              form whose only outcome there is a refusal. */}
          {!demo && (
            <button
              className="more-item more-item-button"
              onClick={() => {
                setOpen(false);
                setSharing(true);
              }}
            >
              <Share2 size={15} />
              Share Library
            </button>
          )}

          <div className="more-divider" />
          <span className="more-section-head">Settings</span>
          {!demo && (
            <button
              className="more-item more-item-button"
              onClick={() => {
                setOpen(false);
                setNaming(true);
              }}
            >
              <UserRound size={15} />
              Your Name
            </button>
          )}
          <button className="more-item more-item-button" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          {/* The demo has no account to show or leave: whoever is looking at it
              came from a link and has nowhere to sign out to. */}
          {!demo && (
            <>
              <div className="more-divider" />
              {account && <span className="more-account">{account}</span>}
              <button className="more-item more-item-button" onClick={signOut}>
                <LogOut size={15} />
                Sign Out
              </button>
            </>
          )}
        </div>
      )}

      {sharing && <ShareModal kind="library" title="your library" onClose={() => setSharing(false)} />}
      {naming && <NameModal onClose={() => setNaming(false)} />}
    </div>
  );
}
