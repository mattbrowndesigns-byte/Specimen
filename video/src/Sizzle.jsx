import { AbsoluteFill, Audio, Img, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadLalezar } from "@remotion/google-fonts/Lalezar";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import timeline from "../public/rec/timeline.json";
import { FPS, HIDDEN, INTRO, LOGO, SHOTS, TAGLINE, TOTAL_FRAMES, VIEW, unsqueeze } from "./shots";

// The wordmark's own face, and the headline face, as the app loads them.
const { fontFamily: lalezar } = loadLalezar();
const { fontFamily: figtree } = loadFigtree("normal", { weights: ["600", "800"] });

// Kivli's dark palette (app/globals.css, :root[data-theme="dark"]), so the
// reel is the same object as the app rather than a trailer for it.
const C = {
  bg: "#0c0c0f",
  page: "#121215",
  ink: "#f0eaf7",
  muted: "#9a9aa2",
  accent: "#f0603c",
  rampDeep: "#4a2d6b",
  rampMid: "#9a6ef0",
  rampWarm: "#f0603c",
  rampLit: "#ffa06b",
};

const W = 1920;
const H = 1080;

const frames = timeline.frames;
const pointer = timeline.pointer;
const clicks = pointer.filter((p) => p.click);

// The last painted frame at or before a moment. Screencast frames only arrive
// when something changes, so a still page is one frame held.
function frameAt(t) {
  const hide = HIDDEN.find(([a, b]) => t > a && t < b);
  if (hide) t = hide[0];
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

function pointerAt(t) {
  let last = null;
  for (const p of pointer) {
    if (p.t > t) break;
    last = p;
  }
  return last;
}

const sec = (s) => Math.round(s * FPS);
const INTRO_F = sec(INTRO);
const TAGLINE_F = sec(TAGLINE);
const LOGO_F = sec(LOGO);

// Where each shot sits on the output timeline.
const PLACED = (() => {
  let at = INTRO_F;
  return SHOTS.map((shot) => {
    const start = at;
    at += sec(shot.dur);
    return { ...shot, start, end: at };
  });
})();
const SHOTS_END = PLACED.at(-1).end;
const LOGO_START = SHOTS_END + TAGLINE_F;

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const smooth = Easing.bezier(0.45, 0, 0.2, 1);
const out = Easing.out(Easing.cubic);

function cameraFor(shot, k, srcT) {
  if (typeof shot.cam === "function") return shot.cam(srcT, k);
  const e = smooth(clamp01(k));
  const [a, b] = shot.cam;
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e) };
}

function Shot({ shot, local, punchIn = true, style }) {
  const length = shot.end - shot.start;
  const k = local / length;
  const srcT = unsqueeze(lerp(shot.cFrom, shot.cTo, k));

  // The camera, with a small push on the first frames of every shot so each
  // cut lands rather than appears.
  let r = cameraFor(shot, k, srcT);
  if (punchIn) {
    const punch = 1 + 0.045 * (1 - out(clamp01(local / 9)));
    r = { x: r.x + (r.w - r.w * punch) / 2, y: r.y + (r.h - r.h * punch) / 2, w: r.w * punch, h: r.h * punch };
  }

  const scale = W / r.w;
  const img = frameAt(srcT);

  // The pointer, drawn where the real one was, scaled with the page.
  const p = pointerAt(srcT);
  const click = clicks.findLast((c) => c.t <= srcT && srcT - c.t < 0.5);
  const pressed = click && srcT - click.t < 0.14;

  return (
    <AbsoluteFill style={{ overflow: "hidden", ...style }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: VIEW.width,
          height: VIEW.height,
          transformOrigin: "0 0",
          transform: `scale(${scale}) translate(${-r.x}px, ${-r.y}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            overflow: "hidden",
            background: C.page,
            boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(240, 234, 247, 0.10)",
          }}
        >
          <Img src={staticFile(`rec/${img.file}`)} style={{ width: VIEW.width, height: VIEW.height, display: "block" }} />
        </div>

        {click && (
          <div
            style={{
              position: "absolute",
              left: click.x,
              top: click.y,
              width: 46,
              height: 46,
              marginLeft: -23,
              marginTop: -23,
              borderRadius: "50%",
              border: `3px solid ${C.accent}`,
              opacity: 1 - (srcT - click.t) / 0.5,
              transform: `scale(${0.4 + ((srcT - click.t) / 0.5) * 1.1})`,
            }}
          />
        )}

        {p && (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            style={{
              position: "absolute",
              left: p.x - 5,
              top: p.y - 3,
              transformOrigin: "5px 3px",
              transform: `scale(${pressed ? 0.85 : 1})`,
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            }}
          >
            <path d="M5 3 L5 19 L9.2 15.2 L12 21.5 L14.6 20.4 L11.9 14.2 L17.5 14.2 Z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </AbsoluteFill>
  );
}

// Near-black with the ramp's two ends glowing out of opposite corners, very
// slowly drifting so a held title card is never a still image.
function Backdrop({ frame }) {
  const drift = Math.sin(frame / 90) * 40;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${12 + drift / 40}% ${6 + drift / 60}%, rgba(154, 110, 240, 0.16), transparent 70%),
          radial-gradient(1100px 760px at ${92 - drift / 40}% 98%, rgba(240, 96, 60, 0.12), transparent 70%), ${C.bg}`,
      }}
    />
  );
}

// One word at a time, rising out of a blur.
function Rise({ children, at, frame, style }) {
  const k = out(clamp01((frame - at) / 16));
  return (
    <span
      style={{
        display: "inline-block",
        opacity: k,
        transform: `translateY(${(1 - k) * 34}px)`,
        filter: `blur(${(1 - k) * 10}px)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function IntroCard({ frame }) {
  const words = ["Your", "visual", "inspiration", "library"];
  const leave = clamp01((frame - (INTRO_F - 18)) / 16);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: figtree,
          fontWeight: 800,
          fontSize: 108,
          letterSpacing: "-0.03em",
          color: C.ink,
          opacity: 1 - leave,
          transform: `translateY(${-leave * 30}px) scale(${1 + leave * 0.03})`,
          filter: `blur(${leave * 8}px)`,
          whiteSpace: "nowrap",
        }}
      >
        {words.map((word, i) => (
          <Rise key={word} at={10 + i * 6} frame={frame} style={{ marginRight: i < words.length - 1 ? "0.24em" : 0 }}>
            {word}
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function TaglineCard({ frame }) {
  const leave = clamp01((frame - (TAGLINE_F - 14)) / 14);
  const line = (words, at) =>
    words.map((word, i) => (
      <Rise key={word + i} at={at + i * 3} frame={frame} style={{ marginRight: i < words.length - 1 ? "0.24em" : 0 }}>
        {word}
      </Rise>
    ));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: figtree,
          fontWeight: 800,
          fontSize: 112,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          color: C.ink,
          textAlign: "center",
          opacity: 1 - leave,
          filter: `blur(${leave * 8}px)`,
          transform: `scale(${1 - leave * 0.02})`,
        }}
      >
        <div>{line(["Save", "what", "inspires", "you."], 8)}</div>
        <div>
          {line(["Find", "it", "when", "you", "need", "it."], 8 + sec(1.0))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// The wordmark, built the way app/_ui/Wordmark.js builds it: one span per
// letter for the warm sweep, and each i drawn twice and clipped -- stem below
// the cut, dot above it -- so the dot can hop while the stem stays put. The
// cut is the app's measured 18.45% (see CLAUDE.md), which only holds on a
// line box of exactly 1em.
const LETTERS = ["K", "i", "v", "l", "i"];
// The nav's hover exactly (globals.css, wordmark-warm and wordmark-hop):
// 55ms between letters, a 0.5s sweep, a 0.42s hop starting 40ms behind its
// letter. CSS applies `ease-out` to each keyframe segment separately, so both
// halves of each move ease out -- up and down alike.
const STEP = 0.055;
const SWEEP = 0.5;
const HOP = 0.42;
const HOP_LAG = 0.04;
const easeOut = Easing.bezier(0, 0, 0.58, 1);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, k) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
}

// A two-segment keyframe: 0 -> 1 by `peak`, back to 0 by the end, each
// segment eased out on its own.
function keyframe(t, length, peak) {
  if (t <= 0 || t >= length) return 0;
  const p = t / length;
  return p < peak ? easeOut(p / peak) : 1 - easeOut((p - peak) / (1 - peak));
}
// wordmark-warm: ink, accent at 40%, ink.
const warmth = (t) => keyframe(t, SWEEP, 0.4);
// wordmark-hop: up 0.11em at 45%, back down.
const hop = (t) => keyframe(t, HOP, 0.45);

function LogoCard({ frame }) {
  const k = out(clamp01(frame / 14));
  // The sweep starts on the next beat after the mark lands.
  const t = (frame - sec(0.5)) / FPS;
  const fade = clamp01((frame - (LOGO_F - 12)) / 12);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - fade }}>
      <div
        style={{
          fontFamily: lalezar,
          fontSize: 300,
          lineHeight: 1,
          letterSpacing: "0.005em",
          color: C.ink,
          opacity: k,
          transform: `translateY(${(1 - k) * 30}px) scale(${0.94 + k * 0.06})`,
          filter: `blur(${(1 - k) * 12}px)`,
          // Lalezar declares a descender "Kivli" never uses; this is the app's
          // em-based trim, so the mark centres on its ink rather than its box.
          marginBottom: "-0.307em",
          whiteSpace: "nowrap",
        }}
      >
        {LETTERS.map((letter, step) => {
          const lt = t - step * STEP;
          const color = mix(C.ink, C.accent, warmth(lt));
          if (letter !== "i") {
            return (
              <span key={step} style={{ color }}>
                {letter}
              </span>
            );
          }
          const lift = hop(lt - HOP_LAG) * 0.11;
          return (
            <span key={step} style={{ position: "relative", display: "inline-block", color }}>
              <span style={{ display: "inline-block", clipPath: "inset(18.45% 0 0 0)" }}>i</span>
              <span style={{ position: "absolute", left: 0, top: 0, clipPath: "inset(0 0 81.55% 0)", transform: `translateY(${-lift}em)` }}>i</span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function Sizzle() {
  const frame = useCurrentFrame();
  const shot = PLACED.find((s) => frame >= s.start && frame < s.end);
  const first = PLACED[0];
  const last = PLACED.at(-1);

  // The window rises in on the drop and sinks away under the tagline.
  const enter = shot === first ? out(clamp01((frame - first.start) / 14)) : 1;
  const leaving = frame >= SHOTS_END && frame < SHOTS_END + 16;
  const leave = leaving ? Easing.in(Easing.cubic)(clamp01((frame - SHOTS_END) / 16)) : 0;

  // Down to silence over the logo's last second.
  const volume = (f) => interpolate(f, [0, 6, TOTAL_FRAMES - sec(1.2), TOTAL_FRAMES], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Audio src={staticFile("music.wav")} volume={volume} />
      <Backdrop frame={frame} />
      {frame < INTRO_F && <IntroCard frame={frame} />}
      {shot && (
        <Shot
          shot={shot}
          local={frame - shot.start}
          punchIn={shot !== first}
          style={shot === first ? { opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${0.97 + enter * 0.03})` } : undefined}
        />
      )}
      {leaving && (
        <Shot
          shot={last}
          local={last.end - last.start - 1}
          punchIn={false}
          style={{ opacity: 1 - leave, transform: `scale(${1 - leave * 0.06})`, filter: `blur(${leave * 6}px)` }}
        />
      )}
      {frame >= SHOTS_END && frame < LOGO_START && <TaglineCard frame={frame - SHOTS_END} />}
      {frame >= LOGO_START && <LogoCard frame={frame - LOGO_START} />}
    </AbsoluteFill>
  );
}
