"use client";

import Link from "next/link";
import { Calendar, ChevronRight, Search, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useFeasts } from "@/hooks/use-feast";
import { GlassPanel, GlowBtn, StatusPill, SectionTitle, theme } from "./feast-shared";
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

      <SectionTitle right={loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} /> : <span className="text-xs" style={{ color: theme.sub }}>{feasts.length} active</span>}>
        Active Feasts
      </SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {feasts.map((f, i) => (
          <GlassPanel key={f.slug} strong pressable glow={f.accent} className="relative overflow-hidden p-5" data-tour={i === 0 ? "feast-listing-first" : undefined}>
            <div className="pointer-events-none absolute -top-5 -right-2.5 h-[120px] w-[120px] rounded-full blur-[30px]" style={{ background: `${f.accent}40` }} />
            <div className="relative">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[14px] text-2xl"
                  style={{ background: `linear-gradient(135deg, ${f.tint[0]}, ${f.tint[1]})`, boxShadow: `0 8px 22px ${f.accent}60` }}
                >
                  🏆
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[20px] font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>
                    {f.name} <span className="text-sm font-normal" style={{ color: theme.faint }}>{f.year}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: theme.sub }}>
                    <Calendar className="h-3 w-3" /> {f.date}
                  </p>
                </div>
              </div>
              {f.blurb && <p className="mt-2 line-clamp-2 text-xs" style={{ color: theme.sub }}>{f.blurb}</p>}
              <div className="mt-3 flex items-center justify-between">
                <StatusPill label={f.status} color={theme.cyan} />
                <div className="flex gap-3 text-right text-xs" style={{ color: theme.sub }}>
                  <span>{f.registrations} registered</span>
                  <span>{f.eventCount ?? f.competitions.length} events</span>
                </div>
              </div>
              <Link
                href={`/feast/${f.slug}`}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[13px] py-2.5 text-sm font-semibold text-white"
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
  );
}
