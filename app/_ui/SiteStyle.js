"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { colorName } from "@/lib/colorNames";
import { formatCaptureDate } from "@/lib/captures";

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
// rough proportions intact, and the real number is on every swatch and in the
// expanded list, so nothing is hidden -- the bar reads hierarchy at a glance,
// it isn't a measuring device.
const COMPRESSION = 0.55;

const pct = (n) => `${n < 0.01 ? "<1" : Math.round(n * 100)}%`;

// Enough contrast to put a tick on the swatch. Rec. 601 luma is the cheap
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

// The generic to fall back to when the real face isn't available to the
// viewer, so a serif at least stays a serif.
function genericFor(classification) {
  const c = (classification || "").toLowerCase();
  if (c.includes("mono")) return "monospace";
  if (c.includes("serif") && !c.includes("sans")) return "serif";
  if (c.includes("slab")) return "serif";
  return "sans-serif";
}

// The specimen renders in the real typeface when the real typeface is
// something the browser can be given: a face that's on Google Fonts gets
// loaded from there. Everything else falls back through the family name --
// which does render for anyone who happens to have it installed -- and then to
// a generic of the right species. A licensed face can't be shown, and showing
// the wrong one silently would be worse than showing a substitute.
function sampleStack(font) {
  const names = [font.display_name, font.family].filter(Boolean);
  return [...new Set(names)].map((n) => `"${n}"`).concat(genericFor(font.classification)).join(", ");
}

// What a designer actually wants to know: what's the headline set in, and
// what's everything else set in. A percentage answered a question nobody
// asked -- "87% of the text" only ever restates "this is the body face".
const ROLE_NAME = {
  headline: "Headline",
  body: "Body & UI",
  "headline-body": "Headline & Body",
  accent: "Accent",
};

function fontRole(font) {
  if (font.role) return ROLE_NAME[font.role] || null;
  // Readings taken before roles existed still carry the old measurement.
  const d = font.display_share;
  if (typeof d !== "number") return null;
  if (d >= 0.6) return "Headline";
  if (d <= 0.15) return "Body & UI";
  return "Headline & Body";
}

// Two claims that must not sit under one label. "This typeface is on Google
// Fonts" and "this is the nearest thing on Google Fonts to one you can't have"
// lead to opposite next actions, so they're grouped and labelled separately.
function matchGroups(font) {
  const available = [];
  const closest = [];
  for (const [service, match] of [
    ["Google Fonts", font.google],
    ["Adobe Fonts", font.adobe],
  ]) {
    if (!match) continue;
    (match.self ? available : closest).push({ service, ...match });
  }
  return [
    { key: "available", label: "Available On", items: available },
    { key: "closest", label: "Closest Match", items: closest },
  ].filter((group) => group.items.length);
}

export default function SiteStyle({ site, onRefresh }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const startedAt = useRef(null);

  const palette = Array.isArray(site.palette) ? site.palette : [];
  const fonts = Array.isArray(site.fonts) ? site.fonts : [];
  const history = Array.isArray(site.style_history) ? site.style_history : [];
  const analyzed = Boolean(site.analyzed_at);

  // Held in a ref because the parent rebuilds this function on every render,
  // and the poll below must not depend on it: each refresh sets state, which
  // re-renders, which would tear the interval down and restart its clock -- so
  // it would never reach five seconds and never poll again.
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

  // Pull the web-font file for any face that's on Google Fonts, so its
  // specimen is the actual typeface rather than a stand-in. Same trade as the
  // favicon service: it tells Google which faces are in the library, and it's
  // the only way to render them truthfully without hosting anything.
  useEffect(() => {
    const families = fonts
      .filter((f) => f.google?.self)
      .map((f) => (f.display_name || f.family).trim())
      .filter(Boolean);
    if (!families.length) return;

    const href = `https://fonts.googleapis.com/css2?${families
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600`)
      .join("&")}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [fonts]);

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

  // The most recent reading whose typefaces differ from today's. A site
  // redesigning is exactly what a library like this should notice, and the
  // previous names are more use in front of you than buried in a column.
  const nameFonts = (list) => (list || []).map((f) => f.display_name || f.family).join(", ");
  const previousFonts = history.find(
    (entry) => entry.fonts?.length && nameFonts(entry.fonts) !== nameFonts(fonts)
  );

  return (
    <>
      {palette.length > 0 && (
        <section className="detail-section">
          <h2>
            Colours <span className="section-count">{palette.length}</span>
          </h2>

          <div className="palette-bar">
            {palette.map((color, i) => (
              <button
                key={color.hex}
                className="palette-swatch"
                style={{ flexGrow: weights[i] / weightTotal, background: color.hex }}
                title={`${colorName(color.hex)} ${color.hex} — ${pct(color.share)} of the interface · ${
                  ROLE_LABEL[color.role] || color.role
                }`}
                onMouseEnter={() => setHovered(color.hex)}
                onMouseLeave={() => setHovered((h) => (h === color.hex ? null : h))}
                onFocus={() => setHovered(color.hex)}
                onBlur={() => setHovered((h) => (h === color.hex ? null : h))}
                onClick={() => copyHex(color.hex)}
                aria-label={`${colorName(color.hex)}, ${color.hex}, ${pct(color.share)} of the interface. Copy.`}
              >
                {copied === color.hex && (
                  <Check size={13} className={isLight(color.hex) ? "palette-tick-dark" : "palette-tick"} />
                )}
              </button>
            ))}
          </div>

          {/* One caption that changes rather than eight labels that don't fit.
              Fixed height, so running along the bar doesn't shift the panel. */}
          {/* The caption and the control share a row: Expand belongs under the
              thing it expands, not up beside a heading it has nothing to do
              with, and the row has to exist anyway to hold the readout. */}
          <div className="palette-foot">
            <p className="palette-caption">
              {shown ? (
                <>
                  <span className="palette-caption-hex">{shown.hex}</span>
                  <span>
                    {colorName(shown.hex)} · {pct(shown.share)} · {ROLE_LABEL[shown.role] || shown.role}
                  </span>
                </>
              ) : (
                <span className="palette-caption-idle">Click to copy</span>
              )}
            </p>
            <div className="section-head-actions">
              <button onClick={() => setExpanded((v) => !v)}>{expanded ? "Collapse" : "Expand"}</button>
            </div>
          </div>

          {expanded && (
            <ul className="palette-list">
              {palette.map((color) => (
                <li key={color.hex}>
                  <span className="palette-list-chip" style={{ background: color.hex }} />
                  <span className="palette-list-name">{colorName(color.hex)}</span>
                  <span className="palette-list-share">{pct(color.share)}</span>
                  <span className="palette-list-hex">{color.hex}</span>
                  <button
                    className="icon-btn palette-copy"
                    onClick={() => copyHex(color.hex)}
                    title={`Copy ${color.hex}`}
                    aria-label={`Copy ${color.hex}`}
                  >
                    {copied === color.hex ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {fonts.length > 0 && (
        <section className="detail-section">
          <h2>
            Fonts in Use <span className="section-count">{fonts.length}</span>
          </h2>

          <ul className="font-list">
            {fonts.map((font) => {
              const name = font.display_name || font.family;
              const role = fontRole(font);
              const groups = matchGroups(font);
              return (
                <li className="font-card" key={font.family}>
                  {/* The specimen carries the answer to the question the panel
                      is actually asked -- what does it look like -- which no
                      amount of naming does on its own.
                      
                      When analyze.js managed to draw the real letterforms off
                      the live page, they're a PNG used as a mask, so they take
                      the app's own text colour in either theme. Otherwise this
                      falls back to naming the family and hoping the reader has
                      it installed, which is honest about being a stand-in. */}
                  {font.specimen?.src ? (
                    <span
                      className="font-sample font-sample-real"
                      style={{ "--specimen": `url(${font.specimen.src})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="font-sample" style={{ fontFamily: sampleStack(font) }} aria-hidden="true">
                      Aa
                    </span>
                  )}

                  <div className="font-detail">
                    <span className="font-name">
                      {font.foundry_url ? (
                        <a href={font.foundry_url} target="_blank" rel="noopener noreferrer">
                          {name}
                          <ArrowUpRight size={13} />
                        </a>
                      ) : (
                        name
                      )}
                      {font.is_custom && <span className="font-badge">Custom</span>}
                    </span>

                    {font.foundry && <span className="font-foundry">by {font.foundry}</span>}

                    <span className="font-meta">
                      {[role, font.classification].filter(Boolean).join(" · ")}
                    </span>

                    {groups.map((group) => (
                      <span className="font-match-group" key={group.key}>
                        <span className="font-match-label">{group.label}</span>
                        <span className="font-matches">
                          {group.items.map((item) => (
                            <a
                              className="font-match"
                              key={item.service}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={item.note || undefined}
                            >
                              <span className="font-match-service">{item.service}</span>
                              {!item.self && <span className="font-match-family">{item.family}</span>}
                            </a>
                          ))}
                        </span>
                      </span>
                    ))}

                    {/* Saying so beats saying nothing. An empty space where the
                        links usually are reads as a bug rather than an answer,
                        and "we looked and there isn't one" is an answer. */}
                    {!groups.length && (
                      <span className="font-no-match">No close match found on Google or Adobe Fonts</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {previousFonts && (
            <p className="style-changed">
              Type changed since {formatCaptureDate(previousFonts.analyzed_at)} — was{" "}
              {nameFonts(previousFonts.fonts)}
            </p>
          )}
        </section>
      )}

      {/* One control for both sections, since one run produces both. */}
      <div className="style-actions">
        {!analyzed && !analyzing && palette.length === 0 && fonts.length === 0 && (
          <p className="style-empty">This site&rsquo;s colours and type haven&rsquo;t been read yet.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="link-btn" onClick={analyze} disabled={analyzing}>
          {analyzing ? "Reading the Page…" : analyzed ? "Re-read Colours & Type" : "Read Colours & Type"}
        </button>
        {analyzed && !analyzing && (
          <span className="style-read-at">Read {formatCaptureDate(site.analyzed_at)}</span>
        )}
      </div>
    </>
  );
}
