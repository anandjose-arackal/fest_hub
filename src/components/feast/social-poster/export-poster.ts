import { toPng } from "html-to-image";

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "winner"
  );
}

export function posterFilename(competitionName: string, winnerName: string): string {
  return `${slugify(competitionName)}-${slugify(winnerName)}-poster.png`;
}

// The poster node is authored at a fixed 1080x1920 CSS px, so pixelRatio: 1
// captures it at exactly that resolution — html-to-image otherwise defaults
// to the device's pixel ratio, which would multiply the output size.
export async function exportPosterNode(node: HTMLElement): Promise<string> {
  return toPng(node, { width: 1080, height: 1920, pixelRatio: 1, cacheBust: true, backgroundColor: "#FFFFFF" });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
