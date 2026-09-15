"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Trophy, ChevronDown } from "lucide-react";
import {
  getLeaderboard, getOverallLeaderboard,
  getMeghalaLeaderboard, getOverallMeghalaLeaderboard,
  getDioceseLeaderboard, getOverallDioceseLeaderboard,
  type LeaderboardRow,
} from "@/actions/results";
import { useFeasts, useOrgHierarchy } from "@/hooks/use-feast";
import { FeastTabs, FeastTopBar, theme } from "./feast-shared";
import type { HierarchyLevel } from "@/types";

type Tier = "shakha" | "meghala" | "diocese";
const TIER_LABEL: Record<Tier, string> = { shakha: "Shakha", meghala: "Meghala", diocese: "Diocese" };

function tiersFor(level: HierarchyLevel): Tier[] {
  if (level === "diocese") return ["shakha", "meghala", "diocese"];
  if (level === "meghala") return ["shakha", "meghala"];
  return ["shakha"];
}

const CATS: { key: keyof LeaderboardRow; label: string; color: string; track: string }[] = [
  { key: "subJunior", label: "Sub Junior", color: "#0369A1", track: "#E0F2FE" },
  { key: "junior", label: "Junior", color: "#22C55E", track: "#DCFCE7" },
  { key: "senior", label: "Senior", color: "#8B5CF6", track: "#EDE9FE" },
  { key: "superSenior", label: "Super Senior", color: "#F59E0B", track: "#FEF3C7" },
  { key: "elder", label: "Elder", color: "#BE185D", track: "#FCE7F3" },
];

const MEDAL_EMOJI = ["🥇", "🥈", "🥉"] as const;
const MEDAL_COLOR = ["#F5C542", "#9CA3AF", "#E0936A"];
const MEDAL_BG = ["#FFFBEB", "#F9FAFB", "#FFF7ED"];
const MEDAL_BORDER = ["#F5C54266", "#9CA3AF44", "#E0936A44"];
const MEDAL_TEXT = ["#92400E", "#1f2937", "#431407"];

function darken(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amt)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amt)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amt)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function useCountUp(target: number, duration = 900, active = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return val;
}

function AnimBar({ pct, color, track, delay = 0, animated }: { pct: number; color: string; track: string; delay?: number; animated: boolean }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!animated) { setW(0); return; }
    const t = setTimeout(() => setW(pct), delay);
    return () => clearTimeout(t);
  }, [pct, animated, delay]);
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: track }}>
      <div className="h-full rounded-full transition-[width] duration-[800ms]" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}, ${darken(color, 0.42)})`, boxShadow: `0 0 8px ${darken(color, 0.3)}88` }} />
    </div>
  );
}

function PodiumCard({ row, rankIdx, animated }: { row: LeaderboardRow; rankIdx: number; animated: boolean }) {
  const val = useCountUp(row.points, 900, animated);
  const isFirst = rankIdx === 0;
  const mc = MEDAL_COLOR[rankIdx];
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden rounded-[18px] px-2 pb-3 pt-4" style={{ background: MEDAL_BG[rankIdx], border: `1.5px solid ${MEDAL_BORDER[rankIdx]}`, boxShadow: isFirst ? `0 8px 28px ${mc}44` : "0 4px 14px rgba(0,0,0,0.06)", marginTop: isFirst ? 0 : 14 }}>
      <div className="relative mb-2 flex h-11 w-11 items-center justify-center rounded-full text-[20px]" style={{ background: `linear-gradient(135deg,${mc},${mc}88)`, boxShadow: `0 6px 18px ${mc}66` }}>{MEDAL_EMOJI[rankIdx]}</div>
      <p className="mb-1 w-full truncate px-1 text-center leading-tight" style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 700, fontSize: isFirst ? 15 : 13, color: "var(--fp-ink)" }}>{row.name}</p>
      <p className="font-black tabular-nums" style={{ fontSize: isFirst ? 22 : 17, color: mc }}>{val}</p>
      <p className="mt-0.5 text-[9px] font-semibold" style={{ color: `${mc}aa` }}>pts</p>
      {isFirst && (row.firstCount > 0 || row.aGrade > 0) && (
        <div className="mt-1.5 flex gap-2 text-[10px] font-semibold" style={{ color: "#6B7280" }}>
          {row.firstCount > 0 && <span>🥇{row.firstCount}</span>}
          {row.aGrade > 0 && <span style={{ color: "#16A34A" }}>A:{row.aGrade}</span>}
        </div>
      )}
    </div>
  );
}

function DrillDown({ row, animated }: { row: LeaderboardRow; animated: boolean }) {
  const total = row.points;
  const hasAchievements = row.firstCount + row.secondCount + row.thirdCount + row.aGrade + row.bGrade + row.cGrade > 0;
  return (
    <div className="px-3 pb-3 pt-1">
      <p className="mb-2.5 text-xs font-black uppercase tracking-widest" style={{ color: "var(--fp-ink)" }}>Category Breakdown</p>
      <div className="space-y-2.5">
        {CATS.map((cat, i) => {
          const pts = row[cat.key] as number;
          const pct = total > 0 ? (pts / total) * 100 : 0;
          return (
            <div key={cat.key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-black" style={{ color: cat.color }}>{cat.label}</span>
                <span className="text-sm font-black tabular-nums" style={{ color: pts > 0 ? cat.color : "#D1D5DB" }}>{pts > 0 ? `${pts} pts` : "—"}</span>
              </div>
              <AnimBar pct={pct} color={cat.color} track={cat.track} delay={i * 60} animated={animated} />
            </div>
          );
        })}
      </div>
      {hasAchievements && (
        <>
          <p className="mb-2 mt-4 text-xs font-black uppercase tracking-widest" style={{ color: "var(--fp-ink)" }}>Achievements</p>
          <div className="flex overflow-hidden rounded-xl" style={{ border: "1px solid rgba(var(--fp-primary-rgb),0.1)" }}>
            <div className="flex flex-1 items-center justify-around px-2 py-2.5" style={{ background: "rgba(255,255,255,0.7)" }}>
              {([["🥇", row.firstCount, "#92400E"], ["🥈", row.secondCount, "#374151"], ["🥉", row.thirdCount, "#7C2D12"]] as const).map(([e, c, t]) => (
                <div key={String(e)} className="text-center"><p className="text-sm">{e}</p><p className="text-sm font-black" style={{ color: t }}>{c}</p></div>
              ))}
            </div>
            <div className="w-px self-stretch" style={{ background: "rgba(var(--fp-primary-rgb),0.12)" }} />
            <div className="flex flex-1 items-center justify-around px-2 py-2.5" style={{ background: "rgba(255,255,255,0.5)" }}>
              {([["A", row.aGrade, "#16A34A"], ["B", row.bGrade, "#D97706"], ["C", row.cGrade, "var(--fp-primary)"]] as const).map(([g, c, t]) => (
                <div key={g} className="text-center"><p className="mb-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-black" style={{ background: t, color: "#fff" }}>{g}</p><p className="text-sm font-black" style={{ color: t }}>{c}</p></div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ShakhaRow({ row, color, animated, defaultOpen }: { row: LeaderboardRow; color: string; animated: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const val = useCountUp(row.points, 900, animated);
  const rankIdx = row.rank - 1;
  const isTop3 = rankIdx >= 0 && rankIdx < 3;
  const mc = isTop3 ? MEDAL_COLOR[rankIdx] : "#8B5CF6";
  return (
    <div className="relative mb-2.5 overflow-hidden rounded-[18px] transition-colors" style={{ background: open ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.58)", border: open ? `1.5px solid ${mc}44` : "1.5px solid rgba(255,255,255,0.75)" }}>
      <div className="absolute inset-y-0 left-0 w-[3.5px]" style={{ background: color }} />
      <button onClick={() => setOpen((o) => !o)} className="w-full pb-2.5 pl-4 pr-3 pt-3 text-left">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black" style={{ fontSize: isTop3 ? 16 : 13, background: isTop3 ? `linear-gradient(135deg,${MEDAL_COLOR[rankIdx]},${MEDAL_COLOR[rankIdx]}99)` : "rgba(107,70,255,0.1)", color: isTop3 ? MEDAL_TEXT[rankIdx] : "#8B5CF6" }}>{isTop3 ? MEDAL_EMOJI[rankIdx] : row.rank}</div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-[15px]" style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 700, color: "var(--fp-ink)" }}>{row.name}</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-1"><span className="text-[18px] font-black tabular-nums" style={{ color: mc }}>{val}</span><span className="text-[10px] font-semibold" style={{ color: `${mc}aa` }}>pts</span></div>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform" style={{ background: "rgba(var(--fp-primary-rgb),0.08)", transform: open ? "rotate(180deg)" : undefined }}><ChevronDown className="h-[13px] w-[13px]" style={{ color: "#8B5CF6" }} /></div>
        </div>
        <div className="flex items-center gap-1.5">
          {([["🥇", row.firstCount, 0], ["🥈", row.secondCount, 1], ["🥉", row.thirdCount, 2]] as const).map(([emoji, count, mi]) => (
            <div key={emoji} className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: MEDAL_BG[mi], border: `1px solid ${MEDAL_BORDER[mi]}` }}>
              <span className="text-xs leading-none">{emoji}</span><span className="text-xs font-black leading-none tabular-nums" style={{ color: count > 0 ? MEDAL_TEXT[mi] : "#C4B5FD" }}>{count}</span>
            </div>
          ))}
        </div>
      </button>
      {open && <div className="mx-3 mb-1 rounded-xl" style={{ background: "rgba(var(--fp-primary-rgb),0.04)" }}><DrillDown row={row} animated={animated} /></div>}
    </div>
  );
}

export function FeastLeaderboard() {
  const router = useRouter();
  const search = useSearchParams();
  const { feasts, loading: feastsLoading } = useFeasts();
  const hierarchy = useOrgHierarchy();
  const availableTiers = tiersFor(hierarchy.hierarchyLevel);
  const [tier, setTier] = useState<Tier>("shakha");
  const [activeSlug, setActiveSlug] = useState(search.get("feast") ?? "");
  const [mode, setMode] = useState<"feast" | "overall">("feast");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (feasts.length > 0 && !feasts.find((f) => f.slug === activeSlug)) setActiveSlug(feasts[0].slug);
  }, [feasts, activeSlug]);

  useEffect(() => {
    if (mode !== "overall") return;
    setLoading(true);
    setRows([]);
    setAnimated(false);
    if (animTimer.current) clearTimeout(animTimer.current);
    const fetcher = tier === "diocese" ? getOverallDioceseLeaderboard : tier === "meghala" ? getOverallMeghalaLeaderboard : getOverallLeaderboard;
    fetcher().then(({ data }) => {
      setRows(data ?? []);
      setLoading(false);
      animTimer.current = setTimeout(() => setAnimated(true), 100);
    });
  }, [mode, tier]);

  useEffect(() => {
    if (mode !== "feast") return;
    if (feastsLoading) return;
    if (!feasts.some((f) => f.slug === activeSlug)) {
      if (feasts.length === 0) setLoading(false);
      return;
    }
    setLoading(true);
    setRows([]);
    setAnimated(false);
    if (animTimer.current) clearTimeout(animTimer.current);
    const fetcher = tier === "diocese" ? getDioceseLeaderboard : tier === "meghala" ? getMeghalaLeaderboard : getLeaderboard;
    fetcher(activeSlug).then(({ data }) => {
      setRows(data ?? []);
      setLoading(false);
      animTimer.current = setTimeout(() => setAnimated(true), 100);
    });
  }, [activeSlug, feastsLoading, feasts, mode, tier]);

  function handlePick(s: string) {
    setMode("feast");
    setActiveSlug(s);
    router.replace(`/rankings?feast=${s}`);
  }

  const shakhaColor = (id: string) => {
    if (id === "__unassigned__") return "#9CA3AF";
    if (tier === "meghala") return hierarchy.meghalas.find((m) => m.id === id)?.color ?? "var(--fp-primary-light)";
    if (tier === "diocese") return hierarchy.dioceses.find((d) => d.id === id)?.color ?? "var(--fp-primary-light)";
    return hierarchy.shakhas.find((s) => s.id === id)?.color ?? "var(--fp-primary-light)";
  };
  const hasResults = rows.some((r) => r.points > 0);
  const top3 = rows.slice(0, 3);
  const podiumSlots: [LeaderboardRow | undefined, number][] = [[top3[1], 1], [top3[0], 0], [top3[2], 2]];

  return (
    <div>
      <FeastTopBar title="Rankings" />

      <div className="mb-3 flex gap-2 rounded-[14px] p-1" style={{ background: "rgba(var(--fp-primary-rgb),0.06)" }}>
        {([["feast", "Fests"], ["overall", "Overall"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className="flex-1 rounded-[11px] py-2 text-[13px] font-bold" style={mode === m ? { background: "linear-gradient(135deg, var(--fp-primary), var(--fp-primary-light))", color: "#fff" } : { color: "var(--fp-sub)" }}>{label}</button>
        ))}
      </div>

      {availableTiers.length > 1 && (
        <div className="mb-3 flex gap-2">
          {availableTiers.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
              style={tier === t ? { background: "var(--fp-ink)", color: "#fff" } : { background: "rgba(var(--fp-primary-rgb),0.06)", color: "var(--fp-sub)" }}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {mode === "feast" && <FeastTabs feasts={feasts} active={activeSlug} onPick={handlePick} loading={feastsLoading} />}

      {loading || (mode === "feast" && feastsLoading) ? (
        <div className="flex justify-center py-16"><Loader2 className="h-[22px] w-[22px] animate-spin" style={{ color: theme.lavender }} /></div>
      ) : !hasResults ? (
        <div className="flex justify-center py-10">
          <div className="flex w-full max-w-[320px] flex-col items-center rounded-[24px] px-7 pb-8 pt-9 text-center" style={{ background: "linear-gradient(145deg,rgba(var(--fp-primary-rgb),0.08),rgba(var(--fp-primary-rgb),0.03),rgba(var(--fp-accent-rgb),0.05))", border: "1px solid rgba(var(--fp-primary-rgb),0.12)" }}>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" }}><Trophy className="h-7 w-7 text-white" /></div>
            <p className="mb-1.5 text-[18px] font-black" style={{ color: theme.text }}>No standings yet</p>
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--fp-sub)" }}>Rankings will appear here once competition results are published for this fest.</p>
          </div>
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2"><Trophy className="h-[13px] w-[13px]" style={{ color: "var(--fp-gold)" }} /><p className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--fp-ink)" }}>Top {TIER_LABEL[tier]}s</p></div>
              <div className="flex items-end gap-2 rounded-[22px] p-3" style={{ background: "linear-gradient(145deg,rgba(var(--fp-primary-rgb),0.08),rgba(var(--fp-primary-rgb),0.03),rgba(var(--fp-accent-rgb),0.05))", border: "1px solid rgba(var(--fp-primary-rgb),0.1)" }}>
                {podiumSlots.map(([row, rankIdx]) => (row ? <PodiumCard key={row.shakhaId} row={row} rankIdx={rankIdx} animated={animated} /> : <div key={rankIdx} className="flex-1" />))}
              </div>
            </div>
          )}
          <div className="mb-3 flex items-center gap-2"><p className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--fp-ink)" }}>All {TIER_LABEL[tier]}s</p><div className="h-px flex-1" style={{ background: "rgba(var(--fp-primary-rgb),0.1)" }} /><p className="text-xs font-bold" style={{ color: "var(--fp-ink)" }}>{rows.length} {TIER_LABEL[tier].toLowerCase()}s</p></div>
          {rows.map((row, i) => <ShakhaRow key={row.shakhaId} row={row} color={shakhaColor(row.shakhaId)} animated={animated} defaultOpen={i === 0} />)}
        </>
      )}
    </div>
  );
}
