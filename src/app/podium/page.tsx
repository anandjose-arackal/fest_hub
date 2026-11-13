"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrgHierarchy } from "@/hooks/use-feast";
import {
  getDioceseLeaderboard, getLeaderboard, getMeghalaLeaderboard, getScreenData,
  type LeaderboardRow, type ScreenCompetitionResult, type ScreenPosition,
} from "@/actions/results";
import { readPodiumPick, type PodiumPick } from "@/lib/podium";
import { ParticipantPhoto } from "@/components/screen/participant-photo";
import { BadgeShow, BADGE_SHOW_MS } from "@/components/screen/badge-show";
import { CmlFlag } from "@/components/screen/cml-flag";
import { catStyle, theme } from "@/components/feast/feast-shared";

// The 16:9 LED wall behind the winner podium, driven from
// /admin/trophies/podium (podium_display):
//   item picked      → that item's 1st / 2nd / 3rd
//   standings        → top 3 diocese → meghala → shakha of the fest, cycling
//   nothing picked   → the flag backdrop and the badge animation, alternating
const W = 1920;
const H = 1080;
const PICK_POLL_MS = 2_000;
const DATA_REFRESH_MS = 20_000;
const BACKDROP_MS = 15_000;
const TIER_MS = 14_000; // includes the title intro
// Stage order: 2nd on the left, 1st in the middle, 3rd on the right.
const STAGE_ORDER = [2, 1, 3] as const;
const PLACE_WORD = { 1: "First", 2: "Second", 3: "Third" } as const;
// Sargaprabha medals (black background cut away), ~812×1499.
const MEDAL_IMG = { 1: "/podium/medal-gold.webp", 2: "/podium/medal-silver.webp", 3: "/podium/medal-bronze.webp" } as const;
const MEDAL_RATIO = 1499 / 812;
const BLOCK = {
  1: { h: 130, bg: "linear-gradient(180deg,#FFE79A,#E9B62E 40%,#9A6508)", ink: "#3A2A06" },
  2: { h: 96, bg: "linear-gradient(180deg,#FFFFFF,#C9CED8 45%,#6E7684)", ink: "#262B33" },
  3: { h: 70, bg: "linear-gradient(180deg,#FFD8B5,#C98A55 45%,#5E3B1F)", ink: "#2A1708" },
} as const;
const UNASSIGNED_ID = "__unassigned__";
// The fest title art (background cut to transparent) revolves in before
// every podium reveal. shortcut: one deployment-wide asset at
// public/podium/title.png; move it to org/fest settings if another fest needs its own.
const TITLE_ART = "/podium/title.webp";
const TITLE_W = 1300;
const TITLE_H = Math.round((TITLE_W * 735) / 1189);
const INTRO_MS = 4_800;

const KEYFRAMES = `
@keyframes pdIn{from{opacity:0;transform:translateY(60px) scale(.94)}to{opacity:1;transform:none}}
@keyframes pdFade{from{opacity:0}to{opacity:1}}
@keyframes pdDrop{0%{opacity:0;transform:translateY(-120%) rotate(-12deg)}60%{opacity:1;transform:translateY(6%) rotate(4deg)}80%{transform:translateY(-2%) rotate(-2deg)}100%{opacity:1;transform:none}}
@keyframes pdSwing{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes pdSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes pdRise{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:.9}100%{transform:translateY(-1150px) scale(1.1);opacity:0}}
@keyframes pdConfetti{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
@keyframes pdShine{0%{transform:translateX(-120%) skewX(-20deg)}60%,100%{transform:translateX(260%) skewX(-20deg)}}
@keyframes pdTitle{0%{opacity:0;transform:rotateY(-720deg) rotateX(22deg) scale(.25);filter:brightness(2.2) blur(6px)}10%{opacity:1}46%{transform:rotateY(0) rotateX(0) scale(1.08);filter:brightness(1.6) blur(0)}54%{transform:rotateY(0) scale(1);filter:brightness(1)}70%{transform:rotateY(-10deg) rotateX(4deg) scale(1.02)}86%{opacity:1;transform:rotateY(8deg) rotateX(-3deg) scale(1.04);filter:brightness(1) blur(0)}100%{opacity:0;transform:rotateY(110deg) scale(1.35);filter:brightness(1.8) blur(10px)}}
@keyframes pdFlash{0%,40%{opacity:0}47%{opacity:.9}75%{opacity:0}}
@keyframes pdSweep{0%,52%{transform:translateX(-140%) skewX(-20deg)}78%,100%{transform:translateX(340%) skewX(-20deg)}}
@keyframes pdPulse{0%,100%{opacity:.55;transform:translate(-50%,-50%) scale(1)}50%{opacity:.9;transform:translate(-50%,-50%) scale(1.08)}}
`;

export default function PodiumPage() {
  const { hierarchyLevel } = useOrgHierarchy();
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
      setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const [org, setOrg] = useState<{ logo: string; name: string; tagline: string }>({ logo: "/logo.png", name: "", tagline: "" });
  useEffect(() => {
    supabase.from("org_settings").select("logo_url, org_name_en, org_name_local, tagline").eq("id", true).single().then(({ data }) => {
      if (data) setOrg({ logo: data.logo_url || "/logo.png", name: data.org_name_local || data.org_name_en || "", tagline: data.tagline || "" });
    });
  }, []);

  const [pick, setPick] = useState<PodiumPick | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => readPodiumPick().then((p) => { if (!cancelled && p) setPick((old) => (old?.updatedAt === p.updatedAt ? old : p)); });
    poll();
    const id = setInterval(poll, PICK_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const slug = pick?.feastSlug ?? null;
  const mode = pick?.mode ?? "item";

  // ── item winners ──
  const [comps, setComps] = useState<{ slug: string; list: ScreenCompetitionResult[] } | null>(null);
  useEffect(() => {
    if (!slug || mode !== "item") return;
    let cancelled = false;
    const load = () => getScreenData(slug).then((r) => { if (!cancelled && r.data) setComps({ slug, list: r.data.competitions }); });
    load();
    const id = setInterval(load, DATA_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, mode, pick?.updatedAt]);
  const comp = mode === "item" && pick?.fcId && comps?.slug === slug ? comps.list.find((c) => c.competitionId === pick.fcId) ?? null : null;

  // ── standings: one tier at a time, top tier first ──
  const tiers: Tier[] = hierarchyLevel === "diocese" ? ["diocese", "meghala", "shakha"] : hierarchyLevel === "meghala" ? ["meghala", "shakha"] : ["shakha"];
  const [standings, setStandings] = useState<{ slug: string; rows: Record<Tier, LeaderboardRow[]> } | null>(null);
  useEffect(() => {
    if (!slug || mode !== "standings") return;
    let cancelled = false;
    const load = () =>
      Promise.all([
        getLeaderboard(slug),
        hierarchyLevel !== "shakha" ? getMeghalaLeaderboard(slug) : Promise.resolve({ data: [] as LeaderboardRow[] }),
        hierarchyLevel === "diocese" ? getDioceseLeaderboard(slug) : Promise.resolve({ data: [] as LeaderboardRow[] }),
      ]).then(([sh, mg, dc]) => {
        if (!cancelled) setStandings({ slug, rows: { shakha: sh.data ?? [], meghala: mg.data ?? [], diocese: dc.data ?? [] } });
      });
    load();
    const id = setInterval(load, DATA_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, mode, hierarchyLevel, pick?.updatedAt]);
  const [tierIdx, setTierIdx] = useState(0);
  const showStandings = mode === "standings" && standings?.slug === slug;
  useEffect(() => {
    if (!showStandings) return;
    const id = setInterval(() => setTierIdx((i) => i + 1), TIER_MS);
    return () => clearInterval(id);
  }, [showStandings]);
  const tier = tiers[tierIdx % tiers.length];

  // ── idle: flag backdrop ↔ badge animation ──
  const idle = !comp && !showStandings;
  const [idleScene, setIdleScene] = useState<"backdrop" | "badge">("backdrop");
  useEffect(() => {
    if (!idle) return;
    const t = setTimeout(() => setIdleScene((s) => (s === "backdrop" ? "badge" : "backdrop")), idleScene === "backdrop" ? BACKDROP_MS : BADGE_SHOW_MS);
    return () => clearTimeout(t);
  }, [idle, idleScene]);

  const lineage = (p: ScreenPosition) =>
    [p.shakha, hierarchyLevel === "diocese" ? p.dioceseName : hierarchyLevel === "meghala" ? p.meghalaName : null].filter(Boolean).join(" · ");

  return (
    <div className="fp-shell" style={{ position: "absolute", inset: 0, background: "#0b0302", overflow: "hidden" }}>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          position: "absolute", left: "50%", top: "50%", width: W, height: H,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center",
          background: "radial-gradient(ellipse 60% 55% at 50% 38%, rgba(255,214,107,.28), transparent 70%), radial-gradient(ellipse 120% 90% at 50% 100%, #5a0f08, #1a0503 70%)",
          color: "#fff", fontFamily: theme.ui, overflow: "hidden",
        }}
      >
        {comp ? (
          <WithIntro key={comp.competitionId}><Winners comp={comp} logo={org.logo} feastName={pick?.feastName ?? ""} lineage={lineage} /></WithIntro>
        ) : showStandings ? (
          <WithIntro key={`${tier}-${tierIdx}`}><Standings tier={tier} rows={standings.rows[tier]} logo={org.logo} feastName={pick?.feastName ?? ""} /></WithIntro>
        ) : idleScene === "badge" ? (
          <BadgeShow key="badge" />
        ) : (
          <Backdrop key="idle" logo={org.logo} name={org.name} tagline={org.tagline} feastName={pick?.feastName ?? null} />
        )}
      </div>
    </div>
  );
}

type Tier = "diocese" | "meghala" | "shakha";
const TIER_TITLE: Record<Tier, { en: string; ml: string }> = {
  diocese: { en: "Diocese Standings", ml: "രൂപത" },
  meghala: { en: "Meghala Standings", ml: "മേഖല" },
  shakha: { en: "Shakha Standings", ml: "ശാഖ" },
};

// ── shared decoration ────────────────────────────────────────────────────

// Gold motes drifting up the whole stage; positions are fixed per index.
function Sparkles({ count = 36 }: { count?: number }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const size = 4 + ((i * 7) % 9);
        return (
          <span
            key={i}
            style={{
              position: "absolute", left: `${(i * 37) % 100}%`, top: H + 20, width: size, height: size, borderRadius: "50%",
              background: i % 3 ? "#FFE58A" : "#FFFFFF", boxShadow: `0 0 ${size * 2}px #FFD84D`,
              animation: `pdRise ${9 + (i % 7)}s linear ${-((i * 1.7) % 14)}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// Slow-turning light rays behind a winner.
function Rays({ size, x, y, color = "rgba(255,221,120,.22)" }: { size: number; x: number | string; y: number | string; color?: string }) {
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%", background: `repeating-conic-gradient(${color} 0deg 7deg, transparent 7deg 18deg)`, maskImage: "radial-gradient(circle, #000 20%, transparent 70%)", WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 70%)", animation: "pdSpin 40s linear infinite", transform: "translate(-50%,-50%)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: x, top: y, width: size * 0.55, height: size * 0.55, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,226,140,.55), transparent 70%)", animation: "pdPulse 3.2s ease-in-out infinite", transform: "translate(-50%,-50%)" }} />
    </>
  );
}

// One burst of confetti from a point, fired once on mount.
function Confetti({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const colors = ["#FFDD1F", "#E63A1E", "#FFFFFF", "#F5C542", "#FF8A5C"];
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {Array.from({ length: 70 }, (_, i) => {
        const a = (i / 70) * Math.PI * 2 + (i % 5) * 0.2;
        const d = 260 + ((i * 53) % 420);
        return (
          <span
            key={i}
            style={{
              position: "absolute", width: 10 + (i % 4) * 3, height: 18 + (i % 3) * 6, background: colors[i % colors.length], borderRadius: 3,
              ["--dx" as string]: `${Math.cos(a) * d}px`, ["--dy" as string]: `${Math.sin(a) * d * 0.7 + 380}px`, ["--r" as string]: `${(i % 2 ? 1 : -1) * (360 + i * 25)}deg`,
              animation: `pdConfetti ${2.4 + (i % 5) * 0.3}s cubic-bezier(.15,.7,.4,1) ${delay}s both`,
            }}
          />
        );
      })}
    </div>
  );
}

function MedalArt({ place, height, delay = 0 }: { place: 1 | 2 | 3; height: number; delay?: number }) {
  return (
    <span style={{ display: "inline-block", height, width: height / MEDAL_RATIO, animation: `pdDrop 1.1s cubic-bezier(.2,.8,.2,1) ${delay}s both` }}>
      <span style={{ display: "block", height: "100%", transformOrigin: "50% 0", animation: `pdSwing ${3 + place * 0.4}s ease-in-out ${delay + 1.1}s infinite` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MEDAL_IMG[place]} alt={`${PLACE_WORD[place]} place medal`} style={{ height: "100%", width: "100%", objectFit: "contain", filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))" }} />
      </span>
    </span>
  );
}

function PodiumBlock({ place }: { place: 1 | 2 | 3 }) {
  const b = BLOCK[place];
  return (
    <div className="fp-disp" style={{ position: "relative", overflow: "hidden", width: "100%", height: b.h, borderRadius: "26px 26px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, letterSpacing: ".1em", background: b.bg, color: b.ink, boxShadow: "inset 0 3px 0 rgba(255,255,255,.6), 0 -10px 40px rgba(0,0,0,.25)" }}>
      {PLACE_WORD[place]}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, width: "40%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)", animation: `pdShine 4.5s ease-in-out ${1 + place * 0.4}s infinite` }} />
    </div>
  );
}

function Header({ logo, kicker, title, right }: { logo: string; kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <header style={{ position: "relative", display: "flex", alignItems: "center", gap: 32, animation: "pdFade .8s ease both" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" style={{ width: 124, height: 124, objectFit: "contain", flex: "none", filter: "drop-shadow(0 0 26px rgba(255,214,107,.6))" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fp-ml" style={{ fontSize: 32, fontWeight: 800, color: "#FFDD1F", letterSpacing: ".04em" }}>{kicker}</div>
        <div className="fp-disp fp-ml" style={{ fontSize: 86, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 6px 30px rgba(0,0,0,.5)" }}>{title}</div>
      </div>
      {right}
    </header>
  );
}

// Thin yellow / red / yellow band — the flag's colours as a stage edge.
function FlagBand({ top }: { top?: boolean }) {
  return <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: 0, height: 18, background: "linear-gradient(#FFDD1F 0 33.34%, #E63A1E 33.34% 66.67%, #FFDD1F 66.67%)" }} />;
}

// The title art bursts in, glints, and clears; the podium mounts after it,
// so its own reveal animations start then.
function WithIntro({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), INTRO_MS);
    return () => clearTimeout(t);
  }, []);
  if (done) return <>{children}</>;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Sparkles count={40} />
      <Rays size={1700} x={W / 2} y={H / 2} color="rgba(255,221,120,.3)" />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, rgba(255,240,190,.9), transparent 55%)", animation: `pdFlash ${INTRO_MS}ms ease-out both` }} />
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 1700, height: 1060, transform: "translate(-50%,-50%)", background: "radial-gradient(ellipse, rgba(10,2,1,.85) 30%, transparent 70%)", animation: `pdFade .6s ease both` }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: TITLE_W, height: TITLE_H, marginLeft: -TITLE_W / 2, marginTop: -TITLE_H / 2, perspective: 1600 }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", animation: `pdTitle ${INTRO_MS}ms cubic-bezier(.25,.8,.25,1) both` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TITLE_ART} alt="Fest title" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 40px rgba(255,200,60,.55)) drop-shadow(0 24px 30px rgba(0,0,0,.6))" }} />
          {/* Light glint clipped to the art itself. */}
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", maskImage: `url(${TITLE_ART})`, WebkitMaskImage: `url(${TITLE_ART})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "25%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent)", animation: `pdSweep ${INTRO_MS}ms ease-in-out both` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── scenes ───────────────────────────────────────────────────────────────

function Backdrop({ logo, name, tagline, feastName }: { logo: string; name: string; tagline: string; feastName: string | null }) {
  return (
    <div style={{ position: "absolute", inset: 0, animation: "pdFade 1.2s ease both" }}>
      <Sparkles />
      <Rays size={1500} x={1240} y={470} />
      <div style={{ position: "absolute", left: 120, top: 150 }}>
        <CmlFlag width={660} />
      </div>
      <div style={{ position: "absolute", left: 860, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ width: 340, height: 340, objectFit: "contain", filter: "drop-shadow(0 0 60px rgba(255,214,107,.7))", animation: "pdIn 1.2s cubic-bezier(.2,.8,.2,1) .2s both" }} />
        {name && <div className="fp-disp fp-ml" style={{ fontSize: 88, lineHeight: 1.08, textShadow: "0 8px 40px rgba(0,0,0,.6)", animation: "pdIn 1s ease .5s both" }}>{name}</div>}
        {feastName && <div className="fp-ml" style={{ fontSize: 54, fontWeight: 800, color: "#FFDD1F", animation: "pdIn 1s ease .8s both" }}>{feastName}</div>}
        {tagline && <div className="fp-ml" style={{ fontSize: 32, fontWeight: 600, color: "rgba(255,243,176,.85)", animation: "pdIn 1s ease 1.1s both" }}>{tagline}</div>}
      </div>
      <FlagBand />
    </div>
  );
}

function Winners({ comp, logo, feastName, lineage }: { comp: ScreenCompetitionResult; logo: string; feastName: string; lineage: (p: ScreenPosition) => string }) {
  const gender = comp.gender === "girl" ? "Girls" : comp.gender === "boy" ? "Boys" : null;
  const cat = catStyle(comp.categorySlug);
  const chip: React.CSSProperties = { padding: "14px 30px", borderRadius: 20, fontSize: 40, color: "var(--fp-on-cat)", boxShadow: "0 10px 30px rgba(0,0,0,.35)" };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Sparkles count={28} />
      <Rays size={1300} x={W / 2} y={560} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "48px 72px 18px" }}>
        <Header
          logo={logo}
          kicker={feastName}
          title={comp.competitionName}
          right={
            <div style={{ display: "flex", gap: 16, flex: "none" }}>
              {comp.categoryName && <span className="fp-disp" style={{ ...chip, background: cat.color }}>{comp.categoryName}</span>}
              {gender && <span className="fp-disp" style={{ ...chip, background: gender === "Girls" ? "var(--fp-girls)" : "var(--fp-boys)" }}>{gender}</span>}
            </div>
          }
        />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.25fr 1fr", alignItems: "end", gap: 44, marginTop: 20 }}>
          {STAGE_ORDER.map((place) => {
            const winners = comp.positions.filter((p) => p.place === place);
            // Reveal 3rd, then 2nd, then 1st.
            const delay = place === 3 ? 0.3 : place === 2 ? 1.1 : 1.9;
            return (
              <div key={place} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, animation: `pdIn 1s cubic-bezier(.2,.8,.2,1) ${delay}s both` }}>
                {winners.length === 0 ? (
                  <div style={{ fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>—</div>
                ) : (
                  <WinnerStack winners={winners} place={place} lineage={lineage} delay={delay} />
                )}
                <PodiumBlock place={place} />
              </div>
            );
          })}
        </div>
      </div>
      <Confetti x={W / 2} y={260} delay={2.3} />
      <FlagBand />
    </div>
  );
}

// Ties share a place: their photos shrink to fit side by side. No photo →
// the poster's hanging medal in its place.
function WinnerStack({ winners, place, lineage, delay }: { winners: ScreenPosition[]; place: 1 | 2 | 3; lineage: (p: ScreenPosition) => string; delay: number }) {
  const base = place === 1 ? 270 : 210;
  const photoW = winners.length === 1 ? base : Math.round((base / Math.min(winners.length, 3)) * 1.15);
  const nameSize = (place === 1 ? 56 : 44) - (winners.length > 1 ? 10 : 0);
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 24, width: "100%" }}>
      {winners.map((w, k) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          {w.photoUrl ? (
            <div style={{ position: "relative" }}>
              <ParticipantPhoto src={w.photoUrl} place={place} name={w.name} width={photoW} />
            </div>
          ) : (
            <MedalArt place={place} height={Math.round(photoW * 1.45)} delay={delay + 0.2} />
          )}
          <div className="fp-ml" style={{ fontSize: nameSize, fontWeight: 900, lineHeight: 1.1, marginTop: 6, textShadow: "0 4px 20px rgba(0,0,0,.6)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.name}</div>
          {w.houseName && <div className="fp-ml" style={{ fontSize: Math.round(nameSize * 0.5), fontWeight: 600, color: "rgba(255,255,255,.75)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.houseName}</div>}
          <div className="fp-ml" style={{ fontSize: Math.round(nameSize * 0.6), fontWeight: 800, color: "#FFDD1F" }}>{lineage(w)}</div>
        </div>
      ))}
    </div>
  );
}

function Standings({ tier, rows, logo, feastName }: { tier: Tier; rows: LeaderboardRow[]; logo: string; feastName: string }) {
  const top = rows.filter((r) => r.shakhaId !== UNASSIGNED_ID && r.points > 0).sort((a, b) => a.rank - b.rank).slice(0, 3);
  const byPlace = (place: 1 | 2 | 3) => top[place - 1];
  const title = TIER_TITLE[tier];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Sparkles count={28} />
      <Rays size={1300} x={W / 2} y={600} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "48px 72px 18px" }}>
        <Header
          logo={logo}
          kicker={feastName}
          title={title.en}
          right={<span className="fp-disp fp-ml" style={{ flex: "none", padding: "14px 34px", borderRadius: 22, fontSize: 46, background: "#E63A1E", color: "#FFDD1F", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>{title.ml} · Top 3</span>}
        />
        {top.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 800, color: "rgba(255,255,255,.6)" }}>No points yet</div>
        ) : (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.25fr 1fr", alignItems: "end", gap: 44, marginTop: 20 }}>
            {STAGE_ORDER.map((place) => {
              const r = byPlace(place);
              const delay = place === 3 ? 0.3 : place === 2 ? 0.9 : 1.5;
              return (
                <div key={place} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, animation: `pdIn 1s cubic-bezier(.2,.8,.2,1) ${delay}s both` }}>
                  {r ? (
                    <>
                      <MedalArt place={place} height={place === 1 ? 440 : 350} delay={delay + 0.2} />
                      <div className="fp-ml" style={{ fontSize: place === 1 ? 60 : 48, fontWeight: 900, lineHeight: 1.1, textShadow: "0 4px 20px rgba(0,0,0,.6)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.name}</div>
                      <div className="fp-num" style={{ fontSize: place === 1 ? 52 : 42, color: "#FFDD1F" }}>
                        {r.points}<span style={{ fontSize: "0.5em", marginLeft: 10, color: "rgba(255,243,176,.8)" }}>pts</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>—</div>
                  )}
                  <PodiumBlock place={place} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Confetti x={W / 2} y={300} delay={1.9} />
      <FlagBand />
    </div>
  );
}
