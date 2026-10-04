"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, MapPin, Clock, Lock, Ticket, Layers, Medal, ClipboardList, Trophy, Calendar,
  ChevronDown, Info, type LucideIcon,
} from "lucide-react";
import { useFeast } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { GlowBtn, FeastTopBar, LoginSheet, catStyle, mix, theme } from "./feast-shared";
import { CompetitionResults, competitionCategoryLabel, loadCompetitionResults, type PublicResultRow } from "./feast-shared-results";
import { SocialPosterOverlay, type SocialPosterWinner } from "./social-poster/social-poster-overlay";
import { feastPosterHeading } from "@/lib/feast-data";
import { Chip } from "./feast-ui";

const CAT_CONFIG: { slug: string; label: string }[] = [
  { slug: "sub_junior", label: "Sub Junior" },
  { slug: "junior", label: "Junior" },
  { slug: "senior", label: "Senior" },
  { slug: "super_senior", label: "Super Senior" },
  { slug: "elder", label: "Elder" },
];
// Team competitions have no age category (see AGENTS.md: they mirror the
// participant chain via team_registrations instead) — same pattern as
// feast-results.tsx's TEAM_TAB, appended as its own tab rather than folded
// into one of the age-category ones.
const TEAM_TAB = { slug: "team", label: "Team" };

function statusPill(status: string) {
  switch (status) {
    case "progressing": return { label: "Live", bg: "var(--fp-warn-bg)", color: "var(--fp-warn)" };
    case "completed": return { label: "Completed", bg: "var(--fp-ok-bg)", color: "var(--fp-ok)" };
    case "published": return { label: "Published", bg: mix("var(--fp-primary)", 14), color: "var(--fp-link)" };
    default: return { label: "Upcoming", bg: "var(--fp-muted-bg)", color: "var(--fp-muted-fg)" };
  }
}

// registration_deadline is a plain `date` (no time component) — the last
// day registration is open, not the moment it closes. Comparing ISO date
// strings (not Date objects) avoids the deadline day itself reading as
// already closed for shakhas west of UTC.
function isRegistrationClosed(deadline: string | null): boolean {
  if (!deadline) return false;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return todayIso > deadline.slice(0, 10);
}

function genderLabel(gender: string | null) {
  if (gender === "boy") return { label: "Boys", color: "var(--fp-boys)" };
  if (gender === "girl") return { label: "Girls", color: "var(--fp-girls)" };
  return null;
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl py-3 text-center" style={{ background: "rgba(255,255,255,.17)", border: "1px solid rgba(255,255,255,.35)" }}>
      <div className="fp-num text-[26px] lg:text-[32px]">{value}</div>
      <div className="fp-cap mt-[5px] text-[9.5px] tracking-[0.1em] opacity-85">{label}</div>
    </div>
  );
}

function QuickTile({ icon: Icon, label, color, onClick }: { icon: LucideIcon; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[18px] pb-3 pt-3.5 transition-transform active:scale-95"
      style={{ background: mix(color, 8), border: `1px solid ${mix(color, 18)}`, color: theme.text }}
    >
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: mix(color, 16), color }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[12.5px] font-extrabold">{label}</span>
    </button>
  );
}

type FeastComp = NonNullable<ReturnType<typeof useFeast>["feast"]>["competitions"][number];

function CompetitionCard({ comp, delay, onPoster }: { comp: FeastComp; delay: number; onPoster: (row: PublicResultRow) => void }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<PublicResultRow[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const isTeam = comp.cat === "Team";
  const cat = catStyle(isTeam ? null : comp.competitionCategorySlug);
  const pill = statusPill(comp.compStatus);
  const gender = genderLabel(comp.gender);
  const showInfo = !!comp.info && (comp.compStatus === "upcoming" || comp.compStatus === "progressing");

  async function toggleResults() {
    if (!resultsOpen && results === null) {
      setLoadingResults(true);
      setResults(await loadCompetitionResults(comp));
      setLoadingResults(false);
    }
    setResultsOpen((o) => !o);
  }

  return (
    <div
      className="fp-fade-up relative h-fit overflow-hidden rounded-[20px] py-3.5 pl-4 pr-3.5"
      style={{ animationDelay: `${delay}s`, ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}` }}
    >
      <span aria-hidden="true" className="absolute left-4 right-4 top-0 h-[2px] rounded-sm" style={{ background: `linear-gradient(90deg, transparent, ${cat.color}, transparent)` }} />
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="fp-ml text-[19px] font-extrabold leading-[1.3]" style={{ color: theme.text }}>{comp.name}</span>
          {gender && (
            <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: mix(gender.color, 10), color: gender.color, border: `1px solid ${mix(gender.color, 40)}` }}>
              {gender.label}
            </span>
          )}
        </div>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>
        {comp.compStatus === "published" && (
          <button
            type="button"
            onClick={toggleResults}
            aria-label={resultsOpen ? "Hide results" : "View results"}
            aria-expanded={resultsOpen}
            className="-mt-1.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{ background: "var(--fp-btn)", color: "var(--fp-btn-fg)", border: `2px solid ${theme.surface2}`, boxShadow: "0 4px 12px rgba(var(--fp-primary-rgb),0.4)" }}
          >
            {loadingResults ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              // Gentle downward nudge while closed hints "tap to see results".
              <span className={resultsOpen ? undefined : "animate-[resultsNudge_1.6s_ease-in-out_infinite]"}>
                <ChevronDown className="h-[18px] w-[18px] transition-transform" strokeWidth={2.75} style={{ transform: resultsOpen ? "rotate(180deg)" : undefined }} />
              </span>
            )}
          </button>
        )}
        {showInfo && (
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            aria-label={infoOpen ? "Hide info" : "Show info"}
            aria-expanded={infoOpen}
            className="-mt-1.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
            style={{ background: theme.surface3, border: `1px solid ${theme.line2}`, color: theme.sub }}
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>
      {(comp.stage || comp.scheduledTime || comp.venue) && (
        <div className="fp-ml mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold" style={{ color: theme.sub }}>
          {comp.stage && <span>Stage {comp.stage.number} — {comp.stage.title}</span>}
          {comp.scheduledTime && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{comp.scheduledTime}</span>}
          {comp.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{comp.venue}</span>}
        </div>
      )}

      {comp.compStatus === "progressing" && comp.progressPct != null && (
        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--fp-track)" }}>
            <div className="fp-grow h-full rounded-full" style={{ width: `${comp.progressPct}%`, background: "linear-gradient(90deg,#F59E0B,#FBBF24)" }} />
          </div>
          <p className="m-0 mt-[5px] text-[11.5px] font-extrabold" style={{ color: "var(--fp-warn)" }}>{comp.progressPct}% complete</p>
        </div>
      )}

      {infoOpen && comp.info && (
        <div className="fp-fade-in mt-2.5 whitespace-pre-wrap rounded-xl px-3 py-2.5 text-[12.5px] font-semibold leading-normal" style={{ background: mix(cat.color, 12), color: theme.sub }}>
          <span className="fp-cap mb-1 block text-[9.5px]" style={{ color: cat.ink }}>Info</span>
          {comp.info}
        </div>
      )}

      {resultsOpen && (
        <div className="-mx-1.5 mt-1">
          <CompetitionResults rows={loadingResults ? undefined : results ?? undefined} accentColor={cat.color} onPoster={onPoster} />
        </div>
      )}
    </div>
  );
}

export function FeastDetails({ slug }: { slug: string }) {
  const router = useRouter();
  const { feast, loading } = useFeast(slug);
  const { session, profile, adminScope, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [posterWinner, setPosterWinner] = useState<SocialPosterWinner | null>(null);
  const isMeAdmin = profile?.role === "me_admin";
  // Registering a participant assigns them to the signed-in admin's own
  // scope node — a shakha by default (see feast-register.tsx's adminShakha
  // lookup, no manual picker), or a shakha *beneath* their node once the org
  // runs at meghala/diocese level (feast-register.tsx then shows a picker
  // scoped to their descendants). An admin with no scope at all has nothing
  // to register into, regardless of role. me_admin oversees everything and
  // is excluded outright, same as before.
  const canRegister = !!session && !isMeAdmin && !!adminScope;

  const availableCats = useMemo(() => {
    if (!feast) return [];
    const slugs = new Set(feast.competitions.filter((c) => c.cat !== "Team").map((c) => c.competitionCategorySlug).filter(Boolean));
    const cats = CAT_CONFIG.filter((c) => slugs.has(c.slug));
    return feast.competitions.some((c) => c.cat === "Team") ? [...cats, TEAM_TAB] : cats;
  }, [feast]);

  const tab = activeTab ?? availableCats[0]?.slug ?? null;
  const registrationClosed = feast?.status === "Completed" || isRegistrationClosed(feast?.registrationDeadline ?? null);

  const tabComps = tab === "team"
    ? feast?.competitions.filter((c) => c.cat === "Team") ?? []
    : feast?.competitions.filter((c) => c.cat === "Individual" && c.competitionCategorySlug === tab) ?? [];

  if (loading && !feast) {
    return (
      <div>
        <FeastTopBar title="Loading…" onBack={() => router.push("/")} />
        <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>
      </div>
    );
  }
  if (!feast) return null;

  const resultsOut = feast.competitions.filter((c) => c.compStatus === "published").length;
  const live = feast.status === "Ongoing";

  return (
    <div className="pb-6">
      <FeastTopBar title={feast.name} onBack={() => router.push("/")} />

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[28px] px-[18px] pb-[18px] pt-5 text-white lg:p-8"
        style={{ background: `linear-gradient(150deg, ${feast.tint[0]} 0%, ${feast.tint[1]} 55%, ${feast.accent} 100%)`, boxShadow: `0 18px 40px ${mix(feast.accent, 32)}` }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.9) 1px, transparent 1.5px)", backgroundSize: "16px 16px" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-[50px] -top-[60px] h-[220px] w-[220px] rounded-full blur-[36px]" style={{ background: "rgba(255,255,255,.22)" }} />
        <div className="relative lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: "rgba(255,255,255,.24)", border: "1px solid rgba(255,255,255,.45)" }}>
              {live && <span className="fp-livedot h-[7px] w-[7px]" style={{ background: "#fff" }} />}
              {feast.status}
            </span>
            <h1 className="fp-ml m-0 mt-3 text-[32px] font-extrabold leading-[1.15] lg:text-[44px]" style={{ textShadow: "0 2px 10px rgba(0,0,0,.15)" }}>
              {feast.name} <span className="text-[18px] font-semibold opacity-75 lg:text-[22px]">{feast.year}</span>
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] font-bold opacity-[0.92]">
              {feast.venue && <span className="inline-flex items-center gap-[5px]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{feast.venue}</span>}
              {feast.date && <span className="inline-flex items-center gap-[5px]"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{feast.date}</span>}
            </div>
          </div>

          <div className="mt-[18px] grid grid-cols-3 gap-2 lg:mt-0 lg:w-[400px] lg:shrink-0">
            <HeroStat value={feast.registrations} label="Registered" />
            <HeroStat value={feast.competitions.length} label="Events" />
            {resultsOut > 0 ? <HeroStat value={resultsOut} label="Results out" /> : <HeroStat value={feast.daysLeft} label="Days left" />}
          </div>
        </div>
      </section>

      {/* Auth-gated actions */}
      {!authLoading && (
        <div className="mt-4 lg:flex lg:items-start lg:gap-3">
          <div className="lg:flex-1">
            {/* Once registration_deadline has passed or the fest is completed, the Feast Portal drops
                the login/register CTA entirely (admin can still register
                participants past the deadline via /admin/participants,
                unaffected by this). Stages/Results/My Regs below stay visible. */}
            {registrationClosed ? null : !session ? (
              <GlowBtn variant="ghost" size="lg" className="w-full" icon={Lock} onClick={() => setLoginOpen(true)}>Login to register</GlowBtn>
            ) : (
              canRegister && (
                // Team events are picked on the same form, after the individual ones.
                <GlowBtn variant="gold" size="lg" className="w-full" icon={Ticket} onClick={() => router.push(`/feast/${slug}/register`)}>Register now</GlowBtn>
              )
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2.5 lg:mt-0 lg:w-[420px] lg:shrink-0">
            <QuickTile icon={Layers} label="Stages" color="var(--fp-primary)" onClick={() => router.push(`/feast/${slug}/stages`)} />
            <QuickTile icon={Medal} label="Results" color="var(--fp-cyan)" onClick={() => router.push(`/results?feast=${slug}`)} />
            {canRegister ? (
              <QuickTile icon={ClipboardList} label="My regs" color="var(--fp-accent)" onClick={() => router.push(`/feast/${slug}/registrations`)} />
            ) : (
              <QuickTile icon={Trophy} label="Rankings" color="var(--fp-gold)" onClick={() => router.push(`/rankings?feast=${slug}`)} />
            )}
          </div>
        </div>
      )}

      {/* Competitions */}
      <section className="mt-[22px] rounded-[26px] px-3.5 py-4 lg:mt-8 lg:p-6" style={{ background: theme.surface3, border: `1px solid ${theme.line}` }}>
        <div className="flex items-center justify-between gap-2.5 px-0.5">
          <h2 className="fp-disp m-0 text-[28px] lg:text-[34px]">Competitions</h2>
          {tabComps.length > 0 && (
            <span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: theme.surface2, color: "var(--fp-link)", border: `1px solid ${theme.line2}` }}>
              {tabComps.length} {tabComps.length === 1 ? "event" : "events"}
            </span>
          )}
        </div>
        {availableCats.length > 0 && (
          <div className="fp-scroll -mx-3.5 my-3.5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {availableCats.map((c) => {
              const cs = catStyle(c.slug === "team" ? null : c.slug);
              return (
                <Chip key={c.slug} on={tab === c.slug} onClick={() => setActiveTab(c.slug)} dot={cs.color} from={cs.hi} to={cs.deep}>
                  {c.label}
                </Chip>
              );
            })}
          </div>
        )}
        {tabComps.length === 0 ? (
          <p className="m-0 mt-3 text-sm font-semibold" style={{ color: theme.faint }}>No competitions in this category yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
            {tabComps.map((c, i) => (
              <CompetitionCard
                key={c.id}
                comp={c}
                delay={Math.min(i, 10) * 0.04}
                onPoster={(row) =>
                  setPosterWinner({
                    rank: row.position as 1 | 2 | 3,
                    winnerName: row.name,
                    houseName: row.houseName,
                    shakhaName: row.shakha,
                    competitionName: c.name,
                    categoryLabel: competitionCategoryLabel(c),
                    feastName: feastPosterHeading(feast),
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {loginOpen && <LoginSheet onClose={() => setLoginOpen(false)} />}
      {posterWinner && <SocialPosterOverlay winner={posterWinner} onClose={() => setPosterWinner(null)} />}
    </div>
  );
}
