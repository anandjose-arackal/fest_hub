"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useFeasts, useShakhas } from "@/hooks/use-feast";
import { useCompetitionStages, type CompetitionStage, type RunState } from "@/hooks/use-competition-stages";
import { getLeaderboard, getOverallLeaderboard, getScreenData, type LeaderboardRow, type ScreenData, type ScreenCompetitionResult } from "@/actions/results";
import { CATEGORY_COLORS } from "@/components/feast/feast-shared";
import { useDashboardRotation, SUB_MS } from "./use-dashboard-rotation";
import { sectionKey, sectionLabel, type DashboardSection } from "./dashboard-types";

const DESIGN_W = 1920;
const C_CYAN = "#3fe7ff";
const C_VIOLET = "#7c5cff";
const GOLD_GRAD = "linear-gradient(135deg, #6ef2ff, #36b6ff 30%, #7a6cff 55%, #e84ad6 80%, #ff8a3c)";
const MEDAL_COLOR = ["#FFD24A", "#C8D6E0", "#E8934A"];
const MEDAL_EMO = ["🥇", "🥈", "🥉"];
const PLACE_LBL = ["Champion Shakha", "Second Place", "Third Place"];
const PLACE_WORDS = ["First", "Second", "Third"];
const PLACE_LABELS_SHORT = ["1st Place", "2nd Place", "3rd Place"];
const GRADE_KEYS = ["A", "B", "C"] as const;
const GRADE_COLORS: Record<string, string> = { A: "#16a34a", B: "#d97706", C: "#7c5cff" };
const GRADE_LABELS: Record<string, string> = { A: "DISTINCTION", B: "MERIT", C: "PASS" };
const STAGE_STATUS_COLOR: Record<RunState, string> = { upcoming: C_VIOLET, running: "#ffd24a", completed: "#4ade80" };

const REFRESH_MS = 20_000;
const FEASTS_POLL_MS = 5 * 60 * 1000;
const FLIP_MS = 7000;
const TICKER_H = 44;
const ROTATION_KEY = "feast-screen-rotation-sections";

function fmtClock(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return { hm: `${p(d.getHours())}:${p(d.getMinutes())}`, s: p(d.getSeconds()) };
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(124,92,255,0.10)", border: "2px solid rgba(124,92,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52 }}>🏆</div>
      <div style={{ fontFamily: "var(--font-oswald)", fontSize: 48, fontWeight: 700, background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>No Results Yet</div>
      <div style={{ fontSize: 20, color: "rgba(157,176,216,0.8)", maxWidth: 600, textAlign: "center" }}>{message}</div>
    </div>
  );
}

function PhotoFrame({ url, medalColor, size = 280 }: { url: string | null; medalColor: string; size?: number }) {
  const hex = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
  return (
    <div
      style={{
        width: size, height: size, position: "relative", margin: "0 auto",
        clipPath: hex,
        background: `conic-gradient(from 0deg, ${medalColor}, #fff8c0 18%, #ffd700 36%, ${medalColor} 54%, #fff4a0 72%, ${medalColor} 90%, #fff8c0 100%)`,
        filter: `drop-shadow(0 0 18px ${medalColor}bb) drop-shadow(0 0 40px ${medalColor}55)`,
      }}
    >
      <div style={{ position: "absolute", inset: 8, clipPath: hex, background: "#1a1430", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg viewBox="0 0 100 100" width="55%" height="55%" fill={medalColor} opacity={0.55}>
            <circle cx="50" cy="35" r="20" />
            <path d="M15 95 Q15 60 50 60 Q85 60 85 95 Z" />
          </svg>
        )}
      </div>
    </div>
  );
}

function MedalTag({ emoji, count }: { emoji: string; count: number }) {
  return (
    <span style={{ opacity: count > 0 ? 1 : 0.35, filter: count > 0 ? "none" : "grayscale(1)", fontSize: 20, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {emoji}<span style={{ fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 16 }}>{count}</span>
    </span>
  );
}

// ── Screen 1: Rankings ─────────────────────────────────────────────────
function Screen1Rankings({ rows, shakhaColor }: { rows: LeaderboardRow[]; shakhaColor: (name: string) => string }) {
  const hasLb = rows.length > 0;
  if (!hasLb) return <EmptyState message="No standings yet — rankings appear as results are published." />;
  const top3 = rows.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]];

  return (
    <div style={{ position: "absolute", top: 120, left: 40, right: 40, bottom: 20, display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ height: 270, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 22 }}>
        {podiumOrder.map((row, slot) => {
          if (!row) return <div key={slot} style={{ width: 280 }} />;
          const medalIdx = row.rank - 1;
          const raise = medalIdx === 0 ? -24 : medalIdx === 1 ? -8 : 0;
          const mc = MEDAL_COLOR[medalIdx] ?? C_VIOLET;
          return (
            <div
              key={row.shakhaId}
              style={{
                width: 280, borderRadius: 20, padding: 20, textAlign: "center", position: "relative",
                background: "rgba(15,12,35,.55)", border: `1px solid ${mc}55`, transform: `translateY(${raise}px)`,
                boxShadow: medalIdx === 0 ? `0 0 50px ${mc}44` : `0 0 20px ${mc}22`,
              }}
            >
              <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, background: `linear-gradient(135deg, ${mc}, ${mc}88)` }}>{MEDAL_EMO[medalIdx]}</div>
              <div style={{ fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 15, color: mc, textTransform: "uppercase", letterSpacing: 1 }}>{PLACE_LBL[medalIdx]}</div>
              <div style={{ fontFamily: "var(--font-oswald)", fontSize: 24, color: "#fff", marginTop: 4 }}>{row.name}</div>
              <div style={{ fontFamily: "var(--font-oswald)", fontSize: 40, fontWeight: 700, color: mc, marginTop: 4 }}>{row.points}<span style={{ fontSize: 16, marginLeft: 4 }}>PTS</span></div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>
                <MedalTag emoji="🥇" count={row.firstCount} />
                <MedalTag emoji="🥈" count={row.secondCount} />
                <MedalTag emoji="🥉" count={row.thirdCount} />
              </div>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: shakhaColor(row.name), margin: "10px auto 0" }} />
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, background: "rgba(15,12,35,.55)", border: "1px solid rgba(124,92,255,.25)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontFamily: "var(--font-oswald)", fontSize: 26, fontWeight: 700, color: "#fff" }}>FULL <b style={{ background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>LEADERBOARD</b></div>
          <div style={{ fontFamily: "var(--font-rajdhani)", color: "#9db4ff", fontSize: 16 }}>{rows.length} Shakhas · Live</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 64px 64px 64px 64px 64px 92px 104px 130px", gap: 8, padding: "8px 12px", fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 13, color: "#9db4ff", textTransform: "uppercase", letterSpacing: 1 }}>
          <span>Rank</span><span>Shakha</span><span>Sub Jr</span><span>Junior</span><span>Senior</span><span>Sup Sr</span><span>Elder</span><span>Total</span><span>🥇🥈🥉</span><span>A/B/C</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ animation: `tableScroll ${Math.max(20, rows.length * 3)}s linear infinite` }}>
            {[...rows, ...rows].map((row, i) => {
              const medalIdx = row.rank - 1;
              const top = medalIdx >= 0 && medalIdx < 3;
              return (
                <div
                  key={`${row.shakhaId}-${i}`}
                  style={{
                    display: "grid", gridTemplateColumns: "52px 1fr 64px 64px 64px 64px 64px 92px 104px 130px", gap: 8, padding: "10px 12px", alignItems: "center",
                    fontFamily: "var(--font-barlow)", fontSize: 16, color: "#fff", borderBottom: "1px solid rgba(255,255,255,.06)",
                    background: top ? `${MEDAL_COLOR[medalIdx]}14` : undefined, borderLeft: top ? `3px solid ${MEDAL_COLOR[medalIdx]}` : "3px solid transparent",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-oswald)", color: top ? MEDAL_COLOR[medalIdx] : "rgba(200,210,240,.5)" }}>{String(row.rank).padStart(2, "0")}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: shakhaColor(row.name) }} />{row.name}</span>
                  <span style={{ color: row.subJunior ? "#fff" : "rgba(150,170,220,.25)" }}>{row.subJunior || "—"}</span>
                  <span style={{ color: row.junior ? "#fff" : "rgba(150,170,220,.25)" }}>{row.junior || "—"}</span>
                  <span style={{ color: row.senior ? "#fff" : "rgba(150,170,220,.25)" }}>{row.senior || "—"}</span>
                  <span style={{ color: row.superSenior ? "#fff" : "rgba(150,170,220,.25)" }}>{row.superSenior || "—"}</span>
                  <span style={{ color: row.elder ? "#fff" : "rgba(150,170,220,.25)" }}>{row.elder || "—"}</span>
                  <span style={{ fontWeight: 700, color: "#FFD24A", textShadow: "0 0 12px rgba(255,210,74,.5)" }}>{row.points}</span>
                  <span style={{ display: "flex", gap: 6 }}><MedalTag emoji="🥇" count={row.firstCount} /><MedalTag emoji="🥈" count={row.secondCount} /><MedalTag emoji="🥉" count={row.thirdCount} /></span>
                  <span style={{ display: "flex", gap: 6, fontFamily: "var(--font-rajdhani)", fontWeight: 700 }}>
                    <span style={{ color: row.aGrade ? "#4ade80" : "rgba(150,170,220,.25)" }}>{row.aGrade || "—"}</span>
                    <span style={{ color: row.bGrade ? "#fbbf24" : "rgba(150,170,220,.25)" }}>{row.bGrade || "—"}</span>
                    <span style={{ color: row.cGrade ? "#a78bfa" : "rgba(150,170,220,.25)" }}>{row.cGrade || "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 2: Competition results ─────────────────────────────────────
function Screen2Competition({ comp, subIdx, shakhaColor }: { comp: ScreenCompetitionResult; subIdx: number; shakhaColor: (n: string) => string }) {
  const catColor = CATEGORY_COLORS[comp.categorySlug] ?? C_VIOLET;
  const activeGrade = GRADE_KEYS[subIdx];
  const gradeColor = GRADE_COLORS[activeGrade];
  const achievers = comp.grades[activeGrade];
  const place = subIdx + 1;
  const winner = comp.positions.find((p) => p.place === place) ?? null;
  const mc = MEDAL_COLOR[subIdx];

  const listRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setScrollY(0);
    const t = setTimeout(() => {
      if (!listRef.current || !viewportRef.current) return;
      const overflow = listRef.current.scrollHeight - viewportRef.current.clientHeight;
      if (overflow > 0) setScrollY(-overflow);
    }, 900);
    return () => clearTimeout(t);
  }, [achievers.map((a) => `${a.name}|${a.shakha}`).join(",")]);

  return (
    <div style={{ position: "absolute", top: 120, left: 40, right: 40, bottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={i === subIdx ? { width: 20, height: 7, borderRadius: 4, background: `linear-gradient(90deg,#ffd24a,${C_VIOLET})` } : { width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.18)" }} />
          ))}
          <span style={{ fontFamily: "var(--font-rajdhani)", color: mc, fontSize: 14, fontWeight: 700, marginLeft: 8 }}>{PLACE_LABELS_SHORT[subIdx]}</span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-anek), var(--font-oswald), sans-serif", fontSize: 46, fontWeight: 800, lineHeight: 1.1, maxHeight: "2.15em", overflow: "hidden",
            background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}
        >
          {comp.categoryName ? `${comp.categoryName} — ${comp.competitionName}` : comp.competitionName}
        </div>
        <div style={{ height: 2, marginTop: 6, background: `linear-gradient(90deg, ${catColor}, ${C_VIOLET} 40%, transparent)` }} />
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "310px 1fr 560px", gap: 20, minHeight: 0 }}>
        {/* Left: position winners */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-oswald)", fontSize: 17, letterSpacing: 2.5, textTransform: "uppercase", color: "#fff", margin: 0 }}>
            POSITION <b style={{ background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>WINNERS</b>
          </h3>
          <div style={{ height: 2, background: "linear-gradient(90deg,#3fe7ff,#7c5cff,transparent)" }} />
          {[0, 1, 2].map((i) => {
            const w = comp.positions.find((p) => p.place === i + 1);
            const active = i === subIdx;
            const c = MEDAL_COLOR[i];
            return (
              <div key={i} style={{ borderRadius: 14, padding: 14, background: "rgba(15,12,35,.5)", opacity: active ? 1 : 0.55, boxShadow: active ? `0 0 28px ${c}44, inset 0 0 0 2px ${c}88` : `0 0 10px ${c}22` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: `${c}22` }}>{MEDAL_EMO[i]}</span>
                  <span style={{ fontFamily: "var(--font-rajdhani)", fontSize: 13, letterSpacing: 3, textTransform: "uppercase", color: c }}>{["1st", "2nd", "3rd"][i]}</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: "var(--font-anek), var(--font-oswald), sans-serif", fontSize: 20, fontWeight: 800, color: w ? "#fff" : "rgba(150,180,240,.35)" }}>{w?.name ?? "—"}</div>
                {w?.houseName && <div style={{ fontSize: 14, color: "#c9d3f5" }}>{w.houseName}</div>}
                {w && <div style={{ fontSize: 15, color: shakhaColor(w.shakha) }}>⛪ {w.shakha}</div>}
              </div>
            );
          })}
        </div>

        {/* Center: featured spotlight */}
        <div key={subIdx} style={{ borderRadius: 20, background: "rgba(15,12,35,.55)", border: `1px solid ${mc}44`, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-rajdhani)", color: mc, fontSize: 16, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>✝ {PLACE_LBL[subIdx]} ✝</div>
          {winner ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 44 }}>{MEDAL_EMO[subIdx]}</span>
                <span style={{ fontFamily: "var(--font-oswald)", fontSize: 44, fontWeight: 700, color: mc, textShadow: `0 0 24px ${mc}88` }}>{PLACE_WORDS[subIdx]}</span>
              </div>
              <PhotoFrame url={winner.photoUrl} medalColor={mc} size={220} />
              <div style={{ marginTop: 16, fontFamily: "var(--font-anek), var(--font-oswald), sans-serif", fontSize: 38, fontWeight: 800, color: "#fff" }}>{winner.name}</div>
              {winner.houseName && <div style={{ marginTop: 4, fontSize: 22 }}>🏠 {winner.houseName}</div>}
              <div style={{ marginTop: 6, fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 26, color: shakhaColor(winner.shakha) }}>⛪ {winner.shakha}</div>
            </>
          ) : (
            <div style={{ opacity: 0.4 }}>
              <div style={{ fontSize: 44 }}>{MEDAL_EMO[subIdx]}</div>
              <div style={{ fontFamily: "var(--font-oswald)", fontSize: 22, color: "#fff", marginTop: 8 }}>No winner yet</div>
            </div>
          )}
        </div>

        {/* Right: grade achievers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <h3 style={{ fontFamily: "var(--font-oswald)", fontSize: 17, letterSpacing: 2.5, textTransform: "uppercase", color: "#fff", margin: 0 }}>
            GRADE <b style={{ background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ACHIEVERS</b>
          </h3>
          <div style={{ height: 2, background: "linear-gradient(90deg,#3fe7ff,#7c5cff,transparent)" }} />
          <div style={{ borderRadius: 14, background: "rgba(15,12,35,.5)", padding: 16, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-oswald)", fontWeight: 700, fontSize: 20, color: "#fff", background: gradeColor, clipPath: "polygon(15% 0,85% 0,100% 15%,100% 85%,85% 100%,15% 100%,0 85%,0 15%)" }}>{activeGrade}</span>
                <div>
                  <div style={{ fontFamily: "var(--font-oswald)", fontSize: 16, color: "#fff" }}>Grade {activeGrade}</div>
                  <div style={{ fontFamily: "var(--font-rajdhani)", fontSize: 11, color: "rgba(150,190,240,.7)" }}>{GRADE_LABELS[activeGrade]}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-oswald)", fontSize: 22, color: C_CYAN }}>{achievers.length}</div>
                <div style={{ fontSize: 10, color: "rgba(150,190,240,.7)" }}>ACHIEVERS</div>
              </div>
            </div>
            <div ref={viewportRef} style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
              {achievers.length === 0 ? (
                <p style={{ color: "rgba(150,180,240,.4)", fontSize: 16 }}>No achievers yet</p>
              ) : (
                <div ref={listRef} style={{ transform: `translateY(${scrollY}px)`, transition: "transform 6s linear" }}>
                  {achievers.map((a, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.06)", animation: "scFadeIn .4s ease both", animationDelay: `${i * 0.07}s` }}>
                      <span style={{ fontFamily: "var(--font-anek), var(--font-barlow), sans-serif", fontWeight: 800, color: "#fff", fontSize: 13 }}>{a.name}{a.houseName && <span style={{ display: "block", fontSize: 11, color: "rgba(200,210,240,.6)", fontWeight: 400 }}>{a.houseName}</span>}</span>
                      <span style={{ fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 12, color: shakhaColor(a.shakha) }}>{a.shakha}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 3: Stage board ────────────────────────────────────────────
function StageBoardScreen({ feastSlug }: { feastSlug: string }) {
  const { stages, loading, totalCount, completedCount } = useCompetitionStages(feastSlug, { alwaysPoll: true, intervalMs: REFRESH_MS });
  const [flipped, setFlipped] = useState(false);
  const [flipPaused, setFlipPaused] = useState(false);

  useEffect(() => {
    if (flipPaused) return;
    const id = setInterval(() => setFlipped((f) => !f), FLIP_MS);
    return () => clearInterval(id);
  }, [flipPaused]);

  if (loading && stages.length === 0) {
    return <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid rgba(255,255,255,.15)", borderTopColor: C_CYAN, animation: "scSpin .9s linear infinite" }} /></div>;
  }
  if (stages.length === 0) return <EmptyState message="Stage schedule hasn't been published yet." />;

  const liveCount = stages.filter((s) => s.status === "running").length;

  return (
    <div style={{ position: "absolute", top: 120, left: 40, right: 40, bottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 16, letterSpacing: 3, color: "#fff",
            background: liveCount > 0 ? "linear-gradient(135deg, #ff3b6b, #b3122e)" : "linear-gradient(135deg,#4b5570,#333c52)",
            clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)",
          }}
        >
          {liveCount > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "scBlink 1.1s steps(1) infinite" }} />}
          {liveCount > 0 ? `${liveCount} STAGE${liveCount > 1 ? "S" : ""} LIVE` : "NO STAGE LIVE"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "var(--font-rajdhani)", fontSize: 20, color: "#9db4ff" }}>OVERALL <b style={{ color: "#fff" }}>{completedCount} / {totalCount}</b> COMPETITIONS COMPLETED</span>
          <button onClick={() => setFlipPaused((p) => !p)} style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(124,92,255,.18)", border: "1px solid rgba(124,92,255,.4)", color: "#fff", fontFamily: "var(--font-rajdhani)", fontWeight: 700, cursor: "pointer" }}>
            {flipPaused ? "Flip Paused" : "Flip Live"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(4, 1fr)", gap: 12, minHeight: 0 }}>
        {stages.slice(0, 8).map((stage) => (
          <StageCard key={stage.key} stage={stage} flipped={flipped} />
        ))}
      </div>
    </div>
  );
}

function StageCard({ stage, flipped }: { stage: CompetitionStage; flipped: boolean }) {
  const color = STAGE_STATUS_COLOR[stage.status];
  const isLive = stage.status === "running";
  const upcoming = stage.competitions.filter((c) => c.status === "upcoming");

  return (
    <div style={{ position: "relative", perspective: 1400 }}>
      <div
        style={{
          position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
          transition: "transform .9s cubic-bezier(.4,.15,.2,1)", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 14, background: "rgba(15,12,35,.6)", borderLeft: `4px solid ${color}`, padding: 14, opacity: stage.status === "completed" ? 0.68 : 1, boxShadow: isLive ? `0 0 40px ${color}44` : undefined }}>
          <StageBadge stage={stage} color={color} />
          <div style={{ fontFamily: "var(--font-oswald)", fontSize: 16, textTransform: "uppercase", color: "#cdd7f5", marginTop: 4 }}>Stage {stage.stageNumber} · {stage.title}</div>
          {isLive && stage.runningCompetition && (
            <div style={{ fontFamily: "var(--font-oswald)", fontSize: 26, fontWeight: 900, background: GOLD_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginTop: 4 }}>{stage.runningCompetition.label}</div>
          )}
          <div style={{ fontSize: 13, color: "#9db4ff", marginTop: 4 }}>
            {stage.completedCount}/{stage.totalCount}{!isLive && stage.scheduledTime ? ` · ${stage.scheduledTime}` : ""}
            {isLive && stage.runningCompetition?.itemProgressPct != null && <span style={{ color }}> · {stage.runningCompetition.itemProgressPct}% done</span>}
          </div>
          <div style={{ position: "relative", height: isLive ? 12 : 8, borderRadius: 4, background: "rgba(255,255,255,.1)", overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", borderRadius: 4, width: `${stage.progressPct}%`, background: color }} />
            {isLive && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)", animation: "scLaneShimmer 2.1s linear infinite", mixBlendMode: "overlay" }} />}
          </div>
        </div>

        {/* Back */}
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 14, background: "rgba(15,12,35,.6)", borderLeft: `4px solid ${color}`, padding: 14 }}>
          <StageBadge stage={stage} color={color} />
          <div style={{ fontFamily: "var(--font-oswald)", fontSize: 15, textTransform: "uppercase", color: "#cdd7f5", marginTop: 4 }}>Stage {stage.stageNumber} · UPCOMING · {upcoming.length}</div>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 14, color: "rgba(200,210,240,.5)", marginTop: 8 }}>{stage.status === "completed" ? "All competitions completed" : "Nothing left upcoming"}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, overflow: "hidden" }}>
              {upcoming.slice(0, 6).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#cdd7f5" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{c.order + 1}</span>
                  {c.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageBadge({ stage, color }: { stage: CompetitionStage; color: string }) {
  const done = stage.status === "completed";
  return (
    <div style={{ position: "absolute", top: 10, left: 10, width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-oswald)", fontWeight: 700, fontSize: 16, color: "#fff", background: done ? "linear-gradient(135deg,#4ade80,#22c55e)" : color }}>
      {done ? "✓" : stage.stageNumber}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────
function ScreenHeader({
  logoUrl, subtitle, feastName, section, sections, activeSectionKey, screenCount, screenIdx, onNavSection, onNavScreen,
}: {
  logoUrl: string; subtitle: string; feastName: string; section: DashboardSection; sections: DashboardSection[]; activeSectionKey: string;
  screenCount: number; screenIdx: number; onNavSection: (i: number) => void; onNavScreen: (i: number) => void;
}) {
  // Initialized null (not fmtClock(new Date()) at first render) to avoid a
  // server/client hydration mismatch — the server-rendered timestamp would
  // never match the client's by the time it hydrates.
  const [clock, setClock] = useState<{ hm: string; s: string } | null>(null);
  useEffect(() => {
    setClock(fmtClock(new Date()));
    const id = setInterval(() => setClock(fmtClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  let title = "SHAKHA <b>RANKINGS</b>";
  let eyebrow = "Overall Standings — All Feasts";
  if (section.kind === "stages") { title = "STAGE <b>BOARD</b>"; eyebrow = "Live Competition Board"; }
  else if (section.kind === "feast") {
    if (screenIdx === 0) eyebrow = "Live Standings";
    else { title = "COMPETITION <b>RESULTS</b>"; eyebrow = "Results Declared"; }
  }

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 104, display: "flex", alignItems: "center", gap: 24, padding: "0 40px", background: "linear-gradient(180deg, rgba(3,2,11,.7) 0%, transparent 100%)", zIndex: 5 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" style={{ width: 78, height: 78, objectFit: "contain" }} />
      <div>
        <div style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 700, fontSize: 32, color: "#fff", lineHeight: 1 }}>{feastName}</div>
        <div style={{ fontFamily: "var(--font-anek), sans-serif", fontWeight: 600, fontSize: 20, color: C_CYAN }}>{subtitle}</div>
      </div>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-rajdhani)", fontWeight: 600, fontSize: 15, letterSpacing: 8, textTransform: "uppercase", color: "#9db4ff" }}>✛ {eyebrow} ✛</div>
        <div style={{ fontFamily: "var(--font-oswald)", fontWeight: 700, fontSize: 46, letterSpacing: 2, textTransform: "uppercase", color: "#fff" }} dangerouslySetInnerHTML={{ __html: title.replace("<b>", `<b style="background:${GOLD_GRAD};-webkit-background-clip:text;-webkit-text-fill-color:transparent">`) }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 230 }}>
        {sections.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {sections.map((s, i) => {
              const active = sectionKey(s) === activeSectionKey;
              return (
                <button
                  key={sectionKey(s)}
                  onClick={() => onNavSection(i)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontFamily: "var(--font-rajdhani)", fontWeight: 600, fontSize: 13, cursor: "pointer",
                    border: active ? "1px solid #3fe7ff" : "1px solid rgba(255,255,255,.2)",
                    background: active ? "linear-gradient(135deg,rgba(63,231,255,.18),rgba(124,92,255,.18))" : "transparent",
                    color: active ? "#fff" : "#cdd7f5",
                  }}
                >
                  {sectionLabel(s)}
                </button>
              );
            })}
          </div>
        )}
        {screenCount > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onNavScreen(Math.max(0, screenIdx - 1))} style={navBtnStyle}>‹</button>
            {Array.from({ length: screenCount }, (_, i) => (
              <span key={i} style={i === screenIdx ? { width: 20, height: 7, borderRadius: 4, background: "linear-gradient(90deg,#ffd24a,#7c5cff)" } : { width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.25)" }} />
            ))}
            <button onClick={() => onNavScreen(Math.min(screenCount - 1, screenIdx + 1))} style={navBtnStyle}>›</button>
          </div>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", background: "linear-gradient(135deg, #ff3b6b, #b3122e)", clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)", fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 14, letterSpacing: 3, color: "#fff" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "scBlink 1.1s steps(1) infinite" }} />LIVE
        </span>
        <div style={{ fontFamily: "var(--font-oswald)", fontSize: 22, color: "#fff" }}>{clock?.hm ?? "--:--"}<small style={{ fontSize: 13, color: "#9db0d8", marginLeft: 4 }}>{clock?.s ?? "--"}</small></div>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = { width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(255,255,255,.25)", color: "#fff", background: "rgba(255,255,255,.06)", cursor: "pointer", fontSize: 13, lineHeight: 1 };

// ── Ticker ───────────────────────────────────────────────────────────
function Ticker({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: TICKER_H, background: "linear-gradient(90deg,rgba(8,8,22,.94),rgba(18,12,38,.94))", borderTop: "1px solid rgba(100,160,255,.35)", zIndex: 1000, display: "flex", alignItems: "center" }}>
      <span style={{ flexShrink: 0, height: "100%", display: "flex", alignItems: "center", padding: "0 20px", background: "linear-gradient(135deg,#6ef2ff,#5b8cff 55%,#9d6eff)", clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)", fontFamily: "var(--font-rajdhani)", fontWeight: 800, fontSize: 16, letterSpacing: 2, color: "#060e18" }}>
        LIVE STANDINGS
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", whiteSpace: "nowrap", animation: `tickerScroll ${Math.max(24, rows.length * 4)}s linear infinite` }}>
          {[...rows, ...rows].map((r, i) => (
            <span key={i} style={{ fontFamily: "var(--font-rajdhani)", fontWeight: 700, fontSize: 20, color: "#fff", padding: "0 20px" }}>
              {r.name} <b style={{ color: C_CYAN }}>{r.points}</b> PTS <span style={{ color: "rgba(200,180,255,.6)" }}>✝</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
function ScreenPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { feasts, loading: feastsLoading } = useFeasts({ pollIntervalMs: FEASTS_POLL_MS });
  const { shakhas } = useShakhas();
  const shakhaColor = useCallback((name: string) => shakhas.find((s) => s.name === name)?.color ?? C_VIOLET, [shakhas]);

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
      const dh = Math.max(1080, Math.round(window.innerHeight / s));
      setScale(s);
      setDesignH(dh);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const sections: DashboardSection[] = [
    { kind: "overall" },
    ...feasts.map((f) => ({ kind: "feast" as const, feastSlug: f.slug, feastName: f.name })),
    ...(feasts.find((f) => f.status !== "Completed") ? [{ kind: "stages" as const, feastSlug: feasts.find((f) => f.status !== "Completed")!.slug, feastName: feasts.find((f) => f.status !== "Completed")!.name }] : []),
  ];

  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enabledSectionKeys, setEnabledSectionKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ROTATION_KEY);
      if (raw) setEnabledSectionKeys(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  function toggleSection(key: string) {
    setEnabledSectionKeys((prev) => {
      const base = prev ?? new Set(sections.map(sectionKey));
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(ROTATION_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const [overallRows, setOverallRows] = useState<LeaderboardRow[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = () => getOverallLeaderboard().then(({ data }) => { if (!cancelled) { setOverallRows(data ?? []); setOverallLoading(false); } });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const [feastRows, setFeastRows] = useState<LeaderboardRow[]>([]);
  const [screenData, setScreenData] = useState<ScreenData>({ competitions: [] });
  const [feastDataLoading, setFeastDataLoading] = useState(false);

  const rotation = useDashboardRotation(sections, screenData.competitions.length, paused, enabledSectionKeys);
  const { activeSection, screenIdx, subIdx, isRankingsScreen, goToSection, goToScreen } = rotation;

  // Keyed on the plain slug string (or null), not the activeSection object —
  // that object is a fresh literal every render (see the URL-sync effect's
  // comment below), which would otherwise tear down and never restart this
  // polling interval on the very next unrelated re-render.
  const activeFeastSlug = activeSection.kind === "feast" ? activeSection.feastSlug : null;
  useEffect(() => {
    if (!activeFeastSlug) return;
    const slug = activeFeastSlug;
    let cancelled = false;
    setFeastDataLoading(true);
    const load = () =>
      Promise.all([getLeaderboard(slug), getScreenData(slug)]).then(([lb, sd]) => {
        if (cancelled) return;
        setFeastRows(lb.data ?? []);
        setScreenData(sd.data ?? { competitions: [] });
        setFeastDataLoading(false);
      });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeFeastSlug]);

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

  const busy = feastsLoading || (activeSection.kind === "overall" ? overallLoading : feastDataLoading);
  const feastName = activeSection.kind === "overall" ? "Overall Standings" : activeSection.kind === "stages" ? activeSection.feastName : activeSection.feastName || "Feast";
  const activeComp = activeSection.kind === "feast" && screenIdx > 0 ? screenData.competitions[screenIdx - 1] : null;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "radial-gradient(ellipse at top, #150c2e, #030211 70%)" }}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", top: 0, left: 0, width: DESIGN_W, height: designH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{ position: "absolute", top: -200, right: -200, width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,92,255,.18), transparent 70%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", bottom: -200, left: -200, width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(63,231,255,.14), transparent 70%)", filter: "blur(60px)" }} />
        </div>

        <ScreenHeader
          logoUrl={orgLogo}
          subtitle={orgTagline}
          feastName={feastName}
          section={activeSection}
          sections={sections}
          activeSectionKey={sectionKey(activeSection)}
          screenCount={activeSection.kind === "feast" ? screenData.competitions.length + 1 : 1}
          screenIdx={screenIdx}
          onNavSection={goToSection}
          onNavScreen={goToScreen}
        />

        {busy ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid rgba(255,255,255,.15)", borderTopColor: C_CYAN, animation: "scSpin .9s linear infinite" }} />
          </div>
        ) : activeSection.kind === "stages" ? (
          <StageBoardScreen feastSlug={activeSection.feastSlug} />
        ) : isRankingsScreen ? (
          <Screen1Rankings rows={activeSection.kind === "overall" ? overallRows : feastRows} shakhaColor={shakhaColor} />
        ) : activeComp ? (
          <Screen2Competition comp={activeComp} subIdx={subIdx} shakhaColor={shakhaColor} />
        ) : screenData.competitions.length === 0 ? (
          <EmptyState message="No results published yet." />
        ) : (
          <EmptyState message="Loading competition..." />
        )}
      </div>

      <Ticker rows={overallRows} />

      <div style={{ position: "fixed", top: 14, right: 14, zIndex: 2000, display: "flex", gap: 8 }}>
        <button onClick={() => setPaused((p) => !p)} style={ctrlBtnStyle}>{paused ? "▶" : "⏸"}</button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setSettingsOpen((o) => !o)} style={ctrlBtnStyle}>⚙</button>
          {settingsOpen && (
            <div style={{ position: "absolute", top: 44, right: 0, minWidth: 220, background: "rgba(10,8,30,.96)", border: "1px solid rgba(63,231,255,.3)", borderRadius: 12, padding: 12, zIndex: 2001 }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#9db0d8", margin: "0 0 8px" }}>Rotate through</p>
              {sections.map((s) => {
                const key = sectionKey(s);
                const checked = !enabledSectionKeys || enabledSectionKeys.has(key);
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fff", padding: "4px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSection(key)} />
                    {sectionLabel(s)}
                  </label>
                );
              })}
              <p style={{ fontSize: 10, color: "#7c86a8", marginTop: 8 }}>Unchecked sections stay reachable via the pills above, just skipped by auto-rotation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ctrlBtnStyle: React.CSSProperties = { width: 34, height: 34, borderRadius: "50%", background: "rgba(10,8,30,.8)", border: "1px solid rgba(124,92,255,.4)", color: "#fff", cursor: "pointer", fontSize: 15 };

const CSS = `
@keyframes scBlink { 50% { opacity: .25; } }
@keyframes scSpin { to { transform: rotate(360deg); } }
@keyframes scFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scLaneShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
@keyframes scPulseDot { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.4); } }
@keyframes tableScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
@keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
`;

export default function ScreenPage() {
  return (
    <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at top, #150c2e, #030211 70%)" }} />}>
      <ScreenPageInner />
    </Suspense>
  );
}
