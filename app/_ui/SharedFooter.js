import Wordmark from "./Wordmark";

// The shared page's own footer, not the app's.
//
// The site footer is a list of places only an account holder can go --
// Favorites, Collections, Manage Tags, Review Queue -- so putting it here
// would hand a stranger six links that all bounce off the login screen. What's
// left is the three pages that explain the thing they're looking at.
const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export default function SharedFooter() {
  return (
    <footer className="site-footer shared-footer">
      <div className="site-footer-inner">
        <a className="site-footer-brand wordmark-link" href="/">
          <Wordmark className="site-footer-mark" as="span" />
        </a>

        <nav className="site-footer-links">
          {LINKS.map(({ href, label }) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
