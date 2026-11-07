"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Armchair, BookOpen, Mic } from "lucide-react";
import type { CompetitionStage, RunState } from "@/hooks/use-competition-stages";
import { floorName } from "@/lib/venue-floors";
import { PLAN_DEPTH, ROW_Y, buildingName, evenRooms, floorsOf, MAIN, relatedRooms, roomStages, routeTo, type PlanFloor, type PlanRoom, type Pt, type RoomKind, type VenuePlan } from "@/lib/venue-plan";

// One floor of the venue, drawn from its floor-plan PDF in perspective: a
// floor slab with the rooms standing on it as low boxes — a back row, the
// verandah (with the room codes on it, as on the PDFs), a front row (or one
// full-depth row). A name too long for its room floats above the floor as a
// label with a pointer down to the room. With a stage selected, its room
// rises and lights up in the stage's status colour, a route draws from the
// nearest stair along the verandah to its door, and its topic / rest rooms
// get an outline. Wide screens get it lengthwise; phones get it upright.

const KIND: Record<RoomKind, { bg: string; ink: string; name?: string }> = {
  stage: { bg: "#2F7D32", ink: "#FFFFFF", name: "Stage" },
  topic: { bg: "#F2B705", ink: "#3A2A00", name: "Topic / rest room" },
  rest: { bg: "#F2B705", ink: "#3A2A00" },
  green: { bg: "#7FB8E6", ink: "#0E2A47", name: "Green room" },
  facility: { bg: "#F28B6E", ink: "#4A1407", name: "Office · facility" },
  desk: { bg: "#FFD84D", ink: "#3A2A00" },
  entrance: { bg: "#1E9E8F", ink: "#FFFFFF" },
  open: { bg: "#FFF3D1", ink: "#8A6A2A" },
  passage: { bg: "#F6DDB8", ink: "#6B4318" },
  landing: { bg: "#F6DDB8", ink: "#6B4318" },
  stair: { bg: "#7D858E", ink: "#FFFFFF", name: "Stair · lift" },
  lift: { bg: "#7D858E", ink: "#FFFFFF" },
  closed: { bg: "#EFE9E2", ink: "#B9AEA2", name: "Not in use" },
};
const FLOOR = "#FFFFFF";
const CORRIDOR = "#F6DDB8";
const CODE_INK = "#7A4A12";
const STATUS: Record<RunState, string> = { running: "#E67E00", completed: "#15803D", upcoming: "var(--fp-primary, #6D28D9)" };
const ROUTE = "#E67E00";

type Orientation = "wide" | "tall";
// Upright (phones) is kept compact so a whole floor fits in about half a screen.
const SIZE: Record<Orientation, { w: number; h: number; squash: number; wall: number }> = {
  wide: { w: 1000, h: 300, squash: 0.62, wall: 16 },
  tall: { w: 300, h: 430, squash: 0.8, wall: 10 },
};
const MAX_FONT: Record<Orientation, number> = { wide: 17, tall: 12.5 };
/** Smallest size a name may shrink to inside its room before it floats out as a label instead. */
const MIN_FONT: Record<Orientation, number> = { wide: 10.5, tall: 7.5 };
const CODE_FONT: Record<Orientation, number> = { wide: 13, tall: 8.5 };
const TAG_FONT: Record<Orientation, number> = { wide: 14, tall: 9.5 };
const HEAD = 46; // room above the far rooms for their tags
const SLAB = 12; // floor slab thickness
const LIFT = 10; // how far the selected stage's room rises

/** Flat plan coordinates (x 0–100 along the building, y 0–PLAN_DEPTH across) → flat SVG units. */
function flat(o: Orientation, x: number, y: number): Pt {
  // Upright is the wide plan turned anticlockwise: the building's left end at the bottom, back row on the left.
  return o === "wide" ? [x * 10, (y / PLAN_DEPTH) * 300] : [(y / PLAN_DEPTH) * 300, (100 - x) * 4.3];
}
/** Flat units → the perspective view; `z` lifts a point off the floor. */
function persp(o: Orientation, [u, v]: Pt, z = 0): Pt {
  const { w, h, squash } = SIZE[o];
  const k = 0.76 + 0.24 * (v / h); // the far side is narrower
  return [w / 2 + (u - w / 2) * k, HEAD + v * squash - z];
}
function pp(o: Orientation, x: number, y: number, z = 0): Pt {
  return persp(o, flat(o, x, y), z);
}
const pts = (...p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function shade(hex: string, amt: number): string {
  if (!hex.startsWith("#")) return `color-mix(in srgb, ${hex} ${Math.round((1 - amt) * 100)}%, #000)`;
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * (1 - amt));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

type Box = { x: number; y: number; w: number; h: number };

/** A room as a box of height z: its top face, the face nearest the viewer, and the box its text fits in. */
function roomBox(o: Orientation, r: PlanRoom, z: number) {
  const [y0, y1] = ROW_Y[r.row];
  const corners: [number, number][] = [[r.x, y0], [r.x + r.w, y0], [r.x + r.w, y1], [r.x, y1]];
  const top = corners.map(([x, y]) => pp(o, x, y, z));
  const ground = corners.map(([x, y]) => pp(o, x, y));
  // The near edge is the one lowest on screen: y1 when wide, the start of x when upright.
  const [a, b] = o === "wide" ? [3, 2] : [0, 3];
  // Text goes in the rectangle inside the (trapezoid) top face, not its bounding box.
  // Wide: corners 0,3 are the left edge and 0,1 the top; upright: 0,1 are the left edge and 1,2 the top.
  const [L1, L2, R1, R2] = o === "wide" ? [0, 3, 1, 2] : [0, 1, 2, 3];
  const [T1, T2, B1, B2] = o === "wide" ? [0, 1, 2, 3] : [1, 2, 0, 3];
  const x0 = Math.max(top[L1][0], top[L2][0]);
  const y0r = Math.max(top[T1][1], top[T2][1]);
  const box: Box = { x: x0, y: y0r, w: Math.min(top[R1][0], top[R2][0]) - x0, h: Math.min(top[B1][1], top[B2][1]) - y0r };
  return { top: pts(...top), front: pts(top[a], top[b], ground[b], ground[a]), near: Math.max(...ground.map((p) => p[1])), box };
}

/** "3", or "5–6" for a room shared by two stages. */
function stageNumber(r: PlanRoom): string | null {
  const ns = roomStages(r);
  if (ns.length === 0) return null;
  return ns.length > 1 ? `${ns[0]}–${ns[ns.length - 1]}` : String(ns[0]);
}

// A stage's rooms carry a small badge, icon then number, instead of "Stage 3".
const BADGE_ICON: Partial<Record<RoomKind, typeof Mic>> = { stage: Mic, topic: BookOpen, rest: Armchair };
const BADGE_H: Record<Orientation, number> = { wide: 26, tall: 18 };

function RoomBadge({ x, y, h, num, kind, tint, maxW }: { x: number; y: number; h: number; num: string; kind: RoomKind; tint: string; maxW: number }) {
  const Icon = BADGE_ICON[kind]!;
  const fs = h * 0.62;
  const iw = h * 0.66;
  const w = h * 0.3 + iw + h * 0.15 + num.length * fs * 0.62 + h * 0.35;
  const s = Math.min(1, maxW / w);
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(${-w / 2} 0)`}>
      <rect width={w} height={h} rx={h / 2} fill="#FFFFFF" fillOpacity={0.95} />
      <Icon x={h * 0.3} y={(h - iw) / 2} width={iw} height={iw} color={tint} strokeWidth={2.6} />
      <text x={h * 0.3 + iw + h * 0.15} y={h / 2 + fs * 0.36} fill="#1F1F24" style={{ fontSize: fs, fontWeight: 900 }}>{num}</text>
    </g>
  );
}

/** A room's name split into lines (" · " joins two names), and the size it fits at, or null if it would be too small. */
function fitName(box: Box, label: string, max: number, min: number): { lines: string[]; size: number } | null {
  const lines = label.split(" · ");
  if (box.w < 14 || box.h < 12) return null;
  // 0.68 em per character: the bold UI font runs wider than 0.6, and the near rooms meet the edge.
  const size = Math.min(max, (box.w - 10) / (Math.max(...lines.map((l) => l.length)) * 0.68 + 0.4), (box.h - 6) / (lines.length * 1.25));
  return size >= min ? { lines, size } : null;
}

function NameText({ box, lines, size, ink }: { box: Box; lines: string[]; size: number; ink: string }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return (
    <text x={cx} y={cy - ((lines.length - 1) * size * 1.25) / 2 + size * 0.35} textAnchor="middle" fill={ink} style={{ fontSize: size, fontWeight: 800, pointerEvents: "none" }}>
      {lines.map((l, i) => <tspan key={i} x={cx} dy={i === 0 ? 0 : size * 1.25}>{l}</tspan>)}
    </text>
  );
}

interface Callout { label: string; room: PlanRoom; anchor: Pt; side: "above" | "below" | "left" | "right" }
interface Placed extends Callout { x: number; y: number; w: number; h: number }

/**
 * Lay out the labels that don't fit in their rooms. Wide: back-row names go
 * up into the sky above the floor, front-row names down below the slab, in
 * lanes so neighbours don't overlap. Upright: back-row names to the left,
 * front-row names to the right, pushed down past each other.
 */
function placeCallouts(o: Orientation, list: Callout[], font: number, top: number, bottom: number): { placed: Placed[]; above: number; below: number; left: number; right: number } {
  const lane = font * 2.1;
  // Upright, a label splits at " · " onto two lines to stay narrow; wide, it stays on one.
  const lines = (c: Callout) => (o === "tall" ? c.label.split(" · ") : [c.label]);
  const pw = (c: Callout) => Math.max(...lines(c).map((l) => l.length)) * font * 0.66 + font * 1.4;
  const ph = (c: Callout) => font * (1.6 + 1.25 * (lines(c).length - 1));
  const placed: Placed[] = [];
  let above = 0, below = 0, left = 0, right = 0;
  if (o === "wide") {
    for (const side of ["above", "below"] as const) {
      const lanes: Placed[][] = [];
      for (const c of list.filter((c) => c.side === side).sort((a, b) => a.anchor[0] - b.anchor[0])) {
        const w = pw(c);
        const x = c.anchor[0] - w / 2;
        let i = lanes.findIndex((l) => l.every((p) => x > p.x + p.w + 6 || x + w < p.x - 6));
        if (i < 0) { lanes.push([]); i = lanes.length - 1; }
        const y = side === "above" ? top - (i + 1) * lane : bottom + 6 + i * lane;
        const p = { ...c, x, y, w, h: ph(c) };
        lanes[i].push(p);
        placed.push(p);
      }
      if (side === "above") above = lanes.length * lane; else below = lanes.length ? lanes.length * lane + 6 : 0;
    }
  } else {
    for (const side of ["left", "right"] as const) {
      let next = -Infinity;
      let widest = 0;
      for (const c of list.filter((c) => c.side === side).sort((a, b) => a.anchor[1] - b.anchor[1])) {
        const w = pw(c);
        const h = ph(c);
        const y = Math.max(c.anchor[1] - h / 2, next);
        next = y + h + 3;
        widest = Math.max(widest, w);
        placed.push({ ...c, x: 0, y, w, h });
      }
      if (side === "left") left = widest ? widest + 14 : 0; else right = widest ? widest + 14 : 0;
    }
    const { w: W } = SIZE[o];
    for (const p of placed) p.x = p.side === "left" ? -left : W + 14;
  }
  return { placed, above, below, left, right };
}

function routeTimes(pts: Pt[]): number[] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return [0, ...seg.map((s) => (acc += s) / total)];
}

function PlanSvg({ o, building, floor, source, plan, stage, stages, reduce, routeDelay }: { o: Orientation; building: string; floor: PlanFloor; source: PlanFloor; plan: VenuePlan; stage: number | null; stages: CompetitionStage[]; reduce: boolean; routeDelay: number }) {
  const { w, h, squash, wall } = SIZE[o];
  const target = stage == null ? null : floor.rooms.find((r) => r.kind === "stage" && roomStages(r).includes(stage)) ?? null;
  // `floor` is drawn with evened-out rooms; its rooms line up by index with `source`, the real plan.
  const helpers = stage == null ? [] : relatedRooms(plan, stage).filter((r) => r.building === building && r.floor === floor.floor).map((r) => floor.rooms[source.rooms.indexOf(r.room)]);
  const [c0, c1] = ROW_Y.corridor;
  // The way in runs along the verandah floor and up into the rooms at either end.
  const route = target ? routeTo(floor, target).map(([x, y]) => pp(o, x, y, y > c0 && y < c1 ? 0 : wall)) : [];
  const times = routeTimes(route);
  const statusOf = (r: PlanRoom) => stages.find((s) => roomStages(r).includes(s.stageNumber))?.status ?? null;
  const hasCorridor = floor.rooms.some((r) => r.row !== "full");
  const routeD = route.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const ROUTE_DELAY = 0.15 + routeDelay;
  const ROUTE_S = 1.3;
  // The way in replays: draws, holds a second at the door, draws again.
  const ROUTE_LOOP = { duration: ROUTE_S, delay: ROUTE_DELAY, repeat: Infinity, repeatType: "loop" as const, repeatDelay: 1 };
  const bottom = HEAD + h * squash;

  // Each room: its box, then where its badge and name go — inside if the name
  // fits at a readable size, otherwise out to a floating label.
  const callouts: Callout[] = [];
  const rooms = floor.rooms
    .map((r) => ({ r, ...roomBox(o, r, r === target ? wall + LIFT : wall) }))
    .sort((a, b) => a.near - b.near)
    .map((room) => {
      const { r, box } = room;
      const num = BADGE_ICON[r.kind] ? stageNumber(r) : null;
      // Upright rooms are wide and short, so the badge sits on the left with the name beside it;
      // wide rooms stack the badge above the name.
      const side = o === "tall" && !!num;
      const bh = num ? Math.min(BADGE_H[o], side ? box.h * 0.7 : box.h * 0.45) : 0;
      const bw = num ? bh * (1.46 + num.length * 0.384) : 0;
      const nameBox: Box = !num ? box : side
        ? { x: box.x + bw + 6, y: box.y, w: box.w - bw - 8, h: box.h }
        : { x: box.x, y: box.y + box.h * 0.12 + bh + 3, w: box.w, h: box.h * 0.88 - bh - 5 };
      const name = r.label && r.kind !== "closed" ? fitName(nameBox, r.label, MAX_FONT[o], MIN_FONT[o]) : null;
      if (r.label && r.kind !== "closed" && !name) {
        const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
        callouts.push({ label: r.label, room: r, anchor: [cx, num && !side ? box.y + box.h * 0.12 + bh + 4 : cy], side: o === "wide" ? (r.row === "front" ? "below" : "above") : r.row === "front" ? "right" : "left" });
      }
      const by = num ? (name && !side ? box.y + box.h * 0.12 : box.y + (box.h - bh) / 2) : 0;
      // Beside the name the badge hugs the left; on its own it is centred.
      const bx = num ? (side && name ? box.x + 4 + bw / 2 : box.x + box.w / 2) : 0;
      return { ...room, num, bh, by, bx, nameBox, name };
    });
  const { placed, above, below, left, right } = placeCallouts(o, callouts, TAG_FONT[o], 0, bottom + SLAB);
  const vbTop = -above;
  const vbBottom = bottom + SLAB + 6 + below;

  // Room codes sit on the verandah beside their room, as on the floor-plan PDFs.
  const codes = hasCorridor
    ? floor.rooms.filter((r) => r.code && r.row !== "full").map((r) => {
        const back = r.row === "back";
        const cx = r.x + r.w / 2;
        if (o === "wide") return { r, at: pp(o, cx, back ? c0 + (c1 - c0) * 0.24 : c0 + (c1 - c0) * 0.58), anchor: "middle" as const };
        const [x, y] = pp(o, cx, (c0 + c1) / 2);
        return { r, at: [back ? x - 3 : x + 3, y + 3] as Pt, anchor: back ? ("end" as const) : ("start" as const) };
      })
    : [];

  return (
    <svg viewBox={`${-6 - left} ${vbTop} ${w + 12 + left + right} ${vbBottom - vbTop}`} style={{ width: "100%", height: "auto", display: "block", fontFamily: "inherit" }} role="img" aria-label={`${building === MAIN ? floorName(floor.floor) : buildingName(plan, building)} plan${target ? `, Stage ${stage} highlighted with the way in` : ""}`}>
      {/* Floor slab: its front edge, then the floor and the verandah */}
      <polygon points={pts(pp(o, 0, PLAN_DEPTH), pp(o, 100, PLAN_DEPTH), pp(o, 100, PLAN_DEPTH, -SLAB), pp(o, 0, PLAN_DEPTH, -SLAB))} fill="#D6CCC0" />
      {o === "tall" && <polygon points={pts(pp(o, 0, 0), pp(o, 0, PLAN_DEPTH), pp(o, 0, PLAN_DEPTH, -SLAB), pp(o, 0, 0, -SLAB))} fill="#D6CCC0" />}
      <polygon points={pts(pp(o, 0, 0), pp(o, 100, 0), pp(o, 100, PLAN_DEPTH), pp(o, 0, PLAN_DEPTH))} fill={FLOOR} />
      {hasCorridor && <polygon points={pts(pp(o, 0, c0), pp(o, 100, c0), pp(o, 100, c1), pp(o, 0, c1))} fill={CORRIDOR} />}

      {/* Far rooms first, so nearer rooms stand in front of them. */}
      {rooms.map(({ r, top, front, box, num, bh, by, bx, nameBox, name }, i) => {
        const k = KIND[r.kind];
        const status = r.kind === "stage" ? statusOf(r) : null;
        const isTarget = r === target;
        const fill = isTarget && status ? STATUS[status] : k.bg;
        const ink = isTarget && status ? "#FFFFFF" : k.ink;
        return (
          <g key={i}>
            <polygon points={front} fill={shade(fill, 0.2)} />
            <polygon points={top} fill={fill} stroke={FLOOR} strokeWidth={3} strokeLinejoin="round" style={{ transition: "fill .5s" }} />
            {num && bh >= 8 && box.w > 16 && <RoomBadge x={bx} y={by} h={bh} num={num} kind={r.kind} tint={isTarget && status ? STATUS[status] : r.kind === "stage" ? k.bg : "#B45309"} maxW={box.w - 6} />}
            {name && <NameText box={nameBox} lines={name.lines} size={name.size} ink={ink} />}
          </g>
        );
      })}

      {codes.map(({ r, at: [x, y], anchor }, i) => (
        <text key={`c${i}`} x={x} y={y} textAnchor={anchor} fill={CODE_INK} style={{ fontSize: CODE_FONT[o], fontWeight: 800 }}>{r.code}</text>
      ))}

      {/* Names too long for their rooms: a label floating off the floor, a pointer down to the room */}
      {placed.map((p, i) => {
        const k = KIND[p.room.kind];
        const font = TAG_FONT[o];
        const end: Pt = p.side === "above" ? [p.x + p.w / 2, p.y + p.h] : p.side === "below" ? [p.x + p.w / 2, p.y] : p.side === "left" ? [p.x + p.w, p.y + p.h / 2] : [p.x, p.y + p.h / 2];
        return (
          <g key={`t${i}`}>
            <line x1={p.anchor[0]} y1={p.anchor[1]} x2={end[0]} y2={end[1]} stroke={shade(k.bg, 0.35)} strokeWidth={1.6} />
            <circle cx={p.anchor[0]} cy={p.anchor[1]} r={3} fill="#FFFFFF" stroke={shade(k.bg, 0.35)} strokeWidth={1.6} />
            <rect x={p.x} y={p.y + 2.5} width={p.w} height={p.h} rx={p.h / 2} fill={shade(k.bg, 0.35)} opacity={0.35} />
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2} fill="#FFFFFF" stroke={k.bg} strokeWidth={2} />
            {(o === "tall" ? p.label.split(" · ") : [p.label]).map((l, j, all) => (
              <text key={j} x={p.x + p.w / 2} y={p.y + p.h / 2 + font * 0.36 + (j - (all.length - 1) / 2) * font * 1.25} textAnchor="middle" fill="#1F1F24" style={{ fontSize: font, fontWeight: 800 }}>{l}</text>
            ))}
          </g>
        );
      })}

      {/* Topic / rest rooms for the selected stage */}
      {helpers.map((r, i) => {
        const { top, box } = roomBox(o, r, wall);
        const tag = r.kind === "topic" ? "Topic room" : "Rest room";
        return (
          <motion.g key={`h${i}`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : ROUTE_DELAY + ROUTE_S }}>
            <polygon points={top} fill="none" stroke="#B45309" strokeWidth={3.5} strokeDasharray="9 6" />
            <g transform={`translate(${box.x + box.w / 2} ${Math.max(14, box.y - 4)})`}>
              <rect x={-tag.length * 4.3 - 10} y={-13} width={tag.length * 8.6 + 20} height={24} rx={12} fill="#B45309" />
              <text textAnchor="middle" y={4} style={{ fontSize: 13, fontWeight: 900 }} fill="#FFFFFF">{tag}</text>
            </g>
          </motion.g>
        );
      })}

      {/* The selected stage: pulsing outline on its raised room, then the way in */}
      {target && (() => {
        const { top } = roomBox(o, target, wall + LIFT);
        return (
          <g>
            <motion.polygon
              points={top} fill="none" stroke="#1F1F24" strokeWidth={4} strokeLinejoin="round"
              initial={reduce ? false : { opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 0.35, 1] }}
              transition={reduce ? undefined : { duration: 1.2, delay: ROUTE_DELAY + ROUTE_S, repeat: 2, repeatType: "reverse" }}
            />
            {route.length > 1 && (
              <>
                <path d={routeD} fill="none" stroke="#FFFFFF" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
                <motion.path
                  d={routeD} fill="none" stroke={ROUTE} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reduce ? { duration: 0 } : { ...ROUTE_LOOP, ease: "easeInOut" }}
                />
                <circle cx={route[0][0]} cy={route[0][1]} r={8} fill="#FFFFFF" stroke={ROUTE} strokeWidth={4} />
                <motion.circle
                  r={8} fill={ROUTE} stroke="#FFFFFF" strokeWidth={3}
                  initial={reduce ? false : { cx: route[0][0], cy: route[0][1] }}
                  animate={{ cx: route.map((p) => p[0]), cy: route.map((p) => p[1]) }}
                  transition={reduce ? { duration: 0 } : { ...ROUTE_LOOP, ease: "easeInOut", times }}
                />
              </>
            )}
          </g>
        );
      })()}
    </svg>
  );
}

/** `animateIn: false` when the caller animates the plan in itself; `routeDelay` (s) holds the route until it has landed. */
export function FloorPlan({ plan, building = MAIN, floor, stage, stages, animateIn = true, routeDelay = 0 }: { plan: VenuePlan; building?: string; floor: number; stage: number | null; stages: CompetitionStage[]; animateIn?: boolean; routeDelay?: number }) {
  const reduce = !!useReducedMotion();
  const f = floorsOf(plan, building).find((x) => x.floor === floor);
  if (!f) return null;
  const even = evenRooms(f);
  const legend = (Object.keys(KIND) as RoomKind[]).filter((k) => KIND[k].name && f.rooms.some((r) => r.kind === k || (k === "topic" && r.kind === "rest") || (k === "stair" && r.kind === "lift")));
  return (
    <motion.div
      key={`${building}-${floor}-${stage ?? "none"}`}
      initial={reduce || !animateIn ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="hidden sm:block"><PlanSvg o="wide" building={building} floor={even} source={f} plan={plan} stage={stage} stages={stages} reduce={reduce} routeDelay={routeDelay} /></div>
      <div className="mx-auto max-w-[360px] sm:hidden"><PlanSvg o="tall" building={building} floor={even} source={f} plan={plan} stage={stage} stages={stages} reduce={reduce} routeDelay={routeDelay} /></div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[12px] font-bold" style={{ color: "var(--fp-sub)" }}>
        {legend.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-3 rounded-[3px]" style={{ background: KIND[k].bg, border: "1px solid rgba(0,0,0,.15)" }} />
            {KIND[k].name}
          </span>
        ))}
        {stage != null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[3px] w-4 rounded-full" style={{ background: ROUTE }} />
            Way in
          </span>
        )}
      </div>
    </motion.div>
  );
}
