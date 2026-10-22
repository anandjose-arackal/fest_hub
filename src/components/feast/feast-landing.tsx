"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, ChevronRight, Search, Loader2, Users, ListChecks, Clock3, Trophy, LogIn, MapPin, Palette, PenTool, Zap, Sparkles } from "lucide-react";
import { useFeasts, type FeastUI } from "@/hooks/use-feast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { GlowBtn, LoginSheet, mix, theme } from "./feast-shared";
import { Eyebrow } from "./feast-ui";
import { LiveActivityFeed, TopRankingWidget } from "./feast-dashboard-widgets";
import { MissionCountdown } from "./feast-countdown";
import { LatestResultWidget } from "./feast-latest-result";
import type { OrgSettings } from "@/types";

export function FeastLanding({ org }: { org: OrgSettings }) {
  const { feasts, loading } = useFeasts();
  const publishedCounts = usePublishedCounts(feasts.map((f) => f.id));
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
          <span className="fp-app-name fp-disp fp-hl-text mt-2 block text-[min(19.5vw,78px)] sm:text-[104px] xl:text-[132px]">{org.app_name || "Competitions & Results"}</span>
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

          {/* One card per row until the content column is wide enough for
              two to keep their name, date and progress on single lines. */}
          <div className="grid grid-cols-1 gap-3.5 2xl:grid-cols-2">
            {feasts.map((f, i) => (
              <FestCard key={f.slug} feast={f} index={i} published={publishedCounts[f.id]} />
            ))}
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

// ── Active Fests card ────────────────────────────────────────────────────
// One fest at a glance, and one tap into it: the fest's colours run down a
// spine on the left (its type icon on top); the glass body carries the name,
// status and dates, then how far the results are — the thing people come
// back for — and registrations/events as a quiet footer. The whole card is
// the link.
const FEST_ICONS = { Palette, PenTool, Zap, Sparkles } as const;

function FestCard({ feast: f, index, published }: { feast: FeastUI; index: number; published: number | undefined }) {
  const Icon = FEST_ICONS[f.icon as keyof typeof FEST_ICONS] ?? Trophy;
  const spine = `linear-gradient(180deg, ${f.tint[0]}, ${f.tint[1]} 60%, ${f.accent})`;
  const live = f.status === "Ongoing";
  const done = f.status === "Completed";
  const events = f.eventCount ?? f.competitions.length;
  const showProgress = (live || done) && events > 0 && published !== undefined;
  const pct = showProgress ? Math.min(100, Math.round(((published ?? 0) / events) * 100)) : 0;

  return (
    <Link
      href={`/feast/${f.slug}`}
      data-tour={index === 0 ? "feast-listing-first" : undefined}
      aria-label={`${f.name} ${f.year}, ${f.status}`}
      className="fp-fest-card fp-fade-up group relative flex overflow-hidden rounded-[24px] outline-none transition-transform active:scale-[0.99] focus-visible:[box-shadow:0_0_0_3px_var(--fp-primary-light)]"
      style={{
        ...theme.glassStrong,
        background: theme.surface2,
        border: `1px solid ${mix(f.accent, 26)}`,
        boxShadow: `0 18px 40px ${mix(f.accent, 16)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        animationDelay: `${0.05 + index * 0.08}s`,
      }}
    >
      {/* Spine: the fest's full colours, its type icon, and the year. */}
      <div className="relative flex w-[72px] shrink-0 flex-col items-center justify-between py-4 sm:w-[84px]" style={{ background: spine }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.35), transparent 70%)" }} />
        <span aria-hidden="true" className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)", boxShadow: "0 8px 18px rgba(0,0,0,0.18)" }}>
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <span className="fp-num relative text-[15px] text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>{f.year}</span>
      </div>

      {/* A wash of the fest's colour bleeding off the spine into the glass. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[72px] w-1/2 sm:left-[84px]" style={{ background: `linear-gradient(90deg, ${mix(f.accent, 18)}, transparent)` }} />

      <div className="relative flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <StatusChip status={f.status} daysLeft={f.daysLeft} accent={f.accent} />
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5"
            style={{ background: mix(f.accent, 22), border: `1px solid ${mix(f.accent, 55)}`, color: theme.text, boxShadow: `0 0 14px ${mix(f.accent, 30)}` }}
          >
            <ChevronRight className="h-5 w-5" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="fp-ml m-0 text-[22px] font-extrabold leading-[1.2] sm:text-[24px]" style={{ color: theme.text }}>{f.name}</p>
          {f.date && (
            <p className="m-0 mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold" style={{ color: theme.sub }}>
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {f.date}
            </p>
          )}
        </div>

        {showProgress ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="whitespace-nowrap text-[12.5px] font-bold" style={{ color: theme.sub }}>
                <span className="fp-num text-[18px]" style={{ color: theme.text }}>{published}</span>/{events} results out
              </span>
              <span className="fp-num text-[13px]" style={{ color: f.accent }}>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--fp-track)" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Results published">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${f.tint[0]}, ${f.accent})`, boxShadow: `0 0 10px ${mix(f.accent, 55)}` }} />
            </div>
          </div>
        ) : (
          f.blurb && <p className="m-0 line-clamp-2 text-[13px] font-semibold leading-normal" style={{ color: theme.sub }}>{f.blurb}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1">
          <Stat icon={Users} value={f.registrations} label="registered" />
          <Stat icon={ListChecks} value={events} label="events" />
        </div>
      </div>
    </Link>
  );
}

function StatusChip({ status, daysLeft, accent }: { status: string; daysLeft: number; accent: string }) {
  const live = status === "Ongoing";
  const label = !live && status !== "Completed" && daysLeft > 0 ? `${daysLeft}d left` : status;
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-extrabold"
      style={live
        ? { background: "var(--fp-live-bg)", color: "var(--fp-live)", border: "1px solid var(--fp-live-line)" }
        : { background: mix(accent, 14), color: theme.text, border: `1px solid ${mix(accent, 30)}` }}
    >
      {live ? <span className="fp-livedot h-[7px] w-[7px]" /> : status !== "Completed" && daysLeft > 0 ? <Clock3 className="h-3 w-3" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold" style={{ color: theme.sub }}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="fp-num text-[16px]" style={{ color: theme.text }}>{value}</span>
      {label}
    </span>
  );
}

// Published results per fest — feast_competitions is public-read, so one
// small client query covers every card.
function usePublishedCounts(feastIds: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = feastIds.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    supabase
      .from("feast_competitions")
      .select("feast_id")
      .eq("result_status", "published")
      .in("feast_id", key.split(","))
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, number> = Object.fromEntries(key.split(",").map((id) => [id, 0]));
        for (const r of data ?? []) next[r.feast_id] = (next[r.feast_id] ?? 0) + 1;
        setCounts(next);
      });
    return () => { cancelled = true; };
  }, [key]);
  return counts;
}
