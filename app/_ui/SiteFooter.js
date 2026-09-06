import { Heart, Layers, Tag, ListChecks, Info, CircleQuestionMark } from "lucide-react";

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
  { href: "/review", label: "Review Queue", Icon: ListChecks },
  { href: "/about", label: "About", Icon: Info },
  { href: "/faq", label: "FAQ", Icon: CircleQuestionMark },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">
          <span className="site-footer-mark">Kivli</span>
          <span className="site-footer-tag">Your visual inspiration library</span>
        </span>

        <nav className="site-footer-links">
          {LINKS.map(({ href, label, Icon }) => (
            <a key={href} href={href}>
              <Icon size={14} />
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
