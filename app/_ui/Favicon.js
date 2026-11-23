"use client";
import { useState } from "react";

// A site's own icon beside its name, so a grid of screenshots is scannable by
// brand as well as by thumbnail. Two chances at an image -- the stored icon,
// then the site's /favicon.ico -- and then a letter, never an empty space.

// Google's favicon service is asked for 64px when an icon is stored
// (lib/iconShape.js), which is fine in a 24px card badge and soft in the 44px
// one at the top of a site's page: on a 2x screen that badge is 88 device
// pixels, so a 64px file is being stretched. Asking for 128 when drawing fixes
// every row already stored without re-resolving any of them. Google hands back
// the largest it has up to that, so a site with only a small icon is no worse.
function sharpen(src) {
  if (!src || !src.includes("gstatic.com/faviconV2")) return src;
  try {
    const url = new URL(src);
    url.searchParams.set("size", "128");
    return url.toString();
  } catch {
    return src;
  }
}

// A stable hue for a name, so a site with no icon at all keeps the same colour
// everywhere it appears. A resource has no measured palette to borrow from,
// and a guess at "the site's colour" that changed between visits would be
// worse than an honest, consistent one.
function hueFor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

function letterSource(alt, url) {
  if (alt && /[a-z0-9]/i.test(alt)) return alt.trim();
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function Favicon({ url, faviconUrl, fills = true, alt }) {
  const declared = sharpen(faviconUrl || null);
  const guessed = (() => {
    try {
      return new URL("/favicon.ico", url).toString();
    } catch {
      return null;
    }
  })();

  const [src, setSrc] = useState(declared || guessed);

  // No icon anywhere: the first letter of the name on a colour of its own, in
  // the same circle, so a row of saves never has a gap where a mark should be.
  if (!src) {
    const source = letterSource(alt, url);
    const letter = (source.match(/[a-z0-9]/i)?.[0] || "?").toUpperCase();
    return (
      <span
        className="favicon-badge favicon-badge-letter"
        style={{ "--letter-hue": hueFor(source.toLowerCase()) }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }

  // Every icon sits in the same bordered circle, whatever shape or background
  // the site's own file has. Otherwise a transparent PNG floats loose against
  // a white card while a square favicon reads as a block, and a row of them
  // has no common baseline.
  //
  // `fills` is measured when the icon is stored: a brand tile fills the circle
  // edge to edge, a mark on transparency is inset so the circle doesn't crop
  // it. There's no rendering rule that suits both.
  return (
    <span className={`favicon-badge${fills ? "" : " favicon-badge-mark"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="favicon"
        src={src}
        alt={alt ? `${alt} icon` : ""}
        width={16}
        height={16}
        loading="lazy"
        onError={() => setSrc(src === declared && guessed && guessed !== declared ? guessed : null)}
      />
    </span>
  );
}
