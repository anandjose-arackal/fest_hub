"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, MapPin, Clock, Lock, Ticket, Users, Layers, Medal, ClipboardList, Trophy,
  ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import { useFeast } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { getPublishedResults } from "@/actions/results";
import { getPublishedTeamResults } from "@/actions/team-results";
import { GlassPanel, GlowBtn, StatusPill, FeastTopBar, LoginSheet, theme, CATEGORY_COLORS } from "./feast-shared";
import { ResultTable, sortResults, type PublicResultRow } from "./feast-shared-results";

const CAT_CONFIG: { slug: string; label: string; color: string }[] = [
  { slug: "sub_junior", label: "Sub Junior", color: CATEGORY_COLORS.sub_junior },
  { slug: "junior", label: "Junior", color: CATEGORY_COLORS.junior },
  { slug: "senior", label: "Senior", color: CATEGORY_COLORS.senior },
  { slug: "super_senior", label: "Super Senior", color: CATEGORY_COLORS.super_senior },
  { slug: "elder", label: "Elder", color: CATEGORY_COLORS.elder },
];
// Team competitions have no age category (see AGENTS.md: they mirror the
// participant chain via team_registrations instead) — same pattern as
// feast-results.tsx's TEAM_TAB, appended as its own tab rather than folded
// into one of the age-category ones.
const TEAM_TAB = { slug: "team", label: "Team", color: theme.pink };

function statusPill(status: string) {
  switch (status) {
    case "progressing": return { label: "Live", bg: "rgba(251,146,60,0.18)", color: "#D97706" };
    case "completed": return { label: "Completed", bg: "rgba(34,197,94,0.18)", color: "#16A34A" };
    case "published": return { label: "Published", bg: "rgba(var(--fp-primary-rgb),0.18)", color: "var(--fp-primary)" };
    default: return { label: "Upcoming", bg: "rgba(156,163,175,0.18)", color: "#6B7280" };
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
  if (gender === "boy") return { label: "Boys", color: "#3B82F6" };
  if (gender === "girl") return { label: "Girls", color: "#EC4899" };
  return null;
}

function HeroStat({ icon: Icon, value, label }: { icon: LucideIcon; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/35 bg-white/15 py-3 backdrop-blur-md">
      <Icon className="h-4 w-4 text-white/80" />
      <span className="text-[20px] font-bold tabular-nums text-white">{value}</span>
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-white/70">{label}</span>
    </div>
  );
}

function QuickTile({ icon: Icon, label, color, onClick }: { icon: LucideIcon; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl py-3.5 transition-transform active:scale-95"
      style={{ background: `${color}14`, border: `1px solid ${color}2a` }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${color}22` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <span className="text-[11.5px] font-semibold" style={{ color: theme.text }}>{label}</span>
    </button>
  );
}

function CompetitionCard({ comp, feastId }: { comp: ReturnType<typeof useFeast>["feast"] extends infer F ? (F extends { competitions: (infer C)[] } ? C : never) : never; feastId: string }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<PublicResultRow[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const isTeam = comp.cat === "Team";
  const cat = CAT_CONFIG.find((c) => c.slug === comp.competitionCategorySlug);
  const catColor = isTeam ? TEAM_TAB.color : cat?.color ?? theme.purple;
  const pill = statusPill(comp.compStatus);
  const gender = genderLabel(comp.gender);

  async function toggleResults() {
    if (!resultsOpen && results === null) {
      setLoadingResults(true);
      const rows = isTeam ? await getPublishedTeamResults(comp.id) : await getPublishedResults(comp.id);
      const mapped: PublicResultRow[] = rows.map((row) => {
        const r = row as unknown as Record<string, unknown>;
        if (isTeam) {
          const teamReg = Array.isArray(r.team_registration)
            ? (r.team_registration as Record<string, unknown>[])[0]
            : (r.team_registration as Record<string, unknown> | undefined);
          const shakha = Array.isArray(teamReg?.shakha) ? (teamReg?.shakha as Record<string, unknown>[])[0] : (teamReg?.shakha as Record<string, unknown> | undefined);
          const members = ((teamReg?.team_registration_members as Record<string, unknown>[] | undefined) ?? []).map((m) => {
            const p = Array.isArray(m.participant) ? (m.participant as Record<string, unknown>[])[0] : (m.participant as Record<string, unknown> | undefined);
            return (p?.name as string) ?? "";
          });
          return {
            registrationId: r.id as string,
            name: (teamReg?.team_name as string) ?? "Team",
            houseName: members.join(", "),
            shakha: (shakha?.name as string) ?? "—",
            grade: r.grade as PublicResultRow["grade"],
            position: r.position as number | null,
            totalPoints: r.total_points as number,
            isTeam: true,
          };
        }
        const partReg = Array.isArray(r.participant_registration)
          ? (r.participant_registration as Record<string, unknown>[])[0]
          : (r.participant_registration as Record<string, unknown> | undefined);
        const participant = Array.isArray(partReg?.participant) ? (partReg?.participant as Record<string, unknown>[])[0] : (partReg?.participant as Record<string, unknown> | undefined);
        const shakha = Array.isArray(participant?.shakha) ? (participant?.shakha as Record<string, unknown>[])[0] : (participant?.shakha as Record<string, unknown> | undefined);
        return {
          registrationId: r.id as string,
          name: (participant?.name as string) ?? "—",
          houseName: (participant?.house_name as string) ?? null,
          shakha: (shakha?.name as string) ?? "—",
          grade: r.grade as PublicResultRow["grade"],
          position: r.position as number | null,
          totalPoints: r.total_points as number,
        };
      });
      setResults(sortResults(mapped));
      setLoadingResults(false);
    }
    setResultsOpen((o) => !o);
  }

  const positions = (results ?? []).filter((r) => r.position != null);
  const grades = (results ?? []).filter((r) => r.position == null && r.grade != null);

  return (
    <GlassPanel className="relative h-fit overflow-hidden p-4">
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: catColor }} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[19px] font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{comp.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>
            {comp.info && (comp.compStatus === "upcoming" || comp.compStatus === "progressing") && (
              <button onClick={() => setInfoOpen((o) => !o)}>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ color: theme.faint, transform: infoOpen ? "rotate(180deg)" : undefined }} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "#3D3A6B", fontFamily: "var(--font-anek), sans-serif" }}>
          {gender && <span style={{ color: gender.color, fontWeight: 600 }}>{gender.label}</span>}
          {comp.stage && <span>Stage {comp.stage.number} — {comp.stage.title}</span>}
          {comp.scheduledTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{comp.scheduledTime}</span>}
          {comp.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{comp.venue}</span>}
        </div>

        {comp.compStatus === "progressing" && comp.progressPct != null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full" style={{ width: `${comp.progressPct}%`, background: "linear-gradient(90deg,#F59E0B,#FBBF24)" }} />
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "#D97706" }}>{comp.progressPct}% complete</p>
          </div>
        )}

        {infoOpen && comp.info && (
          <div className="mt-2 rounded-lg border-l-[3px] p-2.5 text-xs whitespace-pre-wrap" style={{ background: `${catColor}12`, borderColor: catColor, color: theme.sub }}>
            <p className="mb-1 text-[10px] font-semibold uppercase" style={{ color: catColor }}>Info</p>
            {comp.info}
          </div>
        )}

        {comp.compStatus === "published" && (
          <button onClick={toggleResults} className="mt-2 text-xs font-semibold" style={{ color: theme.purple }}>
            {resultsOpen ? "Hide Results" : "View Results"}
          </button>
        )}
        {resultsOpen && (
          loadingResults ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.lavender }} /></div>
          ) : (results?.length ?? 0) === 0 ? (
            <p className="mt-2 text-xs" style={{ color: theme.faint }}>No published results yet.</p>
          ) : (
            <>
              <ResultTable title="Positions" rows={positions} color={catColor} />
              <ResultTable title="Grades" rows={grades} color={catColor} />
            </>
          )
        )}
      </div>
    </GlassPanel>
  );
}

export function FeastDetails({ slug }: { slug: string }) {
  const router = useRouter();
  const { feast, loading } = useFeast(slug);
  const { session, profile, adminScope, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
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
  const hasTeamComp = feast?.competitions.some((c) => c.cat === "Team") ?? false;
  const registrationClosed = isRegistrationClosed(feast?.registrationDeadline ?? null);

  const tabComps = tab === "team"
    ? feast?.competitions.filter((c) => c.cat === "Team") ?? []
    : feast?.competitions.filter((c) => c.cat === "Individual" && c.competitionCategorySlug === tab) ?? [];

  if (loading && !feast) {
    return (
      <div>
        <FeastTopBar title="Loading…" onBack={() => router.push("/")} />
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>
      </div>
    );
  }
  if (!feast) return null;

  return (
    <div>
      <FeastTopBar title={feast.name} onBack={() => router.push("/")} />

      {/* Hero */}
      <GlassPanel strong glow={feast.accent} className="relative overflow-hidden p-5 lg:p-8" style={{ background: `linear-gradient(140deg, ${feast.tint[0]}cc, ${feast.tint[1]}cc)` }}>
        <div className="pointer-events-none absolute -top-14 -right-14 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-black/10 blur-3xl" />
        <div className="relative lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <StatusPill label={feast.status} white />
            <p className="mt-3 text-[28px] font-bold leading-[1.15] text-white lg:text-[38px]">
              {feast.name} <span className="font-normal opacity-70">{feast.year}</span>
            </p>
            {feast.venue && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/85">
                <MapPin className="h-3.5 w-3.5" />{feast.venue}
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5 lg:mt-0 lg:w-[380px] lg:shrink-0">
            <HeroStat icon={Users} value={feast.registrations} label="Registered" />
            <HeroStat icon={Trophy} value={feast.competitions.length} label="Events" />
            <HeroStat icon={Clock} value={feast.daysLeft} label="Days Left" />
          </div>
        </div>
      </GlassPanel>

      {/* Auth-gated actions */}
      {!authLoading && (
        <div className="mt-5 lg:flex lg:items-start lg:gap-3">
          <div className="lg:flex-1">
            {/* Once registration_deadline has passed, the Feast Portal drops
                the login/register CTA entirely (admin can still register
                participants past the deadline via /admin/participants,
                unaffected by this). Stages/Results/My Regs below stay visible. */}
            {registrationClosed ? null : !session ? (
              <GlowBtn variant="ghost" size="lg" className="w-full" icon={Lock} onClick={() => setLoginOpen(true)}>Login to Register</GlowBtn>
            ) : (
              // The "Signed in as … Logout" indicator already appears on the
              // Feast Portal dashboard (feast-landing.tsx) — showing it here
              // too was redundant.
              canRegister && (
                <div className={`grid grid-cols-1 gap-2.5 ${hasTeamComp ? "sm:grid-cols-2" : ""}`}>
                  <GlowBtn variant="gold" size="lg" className="w-full" icon={Ticket} onClick={() => router.push(`/feast/${slug}/register`)}>Register Now</GlowBtn>
                  {hasTeamComp && (
                    <GlowBtn variant="pink" size="lg" className="w-full" icon={Users} onClick={() => router.push(`/feast/${slug}/register-team`)}>Register Team</GlowBtn>
                  )}
                </div>
              )
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2.5 lg:mt-0 lg:w-[420px] lg:shrink-0">
            <QuickTile icon={Layers} label="Stages" color={theme.purple} onClick={() => router.push(`/feast/${slug}/stages`)} />
            <QuickTile icon={Medal} label="Results" color={theme.cyan} onClick={() => router.push(`/results?feast=${slug}`)} />
            {canRegister ? (
              <QuickTile icon={ClipboardList} label="My Regs" color={theme.pink} onClick={() => router.push(`/feast/${slug}/registrations`)} />
            ) : (
              <QuickTile icon={Trophy} label="Leaderboard" color={theme.gold} onClick={() => router.push(`/rankings?feast=${slug}`)} />
            )}
          </div>
        </div>
      )}

      {/* Competitions */}
      <div className="mt-6 rounded-[26px] border p-4 lg:mt-8 lg:p-6" style={{ background: "linear-gradient(145deg,rgba(var(--fp-primary-rgb),0.08),rgba(var(--fp-primary-rgb),0.03),rgba(var(--fp-primary-rgb),0.02),rgba(var(--fp-primary-rgb),0.08))", borderColor: "rgba(var(--fp-primary-rgb),0.12)" }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-semibold" style={{ color: theme.text }}>Competitions</p>
          {tabComps.length > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(var(--fp-primary-rgb),0.12)", color: theme.purple }}>
              {tabComps.length} {tabComps.length === 1 ? "event" : "events"}
            </span>
          )}
        </div>
        {availableCats.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {availableCats.map((c) => {
              const active = tab === c.slug;
              return (
                <button
                  key={c.slug}
                  onClick={() => setActiveTab(c.slug)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                  style={active ? { background: "linear-gradient(135deg, var(--fp-primary), var(--fp-primary-light))", color: "#fff", boxShadow: "0 4px 14px rgba(var(--fp-primary-rgb),0.35)" } : { background: "var(--fp-glass)", color: theme.sub, border: "1.5px solid rgba(var(--fp-primary-rgb),0.15)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#fff" : c.color }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
        {tabComps.length === 0 ? (
          <p className="text-sm" style={{ color: theme.faint }}>No competitions in this category yet.</p>
        ) : (
          <div className="lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 space-y-3">
            {tabComps.map((c) => <CompetitionCard key={c.id} comp={c} feastId={feast.id} />)}
          </div>
        )}
      </div>

      {loginOpen && <LoginSheet onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
