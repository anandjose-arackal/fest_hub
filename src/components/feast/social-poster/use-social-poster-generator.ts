"use client";

import { useCallback, useRef, useState } from "react";
import type { Area, Point } from "react-easy-crop";
import { getCroppedImageDataUrl } from "./crop-image";
import { downloadDataUrl, exportPosterNode, posterFilename } from "./export-poster";

export type PosterStep = "upload" | "crop" | "preview";

export function useSocialPosterGenerator(competitionName: string, winnerName: string) {
  // Starts on the preview step (with a placeholder photo circle) rather than
  // forcing an upload first — the poster is downloadable without a photo,
  // and "Add Photo" from there is what drives into the upload/crop flow.
  const [step, setStep] = useState<PosterStep>("preview");
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const selectFile = useCallback(
    (file: File) => {
      if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
      setError(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
      setRawImageSrc(URL.createObjectURL(file));
      setStep("crop");
    },
    [rawImageSrc]
  );

  const onCropComplete = useCallback((area: Area) => {
    setCroppedAreaPixels(area);
  }, []);

  const confirmCrop = useCallback(async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;
    setIsCropping(true);
    setError(null);
    try {
      const dataUrl = await getCroppedImageDataUrl(rawImageSrc, croppedAreaPixels, rotation);
      setPhotoSrc(dataUrl);
      setStep("preview");
    } catch {
      setError("Couldn't process that photo. Try a different one.");
    } finally {
      setIsCropping(false);
    }
  }, [rawImageSrc, croppedAreaPixels, rotation]);

  // Used by both the "Add Photo" and "Change Photo" actions on the preview step.
  const openPicker = useCallback(() => {
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
    setError(null);
    setStep("upload");
  }, [rawImageSrc]);

  // Cancel out of the upload/crop steps back to preview without touching
  // whatever photoSrc (if any) was already confirmed.
  const backToPreview = useCallback(() => {
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
    setError(null);
    setStep("preview");
  }, [rawImageSrc]);

  const download = useCallback(async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    setError(null);
    try {
      const dataUrl = await exportPosterNode(posterRef.current);
      downloadDataUrl(dataUrl, posterFilename(competitionName, winnerName));
    } catch {
      setError("Couldn't generate the poster. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [competitionName, winnerName]);

  return {
    step,
    rawImageSrc,
    crop,
    zoom,
    rotation,
    photoSrc,
    isCropping,
    isExporting,
    error,
    posterRef,
    setCrop,
    setZoom,
    setRotation,
    selectFile,
    onCropComplete,
    confirmCrop,
    openPicker,
    backToPreview,
    download,
  };
}
