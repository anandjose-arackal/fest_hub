"use client";

import Link from "next/link";
import { useState } from "react";
import { Calendar, ChevronRight, Search, Loader2, ArrowRight, Users, ListChecks, Clock3, Trophy, LogIn, MapPin } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { GlowBtn, LoginSheet, mix, theme } from "./feast-shared";
import { Eyebrow } from "./feast-ui";
import { LiveActivityFeed, TopRankingWidget } from "./feast-dashboard-widgets";
import { MissionCountdown } from "./feast-countdown";
import { LatestResultWidget } from "./feast-latest-result";
import type { OrgSettings } from "@/types";

export function FeastLanding({ org }: { org: OrgSettings }) {
  const { feasts, loading } = useFeasts();
  const showMeghalas = org.hierarchy_level === "meghala" || org.hierarchy_level === "diocese";
  const { session } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  // Countdown targets the soonest fest that hasn't started yet, not just
  // feasts[0] — useFeasts orders by start_date ascending across every
  // non-draft status, so an already-ongoing/completed fest with an earlier
  // date would otherwise block a later, genuinely upcoming one from ever
  // showing a countdown.
  const upcomingFeast = feasts.find((f) => f.startDate && new Date(f.startDate).getTime() > Date.now());

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
      <section className="px-1 pt-[72px]">
        <Eyebrow>{org.tagline || "Fest Portal"}</Eyebrow>
        <h1 className="m-0 mt-2.5">
          <span className="fp-ml block text-[28px] font-extrabold leading-[1.15] sm:text-[34px]" style={{ color: theme.text }}>{org.org_name_en || "Fest Hub"}</span>
          <span className="fp-disp fp-hl-text mt-2 block text-[min(11.6vw,44px)] sm:text-[56px] xl:text-[72px]">{org.app_name || "Competitions & Results"}</span>
        </h1>
        {org.area_name_en && (
          <span className="mt-3.5 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-extrabold" style={{ background: theme.surface3, border: `1px solid ${theme.line2}`, color: "var(--fp-link)" }}>
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {org.area_name_en}
          </span>
        )}
      </section>

      {/* Dashboard: feast list (main) + live updates / top shakhas (sidebar on wide screens) */}
      <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Same column as the feast listing below, so it matches the feast
              cards' width exactly instead of the full-width heading above. */}
          <MissionCountdown startDate={upcomingFeast?.startDate ?? null} feastName={upcomingFeast?.name} />

          {/* The latest published competition's winners (moved here from the
              Results page) — replaces the old "Results published" banner. */}
          <LatestResultWidget />

          <div className="flex items-end justify-between px-1 pb-3 pt-7">
            <h2 className="fp-disp m-0 text-[34px] xl:text-[40px]">Active Fests</h2>
            <span className="pb-[3px] text-[12.5px] font-bold" style={{ color: theme.faint }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} aria-label="Loading" /> : `${feasts.length} active`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
            {feasts.map((f, i) => {
              const hero = `linear-gradient(150deg, ${f.tint[0]}, ${f.tint[1]} 65%, ${f.accent})`;
              const live = f.status === "Ongoing";
              return (
                <article
                  key={f.slug}
                  data-tour={i === 0 ? "feast-listing-first" : undefined}
                  className="fp-fade-up overflow-hidden rounded-[26px]"
                  style={{ ...theme.glassStrong, background: theme.surface2, border: `1px solid ${mix(f.accent, 19)}`, boxShadow: `0 16px 40px ${mix(f.accent, 13)}, 0 2px 8px rgba(30,27,75,0.06)`, animationDelay: `${0.05 + i * 0.08}s` }}
                >
                  <div className="relative overflow-hidden px-[18px] pb-5 pt-[18px]" style={{ background: hero }}>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1.5px)", backgroundSize: "16px 16px" }} />
                    <div aria-hidden="true" className="pointer-events-none absolute -right-[30px] -top-10 h-40 w-40 rounded-full blur-[30px]" style={{ background: "rgba(255,255,255,0.28)" }} />
                    {f.daysLeft > 0 && (
                      <span className="absolute right-3.5 top-3.5 inline-flex h-[26px] items-center gap-[5px] rounded-full px-2.5 text-[11px] font-extrabold text-white" style={{ background: "rgba(0,0,0,0.22)" }}>
                        <Clock3 className="h-3 w-3" aria-hidden="true" /> {f.daysLeft}d left
                      </span>
                    )}
                    <div className="relative flex items-start gap-3.5">
                      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-white" style={{ background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.5)", boxShadow: "0 8px 20px rgba(0,0,0,0.16)" }}>
                        <Trophy className="h-[26px] w-[26px]" strokeWidth={2.25} />
                      </span>
                      <div className={`min-w-0 flex-1 text-white ${f.daysLeft > 0 ? "pr-16" : ""}`}>
                        <p className="fp-ml m-0 text-[23px] font-extrabold leading-[1.2]" style={{ textShadow: "0 1px 6px rgba(0,0,0,.18)" }}>
                          {f.name} <span className="text-[14px] font-semibold opacity-80">{f.year}</span>
                        </p>
                        {f.date && (
                          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[12.5px] font-bold opacity-90">
                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {f.date}
                          </p>
                        )}
                        <span className="mt-2.5 inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: "rgba(255,255,255,.24)", border: "1px solid rgba(255,255,255,.45)" }}>
                          {live && <span className="h-[7px] w-[7px] rounded-full bg-white" style={{ boxShadow: "0 0 0 3px rgba(255,255,255,.3)" }} />}
                          {f.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-[18px] pb-[18px] pt-4">
                    {f.blurb && <p className="m-0 mb-3 line-clamp-2 text-[13px] font-semibold leading-normal" style={{ color: theme.sub }}>{f.blurb}</p>}
                    <div className="grid grid-cols-2 gap-2.5">
                      {([[Users, f.registrations, "Registered"], [ListChecks, f.eventCount ?? f.competitions.length, "Events"]] as const).map(([Icon, n, label]) => (
                        <div key={label} className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5" style={{ background: mix(f.accent, 8), border: `1px solid ${mix(f.accent, 16)}` }}>
                          <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: mix(f.accent, 12), color: f.accent }}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="fp-num block text-[22px]" style={{ color: theme.text }}>{n}</span>
                            <span className="fp-cap mt-[3px] block text-[9.5px] tracking-[0.1em]" style={{ color: theme.sub }}>{label}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <Link
                      href={`/feast/${f.slug}`}
                      className="mt-3.5 flex min-h-[50px] w-full items-center justify-center gap-1.5 rounded-[15px] text-[15px] font-extrabold text-white transition-transform active:scale-[0.98]"
                      style={{ background: hero, boxShadow: `0 10px 24px ${mix(f.accent, 33)}` }}
                    >
                      View details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
            {!loading && feasts.length === 0 && (
              <p className="col-span-full text-sm font-semibold" style={{ color: theme.sub }}>No active fests right now — check back soon.</p>
            )}
          </div>

          {/* Widgets: shown here (after the feast list) on phone/tablet; the
              sidebar covers wide screens instead. */}
          <div className="mt-6 space-y-3.5 lg:hidden">
            <LiveActivityFeed />
            <TopRankingWidget />
            {showMeghalas && <TopRankingWidget tier="meghala" />}
          </div>

          <Link
            href="/search"
            className="mt-3.5 flex items-center gap-3 rounded-[20px] p-4 lg:mt-6"
            style={{ background: theme.surface, border: `1px solid ${theme.line}`, color: theme.text }}
          >
            <span aria-hidden="true" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--fp-note-bg)", color: theme.goldInk }}>
              <Search className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Already registered?</span>
              <span className="mt-0.5 block text-[13px] font-semibold" style={{ color: theme.sub }}>Look up your registration number</span>
            </span>
            <ChevronRight className="h-5 w-5" style={{ color: theme.faint }} aria-hidden="true" />
          </Link>
        </div>

        {/* Sidebar — wide screens only (mobile/tablet copy renders above) */}
        <div className="sticky top-4 mt-6 hidden space-y-3.5 lg:block">
          <LiveActivityFeed />
          <TopRankingWidget />
          {showMeghalas && <TopRankingWidget tier="meghala" />}
        </div>
      </div>

      {loginOpen && <LoginSheet onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
