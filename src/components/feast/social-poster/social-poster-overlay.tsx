"use client";

import { useCallback, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Upload, X, Download, Film } from "lucide-react";
import { GlowBtn } from "../feast-shared";
import { WhatsAppIcon } from "../whatsapp-icon";
import { useOrgSettings } from "@/hooks/use-feast";
import { SocialPoster, SOCIAL_POSTER_WIDTH, SOCIAL_POSTER_HEIGHT } from "./social-poster";
import { StoryPoster, STORY_POSTER_WIDTH, STORY_POSTER_HEIGHT } from "./story-poster";
import { PhotoCropper } from "./photo-cropper";
import { useSocialPosterGenerator } from "./use-social-poster-generator";
import { ScaledPosterPreview } from "./scaled-poster-preview";
import { recordStoryVideo, videoMimeType } from "./story-video";
import { posterFilename, downloadDataUrl } from "./export-poster";

export interface SocialPosterWinner {
  // null = graded without a 1st–3rd place (story poster only).
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
  // Registration photo, prefilled into the poster when present.
  photoUrl: string | null;
}

const STORY_SIZE = { width: STORY_POSTER_WIDTH, height: STORY_POSTER_HEIGHT };
const CLASSIC_SIZE = { width: SOCIAL_POSTER_WIDTH, height: SOCIAL_POSTER_HEIGHT };

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PLACE_WORD: Record<1 | 2 | 3, string> = { 1: "First", 2: "Second", 3: "Third" };

// The message that travels with the poster image: who, what, where, and a
// link back to the results.
function shareText(w: SocialPosterWinner): string {
  const where = [w.shakhaName, w.meghalaName].filter(Boolean).join(", ");
  const lines = [
    w.rank ? `🏆 ${w.winnerName} won ${PLACE_WORD[w.rank]} place${w.grade ? ` with Grade ${w.grade}` : ""}` : `🏆 ${w.winnerName} won Grade ${w.grade}`,
    `${w.competitionName}${w.categoryLabel ? ` (${w.categoryLabel})` : ""}`,
    where,
    w.feastName,
    typeof window !== "undefined" ? `Results: ${window.location.origin}/results` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function SocialPosterOverlay({ winner, onClose }: { winner: SocialPosterWinner; onClose: () => void }) {
  const [format, setFormat] = useState<"story" | "classic">("story");
  const story = format === "story" || winner.rank === null;
  const size = story ? STORY_SIZE : CLASSIC_SIZE;
  const gen = useSocialPosterGenerator(winner.competitionName, winner.winnerName, size, winner.photoUrl);
  const [dragActive, setDragActive] = useState(false);
  const org = useOrgSettings();

  // Animated story video (story-video.ts). The still poster stays rendered
  // (hidden) underneath, since the video is built from a snapshot of it.
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const canRecord = story && typeof window !== "undefined" && videoMimeType() !== null;

  async function makeVideo() {
    if (!gen.posterRef.current) return;
    setVideoError(null);
    setVideoProgress(0);
    try {
      const tier = winner.rank ? (["gold", "silver", "bronze"] as const)[winner.rank - 1] : null;
      const { blob, ext } = await recordStoryVideo(gen.posterRef.current, tier && `/poster/story/medal-${tier}.webp`, setVideoProgress);
      const name = posterFilename(winner.competitionName, winner.winnerName).replace(/\.png$/, `.${ext}`);
      setVideo({ url: URL.createObjectURL(blob), file: new File([blob], name, { type: blob.type }) });
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Couldn't make the video.");
    } finally {
      setVideoProgress(null);
    }
  }

  function closeVideo() {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
  }

  async function shareVideo() {
    if (!video) return;
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [video.file] })) {
      try {
        await navigator.share({ files: [video.file], text: shareText(winner) });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setVideoError("Couldn't share the video. Download it instead.");
      }
    } else {
      downloadDataUrl(video.url, video.file.name);
    }
  }

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file || !ACCEPTED_TYPES.includes(file.type)) return;
      gen.selectFile(file);
    },
    [gen]
  );

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "rgba(20,15,10,0.72)", backdropFilter: "blur(6px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-5">
          <div>
            <h3 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-anek), sans-serif", color: "#fff" }}>Share Your Result</h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>{winner.winnerName} · {winner.competitionName}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none" style={{ background: "rgba(255,255,255,0.12)" }} aria-label="Close">
            <X size={18} color="#fff" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {gen.step === "crop" && gen.rawImageSrc ? (
            <div className="pt-2">
              <PhotoCropper
                image={gen.rawImageSrc}
                crop={gen.crop}
                zoom={gen.zoom}
                rotation={gen.rotation}
                onCropChange={gen.setCrop}
                onZoomChange={gen.setZoom}
                onRotationChange={gen.setRotation}
                onCropComplete={gen.onCropComplete}
              />
              {gen.error && <p className="mt-3 text-center text-[12.5px]" style={{ color: "#FCA5A5" }}>{gen.error}</p>}
            </div>
          ) : gen.step === "upload" ? (
            <div className="pt-2">
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl transition-colors"
                style={{
                  aspectRatio: "1 / 1",
                  border: `2px dashed ${dragActive ? "var(--fp-gold)" : "rgba(255,255,255,0.28)"}`,
                  background: dragActive ? "rgba(var(--fp-gold-rgb),0.08)" : "rgba(255,255,255,0.04)",
                }}
              >
                <Upload size={26} color="rgba(255,255,255,0.7)" />
                <div className="px-6 text-center">
                  <p className="text-[13.5px] font-semibold" style={{ color: "#fff" }}>Drop a photo here</p>
                  <p className="mt-1 text-[11.5px]" style={{ color: "rgba(255,255,255,0.55)" }}>or tap to browse — PNG, JPG or WEBP</p>
                </div>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </label>
            </div>
          ) : !org ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#fff" }} /></div>
          ) : (
            <div className="pt-2">
              {video && (
                <video src={video.url} autoPlay loop muted playsInline controls className="mx-auto block w-full rounded-lg" style={{ maxWidth: 340, aspectRatio: "9 / 16" }} />
              )}
              <div hidden={!!video}>
              {winner.rank !== null && (
                <div role="group" aria-label="Poster format" className="mx-auto mb-3 flex w-fit gap-1 rounded-full p-1" style={{ background: "rgba(255,255,255,0.1)" }}>
                  {(["story", "classic"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={format === f}
                      onClick={() => setFormat(f)}
                      className="rounded-full px-4 py-1.5 text-[12.5px] font-bold"
                      style={format === f ? { background: "#fff", color: "#1a1410" } : { background: "transparent", color: "rgba(255,255,255,0.75)" }}
                    >
                      {f === "story" ? "Story 9:16" : "Classic"}
                    </button>
                  ))}
                </div>
              )}
              <ScaledPosterPreview key={story ? "story" : "classic"} posterRef={gen.posterRef} width={size.width} height={size.height}>
                {story ? (
                  <StoryPoster
                    org={org}
                    rank={winner.rank}
                    grade={winner.grade}
                    winnerName={winner.winnerName}
                    houseName={winner.houseName}
                    shakhaName={winner.shakhaName}
                    meghalaName={winner.meghalaName}
                    competitionName={winner.competitionName}
                    categoryLabel={winner.categoryLabel}
                    feastName={winner.feastName}
                    feastSubtitle={winner.feastSubtitle}
                    photoSrc={gen.photoSrc}
                  />
                ) : (
                <SocialPoster
                  org={org}
                  rank={winner.rank ?? 1}
                  grade={winner.grade}
                  winnerName={winner.winnerName}
                  shakhaName={winner.shakhaName}
                  meghalaName={winner.meghalaName}
                  competitionName={winner.competitionName}
                  categoryLabel={winner.categoryLabel}
                  feastName={winner.feastName}
                  feastSubtitle={winner.feastSubtitle}
                  photoSrc={gen.photoSrc}
                />
                )}
              </ScaledPosterPreview>
              </div>

              {videoError && <p className="mt-3 text-center text-[12.5px]" style={{ color: "#FCA5A5" }}>{videoError}</p>}
              {gen.error && <p className="mt-3 text-center text-[12.5px]" style={{ color: "#FCA5A5" }}>{gen.error}</p>}
              {gen.shareNote && <p role="status" className="mt-3 text-center text-[12.5px]" style={{ color: "#86EFAC" }}>{gen.shareNote}</p>}
            </div>
          )}
        </div>

        {/* Action buttons — a shrink-0 footer (not part of the scrollable
            body above) so they stay reachable even when the poster preview
            or cropper is taller than the viewport, instead of requiring a
            scroll that's easy to miss. */}
        <div className="shrink-0 px-4 pb-6 pt-5">
          {gen.step === "crop" && gen.rawImageSrc ? (
            <div className="flex gap-2.5">
              <GlowBtn variant="ghost" className="flex-1" onClick={gen.backToPreview} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                Cancel
              </GlowBtn>
              <GlowBtn variant="gold" className="flex-1" loading={gen.isCropping} onClick={gen.confirmCrop}>
                Use Photo
              </GlowBtn>
            </div>
          ) : gen.step === "upload" ? (
            <GlowBtn variant="ghost" className="w-full" onClick={gen.backToPreview} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
              Cancel
            </GlowBtn>
          ) : org && video ? (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={shareVideo}
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[16px] text-[15.5px] font-extrabold text-white transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", boxShadow: "0 10px 26px rgba(37,211,102,0.35)" }}
              >
                <WhatsAppIcon size={22} />
                Share Video
              </button>
              <div className="flex gap-2.5">
                <GlowBtn variant="ghost" className="flex-1" onClick={closeVideo} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                  Back to Poster
                </GlowBtn>
                <GlowBtn variant="ghost" className="flex-1" icon={Download} onClick={() => downloadDataUrl(video.url, video.file.name)} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                  Download Video
                </GlowBtn>
              </div>
            </div>
          ) : org ? (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => gen.shareToWhatsApp(shareText(winner))}
                disabled={gen.isSharing}
                aria-busy={gen.isSharing}
                className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[16px] text-[15.5px] font-extrabold text-white transition-transform active:scale-[0.98] disabled:opacity-70"
                style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", boxShadow: "0 10px 26px rgba(37,211,102,0.35)" }}
              >
                {gen.isSharing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <WhatsAppIcon size={22} />}
                {gen.isSharing ? "Preparing poster…" : "Share on WhatsApp"}
              </button>
              <div className="flex gap-2.5">
                <GlowBtn variant="ghost" className="flex-1" onClick={gen.openPicker} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                  {gen.photoSrc ? "Change Photo" : "Add Photo"}
                </GlowBtn>
                <GlowBtn variant="ghost" className="flex-1" icon={Download} loading={gen.isExporting} onClick={gen.download} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                  Download
                </GlowBtn>
              </div>
              {canRecord && (
                <GlowBtn variant="gold" className="w-full" icon={Film} loading={videoProgress !== null} disabled={videoProgress !== null} onClick={makeVideo}>
                  {videoProgress !== null ? `Making video… ${Math.round(videoProgress * 100)}%` : "Make Video"}
                </GlowBtn>
              )}
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
