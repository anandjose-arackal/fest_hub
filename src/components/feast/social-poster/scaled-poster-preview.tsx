"use client";

import { useEffect, useRef, useState } from "react";

// Displays a fixed-size poster node (authored at `width`x`height` CSS px)
// scaled down to fit its container. The export ref must sit on the UNSCALED
// inner node — html-to-image serializes the captured node's own inline
// styles (including `transform`), so if the ref were on the scaled wrapper,
// the exported canvas would contain only the tiny scaled-down poster in one
// corner instead of the full-resolution artwork.
export function ScaledPosterPreview({
  children,
  posterRef,
  width,
  height,
}: {
  children: React.ReactNode;
  posterRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setScale(box.clientWidth / width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={boxRef} className="mx-auto w-full" style={{ maxWidth: 340, aspectRatio: `${width} / ${height}`, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: scale > 0 ? "visible" : "hidden",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div ref={posterRef} style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
