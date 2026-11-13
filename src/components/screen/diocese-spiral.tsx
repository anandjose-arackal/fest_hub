"use client";

import { Fragment, useEffect, useState } from "react";
import { SargaSky } from "@/components/screen/sarga-backdrop";

// Podium idle scene, played just before the badge animation: the org's
// diocese names fly in from every screen edge in 3D, hold on a ring, turn
// into neon stars that spiral into the centre, and the arts-fest emblem
// bursts out of the flash. Ported from cml-badge/remotion/src/Intro.tsx.
// Authored on the 1920×1080 podium stage; plays once per mount (~DIOCESE_SPIRAL_MS).
// shortcut: one deployment-wide emblem at public/podium/arts-emblem.webp; move it to fest settings if another fest needs its own.
const EMBLEM = "/podium/arts-emblem.webp";

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;
// Wide ellipse for the 16:9 stage.
const RX = 640;
const RY = 400;
const FLY_END = 3.6; // names land on the ring
const HOLD_END = 4.8; // names stay readable until here
const SPIRAL_END = 6.8; // stars collapse into the centre
const TOTAL_S = 9.5;
export const DIOCESE_SPIRAL_MS = TOTAL_S * 1000;
// Portal neon (ourcml.in: --purple, --blue, --pink) plus the badge yellow.
const NEON = ["#8b5cf6", "#3b82f6", "#ec4899", "#ffdd1f"];
const TRAIL = [0.04, 0.08, 0.12, 0.16, 0.2, 0.24];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inCubic = (x: number) => x ** 3;
const inQuad = (x: number) => x * x;
const sine = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
const outBack = (x: number) => 1 + 2.5 * (x - 1) ** 3 + 1.5 * (x - 1) ** 2;
// Ease from `from` to `to` between seconds a and b.
const ramp = (t: number, a: number, b: number, from: number, to: number, ease = sine) => from + (to - from) * ease(clamp01((t - a) / (b - a)));

// Where name i of n sits at time t. Clockwise from the top: the first half
// down the right side, the second half up the left; each name gets its own
// height level (sides interleaved), so no two share a row on the ring.
function pos(i: number, n: number, t: number) {
  const right = i < n / 2;
  const level = right ? 2 * i : 2 * (n - 1 - i) + 1;
  const s = -1 + (2 * (level + 0.5)) / n;
  const a0 = right ? Math.asin(s) : Math.PI - Math.asin(s);
  const fly = ramp(t, 0.2 + i * 0.12, FLY_END, 0, 1, outCubic);
  const spiral = ramp(t, HOLD_END, SPIRAL_END, 0, 1, inCubic);
  const k = (1 + 2.5 * (1 - fly)) * (1 - spiral); // 3.5× the ring = off-screen at start
  const a = a0 + ramp(t, HOLD_END - 0.4, SPIRAL_END, 0, Math.PI * 3.5, inQuad);
  return { x: CX + RX * k * Math.cos(a), y: CY + RY * k * Math.sin(a), fly, a };
}

const glow = (c: string, k = 1) => `0 0 ${6 * k}px ${c}, 0 0 ${18 * k}px ${c}, 0 0 ${40 * k}px ${c}`;

export function DioceseSpiral({ names }: { names: string[] }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const s = (now - start) / 1000;
      setT(s);
      if (s < TOTAL_S) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = names.length;
  // Each name owns a row 2·RY/n tall; keep the text inside it.
  const fontSize = Math.min(58, Math.floor(((2 * RY) / n) * 1.7));
  const emblemIn = ramp(t, SPIRAL_END - 0.15, SPIRAL_END + 0.75, 0, 1, outBack);
  const flash = ramp(t, SPIRAL_END - 0.1, SPIRAL_END + 0.05, 0, 1) * ramp(t, SPIRAL_END + 0.05, SPIRAL_END + 0.6, 1, 0);
  const out = ramp(t, TOTAL_S - 0.5, TOTAL_S, 1, 0);

  return (
    <div aria-label="Dioceses" style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: out }}>
      <SargaSky />

      <div style={{ position: "absolute", inset: 0, perspective: 900 }}>
        {names.map((name, i) => {
          const c = NEON[i % NEON.length];
          const p = pos(i, n, t);
          const textOp = ramp(t, 0.2 + i * 0.12, 0.6 + i * 0.12, 0, 1) * ramp(t, HOLD_END + 0.2, HOLD_END + 1.0, 1, 0);
          const starOp = ramp(t, HOLD_END + 0.1, HOLD_END + 0.6, 0, 1) * ramp(t, SPIRAL_END - 0.1, SPIRAL_END + 0.1, 1, 0);
          // 3D: names start near the camera, tilted toward their own edge, then settle flat.
          const z = 600 * (1 - p.fly);
          const tiltY = 70 * Math.cos(p.a) * (1 - p.fly);
          const tiltX = -70 * Math.sin(p.a) * (1 - p.fly);
          const scale = 1 - 0.5 * ramp(t, HOLD_END, HOLD_END + 1.0, 0, 1);
          return (
            <Fragment key={name + i}>
              {starOp > 0 &&
                TRAIL.map((dt, k) => {
                  const q = pos(i, n, t - dt);
                  const s = 12 * (1 - k / TRAIL.length);
                  return <div key={k} aria-hidden="true" style={{ position: "absolute", left: q.x - s / 2, top: q.y - s / 2, width: s, height: s, borderRadius: "50%", background: c, opacity: starOp * 0.6 * (1 - k / TRAIL.length), boxShadow: glow(c, 0.6) }} />;
                })}
              {starOp > 0 && (
                <svg aria-hidden="true" width={48} height={48} viewBox="-22 -22 44 44" style={{ position: "absolute", left: p.x - 24, top: p.y - 24, opacity: starOp, filter: `drop-shadow(0 0 8px ${c}) drop-shadow(0 0 20px ${c})`, transform: `rotate(${t * 220}deg)` }}>
                  <path d="M0 -20 L5 -5 L20 0 L5 5 L0 20 L-5 5 L-20 0 L-5 -5 Z" fill="#fff" />
                </svg>
              )}
              <div
                className="fp-ml"
                style={{
                  position: "absolute", left: p.x, top: p.y, whiteSpace: "nowrap",
                  transform: `translate(-50%, -50%) translateZ(${z}px) rotateY(${tiltY}deg) rotateX(${tiltX}deg) scale(${scale})`,
                  opacity: textOp, fontSize, fontWeight: 800, letterSpacing: ".03em", color: "#fff", textShadow: glow(c),
                }}
              >
                {name}
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Flash where the stars meet */}
      <div aria-hidden="true" style={{ position: "absolute", left: CX - 600, top: CY - 600, width: 1200, height: 1200, borderRadius: "50%", background: "radial-gradient(circle, #fff 0%, #ec4899 25%, #8b5cf600 65%)", opacity: flash, transform: `scale(${0.3 + flash})` }} />

      {/* Emblem with a spinning neon ring */}
      <div style={{ position: "absolute", left: CX - 470, top: CY - 495, width: 940, height: 990, transform: `scale(${emblemIn})`, opacity: Math.min(1, emblemIn * 1.5) }}>
        <div aria-hidden="true" style={{ position: "absolute", left: 50, top: 190, width: 840, height: 840, borderRadius: "50%", background: `conic-gradient(from ${t * 40}deg, #8b5cf6, #3b82f6, #ec4899, #ffdd1f, #8b5cf6)`, filter: "blur(28px)", opacity: 0.85 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EMBLEM} alt="Arts fest emblem" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    </div>
  );
}
