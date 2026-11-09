// Design variants: two Apple-informed readings of the same app, kept beside
// the original so the three can be compared by using them rather than by
// looking at screenshots of them.
//
// A variant is presentation and nothing else. It is one attribute on <html>
// -- `data-variant="refined"` or `"elevated"` -- and every rule that acts on it
// lives in app/variants/*.css under that attribute, so with no attribute set
// not one of those rules can match. That is the whole of the guarantee that
// the original is untouched: it is not that the variant styles are careful,
// it is that they are unreachable.
//
// The attribute comes from a cookie, not from the URL, because the variant has
// to follow you through the app -- the dashboard, a site's page, Collections --
// and every one of those is an ordinary link to an ordinary path. /demo-refined
// and /demo-elevated set it (lib/demoEntry.js), /demo clears it, and the
// switcher in the corner rewrites it in place.
//
// Stamped by an inline script before first paint, the same way the theme is,
// rather than by reading the cookie in the root layout: cookies() there would
// turn every page in the app dynamic, original included, to serve two pages
// that exist for comparison.

export const VARIANT_COOKIE = "kivli_variant";

// Set by either variant route. All it decides is whether the switcher shows
// outside development -- once someone has opened a variant, they are comparing,
// and the way back to the original has to stay on screen.
export const COMPARE_COOKIE = "kivli_compare";

export const VARIANT_MAX_AGE = 60 * 60 * 24 * 30;

export const VARIANTS = [
  { id: "original", label: "Original", route: "/demo" },
  { id: "refined", label: "Refined", route: "/demo-refined" },
  { id: "elevated", label: "Elevated", route: "/demo-elevated" },
];

export function isVariant(value) {
  return value === "refined" || value === "elevated";
}

export const variantBootScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${VARIANT_COOKIE}=(refined|elevated)(?:;|$)/);if(m)document.documentElement.dataset.variant=m[1];}catch(e){}})();`;
