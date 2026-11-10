// Design variants. Refined is the app's design: what the live site, the demo
// and every signed-in library show. The two it was chosen between stay
// reachable for documentation and the case study -- the Original exactly as it
// shipped before the redesign, and Elevated, the more ambitious exploration
// whose best parts Refined absorbed.
//
// A variant is one attribute on <html>, `data-variant="refined"` or
// `"elevated"`, and every rule that acts on it lives in app/variants/*.css under
// that attribute. The Original is the *absence* of the attribute, so with
// "original" chosen not one variant rule can match and globals.css renders on
// its own, as it always did. That is the whole of the guarantee that the
// Original is preserved: it is not that the variant styles are careful, it is
// that they are unreachable.
//
// The choice is a cookie, not part of the URL, because it has to follow you
// through the app -- the dashboard, a site's page, Collections -- and every one
// of those is an ordinary link to an ordinary path. No cookie means Refined.
// /demo clears it; /demo-original, /demo-refined and /demo-elevated set it
// (lib/demoEntry.js); the switcher in the corner rewrites it in place.
//
// Stamped by an inline script before first paint, the same way the theme is,
// rather than by reading the cookie in the root layout: cookies() there would
// turn every page in the app dynamic to decide something the browser can.

export const VARIANT_COOKIE = "kivli_variant";

// Set by any of the comparison routes. All it decides is whether the switcher
// shows outside development -- once someone has opened a comparison link they
// are comparing, and the way between the three has to stay on screen.
export const COMPARE_COOKIE = "kivli_compare";

export const VARIANT_MAX_AGE = 60 * 60 * 24 * 30;

export const DEFAULT_VARIANT = "refined";

export const VARIANTS = [
  { id: "original", label: "Original", route: "/demo-original" },
  { id: "refined", label: "Refined", route: "/demo-refined" },
  { id: "elevated", label: "Elevated", route: "/demo-elevated" },
];

export function isVariant(value) {
  return VARIANTS.some((v) => v.id === value);
}

// "original" sets nothing, so the Original's <html> is the same element it was
// before variants existed.
export const variantBootScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${VARIANT_COOKIE}=(original|refined|elevated)(?:;|$)/);var v=m?m[1]:${JSON.stringify(DEFAULT_VARIANT)};if(v!=="original")document.documentElement.dataset.variant=v;}catch(e){document.documentElement.dataset.variant=${JSON.stringify(DEFAULT_VARIANT)};}})();`;
