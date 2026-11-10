"use client";

import { useCallback, useRef, useState } from "react";
import type { Area, Point } from "react-easy-crop";
import { getCroppedImageDataUrl } from "./crop-image";
import { dataUrlToFile, downloadDataUrl, exportPosterNode, posterFilename } from "./export-poster";
import { PHOTO_W, PHOTO_H } from "./social-poster";

export type PosterStep = "upload" | "crop" | "preview";

// `size` is the export size of whichever poster node `posterRef` is on;
// `initialPhoto` (the registration photo, if any) seeds the photo slot.
export function useSocialPosterGenerator(competitionName: string, winnerName: string, size: { width: number; height: number }, initialPhoto: string | null = null) {
  // Starts on the preview step (with a placeholder photo circle) rather than
  // forcing an upload first — the poster is downloadable without a photo,
  // and "Add Photo" from there is what drives into the upload/crop flow.
  const [step, setStep] = useState<PosterStep>("preview");
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(initialPhoto);
  const [isCropping, setIsCropping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
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
      const dataUrl = await getCroppedImageDataUrl(rawImageSrc, croppedAreaPixels, rotation, PHOTO_W / PHOTO_H);
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
      const dataUrl = await exportPosterNode(posterRef.current, size.width, size.height);
      downloadDataUrl(dataUrl, posterFilename(competitionName, winnerName));
    } catch {
      setError(photoSrc?.startsWith("http") ? "Couldn't load the saved photo into the poster. Tap Change Photo and pick it again." : "Couldn't generate the poster. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [competitionName, winnerName, size.width, size.height, photoSrc]);

  // Share the poster with its details. Phones (Web Share with files) open
  // the share sheet with the image attached — WhatsApp is one tap from
  // there. Elsewhere a browser can't hand an image to WhatsApp, so the
  // poster downloads and WhatsApp opens with the details typed in, ready
  // for the image to be attached.
  const [shareNote, setShareNote] = useState<string | null>(null);
  const shareToWhatsApp = useCallback(async (text: string) => {
    if (!posterRef.current) return;
    setIsSharing(true);
    setError(null);
    setShareNote(null);
    try {
      const dataUrl = await exportPosterNode(posterRef.current, size.width, size.height);
      const filename = posterFilename(competitionName, winnerName);
      const file = await dataUrlToFile(dataUrl, filename);
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
        } catch (err) {
          // Closing the share sheet isn't a failure.
          if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
        }
      } else {
        downloadDataUrl(dataUrl, filename);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        setShareNote("Poster downloaded. Attach it in the WhatsApp chat that just opened.");
      }
    } catch {
      setError("Couldn't share the poster. Download it and send it from WhatsApp.");
    } finally {
      setIsSharing(false);
    }
  }, [competitionName, winnerName, size.width, size.height]);

  return {
    step,
    rawImageSrc,
    crop,
    zoom,
    rotation,
    photoSrc,
    isCropping,
    isExporting,
    isSharing,
    shareNote,
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
    shareToWhatsApp,
  };
}
