"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ChevronRight, Trophy, Search, BookOpen, Clock, Users } from "lucide-react";
import { showsResults, useFeast, useFeasts, type FeastCompetitionUI } from "@/hooks/use-feast";
import { FeastTopBar, catStyle, mix, theme } from "./feast-shared";
import { feastPosterHeading } from "@/lib/feast-data";
import { CompetitionResults, competitionCategoryLabel, genderLabel, loadCompetitionResults, type PublicResultRow } from "./feast-shared-results";
import { Chip, Eyebrow, Medal } from "./feast-ui";
import { SocialPosterOverlay, type SocialPosterWinner } from "./social-poster/social-poster-overlay";

const CAT_TABS = [
  { slug: "sub_junior", label: "Sub Junior" },
  { slug: "junior", label: "Junior" },
  { slug: "senior", label: "Senior" },
  { slug: "super_senior", label: "Super Senior" },
  { slug: "elder", label: "Elder" },
] as const;
const TEAM_TAB = { slug: "team", label: "Team" } as const;

// ── Hero ring: published / total ────────────────────────────────────────
function ResultsRing({ done, total, size = 88 }: { done: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      role="img"
      aria-label={`${done} of ${total} results published`}
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(var(--fp-primary) 0%, var(--fp-accent) ${pct * 0.57}%, var(--fp-gold) ${pct}%, var(--fp-track) ${pct}% 100%)` }}
    >
      <div className="absolute inset-[6px] flex flex-col items-center justify-center gap-1 rounded-full" style={{ background: "var(--fp-base)" }}>
        <span className="fp-num" style={{ fontSize: Math.round(size * 0.31) }}>{done}</span>
        <span className="text-[10px] font-bold" style={{ color: theme.sub }}>of {total} out</span>
      </div>
    </div>
  );
}

// ── Item card (Boys / Girls / Open groups) ──────────────────────────────
function ItemCard({ comp, open, onToggle, rows, accent, delay, onPoster }: {
  comp: FeastCompetitionUI;
  open: boolean;
  onToggle: () => void;
  rows: PublicResultRow[] | undefined;
  accent: { color: string; hi: string };
  delay: number;
  onPoster: (row: PublicResultRow) => void;
}) {
  const out = comp.compStatus === "published";
  const g = genderLabel(comp.gender);
  const gc = g === "Girls" ? "var(--fp-girls)" : "var(--fp-boys)";
  const winner = rows?.find((r) => r.position === 1);
  const panelId = `item-${comp.id}`;
  return (
    <div
      id={`comp-${comp.id}`}
      className="fp-fade-up relative scroll-mt-24 overflow-hidden rounded-[20px] transition-colors"
      style={{
        animationDelay: `${delay}s`,
        background: open ? theme.surface2 : out ? theme.surface : theme.surface3,
        border: `1px solid ${open ? mix(accent.color, 50) : theme.line}`,
        boxShadow: open ? theme.shadow : undefined,
      }}
    >
      <span aria-hidden="true" className="absolute left-[18px] right-[18px] top-0 h-[2px] rounded-sm" style={{ background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)`, opacity: open ? 1 : out ? 0.7 : 0.25 }} />
      <button
        type="button"
        onClick={onToggle}
        disabled={!out}
        aria-expanded={out ? open : undefined}
        aria-controls={out ? panelId : undefined}
        className="flex w-full items-center gap-3.5 py-4 pl-4 pr-3.5 text-left disabled:cursor-default"
        style={{ color: theme.text }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="fp-ml text-[19px] font-bold leading-[1.3]" style={{ color: out ? theme.text : theme.sub }}>{comp.name}</span>
            {g && (
              <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ color: gc, border: `1px solid ${mix(gc, 40)}`, background: mix(gc, 10) }}>{g}</span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12.5px] font-bold" style={{ color: theme.sub }}>
            {comp.filled > 0 && (
              <span className="inline-flex items-center gap-[5px]"><Users className="h-[13px] w-[13px]" aria-hidden="true" />{comp.filled} participants</span>
            )}
            {out ? (
              <span className="inline-flex items-center gap-[5px]" style={{ color: theme.goldInk }}><Trophy className="h-[13px] w-[13px]" aria-hidden="true" />Results out</span>
            ) : (
              <span className="inline-flex items-center gap-[5px]"><Clock className="h-[13px] w-[13px]" aria-hidden="true" />Awaiting results</span>
            )}
          </span>
          {out && !open && winner && (
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold" style={{ color: theme.text }}>
              <Medal pos={1} size={16} tiny label={false} />
              <span className="fp-ml min-w-0 truncate">{winner.name} <span style={{ color: theme.faint }}>· {winner.shakha}</span></span>
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[transform,background] duration-300"
          style={{
            background: open ? accent.hi : out ? theme.surface3 : "transparent",
            color: open ? "var(--fp-on-cat)" : out ? theme.text : theme.faint,
            transform: open ? "rotate(90deg)" : undefined,
          }}
        >
          {out ? <ChevronRight className="h-[18px] w-[18px]" /> : <Clock className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-2.5 pb-3">
          <CompetitionResults rows={rows} accentColor={accent.color} onPoster={onPoster} />
        </div>
      )}
    </div>
  );
}

function FeastContent({ slug, festChips, onGeneratePoster }: { slug: string; festChips: React.ReactNode; onGeneratePoster: (winner: SocialPosterWinner) => void }) {
  const { feast, loading } = useFeast(slug);
  const [activeTab, setActiveTab] = useState<string>("");
  const [gender, setGender] = useState<"all" | "girl" | "boy" | "common">("all");
  // undefined = no choice made yet in this tab/section: the first published
  // item opens by default. null = the viewer closed everything.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [cache, setCache] = useState<Record<string, PublicResultRow[]>>({});
  const requested = useRef(new Set<string>());

  const comps = feast?.competitions ?? [];
  const hasTeam = comps.some((c) => c.cat === "Team");
  const tabs = [
    ...CAT_TABS.filter((cat) => comps.some((c) => c.competitionCategorySlug === cat.slug && c.cat !== "Team")),
    ...(hasTeam ? [TEAM_TAB] : []),
  ];
  const resolved = tabs.some((c) => c.slug === activeTab) ? activeTab : tabs[0]?.slug ?? "";
  const inTab = (slugKey: string) => (slugKey === "team" ? comps.filter((c) => c.cat === "Team") : comps.filter((c) => c.competitionCategorySlug === slugKey && c.cat !== "Team"));
  const filtered = inTab(resolved);
  const accent = catStyle(resolved === "team" ? null : resolved);
  const doneAll = comps.filter((c) => c.compStatus === "published").length;

  function load(comp: FeastCompetitionUI) {
    if (requested.current.has(comp.id)) return;
    requested.current.add(comp.id);
    loadCompetitionResults(comp).then((rows) => setCache((c) => ({ ...c, [comp.id]: rows })));
  }

  function toggle(comp: FeastCompetitionUI) {
    setOpenId(effectiveOpenId === comp.id ? null : comp.id);
  }

  const handlePoster = (comp: FeastCompetitionUI) => (row: PublicResultRow) =>
    onGeneratePoster({
      rank: row.position as 1 | 2 | 3,
      winnerName: row.name,
      houseName: row.houseName,
      shakhaName: row.shakha,
      competitionName: comp.name,
      categoryLabel: competitionCategoryLabel(comp),
      feastName: feast ? feastPosterHeading(feast) : "",
    });

  const groups = ([
    ["girl", "Girls", "var(--fp-girls)"],
    ["boy", "Boys", "var(--fp-boys)"],
    ["common", "Common", accent.color],
  ] as const)
    .map(([key, label, line]) => ({
      key, label, line,
      items: filtered.filter((c) => (key === "common" ? c.gender !== "girl" && c.gender !== "boy" : c.gender === key)),
    }))
    .filter((g) => g.items.length > 0);
  const showSegments = groups.length > 1;
  // A section the current tab doesn't have falls back to All.
  const activeGender = groups.some((g) => g.key === gender) ? gender : "all";
  const visibleGroups = groups.filter((g) => activeGender === "all" || g.key === activeGender);
  const firstPublishedId = visibleGroups.flatMap((g) => g.items).find((c) => c.compStatus === "published")?.id ?? null;
  const effectiveOpenId = openId === undefined ? firstPublishedId : openId;
  const openComp = effectiveOpenId ? comps.find((c) => c.id === effectiveOpenId) : undefined;

  // Load whichever item is open — including the default first one.
  useEffect(() => {
    if (openComp) load(openComp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openComp?.id]);

  const hero = (
    <section className="flex items-end justify-between gap-3.5 px-1 pt-2">
      <div className="min-w-0">
        <Eyebrow>{feast ? `Fests ${feast.year}` : "Fests"}</Eyebrow>
        <h1 className="fp-disp m-0 mt-3 text-[min(15vw,62px)] xl:text-[clamp(62px,6vw,92px)]">
          <span className="block">Fest</span>
          <span className="fp-hl-text block">Results</span>
        </h1>
        <p className="m-0 mt-3 text-[15px] font-semibold" style={{ color: theme.sub }}>Celebrating every achievement</p>
      </div>
      {comps.length > 0 && <ResultsRing done={doneAll} total={comps.length} />}
    </section>
  );

  if (loading && !comps.length) {
    return (
      <>
        {hero}
        {festChips}
        <div className="flex justify-center py-12" role="status" aria-label="Loading results"><Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.lavender }} /></div>
      </>
    );
  }

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-80px] top-[260px] h-[360px] transition-[background] duration-500" style={{ background: `radial-gradient(50% 50% at 50% 50%, ${mix(accent.color, 18)} 0%, transparent 70%)` }} />
      {hero}
      {festChips}

      {tabs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <BookOpen className="h-7 w-7" style={{ color: theme.faint }} />
          <p className="text-sm font-semibold" style={{ color: theme.sub }}>No competitions found for this fest.</p>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Category" className="fp-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 pt-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:overflow-visible sm:px-0">
            {tabs.map((t) => {
              const on = t.slug === resolved;
              const cs = catStyle(t.slug === "team" ? null : t.slug);
              const list = inTab(t.slug);
              const done = list.filter((c) => c.compStatus === "published").length;
              const pct = list.length ? Math.round((done / list.length) * 100) : 0;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => { setActiveTab(t.slug); setOpenId(undefined); }}
                  aria-pressed={on}
                  className="flex h-[88px] shrink-0 flex-col items-start justify-between rounded-[20px] px-3.5 py-3 text-left transition-[min-width,background,box-shadow] duration-300 sm:min-w-0"
                  style={{
                    minWidth: on ? 158 : 118,
                    background: on ? `linear-gradient(150deg, ${cs.hi} 0%, ${cs.deep} 100%)` : theme.surface,
                    color: on ? "var(--fp-on-cat)" : theme.text,
                    border: `1px solid ${on ? "rgba(255,255,255,.3)" : theme.line2}`,
                    boxShadow: on ? `0 14px 30px ${mix(cs.color, 40)}` : undefined,
                  }}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.04em] tabular-nums">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: on ? "currentColor" : cs.color }} />
                    {done} / {list.length}
                  </span>
                  <span className="fp-disp whitespace-nowrap transition-[font-size] duration-300" style={{ fontSize: on ? 26 : 19 }}>{t.label}</span>
                  <span className="block h-[3px] w-full rounded-full" style={{ background: on ? "rgba(0,0,0,.16)" : "var(--fp-track)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: on ? "currentColor" : cs.color }} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative mt-4">
            <div>
              {showSegments && (
                <div role="group" aria-label="Filter by section" className="grid max-w-[560px] gap-1 rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${groups.length + 1}, minmax(0, 1fr))`, background: theme.surface, border: `1px solid ${theme.line2}` }}>
                  {[{ key: "all" as const, label: "All", n: filtered.length }, ...groups.map((g) => ({ key: g.key, label: g.label, n: g.items.length }))].map((sgm) => {
                    const on = activeGender === sgm.key;
                    return (
                      <button
                        key={sgm.key}
                        type="button"
                        onClick={() => { setGender(sgm.key); setOpenId(undefined); }}
                        aria-pressed={on}
                        className="inline-flex h-11 items-center justify-center gap-[7px] rounded-xl text-[13.5px] font-extrabold transition-colors"
                        style={on ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)", boxShadow: "0 6px 16px rgba(var(--fp-primary-rgb),.25)" } : { color: theme.sub }}
                      >
                        {sgm.label}
                        <span className="text-[12px] opacity-70">{sgm.n}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {visibleGroups.map((grp) => (
                <section key={grp.key} className="pt-[26px] first:pt-5">
                  <div className="flex items-center gap-3 px-1 pb-3">
                    <h2 className="fp-disp m-0 text-[30px]">{grp.label}</h2>
                    <span className="text-[12px] font-bold" style={{ color: theme.faint }}>
                      {grp.items.length} {grp.items.length === 1 ? "item" : "items"} · {grp.items.filter((c) => c.compStatus === "published").length} published
                    </span>
                    <span aria-hidden="true" className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${grp.line}, transparent)` }} />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {grp.items.map((comp, i) => (
                      <ItemCard
                        key={comp.id}
                        comp={comp}
                        open={effectiveOpenId === comp.id}
                        onToggle={() => toggle(comp)}
                        rows={cache[comp.id]}
                        accent={accent}
                        delay={0.05 + Math.min(i, 10) * 0.05}
                        onPoster={handlePoster(comp)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              <Link
                href={`/search?feast=${slug}`}
                className="mt-6 flex items-center gap-3.5 rounded-[20px] p-4"
                style={{ background: theme.surface, border: `1px solid ${theme.line}`, color: theme.text }}
              >
                <span aria-hidden="true" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px]" style={{ background: mix(accent.color, 16), color: accent.ink }}>
                  <Search className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-extrabold">Search participants</span>
                  <span className="mt-1 block text-[12.5px] font-semibold" style={{ color: theme.sub }}>Find anyone by name, house or registration number</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: theme.faint }} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function FeastResults() {
  const router = useRouter();
  const search = useSearchParams();
  const initialSlug = search.get("feast") ?? "";
  const { feasts: allFeasts, loading: feastsLoading } = useFeasts();
  const feasts = useMemo(() => allFeasts.filter(showsResults), [allFeasts]);
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  const [posterWinner, setPosterWinner] = useState<SocialPosterWinner | null>(null);

  useEffect(() => {
    if (feasts.length === 0 || feasts.find((f) => f.slug === activeSlug)) return;
    setActiveSlug(feasts[0].slug);
    // A link to a fest that isn't listed (still taking registrations, say)
    // shows the first listed fest; keep the address bar in step with it.
    if (activeSlug) router.replace(`/results?feast=${feasts[0].slug}`, { scroll: false });
  }, [feasts, activeSlug, router]);

  function handlePick(s: string) {
    setActiveSlug(s);
    router.replace(`/results?feast=${s}`);
  }

  // Always shown, even for a single fest: the tab is what says whose
  // results these are.
  const festChips = feasts.length > 0 ? (
    <div className="fp-scroll -mx-4 flex gap-2 overflow-x-auto px-5 pt-4 sm:mx-0 sm:flex-wrap sm:px-1">
      {feasts.map((f) => (
        <Chip key={f.slug} ml on={f.slug === activeSlug} onClick={() => handlePick(f.slug)}>{f.name}</Chip>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative pb-6">
      <FeastTopBar title="Results" />

      {!feastsLoading && feasts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16"><BookOpen className="h-7 w-7" style={{ color: theme.faint }} /><p className="text-sm font-semibold" style={{ color: theme.sub }}>No results yet. They show here once a fest is under way.</p></div>
      ) : feastsLoading || !feasts.some((f) => f.slug === activeSlug) ? (
        <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-[22px] w-[22px] animate-spin" style={{ color: theme.lavender }} /></div>
      ) : (
        <FeastContent key={activeSlug} slug={activeSlug} festChips={festChips} onGeneratePoster={setPosterWinner} />
      )}

      {posterWinner && <SocialPosterOverlay winner={posterWinner} onClose={() => setPosterWinner(null)} />}
    </div>
  );
}
