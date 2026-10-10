"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Award, Check, ChevronLeft, ChevronRight, Church, Pause, Play, Settings, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useFeasts, useOrgHierarchy } from "@/hooks/use-feast";
import { useCompetitionStages, type CompetitionStage } from "@/hooks/use-competition-stages";
import {
  getLeaderboard, getMeghalaLeaderboard, getOverallLeaderboard, getOverallMeghalaLeaderboard, getScreenData,
  type LeaderboardRow, type ScreenAchiever, type ScreenCompetitionResult, type ScreenData,
} from "@/actions/results";
import { getRecentActivity, type ActivityItem } from "@/actions/activity";
import { catStyle } from "@/components/feast/feast-shared";
import { AWARD } from "@/components/feast/feast-shared-results";
import { GradeBadge, Medal, MedalCounts, toneStyle, type MedalPos } from "@/components/feast/feast-ui";
import { SUB_MS, useDashboardRotation } from "./use-dashboard-rotation";
import { sectionKey, sectionLabel, type DashboardSection } from "./dashboard-types";

// Everything on this page paints from the portal's --fp-* tokens (set by the
// root layout's data-fp-theme), so the big screen follows whichever theme
// the org picked instead of carrying its own palette.
const DESIGN_W = 1920;
const REFRESH_MS = 20_000;
const FEASTS_POLL_MS = 5 * 60 * 1000;
const FLIP_MS = 7000;
const TICKER_H = 64;
const ROTATION_KEY = "feast-screen-rotation-sections";
const UNASSIGNED_ID = "__unassigned__";

const TONE = ["gold", "silver", "bronze"] as const;
const PLACE_WORDS = ["First", "Second", "Third"];
const GRADE_KEYS = ["A", "B", "C"] as const;
const CATS = [
  { key: "subJunior", slug: "sub_junior", label: "Sub Jr" },
  { key: "junior", slug: "junior", label: "Junior" },
  { key: "senior", slug: "senior", label: "Senior" },
  { key: "superSenior", slug: "super_senior", label: "Sup Sr" },
  { key: "elder", slug: "elder", label: "Elder" },
] as const;

const GOLD_BAR = "linear-gradient(90deg, color-mix(in srgb, var(--fp-gold) 62%, #7A4F00), var(--fp-gold) 60%, color-mix(in srgb, var(--fp-gold) 55%, #FFFFFF))";
const PANEL: React.CSSProperties = { borderRadius: 28, background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)" };
const PILL: React.CSSProperties = { height: 40, padding: "0 18px", display: "inline-flex", alignItems: "center", borderRadius: 9999, fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const PILL_ON: React.CSSProperties = { ...PILL, fontWeight: 800, border: "1px solid transparent", background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)" };
const PILL_OFF: React.CSSProperties = { ...PILL, border: "1px solid var(--fp-line-2)", background: "var(--fp-surface)", color: "var(--fp-sub)" };
const CHIP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 16px", borderRadius: 9999, fontSize: 14 };
const LIVE_CHIP: React.CSSProperties = { ...CHIP, color: "var(--fp-live)", background: "var(--fp-live-bg)", border: "1px solid var(--fp-live-line)" };
const BADGE: React.CSSProperties = { flex: "none", height: 66, padding: "0 26px", display: "inline-flex", alignItems: "center", borderRadius: 18, fontSize: 40, lineHeight: 1 };
// Members of a team (or a long house name) wrap to two lines at most.
const CLAMP2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
const MINI_BADGE: React.CSSProperties = { height: 26, padding: "0 10px", display: "inline-flex", alignItems: "center", borderRadius: 8, fontSize: 12, letterSpacing: ".08em", color: "var(--fp-on-cat)" };
const GOLD_CHIP: React.CSSProperties ={ ...CHIP, color: "var(--fp-gold-ink)", background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)" };

type Tier = "meghala" | "shakha";

interface RankRow {
  id: string;
  name: string;
  sub: string | null;
  dot: string | null;
  rank: number;
  points: number;
  cats: number[];
  first: number;
  second: number;
  third: number;
  a: number;
  b: number;
  c: number;
  topShakha: { name: string; points: number } | null;
  unassigned: boolean;
}

function fmtClock(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return { hm: `${p(d.getHours())}:${p(d.getMinutes())}`, s: p(d.getSeconds()) };
}

function medalPos(rank: number): MedalPos | null {
  return rank === 1 || rank === 2 || rank === 3 ? rank : null;
}

function Spinner() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
      <div role="status" aria-label="Loading" style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid var(--fp-line-2)", borderTopColor: "var(--fp-gold)", animation: "scSpin .9s linear infinite" }} />
    </div>
  );
}

function EmptyState({ message, lead = "No results" }: { message: string; lead?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, textAlign: "center" }}>
      <div style={{ width: 128, height: 128, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--fp-note-bg)", border: "2px solid var(--fp-note-line)", color: "var(--fp-gold-ink)" }}>
        <Trophy size={56} strokeWidth={1.6} aria-hidden="true" />
      </div>
      <div className="fp-disp" style={{ fontSize: 72 }}>{lead} <span className="fp-hl-text">yet</span></div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "var(--fp-sub)", maxWidth: 720 }}>{message}</div>
    </div>
  );
}

function GradeCount({ grade, n }: { grade: "A" | "B" | "C"; n: number }) {
  const style: React.CSSProperties =
    grade === "A" ? { background: "var(--fp-ga-bg)", color: "var(--fp-ga-fg)" }
      : grade === "B" ? { background: "var(--fp-gb-bg)", color: "var(--fp-gb-fg)" }
        : { border: "1.5px solid var(--fp-gc-line)", color: "var(--fp-gc-fg)" };
  return (
    <span className="fp-num" aria-label={`${n} grade ${grade}`} style={{ minWidth: 40, height: 28, padding: "0 6px", boxSizing: "border-box", borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, ...style }}>
      {n}
    </span>
  );
}

// Podium place marker: a gold / silver / bronze cup with the place on it
// (the round .fp-medal stays on leaderboard rows and the result screen).
const TROPHY_TONES: Record<MedalPos, { stops: [string, string, string, string]; ink: string; glow: string }> = {
  1: { stops: ["#FFF3CC", "#FFD66B", "#F5C542", "#A8700A"], ink: "#3A2A06", glow: "rgba(245,197,66,.5)" },
  2: { stops: ["#FFFFFF", "#E8EBF0", "#B7BDC8", "#6E7684"], ink: "#262B33", glow: "rgba(200,210,224,.4)" },
  3: { stops: ["#FFE6CF", "#E3AA7C", "#A77A4D", "#5E3B1F"], ink: "#3A2210", glow: "rgba(199,138,90,.4)" },
};

function PlaceTrophy({ pos, size }: { pos: MedalPos; size: number }) {
  const id = useId().replace(/:/g, "");
  const t = TROPHY_TONES[pos];
  const fill = `url(#tr-${id})`;
  return (
    <svg
      role="img"
      aria-label={`${pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"} place`}
      viewBox="0 0 64 72"
      width={size}
      height={size * 1.125}
      style={{ flex: "none", overflow: "visible", filter: `drop-shadow(0 4px 10px ${t.glow})` }}
    >
      <defs>
        <linearGradient id={`tr-${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset=".35" stopColor={t.stops[1]} />
          <stop offset=".7" stopColor={t.stops[2]} />
          <stop offset="1" stopColor={t.stops[3]} />
        </linearGradient>
      </defs>
      {/* handles */}
      <path d="M15 12H7.5a3.5 3.5 0 0 0-3.5 3.5V18c0 7 5 12 12.5 13" fill="none" stroke={fill} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M49 12h7.5a3.5 3.5 0 0 1 3.5 3.5V18c0 7-5 12-12.5 13" fill="none" stroke={fill} strokeWidth="4.5" strokeLinecap="round" />
      {/* cup, stem, base */}
      <path d="M13 5h38v17c0 11.6-8.5 20-19 20S13 33.6 13 22V5z" fill={fill} />
      <path d="M28 41h8v9h-8z" fill={fill} />
      <path d="M20 50h24a3 3 0 0 1 3 3v3H17v-3a3 3 0 0 1 3-3z" fill={fill} />
      <rect x="12" y="56" width="40" height="11" rx="3" fill={fill} />
      {/* rim + shine */}
      <rect x="11" y="3" width="42" height="5" rx="2.5" fill={t.stops[0]} opacity=".9" />
      <path d="M19 11c0 8 2 15 6 19" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
      <text x="32" y="29" textAnchor="middle" fontSize="19" fontWeight="900" fill={t.ink} style={{ fontFamily: "var(--font-archivo), sans-serif", fontStretch: "80%" }}>{pos}</text>
    </svg>
  );
}

// ── Rankings (Meghala or Shakha tier) ──────────────────────────────────
function Podium({ rows, tier, caption }: { rows: RankRow[]; tier: Tier; caption: string }) {
  const top = rows.filter((r) => !r.unassigned).slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const ped = [
    { h: 290, medal: 76, pts: 72 },
    { h: 210, medal: 60, pts: 56 },
    { h: 160, medal: 60, pts: 56 },
  ];
  return (
    <section aria-label={tier === "meghala" ? "Top three meghalas" : "Top three shakhas"} style={{ ...PANEL, background: "var(--fp-surface-3)", position: "relative", overflow: "hidden", padding: "28px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div className="fp-rays" aria-hidden="true" style={{ position: "absolute", left: "50%", top: 250, width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="fp-cap" style={{ margin: 0, fontSize: 14, color: "var(--fp-gold-ink)" }}>{tier === "meghala" ? "Meghala podium" : "Shakha podium"}</p>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--fp-meta)" }}>{caption}</p>
      </div>
      <div style={{ position: "relative", flex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "end" }}>
        {order.map((row, slot) => {
          if (!row) return <div key={slot} />;
          const i = slot === 1 ? 0 : slot === 0 ? 1 : 2;
          const pos = (i + 1) as MedalPos;
          const t = TONE[i];
          return (
            <div key={row.id} className="fp-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", minWidth: 0, animationDelay: `${0.15 * slot}s` }}>
              <PlaceTrophy pos={pos} size={(ped[i].medal + 8) * 2} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
                <div className="fp-ml" style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.1, overflowWrap: "anywhere" }}>{row.name}</div>
                {row.sub && <div className="fp-ml" style={{ fontSize: 16, fontWeight: 600, color: "var(--fp-sub)" }}>{row.sub}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className={`fp-num fp-t-${t}`} style={{ fontSize: ped[i].pts }}>{row.points}</span>
                <span className="fp-cap" style={{ fontSize: 12, color: "var(--fp-meta)" }}>pts</span>
              </div>
              <MedalCounts g={row.first} s={row.second} b={row.third} size={18} className="text-[15px]" />
              <div style={{ width: "100%", height: ped[i].h, borderRadius: "20px 20px 6px 6px", background: `var(--fp-ped-${t})`, borderTop: `2px solid var(--fp-ped-${t}-line)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 18, boxSizing: "border-box" }}>
                <span className={`fp-disp fp-t-${t}`} style={{ fontSize: 104 }}>{pos}</span>
                {row.topShakha && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fp-sub)", padding: "0 8px" }}>
                    Top: <span className="fp-ml" style={{ fontWeight: 800, color: "var(--fp-ink)" }}>{row.topShakha.name}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RankTable({ rows, tier, tiers, onTier, meta }: { rows: RankRow[]; tier: Tier; tiers: Tier[]; onTier: (t: Tier) => void; meta: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [overflow, setOverflow] = useState(false);
  const cols = tier === "meghala"
    ? "56px minmax(0, 1fr) repeat(5, 70px) 150px 200px 104px"
    : "56px minmax(0, 1fr) repeat(5, 70px) 150px 150px 96px";

  // Only loop-scroll when the list really is taller than its box — a short
  // table sits still. Measured in a ResizeObserver callback (not
  // synchronously in the effect) so a resize re-checks it too.
  useEffect(() => {
    const vp = viewportRef.current;
    const list = listRef.current;
    if (!vp || !list) return;
    const ro = new ResizeObserver(() => {
      const single = list.scrollHeight / (list.dataset.looped === "true" ? 2 : 1);
      setOverflow(single > vp.clientHeight + 1);
    });
    ro.observe(vp);
    ro.observe(list);
    return () => ro.disconnect();
  }, [rows.length]);

  const shown = overflow ? [...rows, ...rows] : rows;
  const label = tier === "meghala" ? "Meghala" : "Shakha";

  return (
    <section aria-label={`${label} leaderboard`} style={{ ...PANEL, padding: 28, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
        <h2 className="fp-disp" style={{ margin: 0, fontSize: 44 }}>{label} <span className="fp-hl-text">leaderboard</span></h2>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--fp-meta)" }}>{meta}{overflow ? " · scrolls automatically" : ""}</p>
          {tiers.length > 1 && (
            <div role="group" aria-label="Ranking level" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 9999, background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)" }}>
              {tiers.map((t) => (
                <button key={t} type="button" aria-pressed={t === tier} onClick={() => onTier(t)} style={t === tier ? PILL_ON : { ...PILL, border: 0, background: "transparent", color: "var(--fp-sub)" }}>
                  {t === "meghala" ? "Meghala" : "Shakha"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="fp-cap" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "0 16px", fontSize: 12, color: "var(--fp-meta)" }}>
        <span>Rank</span>
        <span>{tier === "meghala" ? "Meghala" : tiers.length > 1 ? "Shakha · Meghala" : "Shakha"}</span>
        {CATS.map((c) => (
          <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: catStyle(c.slug).color }} />{c.label}
          </span>
        ))}
        <span>Medals</span>
        <span>{tier === "meghala" ? "Top shakha" : "Grades A·B·C"}</span>
        <span style={{ textAlign: "right" }}>Total</span>
      </div>
      <div ref={viewportRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ol
          ref={listRef}
          data-looped={overflow}
          style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, animation: overflow ? `tableScroll ${Math.max(20, rows.length * 3)}s linear infinite` : undefined }}
        >
          {shown.map((row, i) => {
            const pos = row.unassigned ? null : medalPos(row.rank);
            const rowStyle: React.CSSProperties = row.unassigned
              ? { border: "1.5px dashed var(--fp-line-2)" }
              : pos ? toneStyle(pos) : { background: "var(--fp-row-bg)", border: "1px solid var(--fp-line)" };
            return (
              <li key={`${row.id}-${i}`} aria-hidden={i >= rows.length || undefined} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", height: 60, flexShrink: 0, padding: "0 16px", borderRadius: 16, ...rowStyle }}>
                {pos ? (
                  <Medal pos={pos} size={38} />
                ) : (
                  <span className="fp-num" style={{ fontSize: 24, color: "var(--fp-meta)", paddingLeft: 6 }}>{row.unassigned ? "—" : String(row.rank).padStart(2, "0")}</span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  {row.dot && <span style={{ width: 10, height: 10, borderRadius: "50%", flex: "none", background: row.dot }} />}
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span className="fp-ml" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: row.unassigned ? "var(--fp-sub)" : undefined }}>
                      {row.unassigned ? "Not in a meghala" : row.name}
                    </span>
                    {row.sub && <span className="fp-ml" style={{ fontSize: 14, fontWeight: 600, color: "var(--fp-meta)", lineHeight: 1.1 }}>{row.sub}</span>}
                  </span>
                </span>
                {row.unassigned ? (
                  <span style={{ gridColumn: "span 7" }} />
                ) : (
                  <>
                    {row.cats.map((v, ci) => (
                      <span key={ci} className="fp-num" style={{ fontSize: 22, color: v ? "var(--fp-ink)" : "var(--fp-faint)" }}>{v || "—"}</span>
                    ))}
                    <MedalCounts g={row.first} s={row.second} b={row.third} size={16} className="gap-2.5 text-[16px]" />
                    {tier === "meghala" ? (
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                        <span className="fp-ml" style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.topShakha?.name ?? "—"}</span>
                        {row.topShakha && <span className="fp-num" style={{ fontSize: 17, color: "var(--fp-gold-ink)" }}>{row.topShakha.points}</span>}
                      </span>
                    ) : (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <GradeCount grade="A" n={row.a} />
                        <GradeCount grade="B" n={row.b} />
                        <GradeCount grade="C" n={row.c} />
                      </span>
                    )}
                  </>
                )}
                <span className={`fp-num ${pos ? `fp-t-${TONE[pos - 1]}` : ""}`} style={{ fontSize: row.unassigned ? 28 : 32, textAlign: "right", color: row.unassigned ? "var(--fp-sub)" : undefined }}>{row.points}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function RankingsScreen({ rows, tier, tiers, onTier, caption, meta }: { rows: RankRow[]; tier: Tier; tiers: Tier[]; onTier: (t: Tier) => void; caption: string; meta: string }) {
  if (rows.filter((r) => !r.unassigned).length === 0) return <EmptyState lead="No standings" message="Rankings appear here as results are published." />;
  return (
    <main style={{ position: "absolute", top: 152, left: 56, right: 56, bottom: TICKER_H + 28, display: "grid", gridTemplateColumns: "580px minmax(0, 1fr)", gap: 32 }}>
      <Podium rows={rows} tier={tier} caption={caption} />
      <RankTable rows={rows} tier={tier} tiers={tiers} onTier={onTier} meta={meta} />
    </main>
  );
}

// ── Competition result ─────────────────────────────────────────────────
function findGrade(comp: ScreenCompetitionResult, p: { name: string; shakha: string }): "A" | "B" | "C" | null {
  return GRADE_KEYS.find((g) => comp.grades[g].some((a) => a.name === p.name && a.shakha === p.shakha)) ?? null;
}

function GradeList({ achievers }: { achievers: ScreenAchiever[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  // Mounted fresh per competition + grade (keyed by the caller), so it
  // always starts at the top; a long list then glides to its end.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!listRef.current || !viewportRef.current) return;
      const over = listRef.current.scrollHeight - viewportRef.current.clientHeight;
      if (over > 0) setScrollY(-over);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  if (achievers.length === 0) {
    return <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--fp-meta)" }}>No one in this grade.</p>;
  }
  return (
    <div ref={viewportRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <ul ref={listRef} style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, transform: `translateY(${scrollY}px)`, transition: "transform 6s linear" }}>
        {achievers.map((a, i) => (
          <li key={`${a.name}-${a.shakha}-${i}`} className="fp-fade-up" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 14, background: "var(--fp-row-bg)", border: "1px solid var(--fp-line)", animationDelay: `${Math.min(i, 10) * 0.06}s` }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
              <span className="fp-ml" style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15 }}>{a.name}</span>
              {a.houseName && <span className="fp-ml" style={{ fontSize: 15, fontWeight: 600, color: "var(--fp-meta)", ...CLAMP2 }}>{a.houseName}</span>}
            </span>
            <span className="fp-ml" style={{ fontSize: 16, fontWeight: 800, color: "var(--fp-link)", textAlign: "right" }}>{a.shakha}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitionScreen({ comp, subIdx }: { comp: ScreenCompetitionResult; subIdx: number }) {
  const cs = catStyle(comp.categorySlug || null);
  const place = (subIdx + 1) as MedalPos;
  const winner = comp.positions.find((p) => p.place === place) ?? null;
  const winnerGrade = winner ? findGrade(comp, winner) : null;
  const activeGrade = GRADE_KEYS[subIdx];
  const graded = comp.grades.A.length + comp.grades.B.length + comp.grades.C.length;
  const gender = comp.gender === "girl" ? "Girls" : comp.gender === "boy" ? "Boys" : null;
  const gc = gender === "Girls" ? "var(--fp-girls)" : "var(--fp-boys)";

  return (
    <>
      <section aria-label="Competition" style={{ position: "absolute", top: 148, left: 56, right: 56, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <span className="fp-cap" style={{ fontSize: 14, color: "var(--fp-meta)" }}>{comp.positions.length} placed · {graded} graded</span>
          {/* Age category and boys/girls lead the title as solid badges —
              from the back of the hall they're what tells two same-named
              items apart. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            {comp.categoryName && <span className="fp-disp" style={{ ...BADGE, background: cs.hi, color: "var(--fp-on-cat)", boxShadow: `0 10px 26px color-mix(in srgb, ${cs.color} 35%, transparent)` }}>{comp.categoryName}</span>}
            {gender && <span className="fp-disp" style={{ ...BADGE, background: gc, color: "var(--fp-on-cat)", boxShadow: `0 10px 26px color-mix(in srgb, ${gc} 35%, transparent)` }}>{gender}</span>}
            {comp.isTeam && <span className="fp-disp" style={{ ...BADGE, background: "var(--fp-cat-team-hi)", color: "var(--fp-on-cat)" }}>Team</span>}
            <h2 className="fp-ml" style={{ margin: "0 0 0 8px", fontSize: 72, fontWeight: 800, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{comp.competitionName}</h2>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flex: "none" }}>
          <span className="fp-cap" style={{ fontSize: 12, color: "var(--fp-meta)" }}>Spotlight</span>
          <div style={{ display: "flex", gap: 8 }} aria-label={`${PLACE_WORDS[subIdx]} place of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: i === subIdx ? 54 : 22, height: 8, borderRadius: 9999, background: i === subIdx ? GOLD_BAR : "var(--fp-track)", transition: "width .4s" }} />
            ))}
          </div>
        </div>
      </section>

      <main style={{ position: "absolute", top: 312, left: 56, right: 56, bottom: TICKER_H + 28, display: "grid", gridTemplateColumns: "560px minmax(0, 1fr) 520px", gap: 28 }}>
        <article aria-label="Final results" style={{ borderRadius: 28, overflow: "hidden", background: "var(--fp-award-bg)", color: AWARD.ink, boxShadow: "var(--fp-award-shadow)", display: "flex", flexDirection: "column" }}>
          <div aria-hidden="true" style={{ height: 6, background: `linear-gradient(90deg, ${cs.color}, #F5C542)` }} />
          <div className="fp-cap" style={{ display: "flex", alignItems: "center", gap: 8, padding: "22px 26px 8px", fontSize: 14, color: AWARD.link }}>
            <Award size={18} strokeWidth={2.2} aria-hidden="true" />Final results
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {comp.categoryName && <span style={{ ...MINI_BADGE, background: cs.hi }}>{comp.categoryName}</span>}
              {gender && <span style={{ ...MINI_BADGE, background: gc }}>{gender}</span>}
              {comp.isTeam && <span style={{ ...MINI_BADGE, background: "var(--fp-cat-team-hi)" }}>Team</span>}
            </span>
          </div>
          {comp.positions.length === 0 ? (
            <p style={{ margin: 0, padding: "12px 26px", fontSize: 18, fontWeight: 600, color: AWARD.sub }}>No placed winners for this item — grades only.</p>
          ) : (
            <ol style={{ margin: 0, padding: "10px 16px 16px", listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {comp.positions.map((p, i) => {
                const active = p.place === place;
                return (
                  <li key={`${p.place}-${p.name}-${i}`} style={{
                    display: "flex", alignItems: "center", gap: 18, padding: 18, borderRadius: 20, transition: "background .4s, border-color .4s",
                    background: active ? "linear-gradient(100deg, rgba(245,197,66,.34) 0%, rgba(255,255,255,.8) 62%)" : AWARD.soft,
                    border: `1.5px solid ${active ? "rgba(217,144,26,.45)" : AWARD.line}`,
                  }}>
                    <Medal pos={p.place} size={62} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
                      <span className="fp-ml" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{p.name}</span>
                      {p.houseName && <span className="fp-ml" style={{ fontSize: 18, fontWeight: 600, color: AWARD.sub, ...CLAMP2 }}>{p.houseName}</span>}
                      <span className="fp-ml" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 17, fontWeight: 800, color: AWARD.link }}>
                        <Church size={15} strokeWidth={2.2} aria-hidden="true" />{p.shakha}{p.meghalaName ? ` · ${p.meghalaName}` : ""}
                      </span>
                    </span>
                    <GradeBadge grade={findGrade(comp, p)} size={46} variant="award" />
                  </li>
                );
              })}
            </ol>
          )}
        </article>

        <section key={subIdx} aria-label={`Spotlight — ${PLACE_WORDS[subIdx].toLowerCase()} place`} style={{ ...PANEL, background: "var(--fp-surface-3)", border: "1px solid var(--fp-tone-gold-line)", boxShadow: "0 0 60px var(--fp-glow)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 28 }}>
          <div className="fp-rays" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "42%", width: 1100, height: 1100, marginLeft: -550, marginTop: -550, borderRadius: "50%" }} />
          <span className="fp-rise" style={{ position: "relative", opacity: winner ? 1 : 0.35 }}><Medal pos={place} size={168} /></span>
          <span className={`fp-disp fp-t-${TONE[subIdx]}`} style={{ position: "relative", fontSize: 84, marginTop: 8 }}>{PLACE_WORDS[subIdx]} place</span>
          {winner ? (
            <div className="fp-fade-up" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animationDelay: ".2s" }}>
              <div className="fp-ml" style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, marginTop: 10 }}>{winner.name}</div>
              {winner.houseName && <div className="fp-ml" style={{ fontSize: 26, fontWeight: 600, color: "var(--fp-sub)", maxWidth: 820, ...CLAMP2 }}>{winner.houseName}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="fp-ml" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 26, fontWeight: 800, color: "var(--fp-link)" }}>
                  <Church size={22} strokeWidth={2.2} aria-hidden="true" />{winner.shakha}{winner.meghalaName ? ` · ${winner.meghalaName}` : ""}
                </span>
                {winnerGrade && <span className="fp-num" style={{ height: 40, padding: "0 14px", borderRadius: 10, display: "inline-flex", alignItems: "center", fontSize: 22, background: "var(--fp-ga-bg)", color: "var(--fp-ga-fg)" }}>Grade {winnerGrade}</span>}
              </div>
            </div>
          ) : (
            <div style={{ position: "relative", fontSize: 26, fontWeight: 700, color: "var(--fp-meta)", marginTop: 10 }}>No {PLACE_WORDS[subIdx].toLowerCase()} place for this item</div>
          )}
        </section>

        <section aria-label="Grade achievers" style={{ ...PANEL, padding: "26px 28px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 className="fp-disp" style={{ margin: 0, fontSize: 40 }}>Grade <span className="fp-hl-text">achievers</span></h3>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fp-meta)" }}>{graded} graded</span>
          </div>
          <div aria-label="Grade shown" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, padding: 5, borderRadius: 18, background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)" }}>
            {GRADE_KEYS.map((g) => (
              <span key={g} aria-current={g === activeGrade || undefined} style={{ height: 52, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, transition: "background .4s", ...(g === activeGrade ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)" } : { color: "var(--fp-sub)" }) }}>
                {g} · {comp.grades[g].length}
              </span>
            ))}
          </div>
          <GradeList key={`${comp.competitionId}-${activeGrade}`} achievers={comp.grades[activeGrade]} />
        </section>
      </main>
    </>
  );
}

// ── Stage board ────────────────────────────────────────────────────────
function StageBoardScreen({ feastSlug }: { feastSlug: string }) {
  const { stages, loading, totalCount, completedCount } = useCompetitionStages(feastSlug, { alwaysPoll: true, intervalMs: REFRESH_MS });
  const [flipped, setFlipped] = useState(false);
  const [flipPaused, setFlipPaused] = useState(false);

  useEffect(() => {
    if (flipPaused) return;
    const id = setInterval(() => setFlipped((f) => !f), FLIP_MS);
    return () => clearInterval(id);
  }, [flipPaused]);

  if (loading && stages.length === 0) return <Spinner />;
  if (stages.length === 0) return <EmptyState lead="No schedule" message="The stage schedule hasn't been published yet." />;

  const liveCount = stages.filter((s) => s.status === "running").length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <>
      <section aria-label="Overall progress" style={{ position: "absolute", top: 152, left: 56, right: 56, height: 72, boxSizing: "border-box", padding: "0 12px 0 24px", borderRadius: 22, background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)", display: "flex", alignItems: "center", gap: 28 }}>
        {liveCount > 0 ? (
          <span className="fp-cap" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--fp-live)" }}>
            <span className="fp-livedot" style={{ width: 10, height: 10 }} />{liveCount} stage{liveCount > 1 ? "s" : ""} live
          </span>
        ) : (
          <span className="fp-cap" style={{ fontSize: 15, color: "var(--fp-meta)" }}>No stage live</span>
        )}
        <span style={{ width: 1, height: 32, background: "var(--fp-line-2)" }} />
        <span style={{ fontSize: 19, fontWeight: 700, color: "var(--fp-sub)", whiteSpace: "nowrap" }}>
          <span className="fp-num" style={{ fontSize: 28, color: "var(--fp-ink)" }}>{completedCount}</span> of <span className="fp-num" style={{ fontSize: 28, color: "var(--fp-ink)" }}>{totalCount}</span> competitions completed
        </span>
        <div style={{ flex: 1, height: 12, borderRadius: 9999, background: "var(--fp-track)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 9999, background: GOLD_BAR, transition: "width .8s cubic-bezier(.22,1,.36,1)" }} />
        </div>
        <span className="fp-num fp-t-gold" style={{ fontSize: 32 }}>{pct}%</span>
        <button type="button" aria-pressed={flipPaused} onClick={() => setFlipPaused((p) => !p)} style={{ ...PILL_OFF, height: 48, gap: 10, color: "var(--fp-ink)", fontFamily: "inherit", fontWeight: 800 }}>
          {flipPaused ? <Play size={18} strokeWidth={2.2} aria-hidden="true" /> : <Pause size={18} strokeWidth={2.2} aria-hidden="true" />}
          {flipPaused ? "Resume card flip" : "Pause card flip"}
        </button>
      </section>

      <main style={{ position: "absolute", top: 244, left: 56, right: 56, bottom: TICKER_H + 28, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        {stages.slice(0, 8).map((stage) => <StageCard key={stage.key} stage={stage} flipped={flipped} />)}
      </main>
    </>
  );
}

function StageCard({ stage, flipped }: { stage: CompetitionStage; flipped: boolean }) {
  const isLive = stage.status === "running";
  const isDone = stage.status === "completed";
  const upcoming = stage.competitions.filter((c) => c.status === "upcoming");
  const next = stage.nextCompetition ?? upcoming[0] ?? null;
  const title = stage.venue ? `${stage.title} · ${stage.venue}` : stage.title;
  // Bar reflects the current item's own progress, not how many of the
  // stage's competitions have been checked off.
  const fill = isLive ? stage.runningCompetition?.itemProgressPct ?? 0 : isDone ? 100 : 0;
  const label = isLive ? stage.runningCompetition?.label ?? "—" : isDone ? `All ${stage.totalCount} competitions completed` : next?.label ?? "Nothing scheduled";
  const meta = isLive
    ? `${stage.completedCount} / ${stage.totalCount} done${stage.runningCompetition?.itemProgressPct != null ? ` · item ${stage.runningCompetition.itemProgressPct}%` : ""}`
    : isDone ? `${stage.completedCount} / ${stage.totalCount} done` : `First up · ${stage.totalCount} items`;

  const face: React.CSSProperties = { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", display: "flex", alignItems: "center", gap: 24, padding: "0 28px 0 24px" };

  return (
    <article
      aria-label={title}
      style={{
        position: "relative", minWidth: 0, minHeight: 0, borderRadius: 24, overflow: "hidden", perspective: 1400,
        ...(isLive ? { background: "var(--fp-tone-gold-bg)", border: "1.5px solid var(--fp-tone-gold-line)", boxShadow: "0 0 40px var(--fp-glow)" } : { background: "var(--fp-surface)", border: "1.5px solid var(--fp-line-2)" }),
        opacity: isDone ? 0.7 : 1, transition: "opacity .5s, box-shadow .5s",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform .9s cubic-bezier(.4,.15,.2,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
        {/* Front — what's on stage now */}
        <div style={face}>
          {isLive ? (
            <span className="fp-medal fp-m-gold" style={{ width: 76, height: 76, fontSize: 38 }}>{stage.stageNumber}</span>
          ) : isDone ? (
            <span className="fp-medal" style={{ width: 76, height: 76, background: "var(--fp-ok-bg)", border: "2px solid var(--fp-ok)", color: "var(--fp-ok)" }}><Check size={34} strokeWidth={2.6} aria-label="Completed" /></span>
          ) : (
            <span className="fp-medal" style={{ width: 76, height: 76, fontSize: 38, color: "var(--fp-sub)", border: "2px solid var(--fp-line-2)" }}>{stage.stageNumber}</span>
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <span className="fp-cap" style={{ fontSize: 14, color: "var(--fp-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
              {isLive ? (
                <span className="fp-cap" style={{ ...LIVE_CHIP, gap: 8, height: 30, padding: "0 12px", fontSize: 12, flex: "none" }}><span className="fp-livedot" style={{ width: 8, height: 8 }} />On stage now</span>
              ) : isDone ? (
                <span className="fp-cap" style={{ ...CHIP, height: 30, padding: "0 12px", fontSize: 12, flex: "none", color: "var(--fp-ok)", background: "var(--fp-ok-bg)" }}>Completed</span>
              ) : (
                <span className="fp-cap" style={{ ...GOLD_CHIP, height: 30, padding: "0 12px", fontSize: 12, flex: "none" }}>{stage.scheduledTime ? `Starts ${stage.scheduledTime}` : "Up next"}</span>
              )}
            </div>
            <div className="fp-ml" style={{ fontSize: isLive ? 40 : 30, fontWeight: 800, lineHeight: 1.08, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isLive ? "var(--fp-ink)" : isDone ? "var(--fp-meta)" : "var(--fp-sub)" }}>{label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1, height: 10, borderRadius: 9999, background: "var(--fp-track)", overflow: "hidden" }}>
                <div style={{ position: "relative", overflow: "hidden", width: `${fill}%`, height: "100%", borderRadius: 9999, background: isDone ? "var(--fp-ok)" : GOLD_BAR, transition: "width .8s cubic-bezier(.22,1,.36,1)" }}>
                  {isLive && <span className="sc-sheen" />}
                </div>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--fp-meta)", whiteSpace: "nowrap" }}>{meta}</span>
            </div>
          </div>
        </div>

        {/* Back — every competition still upcoming on this stage */}
        <div style={{ ...face, transform: "rotateY(180deg)", flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: 10, padding: "16px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="fp-cap" style={{ fontSize: 14, color: "var(--fp-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            <span className="fp-cap" style={{ marginLeft: "auto", fontSize: 13, color: "var(--fp-gold-ink)", flex: "none" }}>Up next · {upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="fp-ml" style={{ fontSize: 26, fontWeight: 700, color: "var(--fp-meta)" }}>{isDone ? "All competitions completed" : "Nothing left upcoming"}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 16, rowGap: 8, overflow: "hidden" }}>
              {upcoming.slice(0, 6).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span className="fp-num" style={{ width: 30, height: 30, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "var(--fp-note-bg)", border: "1px solid var(--fp-note-line)", color: "var(--fp-gold-ink)" }}>
                    {stage.competitions.findIndex((x) => x.id === c.id) + 1}
                  </span>
                  <span className="fp-ml" style={{ fontSize: 22, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── New result published takeover ──────────────────────────────────────
// Plays over everything when a result is published while the screen is
// open: a burst announcing it, then the item's category and name slide in,
// then it fades away onto that item's normal result screen.
interface PublishEvent {
  id: string;
  fcId: string;
  feastSlug: string;
  feastName: string;
  competitionName: string;
  categoryName: string;
  categorySlug: string | null;
  gender: string | null;
  isTeam: boolean;
}
type TakeoverPhase = "announce" | "slide" | "exit";

const PUBLISH_POLL_MS = 10_000;
const ANNOUNCE_MS = 2800;
const SLIDE_MS = 2800;
const EXIT_MS = 450;
// A queued takeover waits until the previous result has shown 1st/2nd/3rd.
const RESULT_HOLD_MS = 3 * SUB_MS;
const CONFETTI_COLORS = ["var(--fp-gold)", "var(--fp-primary-light)", "var(--fp-accent)", "var(--fp-cyan)", "var(--fp-ink)"];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  w: 8 + (i % 3) * 4,
  h: 14 + (i % 4) * 5,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: ((i * 13) % 17) / 10,
  dur: 2.4 + (i % 5) * 0.35,
}));

function toPublishEvent(a: ActivityItem): PublishEvent {
  return {
    id: `${a.id}@${a.at}`,
    fcId: a.id,
    feastSlug: a.feastSlug,
    feastName: a.feastName,
    competitionName: a.competitionName,
    categoryName: a.categoryName ?? "",
    categorySlug: a.categorySlug,
    gender: a.gender,
    isTeam: a.isTeam,
  };
}

function PublishTakeover({ ev, phase }: { ev: PublishEvent; phase: TakeoverPhase }) {
  const cs = catStyle(ev.categorySlug);
  const gender = ev.gender === "girl" ? "Girls" : ev.gender === "boy" ? "Boys" : null;
  const gc = gender === "Girls" ? "var(--fp-girls)" : "var(--fp-boys)";
  const badges = (
    <>
      {ev.categoryName && <span className="fp-disp" style={{ ...BADGE, height: 84, fontSize: 52, padding: "0 32px", background: cs.hi, color: "var(--fp-on-cat)" }}>{ev.categoryName}</span>}
      {gender && <span className="fp-disp" style={{ ...BADGE, height: 84, fontSize: 52, padding: "0 32px", background: gc, color: "var(--fp-on-cat)" }}>{gender}</span>}
      {ev.isTeam && <span className="fp-disp" style={{ ...BADGE, height: 84, fontSize: 52, padding: "0 32px", background: "var(--fp-cat-team-hi)", color: "var(--fp-on-cat)" }}>Team</span>}
    </>
  );

  return (
    <div role="alert" aria-label={`New result published: ${[ev.categoryName, gender, ev.competitionName].filter(Boolean).join(" ")}`} className={phase === "exit" ? "pt-exit" : undefined} style={{ position: "absolute", inset: 0, zIndex: 50, overflow: "hidden" }}>
      <div className="pt-fade" style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 50% 45%, color-mix(in srgb, var(--fp-primary-dark) 45%, var(--fp-base)) 0%, var(--fp-base) 100%)" }} />

      {phase === "announce" ? (
        <>
          <div aria-hidden="true" className="pt-rays-in" style={{ position: "absolute", left: "50%", top: "46%", width: 2000, height: 2000, marginLeft: -1000, marginTop: -1000 }}>
            <div className="fp-rays" style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
          </div>
          {[0.2, 0.55, 0.9].map((d) => (
            <div key={d} aria-hidden="true" className="pt-ring" style={{ animationDelay: `${d}s`, position: "absolute", left: "50%", top: "46%", width: 420, height: 420, marginLeft: -210, marginTop: -210, borderRadius: "50%", border: "3px solid var(--fp-tone-gold-line)", boxShadow: "0 0 40px var(--fp-glow)" }} />
          ))}
          {CONFETTI.map((c, i) => (
            <span key={i} aria-hidden="true" className="pt-confetti" style={{ left: `${c.left}%`, width: c.w, height: c.h, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, textAlign: "center" }}>
            <div className="fp-cap pt-up" style={{ ...LIVE_CHIP, gap: 12, fontSize: 20, padding: "10px 22px", animationDelay: ".15s" }}>
              <span className="fp-livedot" style={{ width: 12, height: 12 }} />New result · just now
            </div>
            <div className="pt-slam" style={{ animationDelay: ".25s" }}>
              <span className="fp-disp" style={{ display: "block", fontSize: 150, lineHeight: 0.9 }}>New result</span>
              <span className="fp-disp fp-t-gold pt-sheen" style={{ fontSize: 250, lineHeight: 0.86, filter: "drop-shadow(0 12px 40px var(--fp-glow))" }}>Published</span>
            </div>
          </div>
        </>
      ) : (
        // Category, boys/girls and the item's name slide in before the result.
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, textAlign: "center", padding: "0 120px" }}>
          <div aria-hidden="true" className="pt-sweep" style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 6, marginTop: -3, background: GOLD_BAR }} />
          <span className="fp-cap pt-slide" style={{ fontSize: 22, color: "var(--fp-gold-ink)" }}>{ev.feastName} · Result published</span>
          <div className="pt-slide" style={{ display: "flex", gap: 18, animationDelay: ".12s" }}>{badges}</div>
          <div className="fp-ml pt-slide" style={{ fontSize: 132, fontWeight: 800, lineHeight: 1.05, animationDelay: ".28s", maxWidth: "100%", ...CLAMP2 }}>{ev.competitionName}</div>
          <span className="fp-cap pt-up" style={{ fontSize: 18, color: "var(--fp-meta)", animationDelay: "1.1s", display: "inline-flex", alignItems: "center", gap: 10 }}>
            The winners <ChevronRight size={20} aria-hidden="true" />
          </span>
        </div>
      )}
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────
// index/count drive the arrows and dots across every screen in the section;
// label/shown/of are what the counter reads ("Result 3 / 29").
interface ScreenNav { index: number; count: number; label: string; shown: number; of: number; onPrev: () => void; onNext: () => void; onGo: (i: number) => void }

function ScreenHeader({
  logoUrl, subtitle, feastName, eyebrow, eyebrowTone, titleLead, titleGold, sections, activeSectionKey, onNavSection, screenNav, paused, onTogglePause, settings,
}: {
  logoUrl: string; subtitle: string; feastName: string; eyebrow: string; eyebrowTone: "live" | "gold"; titleLead: string; titleGold: string;
  sections: DashboardSection[]; activeSectionKey: string; onNavSection: (i: number) => void;
  screenNav: ScreenNav | null; paused: boolean; onTogglePause: () => void; settings: React.ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initialized null (not fmtClock(new Date()) at first render) to avoid a
  // server/client hydration mismatch — the server-rendered timestamp would
  // never match the client's by the time it hydrates.
  const [clock, setClock] = useState<{ hm: string; s: string } | null>(null);
  useEffect(() => {
    const tick = () => setClock(fmtClock(new Date()));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  return (
    <header style={{ position: "absolute", top: 0, left: 0, right: 0, height: 132, boxSizing: "border-box", padding: "0 56px", display: "grid", gridTemplateColumns: "560px 1fr 560px", alignItems: "center", gap: 24, zIndex: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "var(--fp-logo-bg)", border: "2px solid var(--fp-logo-line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div className="fp-ml" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{feastName}</div>
          {subtitle && <div className="fp-ml" style={{ fontSize: 20, fontWeight: 600, color: "var(--fp-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div className="fp-cap" style={eyebrowTone === "live" ? LIVE_CHIP : GOLD_CHIP}>
          {eyebrowTone === "live" ? <span className="fp-livedot" style={{ width: 9, height: 9 }} /> : <Trophy size={16} strokeWidth={2.2} aria-hidden="true" />}
          {eyebrow}
        </div>
        <h1 className="fp-disp" style={{ margin: 0, fontSize: 76, whiteSpace: "nowrap" }}>{titleLead} <span className="fp-hl-text">{titleGold}</span></h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, minWidth: 0 }}>
        {sections.length > 1 && (
          <nav aria-label="Screen sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {sections.map((s, i) => {
              const on = sectionKey(s) === activeSectionKey;
              return (
                <button key={sectionKey(s)} type="button" aria-current={on || undefined} onClick={() => onNavSection(i)} style={{ ...(on ? PILL_ON : PILL_OFF), fontFamily: "inherit" }}>
                  {sectionLabel(s)}
                </button>
              );
            })}
          </nav>
        )}
        {/* Screen controller: step through this section's screens, pause the
            rotation, choose which sections rotate. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div role="group" aria-label="Screen controls" style={{ display: "flex", alignItems: "center", gap: 6, height: 48, padding: "0 6px", borderRadius: 9999, background: "var(--fp-surface)", border: "1px solid var(--fp-line-2)" }}>
            {screenNav && (
              <>
                <button type="button" onClick={screenNav.onPrev} disabled={screenNav.index === 0} aria-label="Previous screen" style={NAV_BTN}><ChevronLeft size={20} aria-hidden="true" /></button>
                {screenNav.count <= 8 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
                    {Array.from({ length: screenNav.count }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => screenNav.onGo(i)}
                        aria-label={`Screen ${i + 1} of ${screenNav.count}`}
                        aria-current={i === screenNav.index || undefined}
                        style={{ width: i === screenNav.index ? 26 : 9, height: 9, padding: 0, border: 0, borderRadius: 9999, cursor: "pointer", background: i === screenNav.index ? GOLD_BAR : "var(--fp-line-2)", transition: "width .3s" }}
                      />
                    ))}
                  </span>
                ) : (
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--fp-sub)", padding: "0 6px", whiteSpace: "nowrap" }}>
                    {screenNav.label} <span className="fp-num" style={{ fontSize: 18, color: "var(--fp-ink)" }}>{screenNav.shown}</span> / {screenNav.of}
                  </span>
                )}
                <button type="button" onClick={screenNav.onNext} disabled={screenNav.index === screenNav.count - 1} aria-label="Next screen" style={NAV_BTN}><ChevronRight size={20} aria-hidden="true" /></button>
                <span aria-hidden="true" style={{ width: 1, height: 24, background: "var(--fp-line-2)", margin: "0 2px" }} />
              </>
            )}
            <button
              type="button"
              onClick={onTogglePause}
              aria-pressed={paused}
              aria-label={paused ? "Resume rotation" : "Pause rotation"}
              style={paused ? { ...NAV_BTN, width: "auto", padding: "0 14px", gap: 6, background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)", border: 0, fontSize: 14, fontWeight: 800, fontFamily: "inherit" } : NAV_BTN}
            >
              {paused ? <><Play size={16} aria-hidden="true" />Paused</> : <Pause size={18} aria-hidden="true" />}
            </button>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <button type="button" onClick={() => setSettingsOpen((o) => !o)} aria-label="Rotation settings" aria-expanded={settingsOpen} style={settingsOpen ? { ...NAV_BTN, background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)", border: 0 } : NAV_BTN}>
                <Settings size={18} aria-hidden="true" />
              </button>
              {settingsOpen && (
                <div style={{ position: "absolute", top: 50, right: 0, minWidth: 300, padding: 16, borderRadius: 16, background: "var(--fp-sheet)", border: "1px solid var(--fp-line-2)", boxShadow: "var(--fp-shadow)", zIndex: 30 }}>
                  {settings}
                </div>
              )}
            </span>
          </div>
          <div className="fp-num" style={{ fontSize: 40, marginLeft: 4 }}>
            {clock?.hm ?? "--:--"}<span style={{ fontSize: 18, color: "var(--fp-meta)", marginLeft: 6 }}>{clock?.s ?? "--"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

const NAV_BTN: React.CSSProperties = { width: 36, height: 36, borderRadius: 9999, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--fp-line-2)", background: "var(--fp-surface-2)", color: "var(--fp-ink)", cursor: "pointer" };

// ── Ticker ─────────────────────────────────────────────────────────────
function Ticker({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <footer aria-label="Live standings ticker" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: TICKER_H, display: "flex", alignItems: "center", overflow: "hidden", background: "var(--fp-bar)", borderTop: "1px solid var(--fp-note-line)", zIndex: 6 }}>
      <span className="fp-cap" style={{ flex: "none", height: "100%", display: "flex", alignItems: "center", padding: "0 34px 0 56px", fontSize: 15, background: "var(--fp-cta-gold)", color: "var(--fp-cta-gold-fg)", clipPath: "polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)", position: "relative", zIndex: 1 }}>
        Live standings
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", whiteSpace: "nowrap", width: "max-content", animation: `tickerScroll ${Math.max(24, rows.length * 4)}s linear infinite` }}>
          {[...rows, ...rows].map((r, i) => (
            <span key={i} aria-hidden={i >= rows.length || undefined} style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "0 22px 0 32px", fontSize: 22, fontWeight: 800 }}>
              <span className="fp-num" style={{ color: "var(--fp-meta)" }}>{String(r.rank).padStart(2, "0")}</span>
              <span className="fp-ml">{r.name}</span>
              <span className="fp-num" style={{ color: "var(--fp-gold-ink)" }}>{r.points}</span>
              <span aria-hidden="true" style={{ width: 7, height: 7, transform: "rotate(45deg)", background: "var(--fp-note-line)", marginLeft: 12 }} />
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ── Main ───────────────────────────────────────────────────────────────
function ScreenPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { feasts, loading: feastsLoading } = useFeasts({ pollIntervalMs: FEASTS_POLL_MS });
  const { meghalas, shakhas, hierarchyLevel } = useOrgHierarchy();
  const hasMeghala = hierarchyLevel !== "shakha";
  const tiers: Tier[] = useMemo(() => (hasMeghala ? ["meghala", "shakha"] : ["shakha"]), [hasMeghala]);

  const [orgLogo, setOrgLogo] = useState("/logo.png");
  const [orgTagline, setOrgTagline] = useState("");
  useEffect(() => {
    supabase.from("org_settings").select("logo_url, org_name_local, tagline").eq("id", true).single().then(({ data }) => {
      if (data) {
        setOrgLogo(data.logo_url || "/logo.png");
        setOrgTagline(data.org_name_local || data.tagline || "");
      }
    });
  }, []);

  const [scale, setScale] = useState(1);
  const [designH, setDesignH] = useState(1080);
  useEffect(() => {
    const fit = () => {
      // Guard against a transient 0×0 viewport (e.g. a hidden/backgrounded
      // tab mid-layout) — dividing by a zero scale produces NaN/Infinity,
      // which React then rejects as an invalid CSS height value.
      if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
      const s = window.innerWidth / DESIGN_W;
      setScale(s);
      setDesignH(Math.max(1080, Math.round(window.innerHeight / s)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const liveFeast = feasts.find((f) => f.status !== "Completed");
  const sections: DashboardSection[] = [
    { kind: "overall" },
    ...feasts.map((f) => ({ kind: "feast" as const, feastSlug: f.slug, feastName: f.name })),
    ...(liveFeast ? [{ kind: "stages" as const, feastSlug: liveFeast.slug, feastName: liveFeast.name }] : []),
  ];

  const [paused, setPaused] = useState(false);

  // Read once on mount. Only the auto-rotation and the (closed by default)
  // settings popover depend on it, so the server render's null can't cause
  // a visible hydration mismatch.
  const [enabledSectionKeys, setEnabledSectionKeys] = useState<Set<string> | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(ROTATION_KEY) : null;
      return raw ? new Set<string>(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  function toggleSection(key: string) {
    const next = new Set(enabledSectionKeys ?? sections.map(sectionKey));
    if (next.has(key)) next.delete(key); else next.add(key);
    setEnabledSectionKeys(next);
    try { localStorage.setItem(ROTATION_KEY, JSON.stringify([...next])); } catch {}

    // Apply the change right away instead of at the end of the current
    // cycle: nothing checked → back to the first section (Overall); the
    // section on screen just got unchecked → jump to the next checked one.
    if (next.size === 0) {
      if (rotation.sectionIdx !== 0) goToSection(0);
      return;
    }
    if (!next.has(activeKey)) {
      for (let step = 1; step <= sections.length; step++) {
        const i = (rotation.sectionIdx + step) % sections.length;
        if (next.has(sectionKey(sections[i]))) {
          goToSection(i);
          break;
        }
      }
    }
  }

  const [overallRows, setOverallRows] = useState<LeaderboardRow[]>([]);
  const [overallMeghalaRows, setOverallMeghalaRows] = useState<LeaderboardRow[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([getOverallLeaderboard(), hasMeghala ? getOverallMeghalaLeaderboard() : Promise.resolve({ data: [] as LeaderboardRow[] })]).then(([lb, mg]) => {
        if (cancelled) return;
        setOverallRows(lb.data ?? []);
        setOverallMeghalaRows(mg.data ?? []);
        setOverallLoading(false);
      });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [hasMeghala]);

  const [feastRows, setFeastRows] = useState<LeaderboardRow[]>([]);
  const [feastMeghalaRows, setFeastMeghalaRows] = useState<LeaderboardRow[]>([]);
  const [screenData, setScreenData] = useState<ScreenData>({ competitions: [] });
  // Which fest's data the feast states currently hold — the active fest is
  // still loading until this catches up with it.
  const [loadedFeastSlug, setLoadedFeastSlug] = useState<string | null>(null);

  // ── New result published ──
  // Watches the same live-activity feed the portal's "Live updates" widget
  // shows (getRecentActivity — feast_competitions turning published). Only
  // items newer than the newest one when this screen opened announce, so
  // reopening the screen never replays old results.
  const [publishQueue, setPublishQueue] = useState<PublishEvent[]>([]);
  const [takeover, setTakeover] = useState<{ ev: PublishEvent; phase: TakeoverPhase } | null>(null);
  const lastTakeoverEndRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    let baseline: string | null = null; // newest activity timestamp seen (DB time)
    const poll = () =>
      getRecentActivity(8).then((items) => {
        if (cancelled) return;
        const newest = items.reduce((m, i) => (i.at > m ? i.at : m), baseline ?? "");
        if (baseline === null) { baseline = newest; return; }
        const since = baseline;
        baseline = newest;
        const events = items
          .filter((i) => i.type === "published" && i.at > since)
          .sort((a, b) => a.at.localeCompare(b.at))
          .map(toPublishEvent);
        // A re-publish of an item already waiting doesn't queue it twice.
        if (events.length) setPublishQueue((q) => [...q, ...events.filter((e) => !q.some((x) => x.fcId === e.fcId))]);
      });
    poll();
    const id = setInterval(poll, PUBLISH_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // A publish overrides pause: rotation holds while the takeover plays and
  // resumes from the new result afterwards.
  const rotation = useDashboardRotation(sections, screenData.competitions.length, paused || takeover !== null, enabledSectionKeys, tiers.length);
  const { activeSection, screenIdx, subIdx, isRankingsScreen, goToSection, goToScreen } = rotation;

  // Keyed on the plain slug string (or null), not the activeSection object —
  // that object is a fresh literal every render (see the URL-sync effect's
  // comment below), which would otherwise tear down and never restart this
  // polling interval on the very next unrelated re-render.
  const activeFeastSlug = activeSection.kind === "feast" ? activeSection.feastSlug : null;

  // After a takeover, the result it announced: set when the takeover moves
  // to its slide, resolved by the fest data load below (which knows where
  // that item sits in the fest's running order).
  const pendingFocusRef = useRef<{ feastSlug: string; fcId: string } | null>(null);
  const goToScreenRef = useRef(goToScreen);
  const tiersLenRef = useRef(tiers.length);
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    goToScreenRef.current = goToScreen;
    tiersLenRef.current = tiers.length;
  });

  useEffect(() => {
    if (!activeFeastSlug) return;
    const slug = activeFeastSlug;
    let cancelled = false;
    const load = () =>
      Promise.all([
        getLeaderboard(slug),
        getScreenData(slug),
        hasMeghala ? getMeghalaLeaderboard(slug) : Promise.resolve({ data: [] as LeaderboardRow[] }),
      ]).then(([lb, sd, mg]) => {
        if (cancelled) return;
        const comps = sd.data?.competitions ?? [];
        setFeastRows(lb.data ?? []);
        setScreenData(sd.data ?? { competitions: [] });
        setFeastMeghalaRows(mg.data ?? []);
        setLoadedFeastSlug(slug);
        const pending = pendingFocusRef.current;
        if (pending && pending.feastSlug === slug) {
          pendingFocusRef.current = null;
          const i = comps.findIndex((c) => c.competitionId === pending.fcId);
          if (i >= 0) goToScreenRef.current(tiersLenRef.current + i);
        }
      });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeFeastSlug, hasMeghala, refreshNonce]);

  // Moves the screen (under the takeover) to the announced result's fest;
  // the load above then lands on the item itself.
  const focusResultRef = useRef<(ev: PublishEvent) => void>(() => {});
  useEffect(() => {
    focusResultRef.current = (ev: PublishEvent) => {
      const idx = sections.findIndex((s) => s.kind === "feast" && s.feastSlug === ev.feastSlug);
      if (idx < 0) return;
      pendingFocusRef.current = { feastSlug: ev.feastSlug, fcId: ev.fcId };
      if (activeFeastSlug === ev.feastSlug) setRefreshNonce((n) => n + 1);
      else goToSection(idx);
    };
  });

  // Next queued takeover, once the previous result has had its turn.
  useEffect(() => {
    if (takeover || publishQueue.length === 0) return;
    const wait = Math.max(0, lastTakeoverEndRef.current + RESULT_HOLD_MS - Date.now());
    const t = setTimeout(() => {
      const [ev, ...rest] = publishQueue;
      setPublishQueue(rest);
      setPaused(false);
      setTakeover({ ev, phase: "announce" });
    }, wait);
    return () => clearTimeout(t);
  }, [takeover, publishQueue]);

  // announce → slide (screen moves to the result underneath) → exit → done.
  useEffect(() => {
    if (!takeover) return;
    const { ev, phase } = takeover;
    const t = setTimeout(() => {
      if (phase === "announce") {
        setTakeover({ ev, phase: "slide" });
        focusResultRef.current(ev);
      } else if (phase === "slide") {
        setTakeover({ ev, phase: "exit" });
      } else {
        lastTakeoverEndRef.current = Date.now();
        setTakeover(null);
      }
    }, phase === "announce" ? ANNOUNCE_MS : phase === "slide" ? SLIDE_MS : EXIT_MS);
    return () => clearTimeout(t);
  }, [takeover]);

  // URL deep-link (initial)
  const initialAppliedRef = useRef(false);
  useEffect(() => {
    if (initialAppliedRef.current || feastsLoading) return;
    const sec = searchParams.get("section");
    if (sec === "overall") goToSection(0);
    else if (sec === "feast") {
      const slug = searchParams.get("feast");
      const idx = sections.findIndex((s) => s.kind === "feast" && s.feastSlug === slug);
      if (idx >= 0) goToSection(idx);
    } else if (sec === "stages") {
      const idx = sections.findIndex((s) => s.kind === "stages");
      if (idx >= 0) goToSection(idx);
    }
    initialAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feastsLoading]);

  // Deliberately keyed on the stable string sectionKey(activeSection), not
  // the activeSection object itself — `sections` (and every DashboardSection
  // within it) is rebuilt as new object literals on every render, so an
  // object-reference dependency here would fire this effect (and its
  // router.replace) on every single render, looping forever.
  const activeKey = sectionKey(activeSection);
  useEffect(() => {
    if (!initialAppliedRef.current) return;
    const params = new URLSearchParams();
    if (activeSection.kind === "overall") params.set("section", "overall");
    else if (activeSection.kind === "feast") { params.set("section", "feast"); params.set("feast", activeSection.feastSlug); }
    else { params.set("section", "stages"); }
    router.replace(`/screen?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, screenIdx]);

  // ── Ranking rows for the active section, both tiers ──
  const shakhaById = useMemo(() => new Map(shakhas.map((s) => [s.id, s])), [shakhas]);
  const meghalaById = useMemo(() => new Map(meghalas.map((m) => [m.id, m])), [meghalas]);
  const isOverall = activeSection.kind === "overall";
  const shakhaLb = isOverall ? overallRows : feastRows;
  const meghalaLb = isOverall ? overallMeghalaRows : feastMeghalaRows;

  const shakhaRankRows: RankRow[] = useMemo(() => shakhaLb.map((r) => {
    const s = shakhaById.get(r.shakhaId);
    const meghala = s?.meghala_id ? meghalaById.get(s.meghala_id) : null;
    return {
      id: r.shakhaId, name: r.name, sub: hasMeghala ? meghala?.name ?? null : null, dot: s?.color ?? null,
      rank: r.rank, points: r.points, cats: [r.subJunior, r.junior, r.senior, r.superSenior, r.elder],
      first: r.firstCount, second: r.secondCount, third: r.thirdCount, a: r.aGrade, b: r.bGrade, c: r.cGrade,
      topShakha: null, unassigned: false,
    };
  }), [shakhaLb, shakhaById, meghalaById, hasMeghala]);

  const meghalaRankRows: RankRow[] = useMemo(() => meghalaLb.map((r) => {
    const unassigned = r.shakhaId === UNASSIGNED_ID;
    const members = shakhas.filter((s) => (unassigned ? !s.meghala_id : s.meghala_id === r.shakhaId));
    const memberIds = new Set(members.map((s) => s.id));
    // Standings rows arrive ranked, so the first member found is the top one.
    const best = shakhaLb.find((x) => memberIds.has(x.shakhaId) && x.points > 0);
    return {
      id: r.shakhaId, name: r.name, sub: `${members.length} shakha${members.length === 1 ? "" : "s"}${unassigned ? " · not ranked" : ""}`,
      dot: unassigned ? null : meghalaById.get(r.shakhaId)?.color ?? null,
      rank: r.rank, points: r.points, cats: [r.subJunior, r.junior, r.senior, r.superSenior, r.elder],
      first: r.firstCount, second: r.secondCount, third: r.thirdCount, a: r.aGrade, b: r.bGrade, c: r.cGrade,
      topShakha: best ? { name: best.name, points: best.points } : null, unassigned,
    };
  }), [meghalaLb, shakhas, shakhaLb, meghalaById]);

  const tier: Tier | null = isRankingsScreen ? tiers[screenIdx] ?? "shakha" : null;
  const activeComp = activeSection.kind === "feast" && !isRankingsScreen ? screenData.competitions[screenIdx - tiers.length] ?? null : null;

  const busy = feastsLoading || (isOverall ? overallLoading : activeSection.kind === "feast" ? loadedFeastSlug !== activeFeastSlug : false);
  const feastName = isOverall ? "Overall Standings" : activeSection.feastName || "Fest";

  let eyebrow = isOverall ? "Live standings · All fests" : "Live standings";
  let eyebrowTone: "live" | "gold" = "live";
  let titleLead = tier === "meghala" ? "Meghala" : "Shakha";
  let titleGold = "Rankings";
  if (activeSection.kind === "stages") { eyebrow = "Live competition board"; titleLead = "Stage"; titleGold = "Board"; }
  else if (activeComp) { eyebrow = "Results declared"; eyebrowTone = "gold"; titleLead = "Competition"; titleGold = "Results"; }

  // Every screen in the active section: the ranking tiers, then (in a fest)
  // each published competition. The stage board is a single screen.
  const compCount = screenData.competitions.length;
  const screenCount = activeSection.kind === "stages" ? 1 : tiers.length + (activeSection.kind === "feast" ? compCount : 0);
  const screenNav: ScreenNav | null = screenCount > 1 ? {
    index: screenIdx,
    count: screenCount,
    label: activeComp ? "Result" : "Standings",
    shown: activeComp ? screenIdx - tiers.length + 1 : screenIdx + 1,
    of: activeComp ? compCount : tiers.length,
    onPrev: () => goToScreen(Math.max(0, screenIdx - 1)),
    onNext: () => goToScreen(Math.min(screenCount - 1, screenIdx + 1)),
    onGo: goToScreen,
  } : null;

  const settingsPanel = (
    <>
      <p className="fp-cap" style={{ fontSize: 12, color: "var(--fp-meta)", margin: "0 0 10px" }}>Rotate through</p>
      {sections.map((s) => {
        const key = sectionKey(s);
        const checked = !enabledSectionKeys || enabledSectionKeys.has(key);
        return (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={checked} onChange={() => toggleSection(key)} style={{ width: 18, height: 18 }} />
            {sectionLabel(s)}
          </label>
        );
      })}
      <p style={{ fontSize: 13, color: "var(--fp-meta)", margin: "10px 0 0", lineHeight: 1.4 }}>Unchecked sections stay reachable from the header pills, just skipped by auto-rotation.</p>
    </>
  );

  const rankRows = tier === "meghala" ? meghalaRankRows : shakhaRankRows;
  const rankedMeghalas = meghalaRankRows.filter((r) => !r.unassigned).length;
  const caption = tier === "meghala" ? "Sum of every shakha's points" : `${shakhaRankRows.length} shakhas ranked`;
  const meta = tier === "meghala" ? `${rankedMeghalas} meghalas · ${shakhas.length} shakhas` : `${shakhaRankRows.length} shakhas`;

  return (
    <div className="fp-shell" style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--fp-page-bg)", color: "var(--fp-ink)", fontFamily: "var(--font-manrope), var(--font-anek), sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", top: 0, left: 0, width: DESIGN_W, height: designH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <ScreenHeader
          logoUrl={orgLogo}
          subtitle={orgTagline}
          feastName={feastName}
          eyebrow={eyebrow}
          eyebrowTone={eyebrowTone}
          titleLead={titleLead}
          titleGold={titleGold}
          sections={sections}
          activeSectionKey={activeKey}
          onNavSection={goToSection}
          screenNav={screenNav}
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
          settings={settingsPanel}
        />

        {busy ? (
          <Spinner />
        ) : activeSection.kind === "stages" ? (
          <StageBoardScreen feastSlug={activeSection.feastSlug} />
        ) : tier ? (
          <RankingsScreen rows={rankRows} tier={tier} tiers={tiers} onTier={(t) => goToScreen(tiers.indexOf(t))} caption={caption} meta={meta} />
        ) : activeComp ? (
          <CompetitionScreen comp={activeComp} subIdx={subIdx} />
        ) : (
          <EmptyState message="No results published yet." />
        )}

        <Ticker rows={overallRows} />

        {takeover && <PublishTakeover key={takeover.ev.id} ev={takeover.ev} phase={takeover.phase} />}
      </div>
    </div>
  );
}

const CSS = `
.fp-shell button:disabled { opacity: .35; cursor: default; }
.sc-sheen { position: absolute; inset: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); mix-blend-mode: overlay; animation: scSheen 2.2s linear infinite; }
@keyframes scSheen { from { transform: translateX(-100%); } to { transform: translateX(240%); } }
@keyframes scSpin { to { transform: rotate(360deg); } }
@keyframes tableScroll { 0% { transform: translateY(0); } 100% { transform: translateY(calc(-50% - 4px)); } }
@keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
/* New result published takeover */
.pt-fade { animation: ptFade .35s ease-out both; }
.pt-rays-in { animation: ptRaysIn 1.1s cubic-bezier(.2,.8,.2,1) both; }
.pt-ring { animation: ptRing 1.6s cubic-bezier(.2,.7,.3,1) both; }
.pt-up { animation: ptUp .6s cubic-bezier(.2,.8,.2,1) both; }
.pt-slam { animation: ptSlam .7s cubic-bezier(.2,1.4,.4,1) both; }
.pt-sheen { position: relative; display: inline-block; overflow: hidden; }
.pt-sheen::after { content: ""; position: absolute; inset: -10% auto -10% 0; width: 30%; background: linear-gradient(100deg, transparent, rgba(255,250,230,.75), transparent); transform: translateX(-160%) skewX(-18deg); mix-blend-mode: overlay; animation: ptSheen 1.2s 1.05s cubic-bezier(.4,0,.2,1) both; }
.pt-confetti { position: absolute; top: -40px; border-radius: 2px; animation-name: ptFall; animation-timing-function: linear; animation-fill-mode: both; }
.pt-slide { animation: ptSlide .75s cubic-bezier(.16,1,.3,1) both; }
.pt-sweep { transform-origin: left center; animation: ptSweep .9s cubic-bezier(.65,0,.35,1) both; opacity: .5; }
.pt-exit { animation: ptExit .45s ease-in both; }
@keyframes ptFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ptRaysIn { from { transform: scale(.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes ptRing { 0% { transform: scale(.2); opacity: 0; } 15% { opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes ptUp { from { transform: translateY(36px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ptSlam { 0% { transform: scale(1.9); opacity: 0; filter: blur(14px); } 60% { opacity: 1; filter: blur(0); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
@keyframes ptSheen { to { transform: translateX(520%) skewX(-18deg); } }
@keyframes ptFall { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(1180px) rotate(620deg); opacity: .2; } }
@keyframes ptSlide { from { transform: translateX(70%) skewX(-8deg); opacity: 0; filter: blur(10px); } to { transform: none; opacity: 1; filter: blur(0); } }
@keyframes ptSweep { 0% { transform: scaleX(0); } 55% { transform: scaleX(1); opacity: .6; } 100% { transform: scaleX(1); opacity: 0; } }
@keyframes ptExit { to { opacity: 0; transform: scale(1.03); } }
@media (prefers-reduced-motion: reduce) {
  .sc-sheen, .pt-rays-in, .pt-ring, .pt-confetti, .pt-sweep, .pt-sheen::after { animation: none; }
  .pt-ring, .pt-confetti, .pt-sweep { display: none; }
  .pt-up, .pt-slam, .pt-slide { animation: ptFade .3s both; }
}
`;

export default function ScreenPage() {
  return (
    <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "var(--fp-page-bg)" }} />}>
      <ScreenPageInner />
    </Suspense>
  );
}
