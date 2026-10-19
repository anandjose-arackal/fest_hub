"use client";

import { useEffect, useState } from "react";
import { Anek_Malayalam, Libre_Baskerville } from "next/font/google";
import { Feather } from "lucide-react";
import type { OrgSettings } from "@/types";

// Public "share your result" poster — one winner + their own uploaded photo,
// downloaded from the results page (see social-poster-overlay.tsx). Built
// from the cut art in public/poster/share/, stacked bottom to top:
// bg_main.webp (wall + divider + rope), bg.webp (saint, torn paper, ribbons,
// place brush-strokes), frame.webp (polaroid), the photo clipped into the
// polaroid's hole, then the medal. Everything is authored on the art's own
// 1024x1536 grid and scaled up to the exported size.
const ART_W = 1024;
const ART_H = 1536;
export const SOCIAL_POSTER_WIDTH = 1080;
export const SOCIAL_POSTER_HEIGHT = (SOCIAL_POSTER_WIDTH / ART_W) * ART_H; // 1620

// Narrow, heavy Malayalam for the org name (needs the wdth axis, which the
// root layout's static --font-anek instance doesn't carry), and a book serif
// for the Latin lines on the card.
const anekCondensed = Anek_Malayalam({ subsets: ["malayalam", "latin"], axes: ["wdth"], variable: "--font-poster-anek", display: "swap" });
const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-poster-serif", display: "swap" });

const ANEK_CONDENSED = "var(--font-poster-anek), var(--font-anek), sans-serif";
const SERIF = "var(--font-poster-serif), var(--font-anek), serif";
const NAYANA = "Nayana, var(--font-anek), sans-serif";
const MAROON = "#7A1220";
const GOLD = "#B3832C";
const INK = "#2B211B";

// The heading reads as a diocese-level contest: "രൂപത" + the fest name.
const HEADING_PREFIX = "രൂപത";

const RANK_LABEL: Record<1 | 2 | 3, string> = { 1: "First", 2: "Second", 3: "Third" };
const RANK_MEDAL: Record<1 | 2 | 3, string> = { 1: "/poster/share/g_medal.png", 2: "/poster/share/s_medal.png", 3: "/poster/share/b_medal.png" };

// frame.webp is placed at its native size; the photo hole's corners were
// measured in its pixels (edge lines fitted to the dark hole, then
// intersected) and pushed out 3px so no black seam survives.
const FRAME = { left: 229, top: 390, width: 710, height: 1095 };
const HOLE = [[185, 98], [707, 167], [629, 884], [85, 808]] as const;
const HOLE_CENTER = { x: 401.5, y: 489 };
// The polaroid is tilted ~7.8° clockwise; the photo is drawn at that angle
// with a little spare all round so the clip, not the photo's edge, makes the
// hole's outline.
const FRAME_TILT_DEG = 7.8;
export const PHOTO_W = 556;
// bg.webp's place/grade brush strokes (x 720-1004, y 958-1142)
const BRUSH_CLIP = "inset(958px 20px 394px 720px)";
export const PHOTO_H = 730;

export interface SocialPosterProps {
  org: OrgSettings;
  rank: 1 | 2 | 3;
  grade: "A" | "B" | "C" | null;
  winnerName: string;
  shakhaName: string;
  meghalaName: string | null;
  competitionName: string;
  categoryLabel: string;
  feastName: string;
  feastSubtitle: string | null;
  photoSrc: string | null;
}

// Same "measure a detached off-screen node" approach as the admin result
// poster's heading fit (see poster-render.tsx) — kept as a separate local
// copy rather than a shared import since the two posters are free to diverge.
function useFitFontSize(text: string, maxWidth: number, family: string, weight: number, min: number, max: number, stretch = "normal"): number {
  const [size, setSize] = useState(max);
  useEffect(() => {
    let cancelled = false;
    if (!text) return;

    function measure() {
      const probe = document.createElement("span");
      probe.textContent = text;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "nowrap";
      probe.style.left = "-9999px";
      probe.style.top = "0";
      probe.style.fontFamily = family;
      probe.style.fontWeight = String(weight);
      probe.style.fontStretch = stretch;
      probe.style.fontSize = "100px";
      // var(--font-poster-*) only resolves under the poster root's font classes.
      probe.className = `${anekCondensed.variable} ${serif.variable}`;
      document.body.appendChild(probe);
      const measured = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);
      if (cancelled || measured <= 0) return;
      setSize(Math.max(min, Math.min(max, (maxWidth / measured) * 100)));
    }

    const fontsReady = typeof document !== "undefined" && "fonts" in document ? document.fonts.ready : Promise.resolve();
    fontsReady.then(measure, measure);

    return () => {
      cancelled = true;
    };
  }, [text, maxWidth, family, weight, min, max, stretch]);
  return size;
}

// "Charity" → "Charity Shakha", unless the name already says it.
function withSuffix(name: string, suffix: string): string {
  return name.toLowerCase().includes(suffix.toLowerCase()) ? name : `${name} ${suffix}`;
}

// Two-line org header: the first half of the words, then the rest.
function splitOrgName(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name.trim(), ""];
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };

export function SocialPoster({ org, rank, grade, winnerName, shakhaName, meghalaName, competitionName, categoryLabel, feastName, feastSubtitle, photoSrc }: SocialPosterProps) {
  const [orgLine1, orgLine2] = splitOrgName(org.org_name_local || org.org_name_en || "");
  const org1Size = useFitFontSize(orgLine1, 430, ANEK_CONDENSED, 800, 36, 72, "75%");
  const org2Size = useFitFontSize(orgLine2, 430, ANEK_CONDENSED, 800, 36, 72, "75%");
  const heading = `${HEADING_PREFIX} ${feastName}`;
  const feastSize = useFitFontSize(heading, 1000, NAYANA, 700, 78, 185);
  const categoryText = categoryLabel.replace(/\s*·\s*/g, " ");
  const categorySize = useFitFontSize(categoryText, 300, SERIF, 700, 26, 44);
  const compSize = useFitFontSize(competitionName, 300, SERIF, 700, 30, 86);
  // A long name stops shrinking at 36px and wraps onto a second line instead.
  const nameSize = useFitFontSize(winnerName, 500, SERIF, 700, 36, 50);
  const holeClip = `polygon(${HOLE.map(([x, y]) => `${x}px ${y}px`).join(", ")})`;

  return (
    <div className={`${anekCondensed.variable} ${serif.variable}`} style={{ width: SOCIAL_POSTER_WIDTH, height: SOCIAL_POSTER_HEIGHT, position: "relative", overflow: "hidden", background: "#F4EEE2" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: ART_W, height: ART_H, transform: `scale(${SOCIAL_POSTER_WIDTH / ART_W})`, transformOrigin: "top left" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/poster/share/bg_main.webp" alt="" crossOrigin="anonymous" style={fill} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/poster/share/bg.webp" alt="" crossOrigin="anonymous" style={fill} />

        {/* Org header, beside the saint baked into bg.webp */}
        <div style={{ position: "absolute", top: 68, left: 345, width: 470, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", fontFamily: ANEK_CONDENSED, fontWeight: 800, fontStretch: "75%", lineHeight: 0.98, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: org1Size, color: MAROON }}>{orgLine1}</span>
          {orgLine2 && <span style={{ fontSize: org2Size, color: GOLD, textShadow: "0 1px 0 rgba(90,60,10,.25)" }}>{orgLine2}</span>}
          {org.org_name_en && (
            <span style={{ marginTop: 4, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 600, fontStretch: "normal", lineHeight: 1.2, fontSize: 19, letterSpacing: 3.5, color: INK }}>{org.org_name_en.toUpperCase()}</span>
          )}
        </div>

        {/* Feast heading under bg_main's divider */}
        <div style={{ position: "absolute", top: 250, left: 0, width: ART_W, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: NAYANA, fontWeight: 700, fontSize: feastSize, lineHeight: 1.1, color: MAROON }}>{heading}</span>
        </div>

        {/* Category + competition on the torn paper */}
        <div style={{ position: "absolute", top: 470, left: 30, width: 320, height: 290, transform: "rotate(-6deg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: SERIF, fontWeight: 700, color: MAROON, whiteSpace: "nowrap" }}>
          <Feather size={58} color="#A8773A" strokeWidth={1.6} aria-hidden="true" style={{ marginBottom: 2 }} />
          {categoryText && <span style={{ fontSize: categorySize, fontWeight: 700, lineHeight: 1.15, WebkitTextStroke: "1px currentColor" }}>{categoryText}</span>}
          <span style={{ fontSize: compSize, lineHeight: 1.1 }}>{competitionName}</span>
        </div>

        {/* Polaroid, its photo, and the name block on its bottom margin */}
        <div style={{ position: "absolute", ...FRAME }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/poster/share/frame.webp" alt="" crossOrigin="anonymous" style={fill} />
          <div style={{ position: "absolute", inset: 0, clipPath: holeClip, WebkitClipPath: holeClip }}>
            <div style={{ position: "absolute", left: HOLE_CENTER.x - PHOTO_W / 2, top: HOLE_CENTER.y - PHOTO_H / 2, width: PHOTO_W, height: PHOTO_H, transform: `rotate(${FRAME_TILT_DEG}deg)`, background: "#EFE6D2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoSrc} alt={winnerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.2" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                </svg>
              )}
            </div>
          </div>

          <div style={{ position: "absolute", left: 344 - 270, top: 948 - 85, width: 540, height: 170, transform: `rotate(${FRAME_TILT_DEG - 2}deg)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: SERIF, fontWeight: 700, whiteSpace: "nowrap" }}>
            <span style={{ maxWidth: 520, whiteSpace: "normal", fontSize: nameSize, lineHeight: 1.1, color: MAROON }}>{winnerName}</span>
            <div style={{ margin: "8px 0 6px", display: "flex", alignItems: "center", gap: 6, width: 380 }}>
              <span style={{ flex: 1, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
              <span style={{ width: 11, height: 11, transform: "rotate(45deg)", background: GOLD }} />
              <span style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
            </div>
            <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: INK }}>{withSuffix(shakhaName, "Shakha")}</span>
            {meghalaName && <span style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.25, color: INK }}>{withSuffix(meghalaName, "Meghala")}</span>}
          </div>
        </div>

        {/* Medal hanging off bg_main's rope */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={RANK_MEDAL[rank]} alt="" crossOrigin="anonymous" style={{ position: "absolute", left: 768, top: 365, width: 250, height: 250 * (596 / 256), pointerEvents: "none" }} />

        {/* Place + grade on bg.webp's maroon and gold brush strokes. Those
            strokes sit under the polaroid in bg.webp, so that strip of
            bg.webp is drawn again on top of it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/poster/share/bg.webp" alt="" crossOrigin="anonymous" style={{ ...fill, clipPath: BRUSH_CLIP, WebkitClipPath: BRUSH_CLIP }} />
        <div style={{ position: "absolute", left: 730, top: 966, width: 268, height: 84, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-1.5deg)", fontFamily: SERIF, fontWeight: 700, fontSize: 50, color: "#FFFFFF", textShadow: "0 2px 4px rgba(0,0,0,.25)" }}>
          {RANK_LABEL[rank]}
        </div>
        {grade && (
          <div style={{ position: "absolute", left: 736, top: 1046, width: 260, height: 82, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-1.5deg)", fontFamily: SERIF, fontWeight: 700, fontSize: 38, color: "#2A1A10" }}>
            {grade} Grade
          </div>
        )}
      </div>
    </div>
  );
}
