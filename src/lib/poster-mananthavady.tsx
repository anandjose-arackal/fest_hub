"use client";

import { Anek_Malayalam, Manjari } from "next/font/google";
import type { OrgSettings } from "@/types";
import { useFitFontSize, type PosterWinner } from "@/lib/poster-render";

// Mananthavady Diocese's Bible Kalolsavam result poster (4:5, 1080×1350).
// Built from the cut art in public/poster/mananthavady/, stacked bottom to
// top: bg.webp (yellow/red split), the three winner photos clipped into
// frame.webp's slots, frame.webp (neon triple frame), heading.webp (the
// diocese + fest title, "2026" included). The heading is baked art, so this
// layout is only offered to the Mananthavady org — see
// isMananthavadyOrg().
export const MANANTHAVADY_POSTER_WIDTH = 1080;
export const MANANTHAVADY_POSTER_HEIGHT = 1350;

export function isMananthavadyOrg(org: Pick<OrgSettings, "area_name_en"> | null | undefined): boolean {
  return org?.area_name_en?.trim().toLowerCase() === "mananthavady";
}

const manjari = Manjari({ subsets: ["malayalam", "latin"], weight: ["700"], display: "swap" });
const anekCondensed = Anek_Malayalam({ subsets: ["malayalam", "latin"], axes: ["wdth"], display: "swap" });

const MANJARI = manjari.style.fontFamily;
const CONDENSED = anekCondensed.style.fontFamily;
const BLUE = "#0A35A8";
const DIVIDER = "#0B58F5";
const GOLD = "#C9A227";

// "Cherupushpa Mission League", the line above the heading art.
const ORG_LINE = "ചെറുപുഷ്പ മിഷൻ ലീഗ്";

// frame.webp is 1528×902, drawn at FRAME's size. Each slot's interior was
// traced from the art (dark pixels enclosed by a frame line, pushed 5px out
// under the line so no seam shows) as a % polygon of the frame box; BOX is
// that polygon's bounding box, which the photo covers before the clip.
const FRAME = { left: 135, top: 655, width: 810, height: 478 };
const SLOT_CLIP: Record<1 | 2 | 3, string> = {
  2:
  "polygon(24.61% 12.08%, 18% 13.41%, 10.08% 14.75%, 7.59% 16.08%, 6.48% 17.41%, 5.69% 18.74%, 5.24% 20.07%, 4.65% 21.4%, 4.45% 22.73%, 4.19% 24.06%, 3.99% 25.39%, 3.99% 26.72%, 4.45% 28.05%, 5.24% 29.38%, 5.56% 30.71%, 5.56% 32.04%, 4.97% 33.37%, 4.45% 34.7%, 4.25% 36.03%, 4.38% 37.36%, 4.45% 38.69%, 4.45% 40.02%, 4.52% 41.35%, 4.58% 42.68%, 4.58% 44.01%, 4.71% 45.34%, 4.78% 46.67%, 4.91% 48%, 4.97% 49.33%, 5.1% 50.67%, 5.17% 52%, 5.3% 53.33%, 5.43% 54.66%, 5.5% 55.99%, 5.56% 57.32%, 5.56% 58.65%, 5.63% 59.98%, 5.69% 61.31%, 5.69% 62.64%, 5.76% 63.97%, 5.89% 65.3%, 6.02% 66.63%, 6.15% 67.96%, 6.22% 69.29%, 6.35% 70.62%, 6.48% 71.95%, 6.54% 73.28%, 6.61% 74.61%, 6.61% 75.94%, 6.68% 77.27%, 6.74% 78.6%, 6.81% 79.93%, 6.87% 81.26%, 7% 82.59%, 7.13% 83.92%, 7.26% 85.25%, 7.46% 86.59%, 7.66% 87.92%, 7.92% 89.25%, 8.51% 90.58%, 9.1% 91.91%, 10.08% 93.24%, 11.91% 94.57%, 13.22% 95.01%, 14.99% 95.01%, 17.8% 94.57%, 26.96% 93.24%, 31.81% 91.91%, 32.66% 90.58%, 32.66% 89.25%, 32.4% 87.92%, 32.13% 86.59%, 31.94% 85.25%, 31.81% 83.92%, 31.68% 82.59%, 31.61% 81.26%, 31.61% 79.93%, 31.61% 78.6%, 31.68% 77.27%, 31.68% 75.94%, 31.68% 74.61%, 31.68% 73.28%, 31.68% 71.95%, 31.68% 70.62%, 31.68% 69.29%, 31.68% 67.96%, 31.68% 66.63%, 31.68% 65.3%, 31.68% 63.97%, 31.68% 62.64%, 31.68% 61.31%, 31.68% 59.98%, 31.68% 58.65%, 31.68% 57.32%, 31.68% 55.99%, 31.68% 54.66%, 31.68% 53.33%, 31.68% 52%, 31.74% 50.67%, 31.74% 49.33%, 31.68% 48%, 31.68% 46.67%, 31.68% 45.34%, 31.68% 44.01%, 31.68% 42.68%, 31.68% 41.35%, 31.68% 40.02%, 31.68% 38.69%, 31.68% 37.36%, 31.68% 36.03%, 31.68% 34.7%, 31.68% 33.37%, 31.61% 32.04%, 31.68% 30.71%, 31.68% 29.38%, 31.54% 28.05%, 30.69% 26.72%, 30.37% 25.39%, 30.37% 24.06%, 30.76% 22.73%, 31.41% 21.4%, 31.61% 20.07%, 31.74% 18.74%, 31.74% 17.41%, 31.61% 16.08%, 30.96% 14.75%, 29.38% 13.41%, 26.18% 12.08%)",
  1:
  "polygon(43.85% 4.77%, 38.09% 6.1%, 36.65% 7.43%, 35.73% 8.76%, 35.08% 10.09%, 34.62% 11.42%, 34.03% 12.75%, 33.9% 14.08%, 33.77% 15.41%, 33.64% 16.74%, 33.64% 18.07%, 33.57% 19.4%, 33.57% 20.73%, 34.1% 22.06%, 34.75% 23.39%, 34.95% 24.72%, 34.82% 26.05%, 34.1% 27.38%, 33.57% 28.71%, 33.57% 30.04%, 33.57% 31.37%, 33.64% 32.71%, 33.64% 34.04%, 33.64% 35.37%, 33.64% 36.7%, 33.64% 38.03%, 33.57% 39.36%, 33.57% 40.69%, 33.57% 42.02%, 33.57% 43.35%, 33.57% 44.68%, 33.57% 46.01%, 33.64% 47.34%, 33.64% 48.67%, 33.64% 50%, 33.57% 51.33%, 33.57% 52.66%, 33.64% 53.99%, 33.57% 55.32%, 33.57% 56.65%, 33.57% 57.98%, 33.57% 59.31%, 33.64% 60.64%, 33.64% 61.97%, 33.57% 63.3%, 33.57% 64.63%, 33.57% 65.96%, 33.64% 67.29%, 33.64% 68.63%, 33.64% 69.96%, 33.64% 71.29%, 33.64% 72.62%, 33.7% 73.95%, 33.7% 75.28%, 33.7% 76.61%, 33.64% 77.94%, 33.64% 79.27%, 33.64% 80.6%, 33.64% 81.93%, 33.64% 83.26%, 33.7% 84.59%, 33.9% 85.92%, 34.03% 87.25%, 34.49% 88.58%, 34.95% 89.91%, 35.8% 91.24%, 36.58% 92.57%, 37.89% 93.9%, 52.09% 95.01%, 53.14% 95.01%, 62.04% 93.9%, 63.15% 92.57%, 63.94% 91.24%, 64.79% 89.91%, 65.25% 88.58%, 65.58% 87.25%, 65.84% 85.92%, 65.97% 84.59%, 65.97% 83.26%, 66.03% 81.93%, 66.03% 80.6%, 66.03% 79.27%, 66.03% 77.94%, 66.03% 76.61%, 66.03% 75.28%, 66.03% 73.95%, 66.03% 72.62%, 66.03% 71.29%, 66.03% 69.96%, 66.03% 68.63%, 66.03% 67.29%, 66.03% 65.96%, 66.03% 64.63%, 66.03% 63.3%, 66.03% 61.97%, 66.03% 60.64%, 66.03% 59.31%, 66.03% 57.98%, 66.03% 56.65%, 66.03% 55.32%, 66.03% 53.99%, 66.03% 52.66%, 66.03% 51.33%, 66.03% 50%, 66.03% 48.67%, 66.03% 47.34%, 66.03% 46.01%, 66.03% 44.68%, 66.03% 43.35%, 66.03% 42.02%, 66.03% 40.69%, 66.03% 39.36%, 66.03% 38.03%, 66.03% 36.7%, 66.03% 35.37%, 66.03% 34.04%, 66.03% 32.71%, 66.03% 31.37%, 66.03% 30.04%, 66.03% 28.71%, 66.03% 27.38%, 66.03% 26.05%, 66.03% 24.72%, 66.03% 23.39%, 66.03% 22.06%, 66.1% 20.73%, 66.1% 19.4%, 66.03% 18.07%, 66.03% 16.74%, 65.97% 15.41%, 65.84% 14.08%, 65.64% 12.75%, 65.12% 11.42%, 64.73% 10.09%, 64.07% 8.76%, 63.09% 7.43%, 61.78% 6.1%, 52.88% 4.77%)",
  3:
  "polygon(72.64% 11.97%, 70.48% 13.3%, 68.72% 14.63%, 68.13% 15.96%, 68% 17.29%, 68% 18.63%, 68.06% 19.96%, 68.06% 21.29%, 68.06% 22.62%, 68% 23.95%, 68% 25.28%, 68% 26.61%, 68% 27.94%, 68% 29.27%, 68% 30.6%, 68% 31.93%, 67.93% 33.26%, 67.93% 34.59%, 68% 35.92%, 68% 37.25%, 68% 38.58%, 68% 39.91%, 68% 41.24%, 68% 42.57%, 68% 43.9%, 68% 45.23%, 68% 46.56%, 68% 47.89%, 68% 49.22%, 68% 50.55%, 68.06% 51.88%, 68% 53.22%, 68% 54.55%, 68% 55.88%, 68% 57.21%, 68.06% 58.54%, 68% 59.87%, 68% 61.2%, 68% 62.53%, 68% 63.86%, 68% 65.19%, 68% 66.52%, 68% 67.85%, 68% 69.18%, 68% 70.51%, 68% 71.84%, 68% 73.17%, 68% 74.5%, 68% 75.83%, 68% 77.16%, 68.06% 78.49%, 68.06% 79.82%, 68.06% 81.15%, 68% 82.48%, 67.93% 83.81%, 67.74% 85.14%, 67.54% 86.47%, 67.34% 87.8%, 67.15% 89.14%, 67.15% 90.47%, 68.13% 91.8%, 73.43% 93.13%, 81.87% 94.46%, 84.95% 94.9%, 86.71% 94.9%, 87.96% 94.46%, 89.86% 93.13%, 90.84% 91.8%, 91.62% 90.47%, 92.02% 89.14%, 92.28% 87.8%, 92.67% 86.47%, 92.8% 85.14%, 92.87% 83.81%, 93% 82.48%, 93% 81.15%, 93.06% 79.82%, 93.13% 78.49%, 93.19% 77.16%, 93.26% 75.83%, 93.32% 74.5%, 93.46% 73.17%, 93.52% 71.84%, 93.59% 70.51%, 93.72% 69.18%, 93.85% 67.85%, 93.91% 66.52%, 94.04% 65.19%, 94.11% 63.86%, 94.18% 62.53%, 94.24% 61.2%, 94.24% 59.87%, 94.31% 58.54%, 94.37% 57.21%, 94.5% 55.88%, 94.63% 54.55%, 94.7% 53.22%, 94.76% 51.88%, 94.96% 50.55%, 95.03% 49.22%, 95.09% 47.89%, 95.16% 46.56%, 95.16% 45.23%, 95.22% 43.9%, 95.29% 42.57%, 95.42% 41.24%, 95.48% 39.91%, 95.48% 38.58%, 95.68% 37.25%, 95.75% 35.92%, 95.48% 34.59%, 94.9% 33.26%, 94.37% 31.93%, 94.31% 30.6%, 94.76% 29.27%, 95.68% 27.94%, 96.01% 26.61%, 96.01% 25.28%, 95.88% 23.95%, 95.62% 22.62%, 95.29% 21.29%, 94.9% 19.96%, 94.24% 18.63%, 93.59% 17.29%, 92.47% 15.96%, 90.05% 14.63%, 81.15% 13.3%, 75.39% 11.97%)",
};
const SLOT_BOX: Record<1 | 2 | 3, { left: number; top: number; width: number; height: number }> = {
  2: { left: 3.99, top: 12.08, width: 28.67, height: 82.93 },
  1: { left: 33.57, top: 4.77, width: 32.53, height: 90.24 },
  3: { left: 67.15, top: 11.97, width: 28.86, height: 82.93 },
};
// Place word near each slot's foot, tilted with the side frames.
const LABEL: Record<1 | 2 | 3, { text: string; x: number; size: number; rotate: number }> = {
  2: { text: "SECOND", x: 18.33, size: 46, rotate: -2 },
  1: { text: "FIRST", x: 49.8, size: 70, rotate: 0 },
  3: { text: "THIRD", x: 81.56, size: 46, rotate: 2 },
};
const LABEL_Y = 85.9;

// White name band under the frames: second | first | third, split by blue
// rules at the same x the reference design uses.
const BAND = { top: 1118, height: 157 };
const COLUMNS: { place: 1 | 2 | 3; left: number; right: number }[] = [
  { place: 2, left: 16, right: 330 },
  { place: 1, left: 330, right: 750 },
  { place: 3, left: 750, right: 1064 },
];

export interface MananthavadyPosterProps {
  org: OrgSettings;
  competitionName: string;
  categoryLabel: string;
  winners: PosterWinner[];
}

export function MananthavadyPoster({ org, competitionName, categoryLabel, winners }: MananthavadyPosterProps) {
  const byPlace = (p: 1 | 2 | 3) => winners.filter((w) => w.place === p);
  const compText = categoryLabel ? `${competitionName} : ${categoryLabel}` : competitionName;
  const compSize = useFitFontSize(compText, 980, MANJARI, 700, 26, 52);
  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

  return (
    <div style={{ width: MANANTHAVADY_POSTER_WIDTH, height: MANANTHAVADY_POSTER_HEIGHT, position: "relative", overflow: "hidden", background: "#F7E83A", boxSizing: "border-box" }}>
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/poster/mananthavady/bg.webp" alt="" crossOrigin="anonymous" style={fill} />

      {/* Org logo + "Cherupushpa Mission League" */}
      <div style={{ position: "absolute", top: 28, left: 0, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 182, height: 182, borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {org.logo_url && <img src={org.logo_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
        </div>
        <p style={{ marginTop: 6, fontFamily: MANJARI, fontWeight: 700, fontSize: 38, lineHeight: 1.2, color: BLUE, whiteSpace: "nowrap" }}>{ORG_LINE}</p>
      </div>

      {/* Diocese + fest heading art, with gold rules either side of its "2026" */}
      <img src="/poster/mananthavady/heading.webp" alt="" crossOrigin="anonymous" style={{ position: "absolute", top: 270, left: (MANANTHAVADY_POSTER_WIDTH - 706) / 2, width: 706, height: "auto" }} />
      <div style={{ position: "absolute", top: 538, left: 270, width: 185, height: 3, background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
      <div style={{ position: "absolute", top: 538, left: 625, width: 185, height: 3, background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />

      {/* Competition : category */}
      <p style={{ position: "absolute", top: 580, left: 0, width: "100%", height: 66, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MANJARI, fontWeight: 700, fontSize: compSize, color: BLUE, whiteSpace: "nowrap" }}>
        {compText}
      </p>

      {/* Name band — under the frames, which overlap its top edge */}
      <div style={{ position: "absolute", left: 0, top: BAND.top, width: "100%", height: BAND.height, background: "#FFFFFF", boxShadow: "0 -4px 14px rgba(0,0,0,0.12)" }}>
        {COLUMNS.slice(1).map((c) => (
          <div key={c.left} style={{ position: "absolute", left: c.left - 2, top: 32, width: 4, height: 105, background: DIVIDER }} />
        ))}
        {COLUMNS.map((c) => {
          const ws = byPlace(c.place);
          const fit = ws.length > 1 ? Math.max(0.55, 1.6 / ws.length) : 1;
          return (
            <div key={c.place} style={{ position: "absolute", left: c.left + 10, top: 22, width: c.right - c.left - 20, height: BAND.height - 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 * fit, textAlign: "center", fontFamily: CONDENSED, fontWeight: 700, fontStretch: "75%", color: BLUE, textTransform: "uppercase", lineHeight: 1.12 }}>
              {ws.length === 0 && <span style={{ fontSize: 36 }}>—</span>}
              {ws.map((w, i) => (
                <div key={i} style={{ maxWidth: "100%" }}>
                  <p style={{ fontSize: 36 * fit, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</p>
                  {w.shakhaName && <p style={{ fontSize: 34 * fit, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.shakhaName}</p>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Photos clipped into the frame slots, then the frame and place words */}
      <div style={{ position: "absolute", ...FRAME }}>
        {([2, 1, 3] as const).map((place) => {
          const box = SLOT_BOX[place];
          // Tied winners share one slot — the first of them with a photo fills it.
          const photo = byPlace(place).find((w) => w.photoUrl)?.photoUrl;
          return (
            <div key={place} style={{ ...fill, clipPath: SLOT_CLIP[place], WebkitClipPath: SLOT_CLIP[place] }}>
              <div style={{ position: "absolute", left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, background: "radial-gradient(circle at 50% 35%, #8A3A2A 0%, #4A1610 70%, #2E0C08 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {photo ? (
                  <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                ) : (
                  <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
        <img src="/poster/mananthavady/frame.webp" alt="" crossOrigin="anonymous" style={fill} />
        {([2, 1, 3] as const).map((place) => {
          const l = LABEL[place];
          return (
            <p
              key={place}
              style={{
                position: "absolute",
                left: `${l.x}%`,
                top: `${LABEL_Y}%`,
                transform: `translate(-50%, -50%) rotate(${l.rotate}deg)`,
                fontFamily: CONDENSED,
                fontWeight: 800,
                fontStretch: "75%",
                fontSize: l.size,
                lineHeight: 1,
                color: "#FFFFFF",
                whiteSpace: "nowrap",
                textShadow: "0 2px 0 #3A3A3A, 0 4px 0 #222, 0 8px 14px rgba(0,0,0,0.65)",
              }}
            >
              {l.text}
            </p>
          );
        })}
      </div>
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
