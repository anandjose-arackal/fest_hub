"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Trophy, Sparkles, Medal, Search, Home,
  Loader2, type LucideIcon,
} from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";

// The Feast Portal's own palette — resolved once from the source app's
// single production theme instantiation (aurora-glass/dusk/28). Since this
// is now a standalone product with one fixed theme (not a Mission Hub
// sub-app taking a parent theme prop), this is a flat constant rather than
// a buildFeastTheme(parent) function.
export const theme = {
  radius: 28,
  text: "#1E1B4B",
  sub: "#6B6792",
  faint: "#9D99BC",
  gold: "#F5C542",
  purple: "#6B46FF",
  lavender: "#A78BFA",
  pink: "#EC4899",
  cyan: "#0EA5C4",
  fill: "#F1EEFB",
  fillStrong: "rgba(107,70,255,0.10)",
  hairline: "rgba(30,27,75,0.07)",
  track: "rgba(30,27,75,0.08)",
  softShadow: "0 14px 32px rgba(120,90,200,0.15)",
  glass: {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px) saturate(180%)",
  } as React.CSSProperties,
  glassStrong: {
    background: "#ffffff",
    border: "1px solid rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px) saturate(180%)",
  } as React.CSSProperties,
  pageBg: "linear-gradient(165deg, #ECE4FF 0%, #F6E5F6 46%, #FFEADC 100%)",
  navBg: "rgba(255,255,255,0.55)",
};

export const CATEGORY_COLORS: Record<string, string> = {
  sub_junior: "#34D3EE",
  junior: "#22C55E",
  senior: "#6B46FF",
  super_senior: "#F5A742",
  elder: "#9D99BC",
};

export const CATEGORY_LABELS: Record<string, string> = {
  sub_junior: "Sub Junior",
  junior: "Junior",
  senior: "Senior",
  super_senior: "Super Senior",
  elder: "Elder",
};

export function gradeColor(grade: "A" | "B" | "C" | null): string {
  if (grade === "A") return "#16A34A";
  if (grade === "B") return "#D97706";
  if (grade === "C") return "#6B46FF";
  return "#9CA3AF";
}

// ── Blobs — soft ambient background shapes ───────────────────────────────
export function Blobs() {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(167,139,250,0.45), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(236,72,153,0.35), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,197,66,0.35), transparent 70%)" }}
      />
    </>
  );
}

// ── GlassPanel ─────────────────────────────────────────────────────────
export function GlassPanel({
  strong, glow, pressable, className, style, children, ...rest
}: {
  strong?: boolean;
  glow?: string;
  pressable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const base = strong ? theme.glassStrong : theme.glass;
  const boxShadow = glow
    ? `0 12px 32px rgba(120,70,160,0.16), 0 0 0 1px ${glow}26, 0 10px 28px ${glow}33`
    : theme.softShadow;
  return (
    <div
      className={`rounded-[${theme.radius}px] ${pressable ? "transition-transform hover:-translate-y-[3px] active:scale-[0.985]" : ""} ${className ?? ""}`}
      style={{ ...base, borderRadius: theme.radius, boxShadow, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

// ── GlowBtn ────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "gold" | "ghost" | "pink";
type BtnSize = "sm" | "md" | "lg";

const VARIANT_STYLE: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: "linear-gradient(135deg, #6B46FF, #A78BFA)", color: "#fff", boxShadow: "0 10px 28px rgba(107,70,255,0.4)" },
  gold: { background: "linear-gradient(135deg, #F7D26B, #F0A500)", color: "#3a2a00", boxShadow: "0 10px 28px rgba(245,197,66,0.38)" },
  ghost: { background: "rgba(107,70,255,0.09)", color: "#1E1B4B", border: "1px solid rgba(107,70,255,0.2)" },
  pink: { background: "linear-gradient(135deg, #C026D3, #EC4899)", color: "#fff", boxShadow: "0 10px 28px rgba(236,72,153,0.4)" },
};
const SIZE_STYLE: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: "10px 14px", fontSize: 13 },
  md: { padding: "14px 18px", fontSize: 15 },
  lg: { padding: "16px 20px", fontSize: 16 },
};

export function GlowBtn({
  variant = "primary", size = "md", disabled, loading, icon: Icon, trailingIcon: TrailingIcon,
  className, children, ...rest
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
      style={{ ...VARIANT_STYLE[variant], ...SIZE_STYLE[size], fontFamily: "var(--font-poppins), sans-serif" }}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
      {!loading && TrailingIcon && <TrailingIcon className="h-4 w-4" />}
    </button>
  );
}

// ── StepDots ───────────────────────────────────────────────────────────
export function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{
                background: done || active ? "linear-gradient(135deg,#6B46FF,#A78BFA)" : theme.fillStrong,
                color: done || active ? "#fff" : theme.faint,
                boxShadow: active ? "0 6px 16px rgba(107,70,255,0.4)" : "none",
              }}
            >
              {done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="h-0.5 flex-1 rounded-full" style={{ background: done ? theme.lavender : theme.track }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── StatusPill ─────────────────────────────────────────────────────────
export function StatusPill({ label, color, white }: { label: string; color?: string; white?: boolean }) {
  const c = white ? "#fff" : color ?? theme.purple;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: white ? "rgba(255,255,255,0.2)" : `${c}22`, border: `1px solid ${white ? "rgba(255,255,255,0.4)" : c + "44"}`, color: white ? "#fff" : c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {label}
    </span>
  );
}

// ── StatBlock ──────────────────────────────────────────────────────────
export function StatBlock({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className="text-[22px] font-bold tabular-nums" style={{ color: color ?? "#fff" }}>{value}</span>
      <span className="text-[10.5px] uppercase tracking-wider" style={{ color: color ? `${color}bb` : "rgba(255,255,255,0.75)" }}>{label}</span>
    </div>
  );
}

// ── SectionTitle ───────────────────────────────────────────────────────
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="my-[22px] mb-3 flex items-center justify-between">
      <h2 className="text-[17px] font-semibold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{children}</h2>
      {right}
    </div>
  );
}

// ── FeastTopBar ────────────────────────────────────────────────────────
export function FeastTopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 px-4 pt-3 sm:px-0">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={theme.glass}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: theme.text }} />
        </button>
      ) : (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
        >
          <Trophy className="h-5 w-5 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold" style={{ color: theme.text, fontFamily: "var(--font-poppins), sans-serif" }}>{title}</p>
        <p className="text-[11px]" style={{ color: theme.faint }}>Feast Portal</p>
      </div>
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ ...theme.glass, color: theme.text }}
      >
        <Home className="h-3.5 w-3.5" /> Home
      </Link>
    </div>
  );
}

// ── FeastNav — bottom nav (real routes, per spec Sec4.5) ────────────────
const NAV_ITEMS = [
  { href: "/", label: "Feasts", icon: Sparkles, match: (p: string) => p === "/" || p.startsWith("/feast") },
  { href: "/results", label: "Results", icon: Medal, match: (p: string) => p.startsWith("/results") },
  { href: "/rankings", label: "Ranks", icon: Trophy, match: (p: string) => p.startsWith("/rankings") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
];

export function FeastNav() {
  const pathname = usePathname();
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex((i) => i.match(pathname)));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3.5 pb-[22px] lg:hidden">
      <div
        className="pointer-events-auto relative flex w-full max-w-[420px] items-center rounded-[26px] px-1.5 py-2.5 sm:max-w-[520px]"
        style={{
          background: `linear-gradient(135deg, rgba(167,139,250,0.72), rgba(190,24,147,0.4) 45%, rgba(107,70,255,0.8)), ${theme.navBg}`,
          border: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "0 12px 34px rgba(107,70,255,0.28), inset 0 1px 1px rgba(255,255,255,0.5)",
          backdropFilter: "blur(8px) saturate(140%)",
        }}
      >
        {NAV_ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="relative flex flex-1 flex-col items-center gap-1 py-1">
              {active && (
                <motion.div
                  layoutId="feast-nav-bubble"
                  className="absolute -top-4 flex h-[54px] w-[54px] items-center justify-center rounded-full"
                  style={{
                    background: "linear-gradient(145deg, #A78BFA, #6B46FF)",
                    boxShadow: "0 8px 20px rgba(140,100,230,0.45), inset 0 1.5px 2px rgba(255,255,255,0.55)",
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Icon className="h-[23px] w-[23px] text-white" />
                </motion.div>
              )}
              <span style={{ opacity: active ? 0 : 1, height: 32, display: "flex", alignItems: "center" }}>
                <Icon className="h-[20px] w-[20px]" style={{ color: "#0B2545" }} />
              </span>
              <span className="text-[10px] font-semibold" style={{ color: active ? "#4C1D95" : "#0B2545" }}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Desktop counterpart to FeastNav — same NAV_ITEMS, same gradient/glass
// language, laid out as a fixed left sidebar instead of a floating bottom
// bar. A separate layoutId keeps its active-bubble animation independent of
// FeastNav's, since both stay mounted simultaneously (CSS hides/shows
// whichever one applies at the current breakpoint, per FeastShell).
export function FeastSideNav() {
  const pathname = usePathname();
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex((i) => i.match(pathname)));
  const { feasts } = useFeasts();

  return (
    <div className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col justify-center px-4 lg:flex">
      <div
        className="flex flex-col gap-1.5 rounded-[26px] p-3"
        style={{
          background: `linear-gradient(165deg, rgba(167,139,250,0.72), rgba(190,24,147,0.4) 45%, rgba(107,70,255,0.8)), ${theme.navBg}`,
          border: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "0 12px 34px rgba(107,70,255,0.28), inset 0 1px 1px rgba(255,255,255,0.5)",
          backdropFilter: "blur(8px) saturate(140%)",
        }}
      >
        {NAV_ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          return (
            <div key={item.href}>
              <Link href={item.href} className="relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
                {active && (
                  <motion.div
                    layoutId="feast-nav-bubble-side"
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: "linear-gradient(145deg, #A78BFA, #6B46FF)",
                      boxShadow: "0 8px 20px rgba(140,100,230,0.45), inset 0 1.5px 2px rgba(255,255,255,0.55)",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon className="h-[20px] w-[20px]" style={{ color: active ? "#fff" : "#0B2545" }} />
                </span>
                <span className="relative text-[13.5px] font-semibold" style={{ color: active ? "#fff" : "#0B2545" }}>{item.label}</span>
              </Link>

              {/* Under "Feasts" — direct links to every active feast */}
              {item.href === "/" && feasts.length > 0 && (
                <div className="ml-[34px] mt-0.5 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: "rgba(11,37,69,0.15)" }}>
                  {feasts.map((f) => {
                    const feastActive = pathname.startsWith(`/feast/${f.slug}`);
                    return (
                      <Link
                        key={f.slug}
                        href={`/feast/${f.slug}`}
                        className="truncate rounded-lg px-2 py-1 text-[12px] font-medium"
                        style={{ color: feastActive ? "#4C1D95" : "#0B2545CC", background: feastActive ? "rgba(255,255,255,0.5)" : "transparent" }}
                      >
                        {f.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FeastTabs — DB-driven feast switcher chips ───────────────────────────
export function FeastTabs({
  feasts, active, onPick, loading,
}: {
  feasts: { slug: string; name: string; tint: [string, string]; accent: string }[];
  active: string;
  onPick: (slug: string) => void;
  loading: boolean;
}) {
  if (loading && feasts.length === 0) {
    return (
      <div className="mb-4 flex gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-2xl bg-white/50" />
        <div className="h-11 flex-1 animate-pulse rounded-2xl bg-white/50" />
      </div>
    );
  }
  if (feasts.length === 0) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {feasts.map((f) => {
        const on = f.slug === active;
        return (
          <button
            key={f.slug}
            onClick={() => onPick(f.slug)}
            className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold"
            style={
              on
                ? { background: `linear-gradient(135deg, ${f.tint[0]}, ${f.tint[1]})`, color: "#fff", boxShadow: `0 8px 22px ${f.accent}55` }
                : { background: "rgba(255,255,255,0.7)", color: "#4B5563", border: "1px solid rgba(107,70,255,0.14)" }
            }
          >
            {f.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Shell — full-bleed page wrapper every screen renders inside ─────────
export function FeastShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden" style={{ background: theme.pageBg }}>
      <Blobs />
      <FeastSideNav />
      <main className="relative pb-[110px] lg:pb-10">
        <div className="mx-auto w-full max-w-md px-4 pt-2 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-8">
          {children}
        </div>
      </main>
      <FeastNav />
    </div>
  );
}

export { ArrowRight };
