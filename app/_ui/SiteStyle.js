"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

// What the site is built out of: the colours it paints and the typefaces it
// sets. Measured in a real browser by analyze.js, so these are the colours the
// interface actually shows rather than the ones its stylesheet declares -- and
// photographs are excluded, which is the whole point. A palette pulled from
// pixels would report the model's jumper in the hero shot.

// Widths are compressed, shares are not.
//
// Painted area is brutally top-heavy: a page background routinely holds 80% of
// it, which as a literal bar is one long white rectangle and five slivers. The
// exponent pulls the tail up enough to see while leaving the order and the
// rough proportions intact, and the real number is on every swatch, so nothing
// is hidden -- the bar is for reading hierarchy at a glance, not for measuring.
const COMPRESSION = 0.55;

const pct = (n) => `${n < 0.01 ? "<1" : Math.round(n * 100)}%`;

// Enough contrast to put a label on the swatch. Rec. 601 luma is the cheap
// version and it's the right cheap version here: it over-weights green, which
// is what the eye does.
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

const ROLE_LABEL = {
  background: "Background",
  text: "Text",
  border: "Borders",
  graphic: "Icons & graphics",
};

function fontRole(font) {
  const d = font.display_share;
  if (typeof d !== "number") return null;
  if (d >= 0.6) return "Headings";
  if (d <= 0.15) return "Body";
  return "Headings & body";
}

export default function SiteStyle({ site, onRefresh }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [hovered, setHovered] = useState(null);
  const startedAt = useRef(null);

  const palette = Array.isArray(site.palette) ? site.palette : [];
  const fonts = Array.isArray(site.fonts) ? site.fonts : [];
  const analyzed = Boolean(site.analyzed_at);

  // Held in a ref because the parent rebuilds this function on every render,
  // and the poll below must not depend on it: each refresh sets state, which
  // re-renders, which would tear the interval down and restart its clock --
  // so it would never reach five seconds and never poll again.
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  // The run happens on a GitHub Actions runner and reports back to the app, so
  // there's nothing to await here -- the row changing under us is the signal.
  useEffect(() => {
    if (!analyzing) return;
    const poll = setInterval(() => {
      if (Date.now() - startedAt.current.at > 4 * 60 * 1000) {
        setAnalyzing(false);
        setError("That took longer than expected. The run may still finish — reload in a minute.");
        return;
      }
      refresh.current?.();
    }, 5000);
    return () => clearInterval(poll);
  }, [analyzing]);

  // A fresh analyzed_at is the run reporting in. Comparing against the stamp
  // taken when the run started is what makes this work on a re-read, where the
  // column was already set.
  useEffect(() => {
    if (analyzing && site.analyzed_at && site.analyzed_at !== startedAt.current?.stamp) {
      setAnalyzing(false);
    }
  }, [site.analyzed_at, analyzing]);

  async function analyze() {
    setError(null);
    startedAt.current = { at: Date.now(), stamp: site.analyzed_at || null };
    setAnalyzing(true);
    const res = await fetch(`/api/sites/${site.id}/analyze`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't start the style read");
      setAnalyzing(false);
    }
  }

  async function copyHex(hex) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1400);
    } catch {
      // Clipboard is blocked in some contexts; the hex is on screen regardless.
    }
  }

  const weights = palette.map((c) => Math.pow(c.share, COMPRESSION));
  const weightTotal = weights.reduce((a, b) => a + b, 0) || 1;
  const shown = palette.find((c) => c.hex === hovered) || null;

  return (
    <>
      {palette.length > 0 && (
        <section className="detail-section">
          <div className="section-head">
            <h2>Colours</h2>
            <span className="section-count">{palette.length}</span>
          </div>

          <div className="palette-bar">
            {palette.map((color, i) => (
              <button
                key={color.hex}
                className="palette-swatch"
                style={{ flexGrow: weights[i] / weightTotal, background: color.hex }}
                title={`${color.hex} — ${pct(color.share)} of the interface · ${
                  ROLE_LABEL[color.role] || color.role
                }`}
                onMouseEnter={() => setHovered(color.hex)}
                onMouseLeave={() => setHovered((h) => (h === color.hex ? null : h))}
                onFocus={() => setHovered(color.hex)}
                onBlur={() => setHovered((h) => (h === color.hex ? null : h))}
                onClick={() => copyHex(color.hex)}
                aria-label={`${color.hex}, ${pct(color.share)} of the interface. Click to copy.`}
              >
                <span className={isLight(color.hex) ? "palette-tick palette-tick-dark" : "palette-tick"}>
                  {copied === color.hex ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>

          {/* One caption that changes rather than eight labels that don't fit.
              It holds the row's height steady so hovering doesn't reflow the
              panel underneath. */}
          <p className="palette-caption">
            {shown ? (
              <>
                <span className="palette-caption-hex">{shown.hex}</span>
                <span>
                  {pct(shown.share)} of the interface · {ROLE_LABEL[shown.role] || shown.role}
                </span>
              </>
            ) : (
              <span className="palette-caption-idle">Sized by share of the interface · click to copy</span>
            )}
          </p>
        </section>
      )}

      {fonts.length > 0 && (
        <section className="detail-section">
          <div className="section-head">
            <h2>Fonts in use</h2>
            <span className="section-count">{fonts.length}</span>
          </div>

          <ul className="font-list">
            {fonts.map((font) => {
              const name = font.display_name || font.family;
              const role = fontRole(font);
              return (
                <li className="font-row" key={font.family}>
                  <span className="font-name">
                    {font.foundry_url ? (
                      <a href={font.foundry_url} target="_blank" rel="noopener noreferrer">
                        {name}
                        <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      name
                    )}
                    {font.foundry && <span className="font-foundry">by {font.foundry}</span>}
                    {font.is_custom && <span className="font-badge">Custom</span>}
                  </span>

                  <span className="font-meta">
                    {[font.classification, role, `${pct(font.share)} of text`].filter(Boolean).join(" · ")}
                  </span>

                  {(font.google || font.adobe) && (
                    <span className="font-matches">
                      {font.google && (
                        <a
                          className="font-match"
                          href={font.google.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={font.google.note || undefined}
                        >
                          {font.google.self ? "On Google Fonts" : `Google: ${font.google.family}`}
                        </a>
                      )}
                      {font.adobe && (
                        <a
                          className="font-match"
                          href={font.adobe.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={font.adobe.note || undefined}
                        >
                          {font.adobe.self ? "On Adobe Fonts" : `Adobe: ${font.adobe.family}`}
                        </a>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* One control for both sections, since one run produces both. */}
      <section className="detail-section">
        {!analyzed && !analyzing && palette.length === 0 && fonts.length === 0 && (
          <p className="style-empty">This site&rsquo;s colours and type haven&rsquo;t been read yet.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="link-btn" onClick={analyze} disabled={analyzing}>
          {analyzing
            ? "Reading the page…"
            : analyzed
              ? "Re-read colours & type"
              : "Read colours & type"}
        </button>
      </section>
    </>
  );
}
