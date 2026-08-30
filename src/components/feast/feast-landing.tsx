"use client";

import Link from "next/link";
import { Calendar, ChevronRight, Search, Loader2, ArrowRight, Sparkles, Users, ListChecks, Clock3, Trophy } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { GlassPanel, StatusPill, SectionTitle, theme } from "./feast-shared";
import { LiveActivityFeed, TopShakhasWidget } from "./feast-dashboard-widgets";
import type { OrgSettings } from "@/types";

export function FeastLanding({ org }: { org: OrgSettings }) {
  const { feasts, loading } = useFeasts();

  return (
    <div>
      <div className="pt-4">
        <p
          className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider"
          style={{ color: theme.gold, fontFamily: "var(--font-poppins), sans-serif" }}
        >
          <Sparkles className="h-3 w-3 fill-current" /> {org.tagline || "Feast Portal"}
        </p>
        <h1
          className="mt-1 text-[32px] font-bold leading-[1.08] tracking-tight sm:text-[40px]"
          style={{ fontFamily: "var(--font-anek), sans-serif" }}
        >
          <span style={{ color: theme.text }}>{org.org_name_en || "Feast Hub"}</span>
          <br />
          <span
            style={{
              background: "linear-gradient(100deg, #F5C542, #EC4899, #A855F7)",
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
          <SectionTitle right={loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} /> : <span className="text-xs" style={{ color: theme.sub }}>{feasts.length} active</span>}>
            Active Feasts
          </SectionTitle>

          {/* Widgets show here first on phone/tablet, above the feast list */}
          <div className="mb-4 space-y-4 lg:hidden">
            <LiveActivityFeed />
            <TopShakhasWidget />
          </div>

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
              <p className="col-span-full text-sm" style={{ color: theme.sub }}>No active feasts right now — check back soon.</p>
            )}
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
    </div>
  );
}
