"use client";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  Heart,
  Layers,
  Tag,
  ListChecks,
  UserPlus,
  Info,
  CircleQuestionMark,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { THEME_KEY } from "@/lib/theme";

// Everything that isn't a primary action. Keeping Manage tags in here rather
// than in the bar itself is the point: the bar is for what you reach for
// constantly, this is for the rest.
//
// Every row carries an icon, including Sign out. One lone icon on the last row
// reads as an oversight rather than a decision, so it's all of them or none.
const LINKS = [
  { href: "/favorites", label: "Favorites", Icon: Heart },
  { href: "/collections", label: "Collections", Icon: Layers },
  { href: "/tags", label: "Manage tags", Icon: Tag },
  { href: "/review", label: "Review queue", Icon: ListChecks },
];

const SECONDARY = [
  { href: "/about", label: "About", Icon: Info },
  { href: "/faq", label: "FAQ", Icon: CircleQuestionMark },
];

export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [theme, setTheme] = useState("light");
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
        onClick={() => setOpen((v) => !v)}
        title="More"
        aria-label="More"
        aria-expanded={open}
      >
        <Menu size={16} />
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
          {SECONDARY.map(({ href, label, Icon }) => (
            <a className="more-item more-item-quiet" key={href} href={href}>
              <Icon size={15} />
              {label}
            </a>
          ))}

          {/* A preference, not an action -- and the section it opens is where
              the next preference goes, rather than back out in the bar. */}
          <div className="more-divider" />
          <span className="more-section-head">Settings</span>
          <button className="more-item more-item-button" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <div className="more-divider" />
          {account && <span className="more-account">{account}</span>}
          <button className="more-item more-item-button" onClick={signOut}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
