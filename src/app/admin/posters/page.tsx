"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Area, Point } from "react-easy-crop";
import { Camera, Download, ImageDown, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPublishedResults } from "@/actions/results";
import { getPublishedTeamResults } from "@/actions/team-results";
import { formatCompetitionOptionLabel, genderDisplayWord } from "@/lib/competition-categories";
import { loadOrgSettingsCached as getOrgSettings } from "@/hooks/use-feast";
import { feastPosterHeading } from "@/lib/feast-data";
import { positionLabel } from "@/lib/result-calculator";
import { ResultPoster, POSTER_WIDTH, POSTER_HEIGHT, POSTER_THEMES, posterGroupLabel, type PosterData, type PosterTheme, type PosterWinner } from "@/lib/poster-render";
import { PhotoCropper } from "@/components/feast/social-poster/photo-cropper";
import { getCroppedImageDataUrl } from "@/components/feast/social-poster/crop-image";
import { toPng } from "html-to-image";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, OrgSettings } from "@/types";

type FCRow = FeastCompetition & { competition: Competition & { competition_category?: CompetitionCategory | null } };

// One poster winner plus the published-result row it came from (the photo
// key — tied winners share a place, never a result id).
interface WinnerRow extends PosterWinner {
  resultId: string;
}

const PLACE_EMOJI: Record<1 | 2 | 3, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function one<T>(x: T | T[] | null | undefined): T | null {
  return (Array.isArray(x) ? x[0] : x) ?? null;
}

// Result-announcement poster for one published item, with optional winner
// photos. Photos are cropped in the browser to a data: URL (a blob: URL
// wouldn't survive html-to-image's cache-busting query string) and live only
// in this page's state — nothing is uploaded, and leaving the page drops them.
function PostersInner() {
  const searchParams = useSearchParams();
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState(searchParams.get("feast") ?? "");
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [compId, setCompId] = useState(searchParams.get("fc") ?? "");
  // Winners of whichever item was loaded last — anything for another compId
  // is stale, so the page reads it as "still loading" rather than resetting
  // state inside the effect.
  const [loaded, setLoaded] = useState<{ compId: string; rows: WinnerRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<PosterTheme>("maroon");
  const [downloading, setDownloading] = useState(false);
  const [posterScale, setPosterScale] = useState(0.3);
  const posterRef = useRef<HTMLDivElement>(null);
  const posterWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop dialog — which winner the picked photo is for, and the cropper state.
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<{ resultId: string; src: string } | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    getOrgSettings().then(setOrg);
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      const rows = data ?? [];
      setFeasts(rows);
      setFeastId((cur) => (cur && rows.some((f) => f.id === cur) ? cur : rows[0]?.id ?? ""));
    });
  }, []);

  // Only published items — the poster announces results, never drafts.
  useEffect(() => {
    if (!feastId) return;
    supabase
      .from("feast_competitions")
      .select("*, competition:competitions(*, competition_category:competition_categories(*))")
      .eq("feast_id", feastId)
      .eq("result_status", "published")
      .order("display_order")
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as FCRow[];
        setFeastComps(rows);
        setCompId((cur) => (cur && rows.some((c) => c.id === cur) ? cur : rows[0]?.id ?? ""));
      });
  }, [feastId]);

  const selectedFc = feastComps.find((c) => c.id === compId);
  const isGroup = selectedFc?.competition.type === "group";
  const hierarchyLevel = org?.hierarchy_level;

  useEffect(() => {
    if (!compId || !selectedFc) return;
    let cancelled = false;
    (async () => {
      let rows: WinnerRow[] = [];
      try {
        if (isGroup) {
          const data = await getPublishedTeamResults(compId);
          rows = data.flatMap((r) => {
            if (r.position == null || r.position < 1 || r.position > 3) return [];
            const team = one(r.team_registration);
            const shakha = one(team?.shakha);
            const meghala = one(shakha?.meghala);
            return [{ resultId: r.id, place: r.position as 1 | 2 | 3, name: team?.team_name ?? "—", houseName: "", shakhaName: posterGroupLabel(hierarchyLevel, shakha?.name ?? "—", meghala?.name) }];
          });
        } else {
          const data = await getPublishedResults(compId);
          rows = data.flatMap((r) => {
            if (r.position == null || r.position < 1 || r.position > 3) return [];
            const reg = one(r.participant_registration);
            const p = one(reg?.participant);
            const shakha = one(p?.shakha);
            const meghala = one(shakha?.meghala);
            return [{ resultId: r.id, place: r.position as 1 | 2 | 3, name: p?.name ?? "—", houseName: p?.house_name ?? "", shakhaName: posterGroupLabel(hierarchyLevel, shakha?.name ?? "—", meghala?.name) }];
          });
        }
        rows.sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? `Couldn't load results: ${err.message}` : "Couldn't load results.");
      }
      if (!cancelled) setLoaded({ compId, rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [compId, selectedFc, isGroup, hierarchyLevel]);

  const loading = !!selectedFc && loaded?.compId !== compId;
  const winners = useMemo(() => (selectedFc && loaded?.compId === compId ? loaded.rows : []), [selectedFc, loaded, compId]);

  const posterData: PosterData | null = useMemo(() => {
    if (!org || !selectedFc || winners.length === 0) return null;
    const feast = feasts.find((f) => f.id === feastId);
    const categoryName = selectedFc.competition.competition_category?.name;
    return {
      org,
      feastName: feast ? feastPosterHeading(feast) : "",
      competitionName: selectedFc.competition.name,
      categoryLabel: [categoryName, genderDisplayWord(selectedFc.competition.gender, categoryName, true)].filter(Boolean).join(" · "),
      winners: winners.map((w) => ({ ...w, photoUrl: photos[w.resultId] ?? null })),
      theme,
    };
  }, [org, selectedFc, winners, feasts, feastId, photos, theme]);

  // Scales the fixed-size (1080×1920) poster node down to fit its column via
  // CSS transform rather than re-rendering it smaller, so html-to-image
  // always captures the same full-resolution node the preview is showing.
  const hasPoster = posterData != null;
  useEffect(() => {
    const el = posterWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setPosterScale(w / POSTER_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPoster]);

  function pickPhoto(resultId: string) {
    setPickingFor(resultId);
    fileInputRef.current?.click();
  }

  function onFileChosen(file: File | undefined) {
    if (!file || !pickingFor) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCropArea(null);
    setCropTarget({ resultId: pickingFor, src: URL.createObjectURL(file) });
    setPickingFor(null);
  }

  function closeCrop() {
    if (cropTarget) URL.revokeObjectURL(cropTarget.src);
    setCropTarget(null);
  }

  async function confirmCrop() {
    if (!cropTarget || !cropArea) return;
    setCropping(true);
    try {
      const dataUrl = await getCroppedImageDataUrl(cropTarget.src, cropArea, rotation);
      setPhotos((prev) => ({ ...prev, [cropTarget.resultId]: dataUrl }));
      closeCrop();
    } catch {
      setError("Couldn't process that photo. Try a different one.");
    } finally {
      setCropping(false);
    }
  }

  function removePhoto(resultId: string) {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[resultId];
      return next;
    });
  }

  async function downloadPoster() {
    if (!posterRef.current || !posterData) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(posterRef.current, { cacheBust: true, width: POSTER_WIDTH, height: POSTER_HEIGHT });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${posterData.competitionName.replace(/\s+/g, "_")}_result.png`;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? `Couldn't generate the image: ${err.message}` : "Couldn't generate the image.");
    } finally {
      setDownloading(false);
    }
  }

  const photoCount = winners.filter((w) => photos[w.resultId]).length;

  const photoSlot = (w: WinnerRow) => {
    const src = photos[w.resultId];
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => pickPhoto(w.resultId)}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 hover:border-[#8B1538] hover:text-[#8B1538]"
          aria-label={src ? `Change photo for ${w.name}` : `Add photo for ${w.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5" />}
        </button>
        <div className="flex flex-col items-start gap-0.5">
          <button type="button" onClick={() => pickPhoto(w.resultId)} className="text-xs font-semibold text-[#8B1538] hover:underline">
            {src ? "Change photo" : "Add photo"}
          </button>
          {src && (
            <button type="button" onClick={() => removePhoto(w.resultId)} className="flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-red-600">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#8B1538] to-[#B8264F] text-white">
          <ImageDown className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Result Poster</h1>
          <p className="text-xs text-neutral-500">Photos are optional and stay on this device — they&apos;re never uploaded.</p>
        </div>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-full sm:max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select className="input w-full sm:max-w-xs" value={compId} onChange={(e) => setCompId(e.target.value)}>
          {feastComps.length === 0 && <option value="">No published results in this fest yet</option>}
          {feastComps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition.type === "group" ? "👥 " : ""}
              {formatCompetitionOptionLabel(c.competition.name, c.competition.gender, c.competition.competition_category?.name)}
            </option>
          ))}
        </select>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFileChosen(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading winners…
        </div>
      ) : !selectedFc ? (
        <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500">
          Publish an item&apos;s results on the Results page to make its poster.
        </p>
      ) : winners.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500">
          No 1st/2nd/3rd place winners in this item&apos;s published results.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] lg:items-start">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-neutral-700">Winners</h2>
              <span className="text-xs text-neutral-500">{photoCount} of {winners.length} with a photo</span>
            </div>

            {/* Desktop */}
            <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white sm:block">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5">Place</th>
                    <th className="px-4 py-2.5">Winner</th>
                    <th className="px-4 py-2.5">Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((w) => (
                    <tr key={w.resultId} className="border-t border-neutral-100">
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-neutral-700">
                        {PLACE_EMOJI[w.place]} {positionLabel(w.place)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-neutral-800">{w.name}</p>
                        <p className="text-xs text-neutral-500">{[w.houseName, w.shakhaName].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-4 py-3">{photoSlot(w)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="space-y-2 sm:hidden">
              {winners.map((w) => (
                <div key={w.resultId} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <p className="text-xs font-bold text-neutral-600">{PLACE_EMOJI[w.place]} {positionLabel(w.place)}</p>
                  <p className="mt-0.5 font-semibold text-neutral-800">{w.name}</p>
                  <p className="mb-2 text-xs text-neutral-500">{[w.houseName, w.shakhaName].filter(Boolean).join(" · ")}</p>
                  {photoSlot(w)}
                </div>
              ))}
            </div>
          </div>

          {posterData && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 lg:sticky lg:top-4">
              <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                {POSTER_THEMES.map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setTheme(th.id)}
                    className={`rounded-lg border-2 px-2 py-1.5 text-xs font-bold ${theme === th.id ? "border-[#8B1538] bg-[#8B1538]/10 text-[#8B1538]" : "border-neutral-200 text-neutral-500"}`}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
              <div
                ref={posterWrapRef}
                className="mx-auto max-w-sm"
                style={{ width: "100%", aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}`, overflow: "hidden", borderRadius: 16, border: "1px solid #eee", background: "#f4f4f5" }}
              >
                <div style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT, transform: `scale(${posterScale})`, transformOrigin: "top left" }}>
                  <ResultPoster ref={posterRef} data={posterData} />
                </div>
              </div>
              <button
                onClick={downloadPoster}
                disabled={downloading}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#8B1538,#B8264F)" }}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Generating…" : "Download Image"}
              </button>
            </div>
          )}
        </div>
      )}

      {cropTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeCrop}>
          {/* PhotoCropper is the Feast Portal's cropper — it reads the
              portal's --fp-* colour tokens, which only exist under a
              data-fp-theme scope. */}
          <div data-fp-theme="violet" className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h2 className="text-base font-bold">
                Photo for {winners.find((w) => w.resultId === cropTarget.resultId)?.name ?? "winner"}
              </h2>
              <button onClick={closeCrop} aria-label="Close"><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PhotoCropper
                image={cropTarget.src}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={setCropArea}
              />
            </div>
            <div className="mt-4 flex shrink-0 gap-2">
              <button onClick={closeCrop} className="flex-1 rounded-xl border-2 border-neutral-200 py-2 text-sm font-semibold">Cancel</button>
              <button
                onClick={confirmCrop}
                disabled={cropping || !cropArea}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#8B1538,#B8264F)" }}
              >
                {cropping && <Loader2 className="h-4 w-4 animate-spin" />} Use photo
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; background: #fff; }
      `}</style>
    </div>
  );
}

export default function PostersPage() {
  return (
    <Suspense>
      <PostersInner />
    </Suspense>
  );
}
