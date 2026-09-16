"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Upload, X, Download } from "lucide-react";
import { GlowBtn } from "../feast-shared";
import { getOrgSettings } from "@/lib/org-settings";
import type { OrgSettings } from "@/types";
import { SocialPoster, SOCIAL_POSTER_WIDTH, SOCIAL_POSTER_HEIGHT } from "./social-poster";
import { PhotoCropper } from "./photo-cropper";
import { useSocialPosterGenerator } from "./use-social-poster-generator";
import { ScaledPosterPreview } from "./scaled-poster-preview";

export interface SocialPosterWinner {
  rank: 1 | 2 | 3;
  winnerName: string;
  houseName: string | null;
  shakhaName: string;
  competitionName: string;
  categoryLabel: string;
  feastName: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function SocialPosterOverlay({ winner, onClose }: { winner: SocialPosterWinner; onClose: () => void }) {
  const gen = useSocialPosterGenerator(winner.competitionName, winner.winnerName);
  const [dragActive, setDragActive] = useState(false);
  const [org, setOrg] = useState<OrgSettings | null>(null);

  useEffect(() => {
    getOrgSettings().then(setOrg);
  }, []);

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
              <ScaledPosterPreview posterRef={gen.posterRef} width={SOCIAL_POSTER_WIDTH} height={SOCIAL_POSTER_HEIGHT}>
                <SocialPoster
                  org={org}
                  rank={winner.rank}
                  winnerName={winner.winnerName}
                  houseName={winner.houseName}
                  shakhaName={winner.shakhaName}
                  competitionName={winner.competitionName}
                  categoryLabel={winner.categoryLabel}
                  feastName={winner.feastName}
                  photoSrc={gen.photoSrc}
                />
              </ScaledPosterPreview>

              {gen.error && <p className="mt-3 text-center text-[12.5px]" style={{ color: "#FCA5A5" }}>{gen.error}</p>}
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
          ) : org ? (
            <div className="flex gap-2.5">
              <GlowBtn variant="ghost" className="flex-1" onClick={gen.openPicker} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                {gen.photoSrc ? "Change Photo" : "Add Photo"}
              </GlowBtn>
              <GlowBtn variant="gold" className="flex-1" icon={Download} loading={gen.isExporting} onClick={gen.download}>
                Download
              </GlowBtn>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
