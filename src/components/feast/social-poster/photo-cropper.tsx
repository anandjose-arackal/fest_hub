"use client";

import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { RotateCcw, RotateCw } from "lucide-react";

export interface PhotoCropperProps {
  image: string;
  crop: Point;
  zoom: number;
  rotation: number;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onRotationChange: (rotation: number) => void;
  onCropComplete: (croppedAreaPixels: Area) => void;
}

export function PhotoCropper({ image, crop, zoom, rotation, onCropChange, onZoomChange, onRotationChange, onCropComplete }: PhotoCropperProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1", background: "#1a1425" }}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onRotationChange={onRotationChange}
          onCropComplete={(_croppedArea, croppedAreaPixels) => onCropComplete(croppedAreaPixels)}
        />
      </div>

      <div className="flex items-center gap-3 px-1">
        <span className="shrink-0 text-[12px] font-semibold" style={{ color: "#9CA3AF" }}>Zoom</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoomChange(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--fp-primary)" }} />
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onRotationChange(rotation - 90)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none transition-transform active:scale-95"
          style={{ background: "rgba(var(--fp-primary-rgb),0.1)" }}
          aria-label="Rotate left"
        >
          <RotateCcw className="h-[18px] w-[18px]" style={{ color: "var(--fp-primary)" }} />
        </button>
        <button
          type="button"
          onClick={() => onRotationChange(rotation + 90)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none transition-transform active:scale-95"
          style={{ background: "rgba(var(--fp-primary-rgb),0.1)" }}
          aria-label="Rotate right"
        >
          <RotateCw className="h-[18px] w-[18px]" style={{ color: "var(--fp-primary)" }} />
        </button>
      </div>
    </div>
  );
}
