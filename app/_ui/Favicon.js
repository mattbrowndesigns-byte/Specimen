"use client";
import { useState } from "react";

// A site's own icon beside its name, so a grid of screenshots is scannable by
// brand as well as by thumbnail.
//
// Served from the site's own domain rather than through a third-party favicon
// service: no external dependency, no rate limit, and the library's contents
// don't get sent anywhere. Two chances, then it gives up and renders nothing
// — a missing icon should leave no gap.
export default function Favicon({ url, faviconUrl, fills = true, alt }) {
  const declared = faviconUrl || null;
  const guessed = (() => {
    try {
      return new URL("/favicon.ico", url).toString();
    } catch {
      return null;
    }
  })();

  const [src, setSrc] = useState(declared || guessed);

  if (!src) return null;

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
