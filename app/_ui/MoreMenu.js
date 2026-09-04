"use client";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

// Everything that isn't a primary action. Keeping Manage tags in here rather
// than in the bar itself is the point: the bar is for what you reach for
// constantly, this is for the rest.
const LINKS = [
  { href: "/favorites", label: "Favorites" },
  { href: "/collections", label: "Collections" },
  { href: "/tags", label: "Manage tags" },
  { href: "/review", label: "Review queue" },
];

const SECONDARY = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

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
          {LINKS.map((link) => (
            <a className="more-item" key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <div className="more-divider" />
          {SECONDARY.map((link) => (
            <a className="more-item more-item-quiet" key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
