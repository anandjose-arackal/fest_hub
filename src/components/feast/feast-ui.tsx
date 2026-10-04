"use client";

// Championship design primitives for the Feast Portal (rankings, results,
// fests, registration). Visual tokens come from globals.css's "Championship
// design tokens" section via the fp-* utility classes and --fp-* variables,
// so every org theme (light or dark) renders these correctly.

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, Info } from "lucide-react";
import { DEFAULT_GRADE_POINTS, DEFAULT_POSITION_POINTS, GROUP_POSITION_POINTS } from "@/lib/result-calculator";
import { mix, theme } from "./feast-shared";

export type MedalPos = 1 | 2 | 3;
const MEDAL_CLASS: Record<MedalPos, string> = { 1: "fp-m-gold", 2: "fp-m-silver", 3: "fp-m-bronze" };
const TONE: Record<MedalPos, "gold" | "silver" | "bronze"> = { 1: "gold", 2: "silver", 3: "bronze" };

export function isMedalPos(n: number | null | undefined): n is MedalPos {
  return n === 1 || n === 2 || n === 3;
}

// Tinted row/card background + border for a podium position.
export function toneStyle(pos: MedalPos): { background: string; border: string } {
  const t = TONE[pos];
  return { background: `var(--fp-tone-${t}-bg)`, border: `1px solid var(--fp-tone-${t}-line)` };
}

export function toneTextClass(pos: MedalPos): string {
  return `fp-t-${TONE[pos]}`;
}

export function Medal({ pos, size = 30, tiny, label = true }: { pos: MedalPos; size?: number; tiny?: boolean; label?: boolean }) {
  return (
    <span
      className={`fp-medal ${MEDAL_CLASS[pos]} ${tiny ? "fp-m-tiny" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      aria-label={label ? `${pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"} place` : undefined}
      role={label ? "img" : undefined}
    >
      {label && !tiny ? pos : null}
    </span>
  );
}

// Medal hanging from a two-tail ribbon — podium and big result cards only.
export function RibbonMedal({ pos, size }: { pos: MedalPos; size: number }) {
  const tailW = Math.round(size * 0.24);
  const tailH = Math.round(size * 0.58);
  const inset = Math.round(size * 0.2);
  return (
    <span aria-hidden="true" className="relative block" style={{ width: size + 4, height: size + tailH * 0.5 }}>
      <span className="fp-ribbon absolute top-0 rounded-[2px]" style={{ left: inset, width: tailW, height: tailH, transform: "skewX(16deg)" }} />
      <span className="fp-ribbon absolute top-0 rounded-[2px]" style={{ right: inset, width: tailW, height: tailH, transform: "skewX(-16deg)" }} />
      <span className={`fp-medal ${MEDAL_CLASS[pos]} absolute bottom-0 left-[2px]`} style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}>
        {pos}
      </span>
    </span>
  );
}

export function MedalCounts({ g, s, b, size = 12, className }: { g: number; s: number; b: number; size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-3 font-bold tabular-nums ${className ?? ""}`} style={{ color: theme.sub }}>
      {([[1, g, "gold"], [2, s, "silver"], [3, b, "bronze"]] as const).map(([p, n, word]) => (
        <span key={p} className="inline-flex items-center gap-[5px]">
          <Medal pos={p} size={size} tiny label={false} />
          {n}
          <span className="sr-only">{word}</span>
        </span>
      ))}
    </span>
  );
}

// Grade badge. `surface` follows the theme (works on light and dark pages);
// `award` is for the always-light award card.
export function GradeBadge({ grade, size = 32, variant = "surface" }: { grade: "A" | "B" | "C" | null; size?: number; variant?: "surface" | "award" }) {
  const award = variant === "award";
  const style: React.CSSProperties =
    grade === "A"
      ? { background: award ? "#4B31B3" : "var(--fp-ga-bg)", color: award ? "#FFE08A" : "var(--fp-ga-fg)" }
      : grade === "B"
        ? { background: award ? "#E6E0FF" : "var(--fp-gb-bg)", color: award ? "#4B31B3" : "var(--fp-gb-fg)" }
        : grade === "C"
          ? { border: `1.5px solid ${award ? "#4B31B3" : "var(--fp-gc-line)"}`, color: award ? "#4B31B3" : "var(--fp-gc-fg)" }
          : { background: theme.surface3, color: theme.faint };
  return (
    <span
      className="fp-num inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.5), fontWeight: 900, ...style }}
      aria-label={grade ? `Grade ${grade}` : "No grade"}
    >
      {grade ?? "–"}
    </span>
  );
}

export function LivePill({ label = "LIVE", detail, small }: { label?: string; detail?: string; small?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full"
      style={{ height: small ? 26 : 30, padding: small ? "0 10px" : "0 12px 0 10px", background: "var(--fp-live-bg)", border: "1px solid var(--fp-live-line)", color: theme.text }}
    >
      <span className="fp-livedot" style={{ width: small ? 7 : 8, height: small ? 7 : 8 }} />
      <span className="text-[11px] font-extrabold tracking-[0.16em]">{label}</span>
      {detail && <span className="text-[12px] font-semibold" style={{ color: theme.sub }}>{detail}</span>}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="fp-cap" style={{ color: theme.goldInk, letterSpacing: "0.22em" }}>{children}</span>
      <span aria-hidden="true" className="h-px max-w-[180px] flex-1" style={{ background: `linear-gradient(90deg, ${theme.line2}, transparent)` }} />
    </div>
  );
}

// Filter chip. `on` uses the theme's active-chip gradient unless an explicit
// color pair (category tabs) is given.
export function Chip({
  on, onClick, children, dot, from, to, className, ml,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
  from?: string;
  to?: string;
  className?: string;
  ml?: boolean;
}) {
  const activeBg = from ? `linear-gradient(135deg, ${from}, ${to ?? from})` : "var(--fp-chip-on)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`${ml ? "fp-ml" : ""} inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors ${className ?? ""}`}
      style={
        on
          ? { background: activeBg, color: from ? "var(--fp-on-cat)" : "var(--fp-chip-on-fg)", border: "1px solid transparent" }
          : { background: theme.surface, color: theme.sub, border: `1px solid ${theme.line2}` }
      }
    >
      {dot && <span className="h-[7px] w-[7px] rounded-full" style={{ background: on ? "currentColor" : dot }} />}
      {children}
    </button>
  );
}

export function Sparkle({ size, color, className, style }: { size: number; color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span aria-hidden="true" className={`fp-twinkle absolute ${className ?? ""}`} style={{ color, ...style }}>
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path fill="currentColor" d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
      </svg>
    </span>
  );
}

export function ProgressBar({ pct, fill, height = 6, track = "var(--fp-track)", animate = true }: { pct: number; fill: string; height?: number; track?: string; animate?: boolean }) {
  return (
    <div className="overflow-hidden rounded-full" style={{ height, background: track }}>
      <div className={animate ? "fp-grow h-full rounded-full" : "h-full rounded-full"} style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: fill }} />
    </div>
  );
}

// Category points bar with a luminous tip — used in the shakha stats panel.
export function CategoryBar({ label, color, pts, pct, rank, delay = 0 }: { label: string; color: string; pts: number; pct: number; rank: number | null; delay?: number }) {
  const first = rank === 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${mix(color, 50)}` }} />
        <span className="fp-cap flex-1 text-[11px] tracking-[0.13em]" style={{ color: theme.text }}>{label}</span>
        {rank != null && (
          <span
            className="inline-flex h-[22px] items-center rounded-md px-[7px] text-[11px] font-extrabold"
            style={first ? { background: "var(--fp-note-bg)", color: theme.goldInk, border: "1px solid var(--fp-note-line)" } : { background: theme.surface3, color: theme.sub, border: `1px solid ${theme.line}` }}
          >
            #{rank}
          </span>
        )}
        <span className="fp-num w-9 text-right text-[21px]">{pts}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "var(--fp-track)" }}>
        <div
          className="fp-grow relative h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: `linear-gradient(90deg, ${mix(color, 30)}, ${color})`, boxShadow: `0 0 12px ${mix(color, 50)}`, animationDelay: `${delay}s` }}
        >
          <span className="absolute right-px top-px h-1.5 w-1.5 rounded-full bg-white opacity-85" />
        </div>
      </div>
    </div>
  );
}

// "How points are calculated" — values come straight from result-calculator's
// defaults; the A/B/C cutoffs mirror calcGrade (60/50/40% of max score).
export function PointsRules() {
  const [open, setOpen] = useState(false);
  const pos = DEFAULT_POSITION_POINTS;
  const grade = DEFAULT_GRADE_POINTS;
  const group = GROUP_POSITION_POINTS;
  return (
    <div className="rounded-[14px]" style={{ background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[46px] w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-extrabold"
        style={{ color: theme.goldInk }}
      >
        <Info className="h-[17px] w-[17px] shrink-0" />
        <span className="flex-1">How points are calculated</span>
        <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div className="fp-fade-in flex flex-col gap-3 px-3.5 pb-3.5">
          <div className="grid grid-cols-2 gap-[18px]">
            <div className="flex flex-col gap-2">
              <span className="fp-cap text-[10px]" style={{ color: theme.sub }}>Placement</span>
              {([[1, pos.first, "1st"], [2, pos.second, "2nd"], [3, pos.third, "3rd"]] as const).map(([p, v, l]) => (
                <div key={p} className="flex items-center gap-2 text-[13px] font-bold">
                  <Medal pos={p} size={18} label={false} />
                  <span className="flex-1" style={{ color: theme.sub }}>{l}</span>
                  <span className="fp-num text-[17px]" style={{ color: theme.goldInk }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="fp-cap text-[10px]" style={{ color: theme.sub }}>Grade</span>
              {([["A", grade.A, "60%+"], ["B", grade.B, "50%+"], ["C", grade.C, "40%+"]] as const).map(([g, v, l]) => (
                <div key={g} className="flex items-center gap-2 text-[13px] font-bold">
                  <GradeBadge grade={g} size={18} />
                  <span className="flex-1" style={{ color: theme.sub }}>{l}</span>
                  <span className="fp-num text-[17px]" style={{ color: theme.goldInk }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="m-0 text-[12px] font-semibold leading-relaxed" style={{ color: theme.sub }}>
            Every entry adds its placement points plus its grade points to the shakha. Group items award {group.first} · {group.second} · {group.third} for placement.
          </p>
        </div>
      )}
    </div>
  );
}

export function useCountUp(target: number, duration = 1100, active = true): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return active ? val : 0;
}

// Viewport media query — false on the server and first client render, so
// layouts that branch on it must render a sensible mobile-first default.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
