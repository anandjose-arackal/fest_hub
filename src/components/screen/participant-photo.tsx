"use client";

import { Medal, type MedalPos } from "@/components/feast/feast-ui";

// A winner's registration photo (participants.photo_url) in a frame of its
// place's metal — the Feast Hub design system's ParticipantPhoto. "portrait"
// leads the /screen spotlight and the publish takeover (556×730 crop, the
// place's Medal on the corner); "round" sits beside the Medal in result
// rows. No photo → the caller shows the Medal alone; never a placeholder
// face on the big screen.
const RING: Record<MedalPos, string> = {
  1: "#F5C542",
  2: "#B7BDC8",
  3: "#A77A4D",
};

export function ParticipantPhoto({
  src,
  place,
  name,
  width,
  variant = "portrait",
  className,
}: {
  src: string;
  place: MedalPos;
  name: string;
  width: number;
  variant?: "portrait" | "round";
  className?: string;
}) {
  const round = variant === "round";
  const height = round ? width : Math.round((width * 730) / 556);
  const ring = RING[place];
  return (
    <span className={className} style={{ position: "relative", display: "inline-block", flex: "none", width, height }}>
      <span
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
          borderRadius: round ? 9999 : 24,
          border: `${round ? 3 : 6}px solid ${ring}`,
          background: "var(--fp-surface-3)",
          boxShadow: round
            ? undefined
            : place === 1
              ? "0 0 0 2px rgba(255,255,255,.35), 0 0 60px var(--fp-glow)"
              : "0 0 0 2px rgba(255,255,255,.35), 0 18px 44px rgba(0,0,0,.22)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Photo of ${name}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
      {!round && (
        <span style={{ position: "absolute", right: -Math.round(width * 0.12), bottom: -Math.round(width * 0.08) }}>
          <Medal pos={place} size={Math.round(width * 0.34)} />
        </span>
      )}
    </span>
  );
}
