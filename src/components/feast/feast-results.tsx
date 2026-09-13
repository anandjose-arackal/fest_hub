"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ChevronDown, Trophy, Search, BookOpen } from "lucide-react";
import { useFeast, useFeasts, type FeastCompetitionUI } from "@/hooks/use-feast";
import { getPublishedResults } from "@/actions/results";
import { getPublishedTeamResults } from "@/actions/team-results";
import { CATEGORY_LABELS, FeastTabs, FeastTopBar, theme } from "./feast-shared";
import { ResultTable, sortResults, type PublicResultRow } from "./feast-shared-results";

const CAT_CONFIG = [
  { slug: "sub_junior", label: "Sub Jr", color: "#34D3EE" },
  { slug: "junior", label: "Junior", color: "#22C55E" },
  { slug: "senior", label: "Senior", color: "#6B46FF" },
  { slug: "super_senior", label: "Super Sr", color: "#F5A742" },
  { slug: "elder", label: "Elder", color: "#9D99BC" },
] as const;
const TEAM_TAB = { slug: "team", label: "Team", color: "#EC4899" } as const;

function mapRow(r: Record<string, unknown>, isTeam: boolean): PublicResultRow {
  if (isTeam) {
    const teamReg = Array.isArray(r.team_registration) ? (r.team_registration as Record<string, unknown>[])[0] : (r.team_registration as Record<string, unknown> | undefined);
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
  const partReg = Array.isArray(r.participant_registration) ? (r.participant_registration as Record<string, unknown>[])[0] : (r.participant_registration as Record<string, unknown> | undefined);
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
}

function CompCard({ comp, catColor }: { comp: FeastCompetitionUI; catColor: string }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PublicResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isTeam = comp.cat === "Team";
  const isPublished = comp.compStatus === "published";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && results === null) {
      setLoading(true);
      const rows = isTeam ? await getPublishedTeamResults(comp.id) : await getPublishedResults(comp.id);
      setResults(sortResults(rows.map((r) => mapRow(r as unknown as Record<string, unknown>, isTeam))));
      setLoading(false);
    }
  }

  const positions = (results ?? []).filter((r) => r.position !== null);
  const grades = (results ?? []).filter((r) => r.position === null && r.grade !== null);

  return (
    <div className="relative mb-2.5 overflow-hidden rounded-2xl border" style={{ background: "rgba(255,255,255,0.52)", backdropFilter: "blur(16px)", borderColor: "rgba(255,255,255,0.7)" }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: catColor }} />
      <button onClick={toggle} className="w-full pl-4 pr-3 py-2.5 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 text-[18px] leading-tight" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{comp.name}</p>
          <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
            {isPublished ? (
              <span className="flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(107,70,255,0.14)", color: theme.purple }}><Trophy className="mr-0.5 h-2.5 w-2.5" />Results</span>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(156,163,175,0.15)", color: "#9CA3AF" }}>Pending</span>
            )}
            <span className="flex h-6 w-6 items-center justify-center rounded-full transition-transform" style={{ background: "rgba(107,70,255,0.1)", transform: open ? "rotate(180deg)" : undefined }}>
              <ChevronDown className="h-3.5 w-3.5" style={{ color: theme.purple }} />
            </span>
          </div>
        </div>
        {comp.gender && (
          <p className="mt-0.5 text-sm" style={{ color: comp.gender === "girl" ? "#EC4899" : "#3B82F6" }}>{comp.gender === "girl" ? "Girls" : "Boys"}</p>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-[18px] w-[18px] animate-spin" style={{ color: catColor }} /></div>
          ) : !isPublished ? (
            <div className="rounded-xl py-5 text-center text-[13px]" style={{ background: `${catColor}10`, color: "#9CA3AF" }}>Results not yet published</div>
          ) : (results?.length ?? 0) === 0 ? (
            <div className="rounded-xl py-5 text-center text-[13px]" style={{ background: `${catColor}10`, color: "#9CA3AF" }}>No results recorded</div>
          ) : (
            <div className="lg:grid lg:grid-cols-2 lg:gap-5">
              <ResultTable title="Positions" rows={positions} color={catColor} />
              <ResultTable title="Grades" rows={grades} color={catColor} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeastContent({ slug }: { slug: string }) {
  const { feast, loading } = useFeast(slug);
  const [activeTab, setActiveTab] = useState<string>("");

  const hasTeam = feast?.competitions.some((c) => c.cat === "Team") ?? false;
  const available = [
    ...CAT_CONFIG.filter((cat) => feast?.competitions.some((c) => c.competitionCategorySlug === cat.slug && c.cat !== "Team")),
    ...(hasTeam ? [TEAM_TAB] : []),
  ];
  const resolved = available.some((c) => c.slug === activeTab) ? activeTab : available[0]?.slug ?? "";
  const filtered = resolved === "team" ? feast?.competitions.filter((c) => c.cat === "Team") ?? [] : feast?.competitions.filter((c) => c.competitionCategorySlug === resolved && c.cat !== "Team") ?? [];
  const activeColor = available.find((c) => c.slug === resolved)?.color ?? theme.purple;

  if (loading && !feast?.competitions.length) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.lavender }} /></div>;
  if (!feast?.competitions.length) return <p className="py-10 text-center text-sm" style={{ color: theme.sub }}>No competitions found for this fest.</p>;

  return (
    <div className="relative overflow-hidden rounded-[20px] p-3" style={{ background: "linear-gradient(145deg,#ede9fe,#f5f3ff,#faf5ff,#ede9fe)", border: "1px solid rgba(107,70,255,0.12)" }}>
      {available.length === 0 ? (
        <p className="py-8 text-center text-[15px]" style={{ color: "#6B7280" }}>No competitions yet.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {available.map((cat) => {
              const on = cat.slug === resolved;
              return (
                <button
                  key={cat.slug}
                  onClick={() => setActiveTab(cat.slug)}
                  className="flex shrink-0 items-center gap-1.5 rounded-[13px] px-4 py-2.5 text-[16px] font-extrabold"
                  style={on ? { background: "linear-gradient(135deg,#6B46FF,#A78BFA)", color: "#fff", boxShadow: "0 4px 14px rgba(107,70,255,0.35)" } : { background: "rgba(255,255,255,0.45)", color: "#4B5563", border: "1.5px solid rgba(107,70,255,0.15)" }}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: on ? "rgba(255,255,255,0.7)" : cat.color }} />
                  {cat.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-[15px]" style={{ color: "#9CA3AF" }}>No competitions in this category.</p>
            ) : (
              filtered.map((comp) => <CompCard key={comp.id} comp={comp} catColor={activeColor} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function FeastResults() {
  const router = useRouter();
  const search = useSearchParams();
  const initialSlug = search.get("feast") ?? "";
  const { feasts, loading: feastsLoading } = useFeasts();
  const [activeSlug, setActiveSlug] = useState(initialSlug);

  useEffect(() => {
    if (feasts.length > 0 && !feasts.find((f) => f.slug === activeSlug)) setActiveSlug(feasts[0].slug);
  }, [feasts, activeSlug]);

  function handlePick(s: string) {
    setActiveSlug(s);
    router.replace(`/results?feast=${s}`);
  }

  const searchCta = (
    <button
      onClick={() => router.push(`/search?feast=${activeSlug}`)}
      className="flex w-full items-center gap-2.5 rounded-[14px] px-4 py-3"
      style={{ background: "rgba(255,255,255,0.72)", border: "1.5px solid rgba(107,70,255,0.14)", backdropFilter: "blur(12px)" }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(107,70,255,0.1)" }}><Search className="h-[15px] w-[15px]" style={{ color: "#8B5CF6" }} /></div>
      <div className="flex-1 text-left">
        <p className="text-sm font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>Search Participants</p>
        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Find a participant and see their results</p>
      </div>
      <ChevronDown className="h-3.5 w-3.5" style={{ color: "#C4B5FD", transform: "rotate(-90deg)" }} />
    </button>
  );

  return (
    <div>
      <FeastTopBar title="Results" />
      <FeastTabs feasts={feasts} active={activeSlug} onPick={handlePick} loading={feastsLoading} />

      <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <div className="mb-4 lg:hidden">{searchCta}</div>

          {!feastsLoading && feasts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16"><BookOpen className="h-7 w-7" style={{ color: theme.faint }} /><p className="text-sm" style={{ color: theme.sub }}>No fests found.</p></div>
          ) : !feastsLoading && feasts.length > 0 && !feasts.some((f) => f.slug === activeSlug) ? (
            <div className="flex justify-center py-16"><Loader2 className="h-[22px] w-[22px] animate-spin" style={{ color: theme.lavender }} /></div>
          ) : activeSlug ? (
            <FeastContent key={activeSlug} slug={activeSlug} />
          ) : null}
        </div>

        {/* Sidebar — wide screens only (mobile copy renders above) */}
        <div className="sticky top-4 hidden lg:block">{searchCta}</div>
      </div>
    </div>
  );
}
