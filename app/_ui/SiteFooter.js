"use client";
import { useEffect, useState } from "react";
import { Heart, Layers, Tag, ListChecks, Sparkles, Info, CircleQuestionMark } from "lucide-react";

// The quiet end of the page.
//
// Everything here is already in the overflow menu, which is the point: the
// menu is for reaching something mid-task, and this is for the moment you've
// run out of grid and are wondering what else there is. Nothing lives only
// down here, so nothing is lost by not scrolling.
const LINKS = [
  { href: "/favorites", label: "Favorites", Icon: Heart },
  { href: "/collections", label: "Collections", Icon: Layers },
  { href: "/tags", label: "Manage Tags", Icon: Tag },
  { href: "/review", label: "Review Queue", Icon: ListChecks, badge: true },
  { href: "/features", label: "Features", Icon: Sparkles },
  { href: "/about", label: "About", Icon: Info },
  { href: "/faq", label: "FAQ", Icon: CircleQuestionMark },
];

export default function SiteFooter() {
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review-count")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setPending(data?.total ?? null))
      .catch(() => {
        // No badge is the right failure: a count that can't be trusted is
        // worse than none, and the link still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">
          <span className="site-footer-mark">Kivli</span>
        </span>

        <nav className="site-footer-links">
          {LINKS.map(({ href, label, Icon, badge }) => (
            <a key={href} href={href}>
              <Icon size={14} />
              {label}
              {/* Only when there's something to review. A zero badge is a
                  notification that nothing happened. */}
              {badge && pending > 0 && <span className="footer-badge">{pending}</span>}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
