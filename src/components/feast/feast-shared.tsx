"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Trophy, Sparkles, Medal, Search, Home,
  Loader2, PenTool, Palette, Zap, HelpCircle, Code2, Globe, LogOut, LogIn, Eye, EyeOff, type LucideIcon,
} from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { HelpSheet } from "./feast-help";

// FeastUI.icon (from use-feast.ts's FEAST_TYPE_CONFIG) is a Lucide icon
// *name*, not an emoji — this resolves it to the actual component.
const FEAST_ICONS: Record<string, LucideIcon> = { PenTool, Palette, Zap, Sparkles };

// The Feast Portal's own palette. Values are CSS custom-property references
// (see globals.css's [data-fp-theme="..."] blocks), not literal hex, so the
// whole portal repaints when org_settings.theme changes — the actual color
// is resolved by the browser from whichever data-fp-theme attribute the root
// layout put on <body>, not by this object. /admin never sets that attribute
// and never reads these tokens, so it's unaffected by the org's theme choice.
export const theme = {
  radius: 28,
  text: "var(--fp-ink)",
  sub: "var(--fp-sub)",
  faint: "var(--fp-meta)",
  gold: "var(--fp-gold)",
  purple: "var(--fp-primary)",
  lavender: "var(--fp-primary-light)",
  pink: "var(--fp-accent)",
  cyan: "var(--fp-cyan)",
  fill: "var(--fp-fill)",
  fillStrong: "rgba(var(--fp-primary-rgb), 0.10)",
  hairline: "rgba(var(--fp-primary-rgb), 0.12)",
  track: "rgba(var(--fp-primary-rgb), 0.10)",
  softShadow: "0 14px 32px rgba(var(--fp-primary-rgb), 0.15)",
  glass: {
    background: "var(--fp-glass)",
    border: "1px solid var(--fp-glass-border)",
    backdropFilter: "blur(16px) saturate(180%)",
  } as React.CSSProperties,
  glassStrong: {
    background: "var(--fp-glass-strong)",
    border: "1px solid var(--fp-glass-border)",
    backdropFilter: "blur(16px) saturate(180%)",
  } as React.CSSProperties,
  pageBg: "var(--fp-page-bg)",
  navBg: "var(--fp-nav-bg)",
  // Championship design tokens (globals.css "Championship design tokens") —
  // derived per theme, so these flip correctly for the dark themes too.
  surface: "var(--fp-surface)",
  surface2: "var(--fp-surface-2)",
  surface3: "var(--fp-surface-3)",
  line: "var(--fp-line)",
  line2: "var(--fp-line-2)",
  goldInk: "var(--fp-gold-ink)",
  shadow: "var(--fp-shadow)",
  ui: "var(--font-manrope), var(--font-anek), sans-serif",
};

// Mixes a color (hex or var()) with transparency. Use instead of appending a
// hex alpha suffix (`${color}22`), which silently produces invalid CSS for a
// var() reference.
export function mix(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export const CATEGORY_COLORS: Record<string, string> = {
  sub_junior: "#34D3EE",
  junior: "#22C55E",
  senior: "var(--fp-primary)",
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

// Theme-aware category colors for the portal's championship design: `color`
// for bars/dots, `ink` for text on the page surface, `deep` as the far end of
// a selected-tab gradient. CATEGORY_COLORS above stays literal hex for /screen
// and the poster, which keep their own fixed look.
export const CATEGORY_ORDER = ["sub_junior", "junior", "senior", "super_senior", "elder"] as const;
const CAT_VAR_KEY: Record<string, string> = { sub_junior: "sj", junior: "j", senior: "s", super_senior: "ss", elder: "e" };
// `hi` is the start of a selected chip/tile gradient (hi → deep): the bright
// hue on dark themes, the deep hue on light ones, so --fp-on-cat text stays
// readable either way.
export function catStyle(slug: string | null | undefined): { color: string; ink: string; deep: string; hi: string } {
  const k = slug ? CAT_VAR_KEY[slug] : undefined;
  if (!k) return { color: "var(--fp-cat-team)", ink: "var(--fp-link)", deep: "var(--fp-cat-team-deep)", hi: "var(--fp-cat-team-hi)" };
  return { color: `var(--fp-cat-${k})`, ink: `var(--fp-cat-${k}-ink)`, deep: `var(--fp-cat-${k}-deep)`, hi: `var(--fp-cat-${k}-hi)` };
}

export function gradeColor(grade: "A" | "B" | "C" | null): string {
  if (grade === "A") return "#16A34A";
  if (grade === "B") return "#D97706";
  if (grade === "C") return "var(--fp-primary)";
  return "#9CA3AF";
}

// ── Blobs — soft ambient background shapes ───────────────────────────────
export function Blobs() {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(var(--fp-primary-light-rgb),0.45), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(var(--fp-accent-rgb),0.35), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(var(--fp-gold-rgb),0.35), transparent 70%)" }}
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
  // Championship surfaces: solid-ish theme surface + hairline, shadow only
  // on the strong variant (forms, summaries) so stacked cards stay calm.
  const base: React.CSSProperties = {
    backdropFilter: "blur(16px) saturate(160%)",
    background: strong ? theme.surface2 : theme.surface,
    border: `1px solid ${theme.line}`,
  };
  const boxShadow = glow ? `0 12px 32px ${mix(glow, 22)}` : strong ? theme.shadow : undefined;
  return (
    <div
      className={`${pressable ? "transition-transform hover:-translate-y-[3px] active:scale-[0.985]" : ""} ${className ?? ""}`}
      style={{ ...base, borderRadius: 22, boxShadow, ...style }}
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
  primary: { background: "var(--fp-btn)", color: "var(--fp-btn-fg)", boxShadow: "0 10px 26px rgba(var(--fp-primary-rgb),0.34)" },
  gold: { background: "var(--fp-cta-gold)", color: "var(--fp-cta-gold-fg)", boxShadow: "0 10px 26px rgba(240,165,0,0.3)" },
  ghost: { background: "var(--fp-surface-2)", color: "var(--fp-ink)", border: "1px solid var(--fp-line-2)" },
  pink: { background: "var(--fp-btn-alt)", color: "var(--fp-btn-alt-fg)", boxShadow: "0 10px 26px rgba(var(--fp-accent-rgb),0.32)" },
};
const SIZE_STYLE: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: "9px 14px", fontSize: 13, minHeight: 40 },
  md: { padding: "12px 18px", fontSize: 14.5, minHeight: 48 },
  lg: { padding: "14px 20px", fontSize: 15, minHeight: 52 },
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
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[15px] font-extrabold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
      style={{ ...VARIANT_STYLE[variant], ...SIZE_STYLE[size], fontFamily: theme.ui }}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
      {!loading && TrailingIcon && <TrailingIcon className="h-4 w-4" />}
    </button>
  );
}

// ── Submit lock ────────────────────────────────────────────────────────
// One server call at a time per form. A ref (not just state) guards it, so
// two taps in quick succession can't both get through. The lock stays on
// when the task reports it's navigating away, which keeps the button
// disabled until the next page replaces this one. A failure releases it for
// a retry.
export function useSubmitLock(onError: (message: string) => void) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<"leaving" | "release">) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    let outcome: "leaving" | "release" = "release";
    try {
      outcome = await task();
    } catch {
      onError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (outcome === "release") {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, run };
}

// Full-screen scrim while a submit is in flight: nothing else on the page
// (back, edit, confirm again) can be tapped until the server answers.
export function ProcessingOverlay({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="fp-fade-in fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: "var(--fp-scrim)", backdropFilter: "blur(3px)" }}>
      <div className="flex items-center gap-3 rounded-[18px] px-5 py-4 text-[15px] font-bold" style={{ background: "var(--fp-sheet)", color: theme.text, border: `1px solid ${theme.line}`, boxShadow: "var(--fp-shadow)", fontFamily: theme.ui }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.lavender }} aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

// Shown in place of the register forms once a fest is completed, for anyone
// who lands there from an old link or "Register another". Admins can still
// add late entries from /admin/participants.
export function RegistrationClosed({ slug, feastName }: { slug: string; feastName: string }) {
  const router = useRouter();
  return (
    <div>
      <FeastTopBar title={`Register · ${feastName}`} onBack={() => router.push(`/feast/${slug}`)} />
      <GlassPanel strong className="mt-5 p-6 text-center">
        <p className="mb-1 text-[17px] font-bold" style={{ color: theme.text }}>Registration closed</p>
        <p className="mb-5 text-[13px]" style={{ color: theme.sub }}>{feastName} is completed, so it no longer takes registrations.</p>
        <Link href={`/feast/${slug}`} className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[15px] px-[18px] text-[14.5px] font-extrabold" style={{ ...VARIANT_STYLE.primary, fontFamily: theme.ui }}>
          Back to fest
        </Link>
      </GlassPanel>
    </div>
  );
}

// ── StepDots ───────────────────────────────────────────────────────────
export function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Progress" className="flex items-center gap-2 px-1" style={{ fontFamily: theme.ui }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <li key={label} className={`flex min-w-0 items-center gap-2 ${last ? "" : "flex-1"}`} aria-current={active ? "step" : undefined}>
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
              style={{
                background: done || active ? "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" : theme.surface3,
                color: done || active ? "#fff" : theme.faint,
                boxShadow: active ? "0 6px 16px rgba(var(--fp-primary-rgb),0.4)" : "none",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="truncate text-[12.5px] font-extrabold" style={{ color: active ? theme.text : theme.faint }}>{label}</span>
            {!last && <span aria-hidden="true" className="h-[3px] min-w-3 flex-1 rounded-full" style={{ background: done ? theme.lavender : theme.track }} />}
          </li>
        );
      })}
    </ol>
  );
}

// ── StatusPill ─────────────────────────────────────────────────────────
export function StatusPill({ label, color, white }: { label: string; color?: string; white?: boolean }) {
  const c = white ? "#fff" : color ?? theme.purple;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: white ? "rgba(255,255,255,0.22)" : mix(c, 14), border: `1px solid ${white ? "rgba(255,255,255,0.45)" : mix(c, 30)}`, color: white ? "#fff" : c, fontFamily: theme.ui, fontWeight: 800 }}
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
    <div className="mb-3 mt-7 flex items-end justify-between gap-3">
      <h2 className="fp-disp text-[32px] sm:text-[36px]" style={{ color: theme.text }}>{children}</h2>
      <div className="pb-1">{right}</div>
    </div>
  );
}

// ── FeastTopBar ────────────────────────────────────────────────────────
export function FeastTopBar({ title, subtitle = "Fest Portal", onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  // HelpButton (signed out, top-left) and ProfileMenu (signed in, top-right)
  // are fixed to the viewport corners — pad the bar so they sit beside its
  // contents instead of on top of them. Help clears the side nav from lg up.
  const { session } = useAuth();
  return (
    <div
      className={`mb-4 flex items-center gap-3 pt-3 ${session ? "pl-1 pr-[52px] sm:pl-0" : "pl-[52px] pr-1 sm:pr-0 lg:pl-0"}`}
      style={{ fontFamily: theme.ui }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ ...theme.glass, background: theme.surface, border: `1px solid ${theme.line}` }}
        >
          <ArrowLeft className="h-[18px] w-[18px]" style={{ color: theme.text }} />
        </button>
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: "linear-gradient(135deg, var(--fp-primary), var(--fp-accent))", boxShadow: "0 8px 18px rgba(var(--fp-primary-rgb),0.3)" }}
        >
          <Trophy className="h-5 w-5 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="fp-ml truncate text-[17px] font-extrabold leading-tight" style={{ color: theme.text }}>{title}</p>
        <p className="fp-ml truncate text-[12px] font-bold" style={{ color: theme.faint }}>{subtitle}</p>
      </div>
      <Link
        href="/"
        aria-label="Home"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: theme.surface, border: `1px solid ${theme.line}`, color: theme.sub }}
      >
        <Home className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}

// ── FeastNav — bottom nav (real routes, per spec Sec4.5) ────────────────
const NAV_ITEMS = [
  { href: "/", label: "Fests", icon: Sparkles, match: (p: string) => p === "/" || p.startsWith("/feast") },
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
          background: "var(--fp-nav-surface)",
          border: "1px solid var(--fp-nav-line)",
          boxShadow: "var(--fp-nav-shadow)",
          backdropFilter: "blur(10px) saturate(140%)",
          fontFamily: theme.ui,
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
                  className="absolute -top-5 flex h-[54px] w-[54px] items-center justify-center rounded-full"
                  style={{
                    background: "var(--fp-nav-on)",
                    boxShadow: "var(--fp-nav-on-shadow)",
                    color: "var(--fp-nav-on-fg)",
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Icon className="h-[23px] w-[23px]" />
                </motion.div>
              )}
              <span style={{ opacity: active ? 0 : 1, height: 32, display: "flex", alignItems: "center" }}>
                <Icon className="h-[21px] w-[21px]" style={{ color: "var(--fp-nav-fg)" }} />
              </span>
              <span className={`text-[10.5px] ${active ? "font-extrabold" : "font-bold"}`} style={{ color: active ? "var(--fp-nav-label-on)" : "var(--fp-nav-fg)" }}>{item.label}</span>
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
          background: "var(--fp-nav-surface)",
          border: "1px solid var(--fp-nav-line)",
          boxShadow: "var(--fp-nav-shadow)",
          backdropFilter: "blur(10px) saturate(140%)",
          fontFamily: theme.ui,
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
                      background: "var(--fp-nav-on)",
                      boxShadow: "var(--fp-nav-on-shadow)",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon className="h-[20px] w-[20px]" style={{ color: active ? "var(--fp-nav-on-fg)" : "var(--fp-nav-fg)" }} />
                </span>
                <span className="relative text-[14px] font-bold" style={{ color: active ? "var(--fp-nav-on-fg)" : "var(--fp-nav-fg)" }}>{item.label}</span>
              </Link>

              {/* Under "Feasts" — direct links to every active feast */}
              {item.href === "/" && feasts.length > 0 && (
                <div className="mb-1 ml-2 mt-1 flex flex-col gap-1.5">
                  {feasts.map((f) => {
                    const feastActive = pathname.startsWith(`/feast/${f.slug}`);
                    const FeastIcon = FEAST_ICONS[f.icon] ?? Sparkles;
                    return (
                      <Link
                        key={f.slug}
                        href={`/feast/${f.slug}`}
                        className="flex items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 transition-transform active:scale-[0.97]"
                        style={
                          feastActive
                            ? { background: `linear-gradient(135deg, ${f.accent}, ${f.tint[1]})`, boxShadow: `0 6px 16px ${f.accent}55, inset 0 1.5px 2px rgba(255,255,255,0.4)` }
                            : { background: "var(--fp-nav-sub-bg)", border: "1px solid var(--fp-nav-sub-line)" }
                        }
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: feastActive ? "rgba(255,255,255,0.28)" : mix(f.accent, 18) }}
                        >
                          <FeastIcon className="h-[15px] w-[15px]" style={{ color: feastActive ? "#fff" : f.accent }} />
                        </span>
                        <span className="fp-ml min-w-0 truncate text-[13px] font-bold" style={{ color: feastActive ? "#fff" : "var(--fp-nav-fg)" }}>
                          {f.name}
                        </span>
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
    <div className="fp-scroll mb-4 flex gap-2 overflow-x-auto pb-1">
      {feasts.map((f) => {
        const on = f.slug === active;
        return (
          <button
            key={f.slug}
            onClick={() => onPick(f.slug)}
            aria-pressed={on}
            className="fp-ml flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] font-bold transition-colors"
            style={
              on
                ? { background: `linear-gradient(135deg, ${f.tint[0]}, ${f.tint[1]})`, color: "#fff", boxShadow: `0 8px 20px ${mix(f.accent, 35)}` }
                : { background: theme.surface, color: theme.sub, border: `1px solid ${theme.line2}` }
            }
          >
            {f.name}
          </button>
        );
      })}
    </div>
  );
}

// ── ProfileMenu — signed-in indicator, collapsed into a top-corner button
// (was a full-width "Signed in as … Logout" panel eating prime space on the
// home page; now one persistent, compact affordance across every portal
// page since FeastShell renders it once for the whole Feast Portal).
const CREDIT_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "https://github.com/anandjose-arackal/fest_hub", label: "GitHub Repo", icon: Code2 },
  { href: "https://anandjose-arackal.github.io/", label: "Developer", icon: Globe },
];

// ── HelpButton — same fixed top-right corner ProfileMenu occupies, but only
// rendered when signed OUT (ProfileMenu already carries its own Help entry
// for signed-in users, see below) — Help shouldn't require an admin login
// just to read "how do I register / find my registration number" etc.
export function HelpButton() {
  const { session } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  if (session) return null;

  return (
    <>
      {/* Top-LEFT, not right — the right corner is Login's slot on the
          landing page ribbon (feast-landing.tsx) and ProfileMenu's slot once
          signed in; sharing it meant computing Login's rendered width to
          avoid overlap, which broke at some viewports. Top-left has nothing
          fixed there at any breakpoint (FeastSideNav is vertically centered,
          not top-anchored, and hidden below lg anyway). */}
      <button
        onClick={() => setHelpOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform active:scale-95 sm:left-6 sm:top-5"
        style={{ background: "var(--fp-nav-on)", color: "var(--fp-nav-on-fg)", boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.3)" }}
        aria-label="Help"
      >
        <HelpCircle className="h-[18px] w-[18px]" />
      </button>
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export function ProfileMenu() {
  const { session, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!session) return null;

  const label = profile?.full_name || profile?.email || "Account";
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={ref} className="fixed right-4 top-4 z-40 sm:right-6 sm:top-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-transform active:scale-95"
        style={{ background: "var(--fp-nav-on)", color: "var(--fp-nav-on-fg)", boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.3)" }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl p-1.5"
          style={{ ...theme.glassStrong, boxShadow: theme.softShadow }}
        >
          <div className="truncate px-3 py-2">
            <p className="truncate text-[12.5px] font-semibold" style={{ color: theme.text }}>{label}</p>
            {profile?.shakha?.name && <p className="truncate text-[11px]" style={{ color: theme.faint }}>{profile.shakha.name}</p>}
          </div>
          <div className="my-1 h-px" style={{ background: theme.hairline }} />

          <button
            onClick={() => { setOpen(false); setHelpOpen(true); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium"
            style={{ color: theme.text }}
          >
            <HelpCircle className="h-4 w-4" /> Help
          </button>

          {CREDIT_LINKS.map((c) => (
            <a
              key={c.href}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium"
              style={{ color: theme.text }}
            >
              <c.icon className="h-4 w-4" style={{ color: theme.purple }} /> {c.label}
            </a>
          ))}

          <div className="my-1 h-px" style={{ background: theme.hairline }} />

          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-semibold"
            style={{ color: "#DC2626" }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// ── LoginSheet — shared admin sign-in bottom sheet (feast-details.tsx's
// registration gate + feast-landing.tsx's dashboard login button) ───────
export function LoginSheet({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else onClose();
  }

  const fieldStyle: React.CSSProperties = { background: "var(--fp-input)", border: `1px solid ${theme.line2}`, color: theme.text };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "var(--fp-scrim)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-login-title"
        className="fp-rise w-full max-w-md rounded-t-[30px] px-5 pb-7 pt-3"
        style={{ background: "var(--fp-sheet)", boxShadow: "0 -20px 50px rgba(30,27,75,0.3)", fontFamily: theme.ui }}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto h-[5px] w-11 rounded-full" style={{ background: theme.line2 }} />
        <div className="mt-5 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(140deg, var(--fp-primary), var(--fp-accent))", boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.35)" }}>
            <LogIn className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="fp-login-title" className="fp-disp text-[32px]" style={{ color: theme.text }}>Admin login</h2>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: theme.sub }}>Sign in to register participants</p>
          </div>
        </div>
        <div className="mt-5 space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: theme.sub }}>Email</span>
            <input className="h-[50px] w-full rounded-[14px] px-3.5 text-[15px] font-semibold outline-none" style={fieldStyle} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: theme.sub }}>Password</span>
            <span className="relative block">
              <input
                className="h-[50px] w-full rounded-[14px] px-3.5 pr-12 text-[15px] font-semibold outline-none"
                style={fieldStyle}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center" style={{ color: theme.sub }}>
                {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </span>
          </label>
          {error && <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>}
          <GlowBtn variant="primary" size="lg" className="mt-1 w-full" icon={LogIn} onClick={submit} loading={busy}>
            Sign in
          </GlowBtn>
        </div>
      </div>
    </div>
  );
}

// ── Shell — full-bleed page wrapper every screen renders inside ─────────
export function FeastShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fp-shell relative min-h-dvh w-full overflow-hidden" style={{ background: theme.pageBg, color: theme.text, fontFamily: theme.ui }}>
      <Blobs />
      <FeastSideNav />
      <ProfileMenu />
      <HelpButton />
      <main className="relative pb-[110px] lg:pb-10 lg:pl-56">
        <div className="mx-auto w-full max-w-md px-4 pt-2 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-8 xl:max-w-6xl 2xl:max-w-[1320px]">
          {children}
        </div>
      </main>
      <FeastNav />
    </div>
  );
}

export { ArrowRight };
