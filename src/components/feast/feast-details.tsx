"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, MapPin, Clock, Lock, Ticket, Users, Layers, Medal, ClipboardList, Trophy,
  LogIn, Eye, EyeOff, ChevronDown, ChevronRight,
} from "lucide-react";
import { useFeast } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { getPublishedResults } from "@/actions/results";
import { getPublishedTeamResults } from "@/actions/team-results";
import { GlassPanel, GlowBtn, StatusPill, StatBlock, FeastTopBar, theme, CATEGORY_COLORS, CATEGORY_LABELS } from "./feast-shared";
import { ResultTable, sortResults, type PublicResultRow } from "./feast-shared-results";

const CAT_CONFIG: { slug: string; label: string; color: string }[] = [
  { slug: "sub_junior", label: "Sub Junior", color: CATEGORY_COLORS.sub_junior },
  { slug: "junior", label: "Junior", color: CATEGORY_COLORS.junior },
  { slug: "senior", label: "Senior", color: CATEGORY_COLORS.senior },
  { slug: "super_senior", label: "Super Senior", color: CATEGORY_COLORS.super_senior },
  { slug: "elder", label: "Elder", color: CATEGORY_COLORS.elder },
];

function statusPill(status: string) {
  switch (status) {
    case "progressing": return { label: "Live", bg: "rgba(251,146,60,0.18)", color: "#D97706" };
    case "completed": return { label: "Completed", bg: "rgba(34,197,94,0.18)", color: "#16A34A" };
    case "published": return { label: "Published", bg: "rgba(107,70,255,0.18)", color: "#6B46FF" };
    default: return { label: "Upcoming", bg: "rgba(156,163,175,0.18)", color: "#6B7280" };
  }
}

function genderLabel(gender: string | null) {
  if (gender === "boy") return { label: "Boys", color: "#3B82F6" };
  if (gender === "girl") return { label: "Girls", color: "#EC4899" };
  return null;
}

function LoginSheet({ onClose }: { onClose: () => void }) {
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

function CompetitionCard({ comp, feastId }: { comp: ReturnType<typeof useFeast>["feast"] extends infer F ? (F extends { competitions: (infer C)[] } ? C : never) : never; feastId: string }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<PublicResultRow[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const cat = CAT_CONFIG.find((c) => c.slug === comp.competitionCategorySlug);
  const catColor = cat?.color ?? theme.purple;
  const pill = statusPill(comp.compStatus);
  const gender = genderLabel(comp.gender);
  const isTeam = comp.cat === "Team";

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
    <GlassPanel className="relative mb-3 overflow-hidden p-4">
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
  const { session, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const isMeAdmin = profile?.role === "me_admin";
  // Registering a participant always assigns them to the signed-in admin's
  // own shakha (see feast-register.tsx's adminShakha lookup, which has no
  // manual shakha picker at all) — so an admin with no shakha_id has no
  // branch to register into, regardless of role. me_admin oversees every
  // branch and is excluded outright, same as before.
  const canRegister = !!session && !isMeAdmin && !!profile?.shakha_id;

  const availableCats = useMemo(() => {
    if (!feast) return [];
    const slugs = new Set(feast.competitions.map((c) => c.competitionCategorySlug).filter(Boolean));
    return CAT_CONFIG.filter((c) => slugs.has(c.slug));
  }, [feast]);

  const tab = activeTab ?? availableCats[0]?.slug ?? null;
  const hasTeamComp = feast?.competitions.some((c) => c.cat === "Team") ?? false;

  const tabComps = feast?.competitions.filter((c) => c.cat === "Individual" && c.competitionCategorySlug === tab) ?? [];

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
      <GlassPanel strong glow={feast.accent} className="relative overflow-hidden p-5" style={{ background: `linear-gradient(140deg, ${feast.tint[0]}cc, ${feast.tint[1]}cc)` }}>
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
        <StatusPill label={feast.status} white />
        <p className="mt-3 text-[28px] font-bold text-white">{feast.name} <span className="font-normal opacity-70">{feast.year}</span></p>
        {feast.venue && <p className="mt-1 flex items-center gap-1 text-sm text-white/85"><MapPin className="h-3.5 w-3.5" />{feast.venue}</p>}
        <div className="mt-4 flex items-center rounded-2xl border border-white/60 bg-white/15 py-3 backdrop-blur-md">
          <StatBlock value={feast.registrations} label="Registered" />
          <div className="h-8 w-px bg-white/30" />
          <StatBlock value={feast.competitions.length} label="Events" />
          <div className="h-8 w-px bg-white/30" />
          <StatBlock value={feast.daysLeft} label="Days Left" color="#8d027de3" />
        </div>
      </GlassPanel>

      {/* Auth-gated actions */}
      {!authLoading && (
        <div className="mt-4 space-y-2">
          {!session ? (
            <GlowBtn variant="ghost" size="lg" className="w-full" icon={Lock} onClick={() => setLoginOpen(true)}>Login to Register</GlowBtn>
          ) : canRegister ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <GlowBtn variant="gold" size="lg" className="w-full" icon={Ticket} onClick={() => router.push(`/feast/${slug}/register`)}>Register Now</GlowBtn>
              {hasTeamComp && (
                <GlowBtn variant="pink" size="lg" className="w-full" icon={Users} onClick={() => router.push(`/feast/${slug}/register-team`)}>Register Team</GlowBtn>
              )}
            </div>
          ) : null}

          <GlowBtn variant="ghost" size="md" className="w-full" icon={Layers} onClick={() => router.push(`/feast/${slug}/stages`)}>Competition Stages</GlowBtn>

          <div className="grid grid-cols-2 gap-2">
            <GlowBtn variant="ghost" size="md" className="w-full" icon={Medal} onClick={() => router.push(`/results?feast=${slug}`)}>Results</GlowBtn>
            {canRegister ? (
              <GlowBtn variant="ghost" size="md" className="w-full" icon={ClipboardList} onClick={() => router.push(`/feast/${slug}/registrations`)}>My Registrations</GlowBtn>
            ) : (
              <GlowBtn variant="ghost" size="md" className="w-full" icon={Trophy} onClick={() => router.push(`/rankings?feast=${slug}`)}>Leaderboard</GlowBtn>
            )}
          </div>
        </div>
      )}

      {/* Competitions */}
      <div className="mt-6 rounded-[26px] border p-4" style={{ background: "linear-gradient(145deg,#ede9fe,#f5f3ff,#faf5ff,#ede9fe)", borderColor: "rgba(107,70,255,0.12)" }}>
        <p className="mb-3 text-[15px] font-semibold" style={{ color: theme.text }}>Competitions</p>
        {availableCats.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {availableCats.map((c) => {
              const active = tab === c.slug;
              return (
                <button
                  key={c.slug}
                  onClick={() => setActiveTab(c.slug)}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                  style={active ? { background: "linear-gradient(135deg, #6B46FF, #A78BFA)", color: "#fff", boxShadow: "0 4px 14px rgba(107,70,255,0.35)" } : { background: "rgba(255,255,255,0.45)", color: "#4B5563", border: "1.5px solid rgba(107,70,255,0.15)" }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
        {tabComps.length === 0 ? (
          <p className="text-sm" style={{ color: theme.faint }}>No competitions in this category yet.</p>
        ) : (
          tabComps.map((c) => <CompetitionCard key={c.id} comp={c} feastId={feast.id} />)
        )}
      </div>

      {loginOpen && <LoginSheet onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
