"use client";

import { useEffect, useRef, useState } from "react";
import type { Area, Point } from "react-easy-crop";
import { Camera, ImagePlus, Loader2, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { PhotoCropper } from "@/components/feast/social-poster/photo-cropper";
import { getCroppedImageBlob } from "@/components/feast/social-poster/crop-image";
import { PHOTO_W, PHOTO_H } from "@/components/feast/social-poster/social-poster";
import { createPhotoUploadUrl } from "@/actions/photos";
import { formatBytes } from "@/lib/compress-image";

// Participant photo for individual events — pick (camera or gallery), crop
// to the poster's portrait frame, compress to a JPEG under 4MB, upload
// straight to S3 (presigned PUT from createPhotoUploadUrl) and hand the
// public URL back through onChange. Shared by the Feast Portal register /
// edit screens and the admin registration forms.
//
// `variant="admin"` scopes the portal's --fp-* colour tokens onto itself
// (PhotoCropper and this field read them; admin pages don't define them).
export function ParticipantPhotoField({
  feastId,
  value,
  onChange,
  onBusyChange,
  personName,
  variant = "portal",
}: {
  feastId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  personName?: string;
  variant?: "portal" | "admin";
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Local preview of what was just uploaded (no wait on S3) and its size.
  const [localPreview, setLocalPreview] = useState<{ src: string; bytes: number } | null>(null);

  useEffect(() => onBusyChange?.(uploading), [uploading, onBusyChange]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview.src); }, [localPreview]);

  function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setArea(null);
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function confirmCrop() {
    if (!cropSrc || !area) return;
    setUploading(true);
    setError("");
    try {
      const blob = await getCroppedImageBlob(cropSrc, area, rotation, PHOTO_W / PHOTO_H);
      const signed = await createPhotoUploadUrl({ feastId, contentType: "image/jpeg", size: blob.size });
      if (signed.error || !signed.uploadUrl || !signed.url) {
        setError(signed.error ?? "Couldn't start the upload.");
        return;
      }
      const res = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!res.ok) {
        setError("Upload failed — check the connection and try again.");
        return;
      }
      setLocalPreview({ src: URL.createObjectURL(blob), bytes: blob.size });
      onChange(signed.url);
      closeCrop();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't process that photo. Try a different one.");
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    setLocalPreview(null);
    onChange(null);
  }

  const shown = value ? (localPreview?.src ?? value) : null;
  const scope = variant === "admin" ? { "data-fp-theme": "violet" } : {};

  return (
    <div {...scope}>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="flex items-center gap-4">
        <div
          className="relative shrink-0 overflow-hidden rounded-2xl"
          style={{
            width: variant === "admin" ? 84 : 104,
            aspectRatio: `${PHOTO_W} / ${PHOTO_H}`,
            background: "rgba(var(--fp-primary-rgb),0.08)",
            border: shown ? "2px solid var(--fp-primary-light)" : "2px dashed rgba(var(--fp-primary-rgb),0.35)",
          }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={personName ? `Photo of ${personName}` : "Participant photo"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserRound className="h-9 w-9" style={{ color: "rgba(var(--fp-primary-rgb),0.45)" }} aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {shown ? (
            <>
              <p className="text-[13px] font-semibold" style={{ color: "var(--fp-ink)" }}>Photo added</p>
              {localPreview && <p className="text-[11.5px]" style={{ color: "var(--fp-meta)" }}>Uploaded · {formatBytes(localPreview.bytes)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <PhotoBtn icon={RefreshCw} onClick={() => galleryRef.current?.click()} disabled={uploading}>Change</PhotoBtn>
                <PhotoBtn icon={Trash2} onClick={remove} disabled={uploading} danger>Remove</PhotoBtn>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] leading-snug" style={{ color: "var(--fp-sub)" }}>
                Used on the winner poster and the results screen. A clear, front-facing photo works best.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <PhotoBtn icon={Camera} onClick={() => cameraRef.current?.click()} disabled={uploading} primary>Take photo</PhotoBtn>
                <PhotoBtn icon={ImagePlus} onClick={() => galleryRef.current?.click()} disabled={uploading}>Choose photo</PhotoBtn>
              </div>
            </>
          )}
        </div>
      </div>
      {error && !cropSrc && <p role="alert" className="mt-2 text-[12px] font-semibold" style={{ color: "#dc2626" }}>{error}</p>}

      {cropSrc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={uploading ? undefined : closeCrop}>
          <div
            {...scope}
            role="dialog"
            aria-modal="true"
            aria-label="Crop photo"
            className="flex max-h-[92vh] w-full max-w-sm flex-col rounded-2xl p-4"
            style={{ background: "var(--fp-surface, #fff)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: "var(--fp-ink)" }}>
                {personName?.trim() ? `Photo of ${personName.trim()}` : "Crop photo"}
              </h2>
              <button type="button" onClick={closeCrop} disabled={uploading} aria-label="Close"><X className="h-5 w-5" style={{ color: "var(--fp-meta)" }} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PhotoCropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={setArea}
              />
            </div>
            {error && <p role="alert" className="mt-3 text-center text-[12px] font-semibold" style={{ color: "#dc2626" }}>{error}</p>}
            <div className="mt-4 flex shrink-0 gap-2">
              <button type="button" onClick={closeCrop} disabled={uploading} className="flex-1 rounded-xl border-2 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "rgba(var(--fp-primary-rgb),0.2)", color: "var(--fp-ink)" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCrop}
                disabled={uploading || !area}
                aria-busy={uploading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" }}
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {uploading ? "Uploading…" : "Use photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoBtn({ icon: Icon, onClick, disabled, primary, danger, children }: {
  icon: typeof Camera;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition-transform active:scale-95 disabled:opacity-50"
      style={
        primary
          ? { background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))", color: "#fff" }
          : danger
            ? { background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.25)" }
            : { background: "rgba(var(--fp-primary-rgb),0.10)", color: "var(--fp-primary)", border: "1px solid rgba(var(--fp-primary-rgb),0.22)" }
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
}
