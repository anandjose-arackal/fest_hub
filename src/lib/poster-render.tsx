"use client";

import { forwardRef, useEffect, useState } from "react";
import type { OrgSettings } from "@/types";

// 9:16 result-announcement poster (1080×1920, the export resolution — the
// on-screen preview scales this same node down via CSS transform rather than
// re-rendering at a smaller size, so html-to-image always captures full res).
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1920;

export type PosterTheme = "maroon" | "blue" | "purple" | "pink";

export const POSTER_THEMES: { id: PosterTheme; label: string }[] = [
  { id: "maroon", label: "Classic (Maroon)" },
  { id: "blue", label: "Navy" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
];

interface DecorLayer {
  src: string;
  style: React.CSSProperties;
}

interface ThemeStyle {
  headingColor: string;
  bannerBorder: string;
  bannerBg: string;
  bannerShadow: string;
  categoryText: string;
  cardBorder: string;
  cardShadow: string;
  footerColor: string;
  medal: Record<1 | 2 | 3, string>;
  ribbon: Record<1 | 2 | 3, string>;
  decor: DecorLayer[];
}

// "Congratulations" gold banner — shared across every theme, layered above
// each theme's own bottom graphic.
const CONGRATULATION_DECOR: DecorLayer = {
  src: "/poster/congratulation.png",
  style: { bottom: -20, left: "50%", transform: "translateX(-50%)", width: 940, zIndex: 5 },
};

// Pre-cut decorative pieces sliced from each reference poster design, served
// from /public/poster/ (see AGENTS.md's asset convention — these are static
// brand art, not admin-configurable data, unlike org.* below).
const THEME_STYLE: Record<PosterTheme, ThemeStyle> = {
  maroon: {
    headingColor: "#7A1220",
    bannerBorder: "#D4AF37",
    bannerBg: "#FFF9EC",
    bannerShadow: "rgba(212,175,55,0.25)",
    categoryText: "#7A1220",
    cardBorder: "#EBD9AE",
    cardShadow: "rgba(139,21,56,0.08)",
    footerColor: "#8B6A3F",
    medal: { 1: "/poster/meroon/medal_gold.png", 2: "/poster/meroon/medal_silver.png", 3: "/poster/meroon/medal_bronze.png" },
    ribbon: { 1: "/poster/meroon/place_bg.png", 2: "/poster/meroon/place_bg.png", 3: "/poster/meroon/place_bg.png" },
    decor: [
      { src: "/poster/meroon/top_left.png", style: { top: 0, left: 0, width: 260 } },
      { src: "/poster/meroon/bottom_right.png", style: { bottom: 130, right: 0, width: 220 } },
      { src: "/poster/meroon/bottom.png", style: { bottom: 0, left: 0, width: "100%", height: "auto" } },
      CONGRATULATION_DECOR,
    ],
  },
  blue: {
    headingColor: "#12345C",
    bannerBorder: "#C9A227",
    bannerBg: "#F5F7FA",
    bannerShadow: "rgba(201,162,39,0.25)",
    categoryText: "#12345C",
    cardBorder: "#D8E0EC",
    cardShadow: "rgba(18,52,92,0.08)",
    footerColor: "#3E5A82",
    medal: { 1: "/poster/blue/gold_medal.png", 2: "/poster/blue/silver_medal.png", 3: "/poster/blue/bronze_medal.png" },
    ribbon: { 1: "/poster/blue/gold_bg.png", 2: "/poster/blue/silver_bg.png", 3: "/poster/blue/bronze_bg.png" },
    decor: [
      { src: "/poster/blue/top_left_grphics.png", style: { top: 0, left: 0, width: 320 } },
      { src: "/poster/blue/top_right2.png", style: { top: 0, right: 0, width: 150 } },
      { src: "/poster/blue/top_right1.png", style: { top: 90, right: 30, width: 100 } },
      { src: "/poster/blue/bottom_graphics.png", style: { bottom: 0, left: 0, width: "100%", height: "auto" } },
      CONGRATULATION_DECOR,
    ],
  },
  purple: {
    headingColor: "#4C1D6E",
    bannerBorder: "#C9A227",
    bannerBg: "#FBF8FD",
    bannerShadow: "rgba(76,29,110,0.2)",
    categoryText: "#4C1D6E",
    cardBorder: "#E4D3C0",
    cardShadow: "rgba(76,29,110,0.1)",
    footerColor: "#6B4E8E",
    medal: { 1: "/poster/purple/gol_medal.png", 2: "/poster/purple/silver_medal.png", 3: "/poster/purple/bronze_medal.png" },
    ribbon: { 1: "/poster/purple/name_bg.png", 2: "/poster/purple/name_bg.png", 3: "/poster/purple/name_bg.png" },
    decor: [
      { src: "/poster/purple/top_left_gf.png", style: { top: 0, left: 0, width: 320 } },
      { src: "/poster/purple/top_left_flower.png", style: { top: 0, left: 0, width: 220 } },
      { src: "/poster/purple/top_right_flower.png", style: { top: 0, right: 0, width: 140 } },
      { src: "/poster/purple/bottom_graphics.png", style: { bottom: 0, left: 0, width: "100%", height: "auto" } },
      CONGRATULATION_DECOR,
    ],
  },
  pink: {
    headingColor: "#9C0F45",
    bannerBorder: "#D4AF37",
    bannerBg: "#FFF5F8",
    bannerShadow: "rgba(156,15,69,0.2)",
    categoryText: "#9C0F45",
    cardBorder: "#F0D3DE",
    cardShadow: "rgba(156,15,69,0.1)",
    footerColor: "#B85C7E",
    medal: { 1: "/poster/pink/golden_medal.png", 2: "/poster/pink/silver_medal.png", 3: "/poster/pink/bronze_medal.png" },
    ribbon: { 1: "/poster/pink/place_bg.png", 2: "/poster/pink/place_bg.png", 3: "/poster/pink/place_bg.png" },
    decor: [
      { src: "/poster/pink/top_top_left.png", style: { top: 0, left: 0, width: 300 } },
      { src: "/poster/pink/top_right.png", style: { top: 0, right: 0, width: 160 } },
      { src: "/poster/pink/bottom_right.png", style: { bottom: 130, right: 0, width: 220 } },
      { src: "/poster/pink/bottom_panel.png", style: { bottom: 0, left: 0, width: "100%", height: "auto" } },
      CONGRATULATION_DECOR,
    ],
  },
};

export interface PosterWinner {
  place: 1 | 2 | 3;
  name: string;
  houseName: string;
  shakhaName: string;
}

export interface PosterData {
  org: OrgSettings;
  feastName: string;
  competitionName: string;
  categoryLabel: string;
  winners: PosterWinner[];
  theme: PosterTheme;
}

const PLACE_LABEL: Record<1 | 2 | 3, string> = {
  1: "FIRST PRIZE",
  2: "SECOND PRIZE",
  3: "THIRD PRIZE",
};

// Scales the feast-name heading so it always spans ~maxWidth regardless of
// how long the feast's name is. Measures a detached, off-screen probe node
// (not the live heading via ref+two-pass state) — coupling the measurement
// to the rendered element required setting state to a probe size, waiting
// for React to commit + paint, THEN measuring, which raced against
// React 19/Fast Refresh's effect timing and could settle on the unfitted
// probe value. A standalone node sidesteps that: it's measured synchronously
// via getBoundingClientRect (forces layout) and never touches component
// state until the one real answer is known. Canvas measureText was tried
// first but Malayalam conjunct/virama shaping renders narrower there than
// in real DOM text layout, so it isn't reliable for this font.
function useFitFontSize(text: string, maxWidth: number, family: string, weight: number, min: number, max: number): number {
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
      probe.style.fontSize = "100px";
      document.body.appendChild(probe);
      const measured = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);
      if (cancelled || measured <= 0) return;
      setSize(Math.max(min, Math.min(max, (maxWidth / measured) * 100)));
    }

    const fontsReady = typeof document !== "undefined" && "fonts" in document ? document.fonts.load(`${weight} 100px ${family}`) : Promise.resolve();
    fontsReady.then(measure, measure);

    return () => {
      cancelled = true;
    };
  }, [text, maxWidth, family, weight, min, max]);
  return size;
}

export const ResultPoster = forwardRef<HTMLDivElement, { data: PosterData }>(function ResultPoster({ data }, ref) {
  const { org, feastName, competitionName, categoryLabel, winners, theme } = data;
  const t = THEME_STYLE[theme];
  const byPlace = (p: 1 | 2 | 3) => winners.find((w) => w.place === p);
  // Fill the poster edge-to-edge minus a 10px gutter on each side.
  const headingFontSize = useFitFontSize(feastName, POSTER_WIDTH - 20, "Nayana", 700, 30, 400);

  return (
    <div
      ref={ref}
      style={{
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        position: "relative",
        background: "#FFFFFF",
        fontFamily: "var(--font-anek), sans-serif",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable @next/next/no-img-element */}
      {t.decor.map((layer, i) => (
        <img key={i} src={layer.src} alt="" crossOrigin="anonymous" style={{ position: "absolute", zIndex: 0, ...layer.style }} />
      ))}

      <div style={{ position: "relative", zIndex: 2, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box" }}>
        {/* Header — org identity, never hardcoded */}
        <div style={{ marginTop: 10, paddingTop: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 168,
              height: 168,
              borderRadius: "50%",
              background: "#fff",
              border: `6px solid ${t.bannerBorder}`,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {org.logo_url && <img src={org.logo_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          {org.org_name_local && (
            <p style={{ marginTop: 12, fontSize: 60, fontWeight: 800, color: "#8B1538", textAlign: "center", lineHeight: 1.15, fontFamily: "var(--font-poppins), sans-serif" }}>
              {org.org_name_local}
            </p>
          )}
          {org.area_name_local && (
            <p style={{ marginTop: 2, fontSize: 52, fontWeight: 600, color: "#8B1538", fontFamily: "var(--font-inter), sans-serif" }}>{org.area_name_local}</p>
          )}
        </div>

        {/* Feast name — big heading, Nayana (public/font/) rather than the
            app-wide Anek/Baloo, per the reference design's display type.
            Sized to span the poster edge-to-edge (10px gutter) rather than
            the 64px side padding the rest of the content uses below.
            Nayana's line box reserves a lot of dead space both above AND
            below the visible glyph ink (measured via canvas pixel scan —
            its ascent/descent metrics run far taller than this script's
            actual cap-height), which at this heading's large auto-fit font
            size showed up as a big visual gap both above it (under the
            area-name line) and below it (before the competition name/
            winners section), despite the explicit margins being small.
            Pulling the <p> up/in on both sides by a fraction of the
            (auto-fit, so size varies per feast name) font size compensates
            for that proportionally instead of hardcoding one offset. */}
        <p style={{ marginTop: -headingFontSize * 0.26, marginBottom: -headingFontSize * 0.3, width: "100%", textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: headingFontSize,
              fontWeight: 700,
              lineHeight: 1.08,
              color: t.headingColor,
              whiteSpace: "nowrap",
              fontFamily: "Nayana, var(--font-anek), sans-serif",
            }}
          >
            {feastName}
          </span>
        </p>
        <div style={{ marginTop: 0, width: "78%", height: 2, background: `linear-gradient(90deg,transparent,${t.bannerBorder},transparent)` }} />

        <div style={{ width: "100%", flex: 1, minHeight: 0, padding: "0 64px 56px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Competition name + category — one line, both Anek bold, no background box */}
        <p
          style={{
            marginTop: 0,
            maxWidth: "94%",
            textAlign: "center",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-anek), sans-serif",
            fontWeight: 800,
          }}
        >
          <span style={{ fontSize: 66, color: t.headingColor, textTransform: "uppercase" }}>{competitionName}</span>
          {categoryLabel && (
            <>
              <span style={{ fontSize: 44, color: t.categoryText }}> · </span>
              <span style={{ fontSize: 44, color: t.categoryText, textTransform: "uppercase" }}>{categoryLabel}</span>
            </>
          )}
        </p>

        {/* Winners */}
        <div style={{ marginTop: 12, width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
          {([1, 2, 3] as const).map((place) => {
            const w = byPlace(place);
            return (
              <div key={place} style={{ display: "flex", alignItems: "stretch", gap: 18 }}>
                <div style={{ position: "relative", flexShrink: 0, display: "flex" }}>
                  <img src={t.medal[place]} alt="" crossOrigin="anonymous" style={{ height: "100%", width: "auto" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ position: "relative", width: "100%", height: 66 }}>
                    <img src={t.ribbon[place]} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />
                    <p
                      style={{
                        position: "relative",
                        zIndex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 33,
                        fontWeight: 800,
                        color: "#fff",
                        fontFamily: "var(--font-poppins), sans-serif",
                      }}
                    >
                      {PLACE_LABEL[place]}
                    </p>
                  </div>
                  <div
                    style={{
                      marginTop: -6,
                      padding: "14px 22px 16px",
                      borderRadius: 16,
                      border: `2px solid ${t.cardBorder}`,
                      background: "#FFFEFB",
                      boxShadow: `0 6px 18px ${t.cardShadow}`,
                    }}
                  >
                    <p style={{ fontSize: 57, fontWeight: 800, color: "#2B1710", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w?.name ?? "—"}</p>
                    {w?.houseName && (
                      <p style={{ marginTop: 2, fontSize: 40, fontWeight: 600, color: t.headingColor, fontFamily: "var(--font-anek), sans-serif" }}>{w.houseName}</p>
                    )}
                    {w?.shakhaName && (
                      <p style={{ marginTop: 2, fontSize: 48, fontWeight: 600, color: t.footerColor, fontFamily: "var(--font-anek), sans-serif" }}>{w.shakhaName}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        </div>
      </div>
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
});
