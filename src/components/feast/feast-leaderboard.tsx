"use client";

import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Trophy, ChevronDown, MapPin } from "lucide-react";
import {
  getLeaderboard, getOverallLeaderboard,
  getMeghalaLeaderboard, getOverallMeghalaLeaderboard,
  getDioceseLeaderboard, getOverallDioceseLeaderboard,
  type LeaderboardRow,
} from "@/actions/results";
import { showsResults, useFeasts, useOrgHierarchy, useOrgSettings } from "@/hooks/use-feast";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { FeastTopBar, catStyle, theme } from "./feast-shared";
import {
  Chip, CategoryBar, Eyebrow, GradeBadge, LivePill, Medal, MedalCounts, PointsRules,
  ProgressBar, RibbonMedal, Sparkle, isMedalPos, toneStyle, toneTextClass, useCountUp, useMediaQuery,
  type MedalPos,
} from "./feast-ui";
import type { HierarchyLevel } from "@/types";

type Tier = "shakha" | "meghala" | "diocese";
const TIER_LABEL: Record<Tier, string> = { shakha: "Shakha", meghala: "Meghala", diocese: "Diocese" };

function tiersFor(level: HierarchyLevel): Tier[] {
  if (level === "diocese") return ["shakha", "meghala", "diocese"];
  if (level === "meghala") return ["shakha", "meghala"];
  return ["shakha"];
}

type CatKey = "subJunior" | "junior" | "senior" | "superSenior" | "elder";
type SortKey = "all" | CatKey;
const CATS: { key: CatKey; slug: string; label: string }[] = [
  { key: "subJunior", slug: "sub_junior", label: "Sub Junior" },
  { key: "junior", slug: "junior", label: "Junior" },
  { key: "senior", slug: "senior", label: "Senior" },
  { key: "superSenior", slug: "super_senior", label: "Super Senior" },
  { key: "elder", slug: "elder", label: "Elder" },
];

const MEDAL_BAR = { g: "#F5C542", s: "#B7BDC8", b: "#C48A5A" };
const TONE_BAR: Record<MedalPos, string> = {
  1: "linear-gradient(90deg, #E0A21B, #FFD66B)",
  2: "linear-gradient(90deg, #7D8593, #D9DDE5)",
  3: "linear-gradient(90deg, #8A5530, #E3AA7C)",
};

interface Ranked {
  row: LeaderboardRow;
  score: number;
  rank: number;
  pos: number; // 1-based position in the sorted list (podium tone follows this, ties included)
}

// Competition ranking (1, 1, 3) by the active sort score.
function rankRows(rows: LeaderboardRow[], score: (r: LeaderboardRow) => number): Ranked[] {
  const sorted = rows.map((row) => ({ row, score: score(row) })).sort((a, b) => b.score - a.score || a.row.rank - b.row.rank);
  let rank = 0;
  return sorted.map((x, i) => {
    if (i === 0 || x.score !== sorted[i - 1].score) rank = i + 1;
    return { ...x, rank, pos: i + 1 };
  });
}

// Published vs total competitions for the fests in view ("64 / 120 results in").
function useResultProgress(feastIds: string[]) {
  const key = feastIds.join(",");
  const [progress, setProgress] = useState<{ key: string; published: number; total: number } | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !key) return;
    let cancelled = false;
    supabase
      .from("feast_competitions")
      .select("result_status")
      .in("feast_id", key.split(","))
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProgress({ key, published: data.filter((r) => r.result_status === "published").length, total: data.length });
      });
    return () => { cancelled = true; };
  }, [key]);
  return progress && progress.key === key ? progress : null;
}

// ── Podium ──────────────────────────────────────────────────────────────
const PODIUM_SIZES = {
  sm: { medal: [46, 64, 42], name: [17, 23, 17], pts: [30, 48, 27], ped: [104, 150, 78], numeral: [62, 92, 50], gap: 8 },
  md: { medal: [56, 76, 50], name: [22, 30, 22], pts: [38, 62, 34], ped: [136, 196, 100], numeral: [84, 124, 66], gap: 12 },
  lg: { medal: [64, 88, 58], name: [28, 38, 28], pts: [46, 78, 42], ped: [170, 240, 124], numeral: [104, 150, 82], gap: 14 },
};

function PodiumColumn({ item, pos, lead, behind, size, animated, delay }: {
  item: Ranked;
  pos: MedalPos;
  lead: number;
  behind: number;
  size: keyof typeof PODIUM_SIZES;
  animated: boolean;
  delay: number;
}) {
  const s = PODIUM_SIZES[size];
  const i = pos === 1 ? 1 : pos === 2 ? 0 : 2; // size arrays are ordered [2nd, 1st, 3rd] like the podium
  const val = useCountUp(item.score, 1300, animated);
  const first = pos === 1;
  const tone = pos === 1 ? "gold" : pos === 2 ? "silver" : "bronze";
  // Shrink long names to the column (container query units) rather than
  // breaking a word mid-way.
  const longest = Math.max(4, ...item.row.name.split(/\s+/).map((w) => w.length));
  return (
    <div className="fp-rise flex min-w-0 flex-col items-center text-center [container-type:inline-size]" style={{ animationDelay: `${delay}s` }}>
      {first && (
        <span className="mb-3 inline-flex h-[22px] items-center rounded-full px-2.5 text-[9.5px] font-extrabold tracking-[0.2em]" style={{ background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)", color: theme.goldInk }}>
          LEADING
        </span>
      )}
      <RibbonMedal pos={pos} size={s.medal[i]} />
      <span className="sr-only">{pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"} place</span>
      <span
        className="fp-disp mt-3 line-clamp-2 max-w-full [overflow-wrap:break-word]"
        style={{ fontSize: `min(${s.name[i]}px, calc(100cqi / ${(longest * 0.64).toFixed(2)}))`, fontStretch: first ? "68%" : "64%", lineHeight: 1 }}
        title={item.row.name}
      >
        {item.row.name}
      </span>
      <span className="mt-2 flex items-baseline gap-1">
        <span className={`fp-num ${first ? "fp-t-gold" : ""}`} style={{ fontSize: s.pts[i] }}>{val}</span>
        <span className="fp-cap text-[9.5px] tracking-[0.12em]" style={{ color: first ? theme.goldInk : theme.faint }}>pts</span>
      </span>
      <span className="mt-1 text-[11.5px] font-bold" style={{ color: first ? theme.goldInk : theme.faint, fontWeight: first ? 800 : 700 }}>
        {first ? (lead > 0 ? `+${lead} lead` : "Tied") : behind > 0 ? `${behind} behind` : "Tied"}
      </span>
      <span
        className="relative mt-3 flex w-full justify-center overflow-hidden"
        style={{
          height: s.ped[i],
          paddingTop: Math.round(s.ped[i] * 0.08),
          borderRadius: first ? "16px 16px 0 0" : "14px 14px 0 0",
          border: `1px solid var(--fp-ped-${tone}-line)`,
          borderBottom: 0,
          background: `var(--fp-ped-${tone})`,
          boxShadow: first ? "inset 0 1px 0 rgba(255,246,214,.6), 0 -10px 40px rgba(245,197,66,.2)" : undefined,
        }}
      >
        <span aria-hidden="true" className={`fp-disp ${toneTextClass(pos)}`} style={{ fontSize: s.numeral[i] }}>{pos}</span>
        {first && (
          <span
            aria-hidden="true"
            className="fp-sheen absolute inset-y-0 left-0 w-[45%]"
            style={{ background: "linear-gradient(90deg, rgba(255,246,214,0), rgba(255,246,214,.45), rgba(255,246,214,0))", transform: "translateX(-160%) skewX(-18deg)" }}
          />
        )}
      </span>
    </div>
  );
}

function Podium({ top, size, animated, label }: { top: Ranked[]; size: keyof typeof PODIUM_SIZES; animated: boolean; label: string }) {
  const [p1, p2, p3] = top;
  const s = PODIUM_SIZES[size];
  const rays = size === "lg" ? 720 : size === "md" ? 580 : 440;
  const glow = size === "lg" ? 400 : size === "md" ? 330 : 270;
  return (
    <section aria-label={`Top three ${label.toLowerCase()}s`} className="relative">
      <div aria-hidden="true" className="fp-rays pointer-events-none absolute left-1/2 rounded-full" style={{ width: rays, height: rays, marginLeft: -rays / 2, top: -rays * 0.16 }} />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 rounded-full" style={{ width: glow, height: glow, marginLeft: -glow / 2, top: -10, background: "radial-gradient(circle, var(--fp-glow) 0%, transparent 70%)" }} />
      <Sparkle size={13} color="var(--fp-gold)" style={{ left: "30%", top: 12, animationDelay: ".2s" }} />
      <Sparkle size={9} color="var(--fp-accent)" style={{ right: "28%", top: 56, animationDelay: "1.1s" }} />
      <Sparkle size={8} color="var(--fp-primary-light)" style={{ left: "33%", top: 136, animationDelay: "1.8s" }} />
      <Sparkle size={10} color="var(--fp-gold)" style={{ right: "32%", top: 152, animationDelay: ".7s" }} />
      <div className="relative grid items-end" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.22fr) minmax(0,1fr)", gap: s.gap }}>
        {p2 ? <PodiumColumn item={p2} pos={2} lead={0} behind={p1.score - p2.score} size={size} animated={animated} delay={0.2} /> : <div />}
        <PodiumColumn item={p1} pos={1} lead={p2 ? p1.score - p2.score : p1.score} behind={0} size={size} animated={animated} delay={0.45} />
        {p3 ? <PodiumColumn item={p3} pos={3} lead={0} behind={p1.score - p3.score} size={size} animated={animated} delay={0.05} /> : <div />}
      </div>
      <div aria-hidden="true" className="relative h-[2px]" style={{ background: "linear-gradient(90deg, transparent, var(--fp-gold), transparent)" }} />
      <div aria-hidden="true" className="mx-1.5 h-[30px]" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--fp-gold) 16%, transparent), transparent)" }} />
    </section>
  );
}

// ── Stats (inline on phones, sticky aside on desktop) ───────────────────
interface StatsCtx {
  ranked: Ranked[];
  catRank: Record<string, Partial<Record<CatKey, number>>>;
  catMax: number;
}

function StatTile({ value, label, gold }: { value: React.ReactNode; label: string; gold?: boolean }) {
  return (
    <div className="rounded-[14px] p-3" style={gold ? { background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)" } : { background: theme.surface3, border: `1px solid ${theme.line}` }}>
      <div className={`fp-num text-[24px] xl:text-[28px] ${gold ? "fp-t-gold" : ""}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] font-bold leading-tight xl:text-[12px]" style={{ color: theme.sub }}>{label}</div>
    </div>
  );
}

function SplitBar({ parts }: { parts: [number, string][] }) {
  const total = parts.reduce((a, [n]) => a + n, 0);
  return (
    <div aria-hidden="true" className="flex h-[5px] gap-[2px] overflow-hidden rounded-full" style={{ background: total ? undefined : "var(--fp-track)" }}>
      {total > 0 && parts.map(([n, c], i) => <span key={i} style={{ flex: n, background: c }} />)}
    </div>
  );
}

function StatsBody({ item, ctx }: { item: Ranked; ctx: StatsCtx }) {
  const r = item.row;
  const lead = item.pos === 1;
  const top = ctx.ranked[0]?.score ?? 0;
  const second = ctx.ranked[1]?.score ?? 0;
  const gap = lead ? top - second : top - item.score;
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={r.firstCount + r.secondCount + r.thirdCount} label="Podium finishes" />
        <StatTile value={r.aGrade + r.bGrade + r.cGrade} label="Graded entries" />
        <StatTile value={lead ? `+${gap}` : `−${gap}`} label={lead ? "Lead over #2" : "Behind #1"} gold />
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="fp-cap" style={{ color: theme.goldInk }}>Category performance</span>
          <span className="text-[11.5px] font-bold" style={{ color: theme.faint }}>rank · pts</span>
        </div>
        {CATS.map((c, j) => {
          const pts = r[c.key];
          return (
            <CategoryBar
              key={c.key}
              label={c.label}
              color={catStyle(c.slug).color}
              pts={pts}
              pct={ctx.catMax > 0 ? (pts / ctx.catMax) * 100 : 0}
              rank={pts > 0 ? ctx.catRank[r.shakhaId]?.[c.key] ?? null : null}
              delay={0.08 + j * 0.07}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <span className="fp-cap" style={{ color: theme.goldInk }}>Achievements</span>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-3 rounded-2xl px-3 pb-3 pt-3.5" style={{ background: theme.surface3, border: `1px solid ${theme.line}` }}>
            <span className="fp-cap text-[10px]" style={{ color: theme.sub }}>Medals</span>
            <div className="flex justify-between">
              {([[1, r.firstCount], [2, r.secondCount], [3, r.thirdCount]] as const).map(([p, n]) => (
                <span key={p} className="flex flex-col items-center gap-[7px]">
                  <Medal pos={p} size={26} />
                  <span className="fp-num text-[24px]">{n}</span>
                </span>
              ))}
            </div>
            <SplitBar parts={[[r.firstCount, MEDAL_BAR.g], [r.secondCount, MEDAL_BAR.s], [r.thirdCount, MEDAL_BAR.b]]} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl px-3 pb-3 pt-3.5" style={{ background: theme.surface3, border: `1px solid ${theme.line}` }}>
            <span className="fp-cap text-[10px]" style={{ color: theme.sub }}>Grades</span>
            <div className="flex justify-between">
              {([["A", r.aGrade], ["B", r.bGrade], ["C", r.cGrade]] as const).map(([g, n]) => (
                <span key={g} className="flex flex-col items-center gap-[7px]">
                  <GradeBadge grade={g} size={26} />
                  <span className="fp-num text-[24px]">{n}</span>
                </span>
              ))}
            </div>
            <SplitBar parts={[[r.aGrade, "var(--fp-gbar-a)"], [r.bGrade, "var(--fp-gbar-b)"], [r.cGrade, "var(--fp-gbar-c)"]]} />
          </div>
        </div>
      </div>

      <PointsRules />
    </div>
  );
}

// ── Leaderboard rows ────────────────────────────────────────────────────
function RowMedalCounts({ r }: { r: LeaderboardRow }) {
  return <MedalCounts g={r.firstCount} s={r.secondCount} b={r.thirdCount} size={11} className="text-[12.5px]" />;
}

const MobileRow = memo(function MobileRow({ item, top, open, onToggle, ctx, color, delay, grouped, divider }: {
  item: Ranked;
  top: number;
  open: boolean;
  onToggle: (id: string) => void;
  ctx: StatsCtx;
  color: string;
  delay: number;
  grouped: boolean;
  divider?: boolean;
}) {
  const podium = !grouped && isMedalPos(item.pos) ? (item.pos as MedalPos) : null;
  const tone = podium ? toneStyle(podium) : null;
  const lead = item.pos === 1;
  const panelId = `lb-${item.row.shakhaId}`;
  return (
    <div
      className="fp-fade-up relative overflow-hidden"
      style={{
        animationDelay: `${delay}s`,
        ...(tone
          ? { ...tone, borderRadius: 18, marginBottom: item.pos === 3 ? 16 : 8, boxShadow: lead ? "0 12px 30px rgba(245,197,66,.2)" : undefined }
          : { background: open ? "var(--fp-row-open)" : "transparent", borderTop: divider ? `1px solid ${theme.line}` : undefined }),
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(item.row.shakhaId)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 text-left"
        style={{ padding: podium ? "15px 14px 10px" : "11px 14px 8px", color: theme.text }}
      >
        <span className={`fp-num w-[34px] shrink-0 ${podium ? toneTextClass(podium) : ""}`} style={{ fontSize: podium ? 30 : 21, color: podium ? undefined : theme.faint }}>
          {String(item.rank).padStart(2, "0")}
        </span>
        {podium && <Medal pos={podium} size={30} />}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate font-extrabold leading-tight tracking-[-0.01em]" style={{ fontSize: podium ? 17 : 15.5 }}>{item.row.name}</span>
          </span>
          <RowMedalCounts r={item.row} />
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="fp-num" style={{ fontSize: podium ? 30 : 22 }}>{item.score}</span>
          <span className="fp-cap text-[9px]" style={{ color: theme.faint }}>pts</span>
        </span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 transition-transform duration-300" style={{ color: theme.faint, transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      <div aria-hidden="true" className="mx-4 mb-[11px] h-[2px] rounded-sm" style={{ background: "var(--fp-track)" }}>
        <div className="h-full rounded-sm" style={{ width: `${Math.max(3, top > 0 ? Math.round((item.score / top) * 100) : 0)}%`, background: podium ? TONE_BAR[podium] : theme.lavender }} />
      </div>
      {open && (
        <div id={panelId} className="fp-fade-in px-4 pb-[18px] pt-1.5">
          <StatsBody item={item} ctx={ctx} />
        </div>
      )}
    </div>
  );
});

const DesktopRow = memo(function DesktopRow({ item, selected, onSelect, ctx, color, delay }: {
  item: Ranked;
  selected: boolean;
  onSelect: (id: string) => void;
  ctx: StatsCtx;
  color: string;
  delay: number;
}) {
  const podium = isMedalPos(item.pos) ? (item.pos as MedalPos) : null;
  const tone = podium ? toneStyle(podium) : { background: selected ? "var(--fp-row-open)" : "var(--fp-row-bg)", border: `1px solid ${theme.line}` };
  const r = item.row;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.row.shakhaId)}
      aria-pressed={selected}
      className="fp-fade-up flex w-full items-center gap-x-5 rounded-[18px] text-left transition-[background,border-color,box-shadow] duration-200 2xl:gap-x-[22px]"
      style={{
        animationDelay: `${delay}s`,
        padding: podium ? "16px 20px" : "12px 20px",
        color: theme.text,
        ...tone,
        ...(selected ? { border: "1px solid var(--fp-primary)", boxShadow: "0 0 0 1px var(--fp-primary), 0 14px 30px rgba(var(--fp-primary-rgb),.18)" } : {}),
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className={`fp-num w-11 shrink-0 ${podium ? toneTextClass(podium) : ""}`} style={{ fontSize: podium ? 34 : 24, color: podium ? undefined : theme.faint }}>
          {String(item.rank).padStart(2, "0")}
        </span>
        {podium && <Medal pos={podium} size={34} />}
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate font-extrabold tracking-[-0.01em]" style={{ fontSize: podium ? 19 : 16.5 }}>{r.name}</span>
      </span>
      <MedalCounts g={r.firstCount} s={r.secondCount} b={r.thirdCount} size={13} className="shrink-0 text-[14px]" />
      <span className="hidden items-center gap-2.5 text-[13px] font-bold tabular-nums 2xl:flex" style={{ color: theme.sub }}>
        {([["A", r.aGrade], ["B", r.bGrade], ["C", r.cGrade]] as const).map(([g, n]) => (
          <span key={g} className="inline-flex items-center gap-[5px]"><GradeBadge grade={g} size={18} />{n}</span>
        ))}
      </span>
      <span aria-hidden="true" className="hidden h-[30px] items-end gap-1 2xl:flex">
        {CATS.map((c) => {
          const col = catStyle(c.slug).color;
          return <span key={c.key} className="w-[9px] rounded-[3px]" style={{ height: Math.max(4, ctx.catMax > 0 ? Math.round((r[c.key] / ctx.catMax) * 30) : 4), background: `linear-gradient(180deg, ${col}, color-mix(in srgb, ${col} 30%, transparent))` }} />;
        })}
      </span>
      <span className="flex min-w-[88px] shrink-0 items-baseline justify-end gap-[5px]">
        <span className="fp-num" style={{ fontSize: podium ? 34 : 26 }}>{item.score}</span>
        <span className="fp-cap text-[10px]" style={{ color: theme.faint }}>pts</span>
      </span>
    </button>
  );
});

function StatsAside({ item, ctx, tierLabel }: { item: Ranked; ctx: StatsCtx; tierLabel: string }) {
  const podium = isMedalPos(item.pos) ? (item.pos as MedalPos) : null;
  const longest = Math.max(4, ...item.row.name.split(/\s+/).map((w) => w.length));
  return (
    <aside
      aria-label={`${tierLabel} statistics`}
      className="sticky top-6 flex flex-col gap-6 rounded-[28px] p-[26px]"
      style={{ ...theme.glassStrong, background: theme.surface2, border: `1px solid ${theme.line}`, boxShadow: theme.shadow }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 [container-type:inline-size]">
          <span className="fp-cap" style={{ color: theme.goldInk }}>{tierLabel} statistics</span>
          <h3 className="fp-disp m-0 mt-2.5 [overflow-wrap:break-word]" style={{ fontSize: `min(44px, calc(100cqi / ${(longest * 0.64).toFixed(2)}))` }}>{item.row.name}</h3>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="fp-num fp-t-gold text-[64px]">{item.score}</span>
            <span className="fp-cap" style={{ color: theme.goldInk }}>points</span>
          </div>
        </div>
        {podium ? (
          <Medal pos={podium} size={58} />
        ) : (
          <span className="fp-num flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full text-[22px]" style={{ border: `1.5px solid ${theme.line2}`, color: theme.sub }}>
            {String(item.rank).padStart(2, "0")}
          </span>
        )}
      </div>
      <StatsBody item={item} ctx={ctx} />
    </aside>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────
export function FeastLeaderboard() {
  const router = useRouter();
  const search = useSearchParams();
  const { feasts: allFeasts, loading: feastsLoading } = useFeasts();
  const feasts = useMemo(() => allFeasts.filter(showsResults), [allFeasts]);
  const hierarchy = useOrgHierarchy();
  const availableTiers = tiersFor(hierarchy.hierarchyLevel);
  // Defaults: all fests, at the org's top level (meghalas for a meghala-level
  // org). Links can still ask for one fest (?feast=) or a tier (?tier=, as
  // the landing page's Top Shakhas/Meghalas widgets do).
  const [pickedTier, setPickedTier] = useState<Tier | null>(() => {
    const t = search.get("tier");
    return t === "shakha" || t === "meghala" || t === "diocese" ? t : null;
  });
  const topTier: Tier = hierarchy.hierarchyLevel;
  const tier: Tier = pickedTier ?? topTier;
  // The top level is only known once org settings load; don't fetch (and
  // flash shakha standings) before then.
  const tierReady = pickedTier !== null || !hierarchy.loading;
  const [activeSlug, setActiveSlug] = useState(search.get("feast") ?? "");
  const [mode, setMode] = useState<"feast" | "overall">(search.get("feast") && search.get("mode") !== "overall" ? "feast" : "overall");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [sort, setSort] = useState<SortKey>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const toggleOpen = useCallback((id: string) => setOpen((o) => (o === id ? null : id)), [setOpen]);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wide = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 640px)");

  const org = useOrgSettings();

  useEffect(() => {
    if (feasts.length > 0 && !feasts.find((f) => f.slug === activeSlug)) setActiveSlug(feasts[0].slug);
  }, [feasts, activeSlug]);

  function resetView() {
    setLoading(true);
    setRows([]);
    setAnimated(false);
    setOpen(null);
    setSelected(null);
    if (animTimer.current) clearTimeout(animTimer.current);
  }

  function land(data: LeaderboardRow[] | undefined) {
    setRows(data ?? []);
    setLoading(false);
    animTimer.current = setTimeout(() => setAnimated(true), 100);
  }

  useEffect(() => {
    if (mode !== "overall" || !tierReady) return;
    resetView();
    const fetcher = tier === "diocese" ? getOverallDioceseLeaderboard : tier === "meghala" ? getOverallMeghalaLeaderboard : getOverallLeaderboard;
    fetcher().then(({ data }) => land(data));
  }, [mode, tier, tierReady]);

  useEffect(() => {
    if (mode !== "feast" || !tierReady) return;
    if (feastsLoading) return;
    if (!feasts.some((f) => f.slug === activeSlug)) {
      if (feasts.length === 0) setLoading(false);
      return;
    }
    resetView();
    const fetcher = tier === "diocese" ? getDioceseLeaderboard : tier === "meghala" ? getMeghalaLeaderboard : getLeaderboard;
    fetcher(activeSlug).then(({ data }) => land(data));
  }, [activeSlug, feastsLoading, feasts, mode, tier, tierReady]);

  // Only what differs from the defaults (all fests, top tier) goes in the URL.
  function syncUrl(next: { mode: "feast" | "overall"; slug?: string; tier: Tier }) {
    const q = new URLSearchParams();
    if (next.mode === "feast" && next.slug) q.set("feast", next.slug);
    if (next.tier !== topTier) q.set("tier", next.tier);
    const qs = q.toString();
    router.replace(qs ? `/rankings?${qs}` : "/rankings");
  }

  function pickFeast(s: string) {
    setMode("feast");
    setActiveSlug(s);
    syncUrl({ mode: "feast", slug: s, tier });
  }

  function pickOverall() {
    setMode("overall");
    syncUrl({ mode: "overall", tier });
  }

  function pickTier(t: Tier) {
    setPickedTier(t);
    syncUrl({ mode, slug: activeSlug, tier: t });
  }

  const shakhaColor = (id: string) => {
    if (id === "__unassigned__") return "#9CA3AF";
    if (tier === "meghala") return hierarchy.meghalas.find((m) => m.id === id)?.color ?? "var(--fp-primary-light)";
    if (tier === "diocese") return hierarchy.dioceses.find((d) => d.id === id)?.color ?? "var(--fp-primary-light)";
    return hierarchy.shakhas.find((s) => s.id === id)?.color ?? "var(--fp-primary-light)";
  };

  const activeFeast = feasts.find((f) => f.slug === activeSlug);
  const progress = useResultProgress(mode === "overall" ? feasts.map((f) => f.id) : activeFeast ? [activeFeast.id] : []);
  const live = mode === "overall" ? feasts.some((f) => f.status === "Ongoing") : activeFeast?.status === "Ongoing";

  const tierLabel = TIER_LABEL[tier];
  const hasResults = rows.some((r) => r.points > 0);
  const ranked = useMemo(() => rankRows(rows, (r) => (sort === "all" ? r.points : r[sort])), [rows, sort]);
  const podium = useMemo(() => rankRows(rows, (r) => r.points).slice(0, 3), [rows]);
  const { catRank, catMax } = useMemo(() => {
    const catRank: StatsCtx["catRank"] = {};
    let catMax = 0;
    for (const c of CATS) {
      for (const x of rankRows(rows, (r) => r[c.key])) {
        (catRank[x.row.shakhaId] ??= {})[c.key] = x.rank;
        catMax = Math.max(catMax, x.score);
      }
    }
    return { catRank, catMax };
  }, [rows]);
  const ctx: StatsCtx = useMemo(() => ({ ranked, catRank, catMax }), [ranked, catRank, catMax]);
  const topScore = ranked[0]?.score ?? 0;
  const selectedItem = ranked.find((x) => x.row.shakhaId === selected) ?? ranked[0];
  const sortLabel = CATS.find((c) => c.key === sort)?.label;
  const eyebrow = mode === "overall" ? "Overall standings" : activeFeast ? `Fests ${activeFeast.year}` : "Fests";
  const areaName = org?.area_name_en?.trim();
  const leadMargin = podium.length > 1 ? podium[0].score - podium[1].score : podium[0]?.score ?? 0;

  const busy = loading || (mode === "feast" && feastsLoading);

  return (
    <div className="pb-6">
      <FeastTopBar title="Rankings" subtitle={org?.tagline || "Fest Portal"} />

      <div className={wide ? "flex items-end gap-10" : ""}>
        <section className={`[container-type:inline-size] ${wide ? "min-w-0 flex-[1_1_380px] pb-9" : "px-1 pt-2"}`}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="fp-disp m-0 mt-3" style={{ fontSize: `min(${wide ? 86 : 72}px, calc(100cqi / 5.2))` }}>
            <span className="fp-hl-text block">{tierLabel}</span>
            <span className="block">Champions</span>
          </h1>
          <div className="mt-[18px] flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
            {live && <LivePill detail="Results coming in" />}
            {areaName && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: theme.sub }}>
                <MapPin className="h-[15px] w-[15px]" aria-hidden="true" />
                {areaName}
              </span>
            )}
          </div>

          {availableTiers.length > 1 && (
            <div role="group" aria-label="Ranking level" className="mt-4 inline-flex gap-1 rounded-full p-1" style={{ background: theme.surface, border: `1px solid ${theme.line2}` }}>
              {availableTiers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTier(t)}
                  aria-pressed={tier === t}
                  className="h-9 rounded-full px-4 text-[12.5px] font-extrabold transition-colors"
                  style={tier === t ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)" } : { color: theme.sub }}
                >
                  {TIER_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className={`fp-scroll mt-4 flex gap-2 ${wide ? "flex-wrap" : "-mx-5 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0"}`}>
            {feastsLoading && feasts.length === 0 ? (
              <>
                <div className="h-[38px] w-24 animate-pulse rounded-full" style={{ background: theme.surface }} />
                <div className="h-[38px] w-32 animate-pulse rounded-full" style={{ background: theme.surface }} />
              </>
            ) : (
              <>
                <Chip on={mode === "overall"} onClick={pickOverall}>All fests</Chip>
                {feasts.map((f) => (
                  <Chip key={f.slug} ml on={mode === "feast" && f.slug === activeSlug} onClick={() => pickFeast(f.slug)}>{f.name}</Chip>
                ))}
              </>
            )}
          </div>

          {progress && progress.total > 0 && !wide && (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1">
                <ProgressBar pct={(progress.published / progress.total) * 100} fill="linear-gradient(90deg, var(--fp-primary), var(--fp-accent) 60%, var(--fp-gold))" height={5} />
              </div>
              <span className="whitespace-nowrap text-[12.5px] font-bold" style={{ color: theme.sub }}>
                <span className="fp-num text-[16px]" style={{ color: theme.text }}>{progress.published}</span> / {progress.total} results in
              </span>
            </div>
          )}

          {wide && hasResults && !busy && (
            <div className="mt-6 grid max-w-[520px] grid-cols-3 gap-3">
              <div className="rounded-[18px] p-4" style={{ background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)" }}>
                <div className="fp-num fp-t-gold text-[34px]">+{leadMargin}</div>
                <div className="mt-2 text-[12.5px] font-bold" style={{ color: theme.sub }}>Leader&apos;s margin</div>
              </div>
              <div className="rounded-[18px] p-4" style={{ background: theme.surface, border: `1px solid ${theme.line}` }}>
                <div className="fp-num text-[34px]">
                  {progress?.published ?? "–"}
                  {progress && <span className="text-[20px]" style={{ color: theme.faint }}> / {progress.total}</span>}
                </div>
                <div className="mt-2 text-[12.5px] font-bold" style={{ color: theme.sub }}>Results published</div>
              </div>
              <div className="rounded-[18px] p-4" style={{ background: theme.surface, border: `1px solid ${theme.line}` }}>
                <div className="fp-num text-[34px]">{rows.length}</div>
                <div className="mt-2 text-[12.5px] font-bold" style={{ color: theme.sub }}>{tierLabel}s competing</div>
              </div>
            </div>
          )}
        </section>

        {wide && hasResults && !busy && (
          <div className="min-w-0 flex-[1.3_1_480px]">
            <Podium top={podium} size="lg" animated={animated} label={tierLabel} />
          </div>
        )}
      </div>

      {busy ? (
        <div className="flex justify-center py-16" role="status" aria-label="Loading rankings">
          <Loader2 className="h-[22px] w-[22px] animate-spin" style={{ color: theme.lavender }} />
        </div>
      ) : !hasResults ? (
        <div className="flex justify-center py-10">
          <div className="flex w-full max-w-[360px] flex-col items-center rounded-[24px] px-7 pb-8 pt-9 text-center" style={{ background: theme.surface, border: `1px solid ${theme.line}` }}>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full fp-m-gold">
              <Trophy className="h-7 w-7" style={{ color: "#3A2A06" }} />
            </div>
            <p className="fp-disp mb-2 text-[28px]">No standings yet</p>
            <p className="text-[13.5px] font-semibold leading-relaxed" style={{ color: theme.sub }}>
              Rankings appear here once competition results are published for this fest.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!wide && (
            <div className="mt-[30px]">
              <Podium top={podium} size={tablet ? "md" : "sm"} animated={animated} label={tierLabel} />
            </div>
          )}

          <div className={wide ? "flex items-start gap-6 pt-4" : "pt-[18px]"}>
            <section aria-label={`All ${tierLabel.toLowerCase()}s`} className="min-w-0 flex-[999_1_520px]">
              <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                <div>
                  <div className="fp-cap text-[10.5px]" style={{ color: theme.goldInk }}>All {tierLabel.toLowerCase()}s</div>
                  <h2 className="fp-disp m-0 mt-[7px]" style={{ fontSize: wide ? 46 : 34 }}>Leaderboard</h2>
                </div>
                <span className="pb-[3px] text-[12px] font-bold" style={{ color: theme.faint }}>
                  {sortLabel ? `${sortLabel} points` : "Total points"}{wide ? ` · select a ${tierLabel.toLowerCase()} for its stats` : ""}
                </span>
              </div>
              <div className={`fp-scroll my-3.5 flex gap-2 ${wide ? "flex-wrap" : "-mx-4 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0"}`}>
                <Chip on={sort === "all"} onClick={() => { setSort("all"); setOpen(null); }} dot="var(--fp-gold)">Overall</Chip>
                {CATS.map((c) => {
                  const cs = catStyle(c.slug);
                  return (
                    <Chip key={c.key} on={sort === c.key} onClick={() => { setSort(c.key); setOpen(null); }} dot={cs.color} from={cs.hi} to={cs.deep}>
                      {c.label}
                    </Chip>
                  );
                })}
              </div>

              {wide ? (
                <div className="flex flex-col gap-2">
                  {ranked.map((x, i) => (
                    <DesktopRow
                      key={x.row.shakhaId}
                      item={x}
                      selected={selectedItem?.row.shakhaId === x.row.shakhaId}
                      onSelect={setSelected}
                      ctx={ctx}
                      color={shakhaColor(x.row.shakhaId)}
                      delay={0.3 + Math.min(i, 14) * 0.04}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {ranked.slice(0, 3).map((x, i) => (
                    <MobileRow
                      key={x.row.shakhaId}
                      item={x}
                      top={topScore}
                      open={open === x.row.shakhaId}
                      onToggle={toggleOpen}
                      ctx={ctx}
                      color={shakhaColor(x.row.shakhaId)}
                      delay={0.9 + i * 0.05}
                      grouped={false}
                    />
                  ))}
                  {ranked.length > 3 && (
                    <div className="overflow-hidden rounded-[18px]" style={{ background: "var(--fp-row-bg)", border: `1px solid ${theme.line}` }}>
                      {ranked.slice(3).map((x, i) => (
                        <MobileRow
                          key={x.row.shakhaId}
                          item={x}
                          top={topScore}
                          open={open === x.row.shakhaId}
                          onToggle={toggleOpen}
                          ctx={ctx}
                          color={shakhaColor(x.row.shakhaId)}
                          delay={1.05 + Math.min(i, 12) * 0.04}
                          grouped
                          divider={i > 0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {wide && selectedItem && (
              <div className="min-w-0 flex-[1_1_360px]">
                <StatsAside item={selectedItem} ctx={ctx} tierLabel={tierLabel} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
