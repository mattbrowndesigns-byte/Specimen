// The score, synthesised rather than licensed: nothing to attribute, nothing
// to clear, and it is written to the edit -- the drums drop as the window
// rises in, step out under the tagline, and the last chord lands on the logo.
//
//   node music.mjs        # writes public/music.wav
//
// Light, bright house at 120 BPM in D major: a plucked arpeggio through a
// ping-pong delay, an airy pad, offbeat bass, four on the floor.
import fs from "node:fs";
import path from "node:path";
import { BPM, BODY, INTRO, TAGLINE, TOTAL } from "./src/structure.js";

const SR = 44100;
const N = Math.ceil(TOTAL * SR) + SR; // a second of tail, faded by the edit
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const DROP = INTRO;
const BREAK = INTRO + BODY;
const HIT = BREAK + TAGLINE;

const L = new Float32Array(N);
const R = new Float32Array(N);
// Sends, processed once at the end.
const verbL = new Float32Array(N);
const verbR = new Float32Array(N);
const delayIn = new Float32Array(N);

// Deterministic noise, so a re-render is the same track.
let seed = 0x9e3779b9;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

// RBJ biquad, coefficients settable mid-stream.
function biquad(type, f, q = 0.707) {
  const s = { x1: 0, x2: 0, y1: 0, y2: 0 };
  s.set = (freq, qq = q) => {
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const a = Math.sin(w) / (2 * qq);
    const c = Math.cos(w);
    let b0, b1, b2;
    if (type === "lp") [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else [b0, b1, b2] = [a, 0, -a];
    const a0 = 1 + a;
    Object.assign(s, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 });
  };
  s.run = (x) => {
    const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
    s.x2 = s.x1;
    s.x1 = x;
    s.y2 = s.y1;
    s.y1 = y;
    return y;
  };
  s.set(f, q);
  return s;
}

function add(i, l, r, verb = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
  if (verb) {
    verbL[i] += l * verb;
    verbR[i] += r * verb;
  }
}

// --- harmony --------------------------------------------------------------
// | Dmaj9 | Bm11 | Gmaj9 | Aadd9 |, voiced close so the pad barely moves.
const CHORDS = [
  { root: 38, tones: [54, 57, 61, 64] },
  { root: 35, tones: [54, 57, 62, 64] },
  { root: 31, tones: [54, 57, 59, 62] },
  { root: 33, tones: [52, 57, 59, 61] },
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t) / BAR) % CHORDS.length];

// --- the kick, and the ducking everything else does around it -------------
const kicks = [];
for (let t = DROP; t < BREAK - 1e-6; t += BEAT) kicks.push(t);
kicks.push(HIT);
function duck(t) {
  let last = -10;
  for (const k of kicks) {
    if (k > t) break;
    last = k;
  }
  const d = t - last;
  return d < 0 || d > 0.5 ? 1 : 1 - 0.6 * Math.exp(-d / 0.11);
}

function kick(t0, gain = 0.95) {
  const start = Math.round(t0 * SR);
  let phase = 0;
  for (let n = 0; n < SR * 0.45; n++) {
    const t = n / SR;
    const f = 46 + 110 * Math.exp(-t / 0.035);
    phase += (TAU * f) / SR;
    const amp = Math.exp(-t / 0.16) * (t < 0.002 ? t / 0.002 : 1);
    const click = n < 90 ? noise() * 0.25 * (1 - n / 90) : 0;
    const v = (Math.sin(phase) * amp + click) * gain;
    add(start + n, v, v);
  }
}

function clap(t0, gain = 0.32) {
  const start = Math.round(t0 * SR);
  const bp = biquad("bp", 1400, 1.2);
  for (let n = 0; n < SR * 0.25; n++) {
    const t = n / SR;
    // Three quick slaps then the tail, which is what makes a clap a clap.
    const slap = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / 0.006) : 0), 0);
    const amp = slap * 0.5 + (t > 0.022 ? Math.exp(-(t - 0.022) / 0.08) : 0);
    const v = bp.run(noise()) * amp * gain;
    add(start + n, v, v, 0.35);
  }
}

function hat(t0, gain, decay = 0.035, pan = 0.15) {
  const start = Math.round(t0 * SR);
  const hp = biquad("hp", 7500, 0.9);
  for (let n = 0; n < SR * decay * 6; n++) {
    const v = hp.run(noise()) * Math.exp(-n / SR / decay) * gain;
    add(start + n, v * (1 - pan), v * (1 + pan), 0.08);
  }
}

function crash(t0, gain = 0.22, decay = 1.4) {
  const start = Math.round(t0 * SR);
  const hp = biquad("hp", 4500, 0.7);
  for (let n = 0; n < SR * decay * 4; n++) {
    const t = n / SR;
    const v = hp.run(noise()) * Math.exp(-t / decay) * gain;
    add(start + n, v * 0.9, v * 1.1, 0.3);
  }
}

// Noise swept up through a band-pass into a moment.
function riser(t0, t1, gain = 0.16) {
  const start = Math.round(t0 * SR);
  const len = Math.round((t1 - t0) * SR);
  const bp = biquad("bp", 300, 2);
  for (let n = 0; n < len; n++) {
    const k = n / len;
    if (n % 32 === 0) bp.set(300 + 7000 * k * k, 2.5);
    const v = bp.run(noise()) * k * k * gain;
    add(start + n, v * (1 - k * 0.4), v * (1 + k * 0.4), 0.4);
  }
}

// --- tone -----------------------------------------------------------------
// A bright pluck: a few harmonics with the top ones dying first.
function pluck(t0, midi, gain, pan = 0, decay = 0.2) {
  const start = Math.round(t0 * SR);
  const f = hz(midi);
  for (let n = 0; n < SR * decay * 5; n++) {
    const t = n / SR;
    const ph = TAU * f * t;
    const atk = t < 0.003 ? t / 0.003 : 1;
    const v =
      (Math.sin(ph) * Math.exp(-t / decay) +
        0.35 * Math.sin(2 * ph) * Math.exp(-t / (decay * 0.5)) +
        0.12 * Math.sin(3 * ph) * Math.exp(-t / (decay * 0.3)) +
        0.05 * Math.sin(4.01 * ph) * Math.exp(-t / 0.03)) *
      atk *
      gain;
    const i = start + n;
    if (i >= N) break;
    add(i, v * (1 - pan), v * (1 + pan), 0.18);
    delayIn[i] += v * 0.5;
  }
}

function bass(t0, midi, len, gain = 0.32) {
  const start = Math.round(t0 * SR);
  const f = hz(midi);
  const lp = biquad("lp", 420, 0.8);
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR;
    const ph = (f * t) % 1;
    const saw = 2 * ph - 1;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.22) * (t > len - 0.02 ? (len - t) / 0.02 : 1);
    const v = lp.run(Math.sin(TAU * f * t) * 0.8 + saw * 0.35) * env * gain * duck(t0 + t);
    add(start + n, v, v);
  }
}

// The pad: three detuned saws per note, low-passed, one bar per chord with a
// soft overlap, and its filter opened or closed by section.
function pad(from, to, cutoffAt, gain = 0.05) {
  for (let bar = Math.floor(from / BAR); bar * BAR < to; bar++) {
    const t0 = Math.max(from, bar * BAR);
    const t1 = Math.min(to, (bar + 1) * BAR);
    const chord = chordAt(t0 + 0.001);
    const start = Math.round(t0 * SR);
    const len = Math.round((t1 - t0 + 0.6) * SR);
    const filters = [biquad("lp", 1200, 0.6), biquad("lp", 1200, 0.6)];
    const phases = chord.tones.map(() => [0, 1, 2].map(() => (noise() + 1) / 2));
    for (let n = 0; n < len; n++) {
      const t = t0 + n / SR;
      if (n % 64 === 0) filters.forEach((f) => f.set(cutoffAt(t), 0.6));
      const held = t1 - t0;
      const local = n / SR;
      const env = Math.min(1, local / 0.35) * (local > held ? Math.max(0, 1 - (local - held) / 0.6) : 1);
      let l = 0;
      let r = 0;
      chord.tones.forEach((m, j) => {
        const f = hz(m);
        [-0.07, 0, 0.07].forEach((det, d) => {
          phases[j][d] = (phases[j][d] + (f * Math.pow(2, det / 12)) / SR) % 1;
          const s = 2 * phases[j][d] - 1;
          if (d === 0) l += s;
          else if (d === 2) r += s;
          else {
            l += s * 0.5;
            r += s * 0.5;
          }
        });
      });
      const dk = 0.55 + 0.45 * duck(t);
      add(start + n, filters[0].run(l) * env * gain * dk, filters[1].run(r) * env * gain * dk, 0.45);
    }
  }
}

// --- the arrangement ------------------------------------------------------
const ARP = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 2, 1, 3, 5, 4];
function arp(from, to, { gain = 0.11, sixteenths = true } = {}) {
  const step = BEAT / 4;
  for (let s = Math.round(from / step); s * step < to - 1e-6; s++) {
    const t = s * step;
    const i = s % 16;
    if (!sixteenths && i % 2) continue;
    const tones = chordAt(t + 0.001).tones.map((m) => m + 12);
    const ext = [...tones, tones[0] + 12, tones[1] + 12];
    const accent = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.8 : 0.55;
    pluck(t, ext[ARP[i]], gain * accent, i % 2 ? 0.35 : -0.35, 0.16);
  }
}

// Intro: the pad opens up under the title and the arp arrives in eighths,
// with a riser into the drop.
pad(0, DROP, (t) => 350 + 2400 * Math.pow(t / DROP, 2));
arp(BAR * 0.5, DROP, { gain: 0.09, sixteenths: false });
riser(BAR, DROP, 0.14);

// Body: everything in.
crash(DROP, 0.2);
pad(DROP, BREAK, () => 2600, 0.045);
arp(DROP, BREAK);
for (const k of kicks.filter((k) => k < BREAK)) kick(k);
for (let t = DROP; t < BREAK - 1e-6; t += BEAT) {
  const beatInBar = Math.round((t % BAR) / BEAT);
  if (beatInBar === 1 || beatInBar === 3) clap(t);
  hat(t + BEAT / 2, 0.14, 0.04);
  hat(t + BEAT / 4, 0.04, 0.025, -0.25);
  hat(t + (BEAT * 3) / 4, 0.05, 0.025, -0.25);
}
for (let t = DROP; t < BREAK - 1e-6; t += BEAT / 2) {
  const chord = chordAt(t + 0.001);
  const onBeat = Math.abs((t / BEAT) % 1) < 1e-6;
  bass(t, chord.root + 12 + (onBeat ? 0 : 0), onBeat ? 0.16 : 0.22, onBeat ? 0.22 : 0.32);
}
// A clap roll into the second half and into the break.
for (const end of [DROP + BAR * 8, BREAK]) {
  for (let i = 0; i < 4; i++) clap(end - BEAT + (i * BEAT) / 4, 0.12 + i * 0.05);
}
crash(DROP + BAR * 8, 0.14, 1.0);

// Break, under the tagline: drums out, the pad closes, the arp keeps going,
// and a riser into the logo.
pad(BREAK, HIT, (t) => 2600 - 1700 * ((t - BREAK) / TAGLINE), 0.07);
arp(BREAK, HIT, { gain: 0.12 });
riser(HIT - BAR, HIT, 0.18);

// The logo: one chord, struck and left to ring.
kick(HIT, 1);
crash(HIT, 0.24, 1.8);
pad(HIT, TOTAL + 0.5, () => 3200, 0.06);
const home = CHORDS[0];
[...home.tones.map((m) => m + 12), home.tones[0] + 24].forEach((m, i) => pluck(HIT + i * 0.035, m, 0.13, (i - 2) * 0.2, 0.9));
bass(HIT, home.root + 12, 1.8, 0.4);

// --- effects --------------------------------------------------------------
// Ping-pong delay on the plucks: dotted eighths, alternating sides.
{
  const d = Math.round(BEAT * 0.75 * SR);
  const lp = biquad("lp", 3500, 0.7);
  const bufL = new Float32Array(N);
  const bufR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const inL = i >= d ? delayIn[i - d] + bufR[i - d] * 0.42 : 0;
    const inR = i >= d ? bufL[i - d] * 0.9 : 0;
    bufL[i] = lp.run(inL);
    bufR[i] = inR;
    L[i] += bufL[i] * 0.28;
    R[i] += bufR[i] * 0.28;
    verbL[i] += bufL[i] * 0.1;
    verbR[i] += bufR[i] * 0.1;
  }
}

// A small Schroeder reverb: four damped combs and two all-passes a side.
function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422].map((n) => ({ buf: new Float32Array(n + offset), i: 0, store: 0 }));
  const alls = [556, 441].map((n) => ({ buf: new Float32Array(n + offset), i: 0 }));
  const outBuf = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.2;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * 0.7 + c.store * 0.3;
      c.buf[c.i] = x + c.store * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of alls) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = o - y;
    }
    outBuf[n] = y;
  }
  return outBuf;
}
const wetL = reverb(verbL, 0);
const wetR = reverb(verbR, 23);
for (let i = 0; i < N; i++) {
  L[i] += wetL[i] * 0.5;
  R[i] += wetR[i] * 0.5;
}

// --- master ---------------------------------------------------------------
const hpL = biquad("hp", 28);
const hpR = biquad("hp", 28);
// Gain-staged so the loudest moment (kick on bass) meets tanh at about 1.1:
// a touch of soft limiting on the peaks, never audible drive.
let raw = 0;
for (let i = 0; i < N; i++) {
  L[i] = hpL.run(L[i]);
  R[i] = hpR.run(R[i]);
  raw = Math.max(raw, Math.abs(L[i]), Math.abs(R[i]));
}
const drive = 1.1 / raw;
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * drive);
  R[i] = Math.tanh(R[i] * drive);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;

const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write("WAVE", 8);
pcm.write("fmt ", 12);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
const out = path.join(import.meta.dirname, "public", "music.wav");
fs.writeFileSync(out, pcm);
console.log(`${out}: ${(N / SR).toFixed(1)}s, raw peak ${raw.toFixed(2)}`);
