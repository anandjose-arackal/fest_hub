"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, ChevronRight, Search, Loader2, ArrowRight, Users, ListChecks, Clock3, Trophy, LogIn } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { GlassPanel, GlowBtn, StatusPill, SectionTitle, LoginSheet, theme } from "./feast-shared";
import { LiveActivityFeed, TopShakhasWidget } from "./feast-dashboard-widgets";
import { MissionCountdown } from "./feast-countdown";
import type { OrgSettings } from "@/types";

// Small confetti burst, contained within the announcement banner (not a
// full-page effect like FeastSuccess's) — colors pull from the org's own
// --fp-* theme vars so it matches whichever palette is active, not a
// hardcoded purple.
interface ConfettiPiece {
  left: number; delay: number; duration: number; color: string; size: number; rotation: number; round: boolean;
}
const BANNER_CONFETTI_COLORS = ["var(--fp-gold)", "var(--fp-primary-light)", "var(--fp-accent)", "#fff"];
// Generated client-side only (after mount): Math.random() values baked in
// during SSR would differ from the client's re-render and trigger a
// hydration mismatch, so this starts empty and fills in via useEffect.
function useBannerConfetti(): ConfettiPiece[] {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  useEffect(() => {
    setPieces(
      Array.from({ length: 20 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.6 + Math.random() * 1.2,
        color: BANNER_CONFETTI_COLORS[Math.floor(Math.random() * BANNER_CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 5,
        rotation: Math.random() * 360,
        round: Math.random() > 0.5,
      }))
    );
  }, []);
  return pieces;
}

export function FeastLanding({ org }: { org: OrgSettings }) {
  const { feasts, loading } = useFeasts();
  const { session } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const bannerConfetti = useBannerConfetti();

  return (
    <div>
      {/* Full-bleed flag ribbon pinned to the page's top edge — fixed (not
          in-flow) so it spans the true viewport width regardless of
          FeastShell's padded/max-width content column. The heading below
          gets matching top padding to clear it. */}
      <div className="fixed inset-x-0 top-0 z-20 h-11" style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}>
        <div className="flag-ribbon-wave absolute inset-0 flex flex-col overflow-hidden">
          <span className="w-full flex-1" style={{ background: "var(--fp-gold)" }} />
          <span className="w-full flex-1" style={{ background: "#DC2626" }} />
          <span className="w-full flex-1" style={{ background: "var(--fp-gold)" }} />
          <span className="fold-sweep pointer-events-none absolute inset-0" />
        </div>
        {/* Login entry point for the public dashboard — same top-right slot
            ProfileMenu's avatar occupies once signed in, so it hides there
            instead of flipping sides. Reuses GlowBtn's own primary gradient
            (same button used for "Sign In"/"Register Now" everywhere else)
            rather than a one-off pill, so it reads as the app's button. */}
        {!session && (
          <GlowBtn
            variant="primary"
            size="sm"
            icon={LogIn}
            onClick={() => setLoginOpen(true)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 sm:right-4"
          >
            Login
          </GlowBtn>
        )}
        {/* Anchored to the ribbon's top edge (not vertically centered) —
            the ribbon itself sits flush at the viewport's top-0, so a
            centered badge taller than the ribbon would push its top half
            above y=0 and get clipped by the viewport edge, not any
            overflow-hidden. Anchoring to top-0 keeps 100% of it visible and
            lets all the extra height overflow downward instead. */}
        <div
          className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-white"
          style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.28)" }}
        >
          <img src={org.logo_url} alt={org.org_name_en || "Fest Hub"} className="h-12 w-12 rounded-full object-cover" />
        </div>
      </div>
      <div className="pt-16">
        <h1
          className="mt-1 text-[32px] font-bold leading-[1.08] tracking-tight sm:text-[40px]"
          style={{ fontFamily: "var(--font-anek), sans-serif" }}
        >
          <span style={{ color: theme.text }}>{org.org_name_en || "Fest Hub"}</span>
          <br />
          <span
            style={{
              background: "linear-gradient(100deg, var(--fp-gold), var(--fp-accent), var(--fp-primary-light))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {org.org_name_local || "Competitions & Results"}
          </span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: theme.sub }}>
          Register, compete and follow live results across the season.
        </p>
      </div>

      {/* Dashboard: feast list (main) + live updates / top shakhas (sidebar on wide screens) */}
      <div className="mt-2 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {/* Same column as the feast listing below, so it matches the feast
              cards' width exactly instead of the full-width heading above. */}
          <MissionCountdown startDate={feasts[0]?.startDate ?? null} feastName={feasts[0]?.name} />

          <Link
            href="/results?feast=literature_fest"
            className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5 transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(110deg, var(--fp-gold), var(--fp-accent) 55%, var(--fp-primary) 100%)",
              boxShadow: "0 8px 22px rgba(var(--fp-primary-rgb),0.35)",
            }}
          >
            {bannerConfetti.map((p, i) => (
              <span
                key={i}
                className="pointer-events-none absolute top-0"
                style={{
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  borderRadius: p.round ? "50%" : 2,
                  transform: `rotate(${p.rotation}deg)`,
                  animation: `bannerConfetti ${p.duration}s ease-in ${p.delay}s infinite`,
                }}
              />
            ))}
            <style>{`@keyframes bannerConfetti { 0% { transform: translateY(-8px) rotate(0); opacity: 1; } 100% { transform: translateY(60px) rotate(340deg); opacity: 0; } }`}</style>

            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.28)" }}>
              <Trophy className="h-5 w-5 text-white" />
            </span>
            <span className="relative min-w-0 flex-1 truncate text-[17px] font-bold text-white" style={{ fontFamily: "var(--font-anek), sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
              സാഹിത്യമത്സരം Result Published
            </span>
            <span className="relative flex shrink-0 items-center gap-1 text-[14.5px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
              Click to view <ArrowRight className="h-[18px] w-[18px]" />
            </span>
          </Link>

          <SectionTitle right={loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} /> : <span className="text-xs" style={{ color: theme.sub }}>{feasts.length} active</span>}>
            Active Fests
          </SectionTitle>

          <div className="grid grid-cols-1 gap-4">
            {feasts.map((f, i) => (
              <GlassPanel
                key={f.slug}
                strong
                pressable
                className="relative overflow-hidden p-0"
                data-tour={i === 0 ? "feast-listing-first" : undefined}
                style={{ boxShadow: `0 16px 40px ${f.accent}22, 0 2px 8px rgba(30,27,75,0.06)`, border: `1px solid ${f.accent}30` }}
              >
                {/* Gradient hero strip */}
                <div className="relative overflow-hidden px-5 pb-6 pt-5" style={{ background: `linear-gradient(150deg, ${f.tint[0]}, ${f.tint[1]} 65%, ${f.accent})` }}>
                  {/* Dotted texture overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.18]"
                    style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1.5px)", backgroundSize: "16px 16px" }}
                  />
                  <div className="pointer-events-none absolute -top-10 -right-8 h-[160px] w-[160px] rounded-full blur-[38px]" style={{ background: "rgba(255,255,255,0.3)" }} />
                  <div className="pointer-events-none absolute -bottom-12 left-8 h-[120px] w-[120px] rounded-full blur-[32px]" style={{ background: "rgba(245,197,66,0.4)" }} />

                  {f.daysLeft > 0 && (
                    <div
                      className="absolute right-4 top-4 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold text-white"
                      style={{ background: "rgba(0,0,0,0.22)", backdropFilter: "blur(6px)" }}
                    >
                      <Clock3 className="h-3 w-3" /> {f.daysLeft}d left
                    </div>
                  )}

                  <div className="relative flex items-start gap-3.5">
                    <div
                      className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.5)", boxShadow: "0 8px 20px rgba(0,0,0,0.18)" }}
                    >
                      <Trophy className="h-[26px] w-[26px] text-white" strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[21px] font-bold leading-tight text-white drop-shadow-sm" style={{ fontFamily: "var(--font-anek), sans-serif" }}>
                        {f.name} <span className="text-sm font-normal text-white/70">{f.year}</span>
                      </p>
                      {f.date && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-white/85">
                          <Calendar className="h-3 w-3" /> {f.date}
                        </p>
                      )}
                      <div className="mt-2">
                        <StatusPill label={f.status} white />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 pt-4">
                  {f.blurb && <p className="mb-3 line-clamp-2 text-xs" style={{ color: theme.sub }}>{f.blurb}</p>}
                  <div className="flex gap-2.5">
                    <div className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: `${f.accent}0f`, border: `1px solid ${f.accent}22` }}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${f.accent}1f` }}>
                        <Users className="h-4 w-4" style={{ color: f.accent }} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-bold leading-none tabular-nums" style={{ color: theme.text }}>{f.registrations}</p>
                        <p className="mt-0.5 text-[9.5px] uppercase tracking-wide" style={{ color: theme.faint }}>Registered</p>
                      </div>
                    </div>
                    <div className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: `${f.accent}0f`, border: `1px solid ${f.accent}22` }}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${f.accent}1f` }}>
                        <ListChecks className="h-4 w-4" style={{ color: f.accent }} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-bold leading-none tabular-nums" style={{ color: theme.text }}>{f.eventCount ?? f.competitions.length}</p>
                        <p className="mt-0.5 text-[9.5px] uppercase tracking-wide" style={{ color: theme.faint }}>Events</p>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/feast/${f.slug}`}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[13px] py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                    style={{ background: `linear-gradient(135deg, ${f.tint[0]}, ${f.tint[1]})`, boxShadow: `0 8px 22px ${f.accent}55` }}
                  >
                    View Details <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </GlassPanel>
            ))}
            {!loading && feasts.length === 0 && (
              <p className="col-span-full text-sm" style={{ color: theme.sub }}>No active fests right now — check back soon.</p>
            )}
          </div>

          {/* Widgets: shown here (after the feast list) on phone/tablet; the
              sidebar covers wide screens instead. */}
          <div className="mt-6 space-y-4 lg:hidden">
            <LiveActivityFeed />
            <TopShakhasWidget />
          </div>

          <Link href="/search" className="mt-6 block">
            <GlassPanel className="flex items-center gap-3 p-4" pressable>
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,197,66,0.16)" }}>
                <Search className="h-4 w-4" style={{ color: theme.gold }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: theme.text }}>Already registered?</p>
                <p className="text-xs" style={{ color: theme.sub }}>Look up your registration number</p>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: theme.faint }} />
            </GlassPanel>
          </Link>
        </div>

        {/* Sidebar — wide screens only (mobile/tablet copy renders above) */}
        <div className="sticky top-4 mt-8 hidden space-y-4 lg:mt-[52px] lg:block">
          <LiveActivityFeed />
          <TopShakhasWidget />
        </div>
      </div>

      {loginOpen && <LoginSheet onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
