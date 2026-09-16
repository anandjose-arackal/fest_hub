export interface CroppedAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OUTPUT_SIZE = 900;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotatedBoundingBox(width: number, height: number, rotationDeg: number) {
  const rad = toRadians(rotationDeg);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

// Rotates the source image onto an intermediate canvas, then crops the
// requested pixel region out of it and resizes down to a fixed square —
// large enough to stay sharp inside the poster's photo circle.
export async function getCroppedImageDataUrl(imageSrc: string, croppedAreaPixels: CroppedAreaPixels, rotationDeg = 0): Promise<string> {
  const image = await loadImage(imageSrc);
  const box = rotatedBoundingBox(image.width, image.height, rotationDeg);

  const rotateCanvas = document.createElement("canvas");
  rotateCanvas.width = box.width;
  rotateCanvas.height = box.height;
  const rotateCtx = rotateCanvas.getContext("2d");
  if (!rotateCtx) throw new Error("2D canvas context unavailable");

  rotateCtx.translate(box.width / 2, box.height / 2);
  rotateCtx.rotate(toRadians(rotationDeg));
  rotateCtx.translate(-image.width / 2, -image.height / 2);
  rotateCtx.drawImage(image, 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("2D canvas context unavailable");

  outputCtx.drawImage(
    rotateCanvas,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  return outputCanvas.toDataURL("image/png");
}
