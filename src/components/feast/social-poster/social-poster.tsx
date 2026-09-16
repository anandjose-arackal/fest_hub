"use client";

import { useEffect, useState } from "react";
import type { OrgSettings } from "@/types";

// Public "share your result" poster — one winner + their own uploaded photo,
// downloaded from the results page (see social-poster-overlay.tsx). Uses the
// real cut art in public/poster/winner/ (red-gold border + a per-rank laurel
// wreath frame with the photo hole baked in); only the header/name/footer
// regions are still flat CSS pending matching art for those.
export const SOCIAL_POSTER_WIDTH = 1080;
export const SOCIAL_POSTER_HEIGHT = 1920;

const RANK_LABEL: Record<1 | 2 | 3, string> = { 1: "FIRST PRIZE", 2: "SECOND PRIZE", 3: "THIRD PRIZE" };
const RANK_COLOR: Record<1 | 2 | 3, string> = { 1: "#C9A227", 2: "#9CA3AF", 3: "#B5651D" };
// Each rank's wreath-frame PNG has a different native aspect ratio (the
// source crops weren't uniform), so the photo hole's position/size is tuned
// per rank rather than assumed identical.
// holeTop/Left/W/H measured by ray-casting outward from the hole's center in
// each PNG's raw pixels to find the ring's inner edge (the earlier bounding-box
// scan over transparent/white pixels leaked into the gaps between laurel
// leaves and inflated the width, and didn't correct for the crown/medal
// dipping into the hole at top/bottom — producing a box whose width:height
// ratio didn't match frameWidth:frameHeight, so border-radius:50% rendered an
// ellipse instead of a circle, letting the photo spill past the ring on the
// sides while leaving gaps above/below). These values are a true circle (in
// rendered, aspect-corrected pixels) sized to the ring's inner edge, +2px so
// the ring's own stroke covers the seam. The photo sits BEHIND the frame
// (frame painted on top), so any part of a photo that would otherwise overlap
// the ring/ribbon art is simply covered by it — trimming the photo there is
// fine.
// frameWidth is tuned per rank rather than shared: ranks 2 and 3 use taller
// (more square) frame art than rank 1 (941x856 and 1128x1075 vs 780x557), so
// at a common width their rendered frameHeight ran long enough to push the
// competition name/category text down into the bottom ribbon border baked
// into bg_border.png — visually hidden behind it. Shrinking just those two
// frames reclaims the room without touching rank 1, which already fit.
const RANK_FRAME: Record<1 | 2 | 3, { src: string; aspect: number; frameWidth: number; holeTop: number; holeLeft: number; holeW: number; holeH: number }> = {
  1: { src: "/poster/winner/first_placeholder.png", aspect: 780 / 557, frameWidth: 760, holeTop: 0.1975, holeLeft: 0.2846, holeW: 0.4308, holeH: 0.6032 },
  2: { src: "/poster/winner/second_place_hldr.png", aspect: 941 / 856, frameWidth: 640, holeTop: 0.2079, holeLeft: 0.2338, holeW: 0.5313, holeH: 0.5841 },
  3: { src: "/poster/winner/third_place_hldr.png", aspect: 1128 / 1075, frameWidth: 615, holeTop: 0.2167, holeLeft: 0.2305, holeW: 0.539, holeH: 0.5656 },
};

export interface SocialPosterProps {
  org: OrgSettings;
  rank: 1 | 2 | 3;
  winnerName: string;
  houseName: string | null;
  shakhaName: string;
  competitionName: string;
  categoryLabel: string;
  feastName: string;
  photoSrc: string | null;
}

// Same "measure a detached off-screen node" approach as the admin result
// poster's heading fit (see poster-render.tsx) — kept as a separate local
// copy rather than a shared import since the two posters are free to diverge
// once this one gets its real art.
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

export function SocialPoster({ org, rank, winnerName, houseName, shakhaName, competitionName, categoryLabel, feastName, photoSrc }: SocialPosterProps) {
  // Fill the poster edge-to-edge minus a 10px gutter, same as the admin
  // result poster's feast-name heading.
  const titleSize = useFitFontSize(feastName, SOCIAL_POSTER_WIDTH - 20, "Nayana", 700, 40, 400);
  const rankColor = RANK_COLOR[rank];
  const frame = RANK_FRAME[rank];
  const frameWidth = frame.frameWidth;
  const frameHeight = frameWidth / frame.aspect;

  return (
    <div
      style={{
        width: SOCIAL_POSTER_WIDTH,
        height: SOCIAL_POSTER_HEIGHT,
        position: "relative",
        background: "#FFFFFF",
        fontFamily: "var(--font-anek), sans-serif",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/poster/winner/bg_border.png" alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      {/* Org header */}
      <div style={{ position: "relative", marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "#fff",
            border: "5px solid #D4AF37",
            boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {org.logo_url && <img src={org.logo_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </div>
        {org.org_name_local && (
          <p style={{ marginTop: 16, fontSize: 60, fontWeight: 800, color: "#8B1538", textAlign: "center", fontFamily: "var(--font-poppins), sans-serif" }}>{org.org_name_local}</p>
        )}
        {org.area_name_local && <p style={{ marginTop: 2, fontSize: 52, fontWeight: 600, color: "#8B1538" }}>{org.area_name_local}</p>}
      </div>

      {/* Feast name */}
      <p style={{ marginTop: 18, width: "100%", textAlign: "center" }}>
        <span style={{ display: "inline-block", fontSize: titleSize, fontWeight: 700, lineHeight: 1.1, color: "#7A1220", whiteSpace: "nowrap", fontFamily: "Nayana, var(--font-anek), sans-serif" }}>
          {feastName}
        </span>
      </p>
      <div style={{ marginTop: 8, width: "60%", height: 2, background: "linear-gradient(90deg,transparent,#D4AF37,transparent)" }} />

      {/* Winner name */}
      <p style={{ marginTop: -22, maxWidth: "88%", textAlign: "center", fontSize: 84, fontWeight: 800, lineHeight: 1.15, color: "#7A1220", fontFamily: "var(--font-anek), sans-serif" }}>{winnerName}</p>

      {/* House + Shakha */}
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16 }}>
        {houseName && (
          <span style={{ borderRadius: 999, padding: "12px 28px", background: "#FFF3D6", fontSize: 52, fontWeight: 700, color: "#8B6A3F" }}>{houseName}</span>
        )}
        <span style={{ borderRadius: 999, padding: "12px 28px", background: "#FFF3D6", fontSize: 52, fontWeight: 700, color: "#8B6A3F" }}>{shakhaName}</span>
      </div>

      {/* Laurel-wreath rank frame with the photo hole baked in. The photo
          sits BEHIND the frame (frame painted on top, in DOM after), at the
          hole's full measured size — the ring/crown/ribbon art naturally
          covers whatever part of a photo would otherwise overlap them, so
          the photo gets trimmed at those edges rather than the circle being
          shrunk to avoid it. */}
      <div style={{ position: "relative", marginTop: 10, width: frameWidth, height: frameHeight }}>
        <div
          style={{
            position: "absolute",
            top: frameHeight * frame.holeTop,
            left: frameWidth * frame.holeLeft,
            width: frameWidth * frame.holeW,
            height: frameHeight * frame.holeH,
            borderRadius: "50%",
            overflow: "hidden",
            background: "#FFF9EC",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt={winnerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg width="35%" height="35%" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
            </svg>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.src} alt="" crossOrigin="anonymous" style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "none" }} />
      </div>

      <p style={{ marginTop: 0, fontSize: 51, fontWeight: 800, letterSpacing: 2, color: rankColor, fontFamily: "var(--font-poppins), sans-serif" }}>{RANK_LABEL[rank]}</p>

      {/* Competition + category */}
      <div style={{ marginTop: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", maxWidth: "88%" }}>
        <p style={{ fontSize: 66, fontWeight: 800, color: "#7A1220", fontFamily: "var(--font-anek), sans-serif" }}>{competitionName}</p>
        <p style={{ fontSize: 52, fontWeight: 700, letterSpacing: 1, color: "#8B6A3F" }}>{categoryLabel.toUpperCase()}</p>
      </div>

      {/* Footer */}
      {org.tagline && (
        <div style={{ marginTop: "auto", marginBottom: 0, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 40, height: 2, background: "#D4AF37" }} />
          <p style={{ fontSize: 20, fontWeight: 600, color: "#8B6A3F", letterSpacing: 1 }}>{org.tagline}</p>
          <span style={{ width: 40, height: 2, background: "#D4AF37" }} />
        </div>
      )}
    </div>
  );
}
