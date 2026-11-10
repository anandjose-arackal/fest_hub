import { toPng } from "html-to-image";
import { STORY_POSTER_WIDTH as W, STORY_POSTER_HEIGHT as H } from "./story-poster";
import {
  BURSTS, BURST_PERIOD, CIRCUITS, VIDEO_FPS, VIDEO_SECONDS, mulberry32, medalOffsetY, pathLength, pointAlong, pulseHead, shineProgress, sparkAt, sparksFor,
} from "@/lib/story-video-timeline";

// Animated version of the story poster, drawn frame by frame on a canvas and
// recorded with MediaRecorder (real time, VIDEO_SECONDS long). The poster's
// text/photo/ribbon/waves come from one transparent snapshot of the poster
// node; background, circuit pulses, medal drop, ribbon shine and fireworks
// are drawn here on top of / under it.

// Must match story-poster.tsx's layout.
const MEDAL = { left: 18, top: -70, width: 320 };
const RIBBON = { x: 130, y: 1196, w: 820, h: 130 };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function videoMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1.42E01F", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

interface Assets { content: HTMLImageElement; bg: HTMLImageElement | null; medal: HTMLImageElement | null }

// Pulse colours (head -> tail rgb, glow, crackle sparks). All three run at
// once: circuit i uses PULSE_ORDER[i % 3].
type PulseTheme = "blue" | "orange" | "bluegreen";
const PULSE_ORDER: PulseTheme[] = ["blue", "orange", "bluegreen"];
const PULSE_THEMES: Record<PulseTheme, { head: [number, number, number]; tail: [number, number, number]; glow: string; spark: string }> = {
  blue: { head: [40, 120, 255], tail: [90, 190, 255], glow: "#3B82F6", spark: "#BFE0FF" },
  orange: { head: [255, 110, 20], tail: [255, 190, 60], glow: "#FF7A1A", spark: "#FFB14A" },
  bluegreen: { head: [30, 150, 255], tail: [39, 222, 147], glow: "#19D3C5", spark: "#7CFFCB" },
};
const mixRgb = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",");

function drawFrame(ctx: CanvasRenderingContext2D, a: Assets, t: number, sparks: ReturnType<typeof sparksFor>[]) {
  // Background
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#F8F7F4";
  ctx.fillRect(0, 0, W, H);
  if (a.bg) ctx.drawImage(a.bg, 0, 0, W, H);

  // Circuit traces + travelling pulses
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  CIRCUITS.forEach((path, i) => {
    const pal = PULSE_THEMES[PULSE_ORDER[i % PULSE_ORDER.length]];
    ctx.strokeStyle = "rgba(20,26,60,0.10)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    path.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    for (const [x, y] of [path[0], path[path.length - 1]]) {
      ctx.fillStyle = "rgba(20,26,60,0.16)";
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    const head = pulseHead(i, t);
    const tail = 140;
    ctx.save();
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 22;
    for (let k = 0; k < 10; k++) {
      const d0 = head - (tail * k) / 10, d1 = head - (tail * (k + 1)) / 10;
      if (d0 < 0 || d1 > pathLength(path)) continue;
      const [x0, y0] = pointAlong(path, d0), [x1, y1] = pointAlong(path, Math.max(0, d1));
      ctx.strokeStyle = `rgba(${mixRgb(pal.head, pal.tail, k / 9)},${0.95 * (1 - k / 10)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    const [hx, hy] = pointAlong(path, head);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
    // Crackle: a few short orange sparks off the pulse head, new each frame.
    const frame = Math.floor(t * VIDEO_FPS);
    ctx.strokeStyle = pal.spark;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 4; k++) {
      const r = mulberry32(i * 9973 + frame * 31 + k);
      const a = r() * Math.PI * 2, l = 10 + r() * 22;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, hy + Math.sin(a) * l * 0.5 + (r() - 0.5) * 8);
      ctx.lineTo(hx + Math.cos(a) * l, hy + Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.restore();
  });

  // Poster content
  // Fully visible from frame 0 so the video thumbnail shows the poster.
  ctx.drawImage(a.content, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // Ribbon shine
  const p = shineProgress(t);
  if (p !== null) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(RIBBON.x, RIBBON.y, RIBBON.w, RIBBON.h);
    ctx.clip();
    const cx = RIBBON.x - 200 + p * (RIBBON.w + 400);
    const g = ctx.createLinearGradient(cx - 120, RIBBON.y, cx + 120, RIBBON.y + RIBBON.h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,250,220,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(RIBBON.x, RIBBON.y, RIBBON.w, RIBBON.h);
    ctx.restore();
  }

  // Medal dropping in from the top
  if (a.medal) {
    const mh = (MEDAL.width * a.medal.naturalHeight) / a.medal.naturalWidth;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(a.medal, MEDAL.left, MEDAL.top + medalOffsetY(t, mh + MEDAL.top), MEDAL.width, mh);
    ctx.restore();
  }

  // Fireworks
  ctx.save();
  ctx.shadowBlur = 12;
  BURSTS.forEach((b, bi) => {
    for (const s of sparks[bi]) {
      const age = (t % BURST_PERIOD) - b.at;
      const now = sparkAt(b, s, age);
      const prev = sparkAt(b, s, age - 0.06);
      if (!now || !prev) continue;
      ctx.globalAlpha = now.alpha;
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(now.x, now.y);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// Records the animated poster. `node` is the rendered StoryPoster root.
export async function recordStoryVideo(node: HTMLElement, medalSrc: string | null, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const mime = videoMimeType();
  if (!mime) throw new Error("This browser can't record video.");

  // Hide the layers this file draws itself while snapshotting the rest
  // (html-to-image's `filter` left the medal in, unstyled).
  const skipped = Array.from(node.querySelectorAll<HTMLElement>("[data-video-layer]"));
  skipped.forEach((el) => (el.style.display = "none"));
  let contentUrl: string;
  try {
    contentUrl = await toPng(node, { width: W, height: H, pixelRatio: 1, cacheBust: true });
  } finally {
    skipped.forEach((el) => (el.style.display = ""));
  }
  const [bg, medal] = await Promise.all([loadImage("/poster/story/bg.webp"), medalSrc ? loadImage(medalSrc) : Promise.resolve(null)]);
  const content = await loadImage(contentUrl);
  if (!content) throw new Error("Couldn't prepare the poster.");

  const canvas = document.createElement("canvas");
  // Phones crashed the tab ("Something went wrong") at full 1080x1920 /
  // 8Mbps; touch devices record at 720x1280 and a lower bitrate.
  const phone = window.matchMedia("(pointer: coarse)").matches;
  const scale = phone ? 2 / 3 : 1;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const sparks = BURSTS.map((_, i) => sparksFor(i));
  const assets = { content, bg, medal };
  drawFrame(ctx, assets, 0, sparks);

  // Frames are pushed by hand (captureStream(0) + requestFrame): Chrome's MP4
  // recorder times the video by frame count, so a timer that slips below
  // 30fps would make a short video. Frame n always shows time n/FPS.
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: phone ? 4_000_000 : 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  rec.start(1000); // chunks, so the whole video isn't held in one buffer
  const total = VIDEO_SECONDS * VIDEO_FPS;
  const start = performance.now();
  for (let n = 0; n < total; n++) {
    drawFrame(ctx, assets, n / VIDEO_FPS, sparks);
    track.requestFrame?.();
    onProgress?.((n + 1) / total);
    // Pace against the clock (no drift); setTimeout, not rAF, so a briefly
    // backgrounded tab keeps going.
    const wait = start + ((n + 1) * 1000) / VIDEO_FPS - performance.now();
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  }
  // The encoder runs behind real time on 1080x1920; stopping right away
  // drops its queued tail (a 15s video came out 11.6s). Let it catch up.
  // shortcut: fixed grace period, measured on a desktop Chrome; raise it if
  // slow phones still come out short.
  await new Promise((r) => setTimeout(r, VIDEO_SECONDS * 300));
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}
