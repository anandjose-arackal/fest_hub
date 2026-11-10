"use client";

import { useState } from "react";
import type { OrgSettings } from "@/types";
import { POSTER_FONT_CLASS, useFitFontSize, withSuffix } from "./social-poster";

// 9:16 "story" share poster (1080x1920) for WhatsApp/Instagram status. Each
// piece is its own absolutely-positioned layer so the same layout can later
// be animated into a video reel. Art lives in public/poster/story/ (medal and
// ribbon per rank tier, bottom waves); until a file exists the layer falls
// back to the older share art or a plain CSS shape.
export const STORY_POSTER_WIDTH = 1080;
export const STORY_POSTER_HEIGHT = 1920;

type Tier = "gold" | "silver" | "bronze";

// Title lockup that matches the medal art in public/poster/story/ (the medal
// bar reads the same name). shortcut: tied to this art set; move to
// org_settings when another org gets its own story art.
const STORY_TITLE = "സർഗ്ഗപ്രഭ";
const STORY_TAGLINE = "മിഷൻ കലോത്സവം";

const NAVY = "#141A3C";
const RED = "#C3121F";
const MAROON = "#8A0E1A";
const GOLD = "#E2A91B";
const SERIF = "var(--font-poster-serif), var(--font-anek), serif";
const SANS = "var(--font-manrope), var(--font-anek), sans-serif";
const HEAVY = "var(--font-poster-anek), var(--font-anek), sans-serif";
const NAYANA = "Nayana, var(--font-anek), sans-serif";

const RANK_WORD: Record<1 | 2 | 3, string> = { 1: "FIRST", 2: "SECOND", 3: "THIRD" };
const RANK_TIER: Record<1 | 2 | 3, Tier> = { 1: "gold", 2: "silver", 3: "bronze" };
const GRADE_TIER: Record<"A" | "B" | "C", Tier> = { A: "gold", B: "silver", C: "bronze" };
const OLD_MEDAL: Record<Tier, string> = { gold: "/poster/share/g_medal.png", silver: "/poster/share/s_medal.png", bronze: "/poster/share/b_medal.png" };
const RIBBON_FILTER: Record<Tier, string> = { gold: "none", silver: "grayscale(1) brightness(1.08) contrast(1.05)", bronze: "sepia(0.4) saturate(1.1) hue-rotate(-18deg) brightness(0.82)" };
const RIBBON_FILL: Record<Tier, string> = {
  gold: "linear-gradient(180deg, #FFE27A, #F2B320 55%, #D99A12)",
  silver: "linear-gradient(180deg, #F4F5F7, #C9CDD3 55%, #A9AEB6)",
  bronze: "linear-gradient(180deg, #F3C49B, #CD8A52 55%, #A8683A)",
};

export interface StoryPosterProps {
  org: OrgSettings;
  rank: 1 | 2 | 3 | null;
  grade: "A" | "B" | "C" | null;
  winnerName: string;
  houseName: string | null;
  shakhaName: string;
  meghalaName: string | null;
  competitionName: string;
  categoryLabel: string;
  feastName: string;
  feastSubtitle: string | null;
  photoSrc: string | null;
}

// <img> that swaps to `fallback` (or hides) when the art file is missing.
// `videoLayer` marks layers the video draws itself (story-video.ts), so its
// content snapshot leaves them out.
function Art({ src, fallback, style, videoLayer }: { src: string; fallback?: string; style: React.CSSProperties; videoLayer?: boolean }) {
  const [current, setCurrent] = useState<string | null>(src);
  if (!current) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt=""
      crossOrigin="anonymous"
      onError={() => setCurrent(current === src && fallback ? fallback : null)}
      data-video-layer={videoLayer ? "" : undefined}
      style={{ position: "absolute", pointerEvents: "none", ...style }}
    />
  );
}

export function StoryPoster({ org, rank, grade, winnerName, houseName, shakhaName, meghalaName, competitionName, categoryLabel, photoSrc }: StoryPosterProps) {
  const tier: Tier = rank ? RANK_TIER[rank] : grade ? GRADE_TIER[grade] : "gold";
  const [ribbonArt, setRibbonArt] = useState(true);
  // With a medal the header sits in the right-hand column; grade-only
  // winners have no medal, so the header centres across the full width.
  const headerLeft = rank ? 360 : 60;
  const headerWidth = rank ? 680 : 960;

  const orgName = org.org_name_en || org.org_name_local || "";
  const titleSize = useFitFontSize(STORY_TITLE, headerWidth + 20, NAYANA, 700, 70, 240);
  const compSize = useFitFontSize(competitionName, 760, SERIF, 700, 34, 64);
  const nameSize = useFitFontSize(winnerName, 940, SERIF, 700, 52, 104);
  const houseSize = useFitFontSize(houseName ?? "", 620, SANS, 500, 32, 56);
  const resultSize = rank ? 92 : 88;

  return (
    <div className={POSTER_FONT_CLASS} style={{ width: STORY_POSTER_WIDTH, height: STORY_POSTER_HEIGHT, position: "relative", overflow: "hidden" }}>
      <div data-video-layer="" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 70% at 50% 35%, #FFFFFF 0%, #F6F4F1 100%)" }} />
      {/* Contour-line background art */}
      <Art videoLayer src="/poster/story/bg.webp" style={{ inset: 0, width: STORY_POSTER_WIDTH, height: STORY_POSTER_HEIGHT }} />

      {/* Bottom waves */}
      {/* multiply: the art may ship on white instead of transparent */}
      <Art src="/poster/story/bottom.png" style={{ left: 0, bottom: 0, width: STORY_POSTER_WIDTH, height: "auto", mixBlendMode: "multiply" }} />

      {/* Medal (ranked) */}
      {rank && <Art videoLayer src={`/poster/story/medal-${tier}.webp`} fallback={OLD_MEDAL[tier]} style={{ left: 18, top: -70, width: 320, height: "auto", filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.25))" }} />}

      {/* Org logo + name */}
      <div style={{ position: "absolute", top: 80, left: headerLeft, width: headerWidth, display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
        {org.logo_url && (
          // Own URL: the portal caches this logo from a non-CORS request, which a crossOrigin load can't reuse.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${org.logo_url}${org.logo_url.includes("?") ? "&" : "?"}poster`} alt="" crossOrigin="anonymous" style={{ height: 110, width: "auto", maxWidth: 200, objectFit: "contain" }} />
        )}
        {org.logo_url && orgName && <span style={{ width: 3, height: 100, background: NAVY }} />}
        {orgName && (
          <span style={{ maxWidth: 380, display: "flex", flexDirection: "column", fontFamily: SANS, fontWeight: 800, fontSize: 38, lineHeight: 1.08, color: NAVY, textTransform: "uppercase" }}>
            <span>{orgName}</span>
            {org.area_name_en && <span>{org.area_name_en}</span>}
          </span>
        )}
      </div>

      {/* Feast title block */}
      <div style={{ position: "absolute", top: 222, left: headerLeft, width: headerWidth, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", whiteSpace: "nowrap" }}>
        <span style={{ marginTop: 10, fontFamily: NAYANA, fontWeight: 700, fontSize: titleSize, lineHeight: 1, backgroundImage: `linear-gradient(180deg, ${RED}, ${MAROON})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{STORY_TITLE}</span>
        <span style={{ marginTop: -28, fontFamily: "var(--font-anek), sans-serif", fontWeight: 700, fontSize: 56, lineHeight: 1.1, color: "#1D4ED8" }}>{STORY_TAGLINE}</span>
      </div>

      {/* Photo card */}
      <div style={{ position: "absolute", left: 180, top: 545, width: 720, height: 690, borderRadius: 52, border: `6px solid ${GOLD}`, overflow: "hidden", background: "#E9EAEE", boxShadow: "0 18px 40px rgba(20,26,60,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt={winnerName} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        ) : (
          <svg width="42%" height="42%" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.2" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        )}
      </div>

      {/* Result ribbon */}
      <div style={{ position: "absolute", left: 30, top: 1190, width: 1020, height: 208 }}>
        {ribbonArt ? (
          // One gold ribbon art; silver/bronze are CSS-tinted from it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/poster/story/ribbon-gold.png" alt="" crossOrigin="anonymous" onError={() => setRibbonArt(false)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: RIBBON_FILTER[tier] }} />
        ) : (
          <div style={{ position: "absolute", left: 90, right: 90, top: 10, bottom: 70, borderRadius: 18, background: RIBBON_FILL[tier], boxShadow: "0 10px 22px rgba(120,80,0,0.25)" }} />
        )}
        {/* Text sits on the ribbon's front band (top ~60% of the art). */}
        <div style={{ position: "absolute", left: 130, right: 130, top: 6, bottom: 78, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, whiteSpace: "nowrap", color: MAROON, fontFamily: HEAVY, fontWeight: 800, fontStretch: "85%", textShadow: "0 1px 0 rgba(255,255,255,0.45)" }}>
          {rank && <span style={{ fontSize: resultSize, lineHeight: 1 }}>{RANK_WORD[rank]}</span>}
          {rank && grade && <span style={{ fontSize: 46, lineHeight: 1 }}>with</span>}
          {grade && <span style={{ fontSize: rank ? 72 : resultSize, lineHeight: 1 }}>{grade} GRADE</span>}
        </div>
      </div>

      {/* Competition + category pill */}
      <div style={{ position: "absolute", left: 0, top: 1392, width: STORY_POSTER_WIDTH, display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 900, padding: "10px 56px 12px", borderRadius: 28, background: `linear-gradient(180deg, #D2202C, ${MAROON})`, display: "flex", flexDirection: "column", alignItems: "center", color: "#FFFFFF", whiteSpace: "nowrap", boxShadow: "0 8px 18px rgba(138,14,26,0.25)" }}>
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: compSize, lineHeight: 1.2 }}>{competitionName}</span>
          {categoryLabel && <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30, letterSpacing: 1, lineHeight: 1.25, opacity: 0.92 }}>{categoryLabel}</span>}
        </div>
      </div>

      {/* Name + house name */}
      <div style={{ position: "absolute", left: 40, top: 1530, width: 1000, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: nameSize, lineHeight: 1.1, color: NAVY }}>{winnerName}</span>
        {houseName && (
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 26 }}>
            <span style={{ width: 150, height: 4, background: GOLD }} />
            <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: houseSize, lineHeight: 1.15, color: NAVY, whiteSpace: "nowrap" }}>{houseName}</span>
            <span style={{ width: 150, height: 4, background: GOLD }} />
          </div>
        )}
      </div>

      {/* Shakha | Meghala chip */}
      <div style={{ position: "absolute", left: 0, top: 1735, width: STORY_POSTER_WIDTH, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34, padding: "18px 48px", borderRadius: 60, background: "rgba(253,240,222,0.95)", fontFamily: SANS, fontWeight: 800, fontSize: 40, lineHeight: 1.1, color: NAVY, whiteSpace: "nowrap" }}>
          <span>{withSuffix(shakhaName, "Shakha")}</span>
          {meghalaName && <span style={{ width: 3, height: 64, background: GOLD }} />}
          {meghalaName && <span>{meghalaName}</span>}
        </div>
      </div>
    </div>
  );
}
