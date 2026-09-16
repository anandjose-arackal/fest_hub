"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResultPoster, type PosterData } from "@/lib/poster-render";

// Render-only endpoint for the bulk poster-export script (scripts/generate-posters.mjs).
// Takes the *complete* PosterData as a base64url-encoded `data` query param and
// renders exactly that — it never talks to Supabase itself, so unlike every
// other /admin page it needs no auth: there is no org/competition/result data
// here for an unauthenticated visitor to read, only whatever the caller already
// handed it. The script drives a headless browser to this page and screenshots
// the #poster-capture node directly (not html-to-image — Playwright can
// capture the live DOM node at full resolution without a canvas round-trip).
// atob/TextDecoder (not Buffer, which is Node-only and undefined in the
// browser bundle) so decoding behaves identically during SSR and on the
// client — a Buffer ReferenceError client-side previously made this silently
// fail there while it worked server-side, producing a permanent hydration
// mismatch that never resolved to the real poster.
function decodePosterData(raw: string | null): PosterData | null {
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.winners)) return null;
    return parsed as PosterData;
  } catch {
    return null;
  }
}

function PosterRenderInner() {
  const params = useSearchParams();
  const data = decodePosterData(params.get("data"));

  if (!data) {
    return <p style={{ padding: 24, fontFamily: "monospace" }}>Missing or invalid `data` query param.</p>;
  }

  return (
    <div id="poster-capture" style={{ display: "inline-block" }}>
      <ResultPoster data={data} />
    </div>
  );
}

export default function PosterRenderPage() {
  return (
    <Suspense>
      <PosterRenderInner />
    </Suspense>
  );
}
