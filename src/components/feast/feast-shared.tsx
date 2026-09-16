"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Trophy, Sparkles, Medal, Search, Home,
  Loader2, PenTool, Palette, Zap, HelpCircle, Code2, Globe, LogOut, LogIn, Eye, EyeOff, type LucideIcon,
} from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";

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
  faint: "var(--fp-faint)",
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
  pageBg: "linear-gradient(165deg, var(--fp-bg-1) 0%, var(--fp-bg-2) 46%, var(--fp-bg-3) 100%)",
  navBg: "var(--fp-nav-bg)",
};

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
  const base = strong ? theme.glassStrong : theme.glass;
  const boxShadow = glow
    ? `0 12px 32px rgba(var(--fp-primary-rgb),0.16), 0 0 0 1px ${glow}26, 0 10px 28px ${glow}33`
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
  primary: { background: "linear-gradient(135deg, var(--fp-primary), var(--fp-primary-light))", color: "#fff", boxShadow: "0 10px 28px rgba(var(--fp-primary-rgb),0.4)" },
  gold: { background: "linear-gradient(135deg, #F7D26B, #F0A500)", color: "#3a2a00", boxShadow: "0 10px 28px rgba(var(--fp-gold-rgb),0.38)" },
  ghost: { background: "rgba(var(--fp-primary-rgb),0.09)", color: "var(--fp-ink)", border: "1px solid rgba(var(--fp-primary-rgb),0.2)" },
  pink: { background: "linear-gradient(135deg, var(--fp-primary), var(--fp-accent))", color: "#fff", boxShadow: "0 10px 28px rgba(var(--fp-accent-rgb),0.4)" },
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
                background: done || active ? "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" : theme.fillStrong,
                color: done || active ? "#fff" : theme.faint,
                boxShadow: active ? "0 6px 16px rgba(var(--fp-primary-rgb),0.4)" : "none",
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
          style={{ background: "linear-gradient(135deg, var(--fp-primary), var(--fp-accent))" }}
        >
          <Trophy className="h-5 w-5 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold" style={{ color: theme.text, fontFamily: "var(--font-poppins), sans-serif" }}>{title}</p>
        <p className="text-[11px]" style={{ color: theme.faint }}>Fest Portal</p>
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
          background: `linear-gradient(135deg, rgba(var(--fp-primary-light-rgb),0.72), rgba(var(--fp-accent-rgb),0.4) 45%, rgba(var(--fp-primary-rgb),0.8)), ${theme.navBg}`,
          border: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "0 12px 34px rgba(var(--fp-primary-rgb),0.28), inset 0 1px 1px rgba(255,255,255,0.5)",
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
                    background: "linear-gradient(145deg, var(--fp-primary), var(--fp-primary-dark))",
                    boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.45), inset 0 1.5px 2px rgba(255,255,255,0.35)",
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Icon className="h-[23px] w-[23px] text-white" />
                </motion.div>
              )}
              <span style={{ opacity: active ? 0 : 1, height: 32, display: "flex", alignItems: "center" }}>
                <Icon className="h-[20px] w-[20px]" style={{ color: "var(--fp-ink)" }} />
              </span>
              <span className="text-[10px] font-semibold" style={{ color: active ? "var(--fp-primary)" : "var(--fp-ink)" }}>{item.label}</span>
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
          background: `linear-gradient(165deg, rgba(var(--fp-primary-light-rgb),0.72), rgba(var(--fp-accent-rgb),0.4) 45%, rgba(var(--fp-primary-rgb),0.8)), ${theme.navBg}`,
          border: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "0 12px 34px rgba(var(--fp-primary-rgb),0.28), inset 0 1px 1px rgba(255,255,255,0.5)",
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
                      background: "linear-gradient(145deg, var(--fp-primary), var(--fp-primary-dark))",
                      boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.45), inset 0 1.5px 2px rgba(255,255,255,0.35)",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon className="h-[20px] w-[20px]" style={{ color: active ? "#fff" : "var(--fp-ink)" }} />
                </span>
                <span className="relative text-[13.5px] font-semibold" style={{ color: active ? "#fff" : "var(--fp-ink)" }}>{item.label}</span>
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
                            : { background: "rgba(255,255,255,0.42)", border: "1px solid rgba(255,255,255,0.55)" }
                        }
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: feastActive ? "rgba(255,255,255,0.28)" : `${f.accent}22` }}
                        >
                          <FeastIcon className="h-[15px] w-[15px]" style={{ color: feastActive ? "#fff" : f.accent }} />
                        </span>
                        <span className="min-w-0 truncate text-[12.5px] font-bold" style={{ color: feastActive ? "#fff" : "var(--fp-ink)" }}>
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
                : { background: "var(--fp-glass)", color: theme.sub, border: "1px solid rgba(var(--fp-primary-rgb),0.14)" }
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

export function ProfileMenu() {
  const { session, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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
        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white transition-transform active:scale-95"
        style={{ background: "linear-gradient(135deg, var(--fp-primary), var(--fp-primary-light))", boxShadow: "0 8px 20px rgba(var(--fp-primary-rgb),0.35)" }}
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
            disabled
            className="flex w-full cursor-not-allowed items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium opacity-50"
            style={{ color: theme.text }}
          >
            <span className="flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Help</span>
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: theme.fillStrong, color: theme.sub }}>Soon</span>
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold" style={{ color: theme.text }}>Admin Login</h2>
        <p className="mb-4 text-sm" style={{ color: theme.sub }}>Sign in to register participants</p>
        <div className="space-y-3">
          <input className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 pr-9 text-sm"
              type={show ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="text-sm" style={{ color: "#EF4444" }}>{error}</p>}
          <GlowBtn variant="primary" size="lg" className="w-full" icon={LogIn} onClick={submit} loading={busy}>
            Sign In
          </GlowBtn>
        </div>
      </div>
    </div>
  );
}

// ── Shell — full-bleed page wrapper every screen renders inside ─────────
export function FeastShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden" style={{ background: theme.pageBg }}>
      <Blobs />
      <FeastSideNav />
      <ProfileMenu />
      <main className="relative pb-[110px] lg:pb-10 lg:pl-56">
        <div className="mx-auto w-full max-w-md px-4 pt-2 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-8">
          {children}
        </div>
      </main>
      <FeastNav />
    </div>
  );
}

export { ArrowRight };
