// Browser-side photo compression for uploads — plain canvas, no library.
// Phone camera photos are often 5–12MB; re-encoding as JPEG brings a cropped
// 900px-wide portrait to roughly 150–400KB. If a result is still over the
// limit, quality steps down, then the image is scaled down, until it fits.

const QUALITIES = [0.88, 0.8, 0.7, 0.6, 0.5];
const MIN_WIDTH = 480;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the photo"))), "image/jpeg", quality);
  });
}

function scaled(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * factor);
  out.height = Math.round(canvas.height * factor);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export async function compressCanvas(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  // JPEG has no alpha — paint transparent areas (rotated corners) white.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);

  let current = flat;
  for (;;) {
    for (const q of QUALITIES) {
      const blob = await toJpeg(current, q);
      if (blob.size <= maxBytes) return blob;
    }
    if (current.width * 0.75 < MIN_WIDTH) throw new Error("Couldn't make the photo small enough — try a different one.");
    current = scaled(current, 0.75);
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
