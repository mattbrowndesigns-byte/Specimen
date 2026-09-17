"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ModalShell from "./ModalShell";
import { useWorkRunning } from "./workInFlight";

// Something to do with the minute a capture takes.
//
// It is deliberately an Easter egg rather than a feature: a small ship in the
// corner that twitches every few seconds, and nothing that explains itself
// until you press it. The whole of the instructions is one line, because a
// game you have to read about is not a thing you play while waiting for a
// screenshot.
//
// Two rules it exists under. The launcher appears while work is in flight and
// goes when the work does -- but the game does not. Opening it is a decision,
// so closing it is one too, and a resource that describes itself in eight
// seconds must not slam the window on someone mid-round. And nothing here is a
// hardcoded colour: it is drawn from the same tokens as the rest of the app,
// which is what makes it work in both themes, and its bullets carry the
// capture bar's own gradient.

const SHIP_HALF = 11;
const SHIP_H = 22;
const SHIP_SPEED = 320; // px per second
const SHIP_BOTTOM = 26; // gap under the ship

const FIRE_MS = 190;
const BULLET_SPEED = 430;
const BULLET_LEN = 12;

const ROCK_MIN = 10;
const ROCK_MAX = 25;
const SPLIT_ABOVE = 16;
const SPAWN_START = 950;
const SPAWN_FLOOR = 330;
const ROCK_SLOW = 42;
const ROCK_FAST = 95;

const LIVES = 3;
const INVULN_MS = 1500;

// A tab that was in the background for a minute comes back with one enormous
// frame. Clamping the step means rocks step through the ship rather than
// teleporting past it.
const MAX_STEP = 0.05;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Nine vertices at jittered radii, kept on the rock so it is the same lump
// every frame rather than boiling.
function rockShape() {
  return Array.from({ length: 9 }, () => rand(0.74, 1.12));
}

function makeRock(w, hard) {
  const r = rand(ROCK_MIN, ROCK_MAX);
  return {
    x: rand(r, w - r),
    y: -r - 4,
    r,
    vx: rand(-26, 26),
    vy: rand(ROCK_SLOW, ROCK_FAST) * (1 + hard * 0.45),
    spin: rand(-1.1, 1.1),
    angle: rand(0, Math.PI * 2),
    shape: rockShape(),
  };
}

function makeStars(w, h) {
  return Array.from({ length: 46 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: rand(0.5, 1.4),
    a: rand(0.18, 0.7),
  }));
}

function createWorld(w, h) {
  return {
    w,
    h,
    shipX: w / 2,
    pointerX: null,
    bullets: [],
    rocks: [],
    sparks: [],
    stars: makeStars(w, h),
    score: 0,
    lives: LIVES,
    over: false,
    fireIn: 0,
    spawnIn: 500,
    invuln: 0,
    elapsed: 0,
  };
}

// Every colour comes from the stylesheet, so the game flips with the theme
// like everything else does.
function readPalette() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    bg: v("--surface-sunken") || "#f1f1f3",
    ink: v("--text") || "#1a1a1a",
    faint: v("--text-faint") || "#888",
    ship: v("--ramp-mid") || "#7b4bd8",
    ramp: [v("--ramp-deep"), v("--ramp-mid"), v("--ramp-warm"), v("--ramp-lit")],
    // Light ink on a dark field is a starfield; dark ink on a light one is
    // dust on the lens. Same dots either way, dimmer when they'd read as dirt.
    starFade: document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0.45,
  };
}

function Ship({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 L20 21 L12 17 L4 21 Z" fill="currentColor" />
    </svg>
  );
}

export default function Arcade() {
  const working = useWorkRunning();
  const [open, setOpen] = useState(false);

  // The launcher belongs to the wait; the game does not.
  if (!open && !working) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="arcade-launch"
          onClick={() => setOpen(true)}
          title="Shoot some rocks while you wait"
          aria-label="Play a game while this loads"
        >
          <Ship size={22} />
        </button>
      )}
      {open && <ArcadeGame onClose={() => setOpen(false)} />}
    </>
  );
}

function ArcadeGame({ onClose }) {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const keysRef = useRef(new Set());
  const paletteRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, lives: LIVES, over: false });

  const restart = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    worldRef.current = createWorld(world.w, world.h);
    setHud({ score: 0, lives: LIVES, over: false });
  }, []);

  // Arrow keys scroll the page underneath if nobody stops them, and the page
  // is still there behind the backdrop.
  useEffect(() => {
    function down(e) {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key.toLowerCase());
      }
    }
    function up(e) {
      keysRef.current.delete(e.key.toLowerCase());
    }
    function blur() {
      keysRef.current.clear();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Read the palette once, then again whenever the theme attribute flips.
  useEffect(() => {
    paletteRef.current = readPalette();
    const observer = new MutationObserver(() => {
      paletteRef.current = readPalette();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let last = 0;
    let stopped = false;

    // The world runs in CSS pixels and the backing store is scaled to the
    // display, so the same code draws crisply on a retina screen and on a
    // projector without knowing which it is on.
    function fit() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const world = worldRef.current;
      if (!world) {
        worldRef.current = createWorld(rect.width, rect.height);
      } else {
        world.w = rect.width;
        world.h = rect.height;
        world.shipX = Math.min(Math.max(world.shipX, SHIP_HALF), rect.width - SHIP_HALF);
        world.stars = makeStars(rect.width, rect.height);
      }
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    function step(dt) {
      const world = worldRef.current;
      const keys = keysRef.current;
      world.elapsed += dt;

      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      if (left !== right) {
        world.shipX += (right ? 1 : -1) * SHIP_SPEED * dt;
        world.pointerX = null;
      } else if (world.pointerX != null) {
        // Pointer control nobody is told about, because a trackpad is what is
        // under most hands when this appears.
        const gap = world.pointerX - world.shipX;
        const move = Math.sign(gap) * Math.min(Math.abs(gap), SHIP_SPEED * dt);
        world.shipX += move;
      }
      world.shipX = Math.min(Math.max(world.shipX, SHIP_HALF), world.w - SHIP_HALF);

      if (world.invuln > 0) world.invuln -= dt * 1000;

      if (!world.over) {
        world.fireIn -= dt * 1000;
        if (world.fireIn <= 0) {
          world.fireIn = FIRE_MS;
          world.bullets.push({ x: world.shipX, y: world.h - SHIP_BOTTOM - SHIP_H });
        }

        // Difficulty is a slow ramp on elapsed time, not on score: shooting
        // well should not be what makes it unplayable.
        const hard = Math.min(1, world.elapsed / 70);
        world.spawnIn -= dt * 1000;
        if (world.spawnIn <= 0) {
          world.spawnIn = SPAWN_START - (SPAWN_START - SPAWN_FLOOR) * hard;
          world.rocks.push(makeRock(world.w, hard));
        }
      }

      for (const b of world.bullets) b.y -= BULLET_SPEED * dt;
      world.bullets = world.bullets.filter((b) => b.y > -BULLET_LEN);

      for (const rock of world.rocks) {
        rock.x += rock.vx * dt;
        rock.y += rock.vy * dt;
        rock.angle += rock.spin * dt;
        if (rock.x < rock.r || rock.x > world.w - rock.r) rock.vx *= -1;
      }
      world.rocks = world.rocks.filter((rock) => rock.y - rock.r < world.h + 40);

      // Bullets against rocks.
      for (let i = world.rocks.length - 1; i >= 0; i -= 1) {
        const rock = world.rocks[i];
        for (let j = world.bullets.length - 1; j >= 0; j -= 1) {
          const b = world.bullets[j];
          const dx = b.x - rock.x;
          const dy = b.y - rock.y;
          if (dx * dx + dy * dy > rock.r * rock.r) continue;
          world.bullets.splice(j, 1);
          world.rocks.splice(i, 1);
          world.score += Math.round(30 - rock.r);
          burst(world, rock.x, rock.y, rock.r);
          if (rock.r > SPLIT_ABOVE) {
            for (let k = 0; k < 2; k += 1) {
              world.rocks.push({
                ...rock,
                r: rock.r * 0.56,
                vx: rock.vx + rand(-55, 55),
                vy: rock.vy * 1.12,
                spin: rand(-1.6, 1.6),
                shape: rockShape(),
              });
            }
          }
          break;
        }
      }

      // Rocks against the ship. A rock that makes it to the floor is just
      // gone -- only a collision costs anything, which keeps a quiet round
      // quiet instead of punishing you for standing still.
      if (!world.over && world.invuln <= 0) {
        const sx = world.shipX;
        const sy = world.h - SHIP_BOTTOM - SHIP_H / 2;
        for (let i = world.rocks.length - 1; i >= 0; i -= 1) {
          const rock = world.rocks[i];
          const dx = sx - rock.x;
          const dy = sy - rock.y;
          const reach = rock.r + SHIP_HALF * 0.8;
          if (dx * dx + dy * dy > reach * reach) continue;
          world.rocks.splice(i, 1);
          burst(world, sx, sy, 20);
          world.lives -= 1;
          world.invuln = INVULN_MS;
          if (world.lives <= 0) world.over = true;
          break;
        }
      }

      for (const s of world.sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
      }
      world.sparks = world.sparks.filter((s) => s.life > 0);
    }

    function burst(world, x, y, size) {
      const count = Math.round(4 + size / 4);
      for (let i = 0; i < count; i += 1) {
        const a = rand(0, Math.PI * 2);
        const speed = rand(30, 130);
        world.sparks.push({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: rand(0.25, 0.6),
          tone: Math.floor(rand(0, 4)),
        });
      }
    }

    function draw() {
      const world = worldRef.current;
      const p = paletteRef.current || readPalette();

      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, world.w, world.h);

      ctx.fillStyle = p.faint;
      for (const s of world.stars) {
        ctx.globalAlpha = s.a * p.starFade;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      for (const rock of world.rocks) {
        ctx.beginPath();
        const n = rock.shape.length;
        for (let i = 0; i < n; i += 1) {
          const a = rock.angle + (i / n) * Math.PI * 2;
          const rr = rock.r * rock.shape[i];
          const x = rock.x + Math.cos(a) * rr;
          const y = rock.y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // The capture bar's gradient, running along each shot with the lit end
      // leading. It is the one piece of colour in here, which is the point:
      // the ramp is what this app uses to say "something is happening".
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.ramp[3];
      for (const b of world.bullets) {
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + BULLET_LEN);
        g.addColorStop(0, p.ramp[3]);
        g.addColorStop(0.4, p.ramp[2]);
        g.addColorStop(0.75, p.ramp[1]);
        g.addColorStop(1, p.ramp[0]);
        ctx.fillStyle = g;
        // roundRect is Safari 16 and up; a square shot is a fine thing to
        // fall back to and better than a blank playfield.
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(b.x - 1.5, b.y, 3, BULLET_LEN, 1.5);
          ctx.fill();
        } else {
          ctx.fillRect(b.x - 1.5, b.y, 3, BULLET_LEN);
        }
      }
      ctx.shadowBlur = 0;

      for (const s of world.sparks) {
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2.2));
        ctx.fillStyle = p.ramp[s.tone] || p.ramp[1];
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      // Blinking while it cannot be hit, so a life lost reads as a state and
      // not as a glitch.
      const hidden = world.invuln > 0 && Math.floor(world.invuln / 110) % 2 === 0;
      if (!world.over && !hidden) {
        const y = world.h - SHIP_BOTTOM;
        ctx.fillStyle = p.ship;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.ship;
        ctx.beginPath();
        ctx.moveTo(world.shipX, y - SHIP_H);
        ctx.lineTo(world.shipX + SHIP_HALF, y);
        ctx.lineTo(world.shipX, y - SHIP_H * 0.28);
        ctx.lineTo(world.shipX - SHIP_HALF, y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function loop(now) {
      if (stopped) return;
      const dt = last ? Math.min((now - last) / 1000, MAX_STEP) : 0;
      last = now;
      if (dt > 0) step(dt);
      draw();

      const world = worldRef.current;
      setHud((prev) =>
        prev.score === world.score && prev.lives === world.lives && prev.over === world.over
          ? prev
          : { score: world.score, lives: world.lives, over: world.over },
      );

      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <ModalShell label="Rock shoot" className="arcade-modal" onClose={onClose}>
      <div className="modal-head arcade-head">
        <span className="arcade-score">{hud.score}</span>
        <span className="arcade-lives" aria-label={`${hud.lives} ships left`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "" : "arcade-life-spent"}>
              <Ship size={13} />
            </span>
          ))}
        </span>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="arcade-screen">
        <canvas
          ref={canvasRef}
          onPointerMove={(e) => {
            const world = worldRef.current;
            if (!world) return;
            world.pointerX = e.clientX - e.currentTarget.getBoundingClientRect().left;
          }}
          onPointerLeave={() => {
            if (worldRef.current) worldRef.current.pointerX = null;
          }}
        />
        {hud.over && (
          <div className="arcade-over">
            <p className="arcade-over-score">{hud.score}</p>
            <button className="arcade-again" onClick={restart}>
              Go again
            </button>
          </div>
        )}
      </div>

      <p className="arcade-hint">
        <kbd>←</kbd> <kbd>→</kbd> to move. It fires on its own.
      </p>
    </ModalShell>
  );
}
