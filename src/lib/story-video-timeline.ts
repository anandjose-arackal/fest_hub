// Pure timing/geometry for the animated story poster (story-video.ts draws
// it). Everything is a function of time `t` in seconds so frames are
// deterministic.

// Every repeating effect has a period that divides VIDEO_SECONDS, so the
// video loops without a visible jump.
export const VIDEO_SECONDS = 15;
export const BURST_PERIOD = 5; // fireworks fire again every 5s
export const VIDEO_FPS = 30;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export function easeOutBack(x: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  const p = clamp01(x) - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

// Medal drops in from above the frame and settles with a small overshoot.
export const MEDAL_DROP = { start: 0.15, duration: 1.0 };
export function medalOffsetY(t: number, height: number): number {
  return (1 - easeOutBack((t - MEDAL_DROP.start) / MEDAL_DROP.duration)) * -(height + 40);
}

// A light band sweeps across the ribbon every `period` seconds; returns the
// band centre as 0..1 across the ribbon, or null between sweeps.
export const SHINE = { first: 1.0, period: 2.5, sweep: 0.9 };
export function shineProgress(t: number): number | null {
  if (t < SHINE.first) return null;
  const local = (t - SHINE.first) % SHINE.period;
  return local <= SHINE.sweep ? local / SHINE.sweep : null;
}

// Seeded PRNG so fireworks look the same in every recording.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Burst { x: number; y: number; at: number; colors: string[] }
export interface Spark { angle: number; speed: number; color: string }
export const BURSTS: Burst[] = [
  { x: 260, y: 520, at: 0.35, colors: ["#F2A51B", "#E8283A", "#FFC107"] },
  { x: 820, y: 400, at: 0.9, colors: ["#E8283A", "#1D4ED8", "#F2A51B"] },
];
export const BURST_LIFE = 1.6;

export function sparksFor(burstIndex: number, count = 60): Spark[] {
  const rnd = mulberry32(1000 + burstIndex);
  const colors = BURSTS[burstIndex].colors;
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2 + rnd() * 0.15,
    speed: 260 + rnd() * 220,
    color: colors[Math.floor(rnd() * colors.length)],
  }));
}

// Position and alpha of one spark `age` seconds after its burst (null when dead).
export function sparkAt(b: Burst, s: Spark, age: number): { x: number; y: number; alpha: number } | null {
  if (age < 0 || age > BURST_LIFE) return null;
  const drag = 1 - Math.exp(-2.2 * age);
  const dist = (s.speed / 2.2) * drag;
  return {
    x: b.x + Math.cos(s.angle) * dist,
    y: b.y + Math.sin(s.angle) * dist + 160 * age * age,
    alpha: 1 - age / BURST_LIFE,
  };
}

// Circuit traces: right-angle polylines across the poster. A glowing pulse
// travels each one, offset in time so they don't fire together.
export type Pt = [number, number];
// PCB-style traces: each starts at a side edge and wanders in a side band
// with right-angle and 45° turns. Seeded, so every video gets the same board.
const BAND = 210; // how far into the poster a trace may wander from its edge
function circuitFrom(seed: number, side: "left" | "right", y0: number): Pt[] {
  const rnd = mulberry32(seed);
  const dir = side === "left" ? 1 : -1;
  const edge = side === "left" ? 0 : 1080;
  let x = edge, y = y0;
  const pts: Pt[] = [[x, y]];
  const steps = 6 + Math.floor(rnd() * 5);
  for (let s = 0; s < steps; s++) {
    const kind = rnd();
    const len = 30 + rnd() * 90;
    if (kind < 0.4) x += dir * len; // inward/outward horizontal
    else if (kind < 0.75) y += (rnd() < 0.5 ? -1 : 1) * len; // vertical
    else { const d = (rnd() < 0.5 ? -1 : 1) * len * 0.7; x += dir * Math.abs(d); y += d; } // 45°
    x = side === "left" ? Math.min(Math.max(x, 12), BAND) : Math.max(Math.min(x, 1068), 1080 - BAND);
    y = Math.min(Math.max(y, 40), 1880);
    const last = pts[pts.length - 1];
    if (last[0] !== x || last[1] !== y) pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
}
export const CIRCUITS: Pt[][] = Array.from({ length: 22 }, (_, i) => {
  const side = i % 2 === 0 ? "left" : "right";
  return circuitFrom(77 + i * 13, side, 120 + Math.floor(i / 2) * 160 + (i % 2) * 70);
});
export const PULSE_PERIOD = 2.5;

export function pathLength(path: Pt[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return len;
}

// Point at distance d along the path (clamped to its ends).
export function pointAlong(path: Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (left <= seg) return [x0 + ((x1 - x0) * left) / seg, y0 + ((y1 - y0) * left) / seg];
    left -= seg;
  }
  return path[path.length - 1];
}

// Pulse head distance along circuit `i` at time t.
export function pulseHead(i: number, t: number): number {
  const phase = ((t + i * 0.55) % PULSE_PERIOD) / PULSE_PERIOD;
  return phase * pathLength(CIRCUITS[i]);
}
