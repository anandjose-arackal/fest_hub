"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { CompetitionStage, RunState } from "@/hooks/use-competition-stages";
import { floorCount, floorName, placeOnFloor } from "@/lib/venue-floors";
import {
  Box, C, CHURCH, CampusDefs, Church, CompoundWall, FACADE_SLOPE, SCHOOL_SPAN, WX, GROUNDS, Grounds, H, HALL, Hall, L, PARAPET, Palm, GREEN_ROOMS, GreenRooms, Statue, Tree, poly, pt, spt, type Pt,
} from "./venue-campus";

// Isometric (dimetric) illustration of the fest venue campus, as in the venue
// photo: the school on the left (a long multi-storey block, its facade rising
// gently to the right), the church in the middle and the hall on the right.
// Each school stage is pinned on its floor's band of the facade; a stage in
// the hall (building "hall" in src/config/venue.json) is pinned on the hall.
// Drawn in SVG units; the viewBox scales it to whatever box it sits in, and
// in `zoomable` mode (a fixed 12:5 box) it glides in to the focused building.

const PIN_R = 28;

const PIN: Record<RunState, { fill: string; label: string }> = {
  running: { fill: "#F59E0B", label: "live now" },
  completed: { fill: "#16A34A", label: "completed" },
  upcoming: { fill: "var(--fp-primary, #6D28D9)", label: "upcoming" },
};

/** The isometric hall's id in venue.json's annexes. */
const HALL_ID = "hall";

function Label({ x, y, text, size = 20 }: { x: number; y: number; text: string; size?: number }) {
  const w = text.length * size * 0.56 + size * 1.2;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-size * 0.85} width={w} height={size * 1.7} rx={size * 0.85} fill="#FFFFFF" fillOpacity={0.94} stroke={C.ink} strokeOpacity={0.12} />
      <text textAnchor="middle" y={size * 0.34} fontSize={size} fontWeight={800} fill={C.ink}>{text}</text>
    </g>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function hasVenueMap(stages: CompetitionStage[]): boolean {
  return stages.some((s) => s.floor != null || s.building != null);
}

interface Pin { stage: CompetitionStage; group: string; labelLeft: boolean; maxChars: number; at: Pt }

/**
 * Pins along one row (a school floor, or the hall). A title pill sits right
 * of its pin and stops short of the next pin and of the row's end. The
 * rightmost pin flips its pill to the left when that end is too tight,
 * sharing the gap with its left neighbour.
 */
function rowPins(list: CompetitionStage[], len: number, group: string, endRoom: number, at: (t: number) => Pt): Pin[] {
  const placed = placeOnFloor(list);
  const n = placed.length;
  if (n === 0) return [];
  const last = placed[n - 1];
  const rightRoom = (p: (typeof placed)[number]) => Math.min(p.gap * len - PIN_R * 2 - 20, len - p.t * len - PIN_R + endRoom);
  const lastLeftRoom = n === 1 ? last.t * len - PIN_R - 20 : (last.gapLeft * len) / 2 - PIN_R - 10;
  const flipLast = rightRoom(last) < last.item.title.length * 11.5 && lastLeftRoom > rightRoom(last);
  return placed.map((p, i) => {
    const room = i === n - 1 && flipLast ? lastLeftRoom : i === n - 2 && flipLast ? Math.min(rightRoom(p), (p.gap * len) / 2 - PIN_R - 10) : rightRoom(p);
    return { stage: p.item, group, labelLeft: i === n - 1 && flipLast, maxChars: Math.max(4, Math.floor(room / 11.5)), at: at(p.t) };
  });
}

export interface VenueMapProps {
  stages: CompetitionStage[];
  /** School ground-floor labels, left to right (venue plan's groundLabels). */
  facilities?: string[];
  /** Floors to draw at least (the venue plan's), so the school is whole before stages are set. */
  minFloors?: number;
  /** School name for the roof sign. */
  venueName?: string | null;
  /** Highlights one school floor: the rest of the campus dims, its band glows, its name pops. */
  focusFloor?: number | null;
  /** Highlights another building instead (e.g. "hall"). */
  focusBuilding?: string | null;
  /** Glide the view in to the focused building (fixed 12:5 box). Off: the whole campus at its own shape. */
  zoomable?: boolean;
  /** Stage title beside each pin (hidden below 640px viewport width). */
  labels?: boolean;
  /** Live / Completed / Upcoming key under the drawing. */
  legend?: boolean;
  selectedKey?: string | null;
  /** Makes pins buttons. Leave unset when the map sits inside a link. */
  onSelect?: (stageKey: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function VenueMap({ stages, facilities = [], minFloors = 1, venueName, focusFloor = null, focusBuilding = null, zoomable = false, labels = true, legend = true, selectedKey, onSelect, className, style }: VenueMapProps) {
  const reduce = !!useReducedMotion();
  const placed = stages.filter((s) => s.floor != null);
  const inHall = stages.filter((s) => s.building === HALL_ID);
  const floors = Math.max(minFloors, floorCount(placed.map((s) => s.floor)));
  const top = floors * H;
  const hallFocus = focusBuilding === HALL_ID;
  const floorFocus = !hallFocus && focusFloor != null && focusFloor < floors;
  const dimmed = (f: number) => hallFocus || (floorFocus && f !== focusFloor);
  const band = (f: number) => poly(spt(0, 0, f * H), spt(L, 0, f * H), spt(L, 0, (f + 1) * H), spt(0, 0, (f + 1) * H));
  const sideBand = (f: number) => poly(spt(0, 0, f * H), spt(0, 1, f * H), spt(0, 1, (f + 1) * H), spt(0, 0, (f + 1) * H));
  const hallFront = poly(pt(HALL.a0, HALL.b0, 0), pt(HALL.a1, HALL.b0, 0), pt(HALL.a1, HALL.b0, HALL.z), pt(HALL.a0, HALL.b0, HALL.z));

  // View boxes: the whole campus, the school (with its floor names), the hall.
  const schoolTop = spt(L, 1, top + PARAPET)[1] - 70;
  const roadFront = GROUNDS.front - 0.42;
  const box = (x0: number, y0: number, x1: number, y1: number) => `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`;
  const views = {
    // Framed on the school, church and seminary; the green rooms behind may crop.
    campus: box(spt(0, 1, 0)[0] - 70, Math.min(schoolTop, pt(CHURCH.a1, CHURCH.b0 + 0.3, CHURCH.tower + 90)[1], pt(HALL.a1, HALL.b1, HALL.ridge + 80)[1]), pt(HALL.a1, HALL.b1, 0)[0] + 80, pt(0, roadFront, 0)[1] + 10),
    school: box(spt(0, 1, 0)[0] - 40, schoolTop, spt(L, 0, 0)[0] + 240, pt(0, GROUNDS.front - 0.1, 0)[1] + 10),
    hall: box(pt(HALL.a0 - 80, HALL.b0 - 1.4, 0)[0], pt(HALL.a1, HALL.b1, HALL.ridge)[1] - 110, pt(HALL.a1 + 80, HALL.b1, 0)[0] + 20, pt(0, HALL.b0 - 1.4, 0)[1]),
  };
  const viewBox = zoomable && hallFocus ? views.hall : zoomable && floorFocus ? views.school : views.campus;

  const byFloor = new Map<number, CompetitionStage[]>();
  for (const s of placed) {
    const list = byFloor.get(s.floor!) ?? [];
    list.push(s);
    byFloor.set(s.floor!, list);
  }

  const porchA0 = 0.43 * L;
  const porchA1 = 0.6 * L;
  const windowsPerFloor = 18;
  const bands: [number, number][] = [[0.09, 0.16], [0.66, 0.73]];
  const hallLen = HALL.a1 - HALL.a0;

  // School pins stop short of the facade's end (floor names sit past it);
  // hall pins may run a little past the hall's end.
  const pins: Pin[] = [
    ...[...byFloor.entries()].flatMap(([floor, list]) => rowPins(list, L, `f${floor}`, -40, (t) => spt(t * L, -0.1, (floor + 0.5) * H))),
    ...rowPins(inHall, hallLen, HALL_ID, 60, (t) => pt(HALL.a0 + t * hallLen, HALL.b0 - 0.12, HALL.z * 0.5)),
  ];
  const pinDimmed = (p: Pin) => (p.group === HALL_ID ? floorFocus : dimmed(Number(p.group.slice(1))));

  const interactive = !!onSelect;
  const onKey = (key: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(key); }
  };

  // Facilities are markers over the ground floor either side of the porch, in
  // note order: equal-size pills with a pointer and a leader down to a dot on
  // the room. Neighbours alternate between two heights so pills never touch.
  const leftCount = Math.ceil(facilities.length / 2);
  const sides = [[0.04, porchA0 / L - 0.015, leftCount], [porchA1 / L + 0.015, 0.96, facilities.length - leftCount]] as const;
  const minSlot = Math.min(...sides.filter(([, , n]) => n > 0).map(([from, to, n]) => ((to - from) * L) / n));
  const longest = Math.max(0, ...facilities.map((f) => f.length));
  const calloutSize = Math.min(17, (minSlot * 2 - 16) / (longest * 0.56 + 1.2));
  const calloutW = longest * calloutSize * 0.56 + calloutSize * 1.2;
  const facilityLabels = facilities.map((name, i) => {
    const left = i < leftCount;
    const [from, to, n] = left ? sides[0] : sides[1];
    const idx = left ? i : i - leftCount;
    return { name, lift: idx % 2 ? 62 : 24, tip: spt((from + ((to - from) * (idx + 0.5)) / n) * L, 0, H * 0.24) };
  });

  // Roof sign: the name in white on a red board along the parapet, slanted
  // with the facade; the font shrinks so a long name stays within 90% of it.
  const sign = venueName?.trim().toUpperCase() || null;
  // The facade is foreshortened: one unit along it is FX screen px across.
  const FX = (WX * SCHOOL_SPAN) / L;
  const signFont = sign ? Math.min(30, (0.86 * L * FX) / (sign.length * 0.64)) : 0;
  const signW = sign ? (sign.length * signFont * 0.64 + signFont * 1.6) / FX : 0;
  const signH = signFont * 1.5;
  const hallName = inHall[0]?.buildingName ?? null;

  const ariaSummary = `${venueName ? `${venueName} — v` : "V"}enue map: ${floors} floor${floors > 1 ? "s" : ""}, ${placed.length} stage${placed.length === 1 ? "" : "s"}${inHall.length ? `, ${inHall.length} in ${hallName ?? "the hall"}` : ""}${facilities.length ? `; ground floor: ${facilities.join(", ")}` : ""}`;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 10, ...style }}>
      <motion.svg
        initial={false}
        animate={{ viewBox }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        preserveAspectRatio="xMidYMid meet"
        role={interactive ? "group" : "img"}
        aria-label={ariaSummary}
        style={{ width: "100%", height: "auto", flex: "1 1 auto", minHeight: 0, display: "block", fontFamily: "inherit", ...(zoomable ? { aspectRatio: "12 / 5" } : {}) }}
      >
        <style>{`
          .vm-pulse{transform-box:fill-box;transform-origin:center;animation:vm-pulse 1.8s ease-out infinite}
          @keyframes vm-pulse{from{transform:scale(1);opacity:.6}to{transform:scale(1.9);opacity:0}}
          .vm-pin .vm-focus{opacity:0}
          .vm-pin:focus-visible{outline:none}
          .vm-pin:focus-visible .vm-focus,.vm-pin:hover .vm-focus{opacity:1}
          @media (max-width:639px){.vm-label{display:none}}
          .vm-veil{transition:opacity .45s ease}
          .vm-dim{transition:opacity .45s ease}
          .vm-sweep{stroke-dasharray:1;stroke-dashoffset:1;animation:vm-sweep .75s ease-out forwards}
          @keyframes vm-sweep{to{stroke-dashoffset:0}}
          .vm-glow{animation:vm-glow 1.6s ease-in-out .75s infinite alternate}
          @keyframes vm-glow{from{fill-opacity:.1}to{fill-opacity:.28}}
          .vm-pop{transform-box:fill-box;transform-origin:left center;animation:vm-pop .5s cubic-bezier(.3,1.6,.5,1)}
          @keyframes vm-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
          .vm-bounce{animation:vm-bounce .7s cubic-bezier(.3,1.5,.5,1)}
          @keyframes vm-bounce{0%{transform:translateY(0)}35%{transform:translateY(-26px)}100%{transform:translateY(0)}}
          @media (prefers-reduced-motion:reduce){.vm-pulse{animation:none;opacity:.35}.vm-sweep{animation:none;stroke-dashoffset:0}.vm-glow,.vm-pop,.vm-bounce{animation:none}.vm-veil,.vm-dim{transition:none}}
        `}</style>

        <CampusDefs />
        <Grounds />
        {/* Palms behind the buildings */}
        {[[-250, 3.4, 1.1], [-120, 4.6, 1], [CHURCH.a0 - 70, CHURCH.b1 + 0.2, 1.1], [CHURCH.a1 + 20, CHURCH.b1 + 0.35, 1], [GREEN_ROOMS.a0 + 40, GREEN_ROOMS.b1 + 0.2, 0.95], [GREEN_ROOMS.a1 - 30, GREEN_ROOMS.b1 + 0.15, 1.1], [GROUNDS.a1 - 30, HALL.b0 - 0.2, 0.9]].map(([a, b, s]) => <Palm key={a} a={a} b={b} s={s} />)}

        {/* ── School ── */}
        {/* Left end wall */}
        <polygon points={poly(spt(0, 0, 0), spt(0, 1, 0), spt(0, 1, top), spt(0, 0, top))} fill={C.wallSide} />
        <polygon points={poly(spt(0, 0, 0), spt(0, 1, 0), spt(0, 1, top), spt(0, 0, top))} fill="url(#vc-side)" />
        {Array.from({ length: floors }, (_, f) => (
          <g key={`sw${f}`}>
            {[0.3, 0.62].map((b) => (
              <polygon key={b} points={poly(spt(0, b, f * H + 30), spt(0, b + 0.16, f * H + 30), spt(0, b + 0.16, f * H + 66), spt(0, b, f * H + 66))} fill="url(#vc-glass)" />
            ))}
          </g>
        ))}

        {/* Facade, with its orange bands and the blue stair-tower strip */}
        <polygon points={poly(spt(0, 0, 0), spt(L, 0, 0), spt(L, 0, top), spt(0, 0, top))} fill={C.wall} />
        <polygon points={poly(spt(0, 0, 0), spt(L, 0, 0), spt(L, 0, top), spt(0, 0, top))} fill="url(#vc-front)" />
        {bands.map(([t0, t1]) => (
          <polygon key={t0} points={poly(spt(t0 * L, 0, 0), spt(t1 * L, 0, 0), spt(t1 * L, 0, top), spt(t0 * L, 0, top))} fill={C.band} />
        ))}
        <polygon points={poly(spt(0.37 * L, 0, 0), spt(0.395 * L, 0, 0), spt(0.395 * L, 0, top), spt(0.37 * L, 0, top))} fill={C.stair} />

        {/* Windows */}
        {Array.from({ length: floors }, (_, f) =>
          Array.from({ length: windowsPerFloor }, (_, i) => {
            const a = ((i + 0.5) / windowsPerFloor) * L - 13;
            if (f === 0 && a + 26 > porchA0 - 20 && a < porchA1 + 20) return null;
            const z = f * H + 28;
            return (
              <g key={`w${f}-${i}`}>
                <polygon points={poly(spt(a, 0, z), spt(a + 26, 0, z), spt(a + 26, 0, z + 40), spt(a, 0, z + 40))} fill="url(#vc-glass)" />
                <polygon points={poly(spt(a + 3, 0, z + 22), spt(a + 12, 0, z + 37), spt(a + 3, 0, z + 37))} fill={C.glassHi} opacity={0.55} />
                <polygon points={poly(spt(a - 3, 0, z + 40), spt(a + 29, 0, z + 40), spt(a + 29, 0, z + 45), spt(a - 3, 0, z + 45))} fill={C.trim} opacity={0.85} />
              </g>
            );
          }),
        )}

        {/* Floor lines */}
        {Array.from({ length: floors - 1 }, (_, i) => {
          const z = (i + 1) * H;
          return (
            <g key={`fl${z}`}>
              <polygon points={poly(spt(0, 0, z - 4), spt(L, 0, z - 4), spt(L, 0, z + 4), spt(0, 0, z + 4))} fill={C.trim} />
              <polygon points={poly(spt(0, 0, z - 4), spt(0, 1, z - 4), spt(0, 1, z + 4), spt(0, 0, z + 4))} fill={C.trimSide} />
            </g>
          );
        })}

        {/* Parapet and roof, with two rooftop rooms */}
        <Box p={spt} sideAt="a0" a0={0} a1={L} b0={0} b1={1} z0={top} z1={top + PARAPET} front={C.trim} side={C.trimSide} top={C.roofEdge} />
        <polygon points={poly(spt(10, 0.08, top + PARAPET), spt(L - 10, 0.08, top + PARAPET), spt(L - 10, 0.92, top + PARAPET), spt(10, 0.92, top + PARAPET))} fill={C.roof} />
        <Box p={spt} sideAt="a0" a0={0.2 * L} a1={0.27 * L} b0={0.35} b1={0.7} z0={top + PARAPET} z1={top + PARAPET + 42} front={C.wall} side={C.wallSide} top={C.trim} />
        <Box p={spt} sideAt="a0" a0={0.8 * L} a1={0.9 * L} b0={0.3} b1={0.75} z0={top + PARAPET} z1={top + PARAPET + 54} front={C.wall} side={C.wallSide} top={C.trim} />

        {sign && (
          <g>
            <Box p={spt} sideAt="a0" a0={L / 2 - signW / 2} a1={L / 2 + signW / 2} b0={0.02} b1={0.07} z0={top + PARAPET - 4} z1={top + PARAPET + signH} front={C.trim} side={C.trimSide} top={C.trimSide} />
            {(() => {
              const [x, y] = spt(L / 2, 0.02, top + PARAPET - 4 + signH / 2);
              return (
                <text transform={`matrix(1 ${FACADE_SLOPE} 0 1 ${x} ${y})`} textAnchor="middle" y={signFont * 0.36} fontSize={signFont} fontWeight={900} fill="#FFFFFF" style={{ letterSpacing: ".03em" }}>{sign}</text>
              );
            })()}
          </g>
        )}

        {/* Entrance porch */}
        <Box p={spt} sideAt="a0" a0={porchA0} a1={porchA1} b0={-0.42} b1={0} z0={0} z1={H * 0.82} front={C.porch} side={C.porchSide} top={C.porchTop} />
        {[0.08, 0.36, 0.64, 0.92].map((t) => {
          const a = porchA0 + (porchA1 - porchA0) * t - 6;
          return <polygon key={t} points={poly(spt(a, -0.42, 0), spt(a + 12, -0.42, 0), spt(a + 12, -0.42, H * 0.6), spt(a, -0.42, H * 0.6))} fill={C.column} />;
        })}
        <Tree a={140} b={-0.2} s={0.9} />

        {/* Floor focus: a veil over every other floor, then the chosen floor's
            outline draws itself round its band and keeps a soft glow. */}
        {Array.from({ length: floors }, (_, f) => (
          <g key={`veil${f}`} className="vm-veil" opacity={dimmed(f) ? 1 : 0} aria-hidden="true">
            <polygon points={band(f)} fill="#1B1430" fillOpacity={0.5} />
            <polygon points={sideBand(f)} fill="#1B1430" fillOpacity={0.5} />
          </g>
        ))}
        {floorFocus && (
          <g key={`glow${focusFloor}`} aria-hidden="true">
            <polygon className="vm-glow" points={band(focusFloor)} fill="#F59E0B" fillOpacity={0.1} />
            <polygon className="vm-glow" points={sideBand(focusFloor)} fill="#F59E0B" fillOpacity={0.1} />
            <polygon className="vm-sweep" pathLength={1} points={band(focusFloor)} fill="none" stroke="#F59E0B" strokeWidth={6} strokeLinejoin="round" />
            <polygon className="vm-sweep" pathLength={1} points={sideBand(focusFloor)} fill="none" stroke="#F59E0B" strokeWidth={6} strokeLinejoin="round" />
          </g>
        )}

        {/* ── Church and hall ── */}
        <g className="vm-dim" opacity={floorFocus ? 0.4 : 1}>
          <Church />
          <GreenRooms />
          <Statue />
          <Hall />
          {/* The building behind the seminary holds the green rooms (no stages). */}
          <Label x={pt(GREEN_ROOMS.a0 + 150, GREEN_ROOMS.b0, 0)[0]} y={pt(GREEN_ROOMS.a0 + 150, GREEN_ROOMS.b0, GREEN_ROOMS.z + 20)[1]} text="Green Rooms" size={22} />
          {hallName && (
            <Label x={pt((HALL.a0 + HALL.a1) / 2, HALL.b0, 0)[0]} y={pt((HALL.a0 + HALL.a1) / 2, HALL.b0, HALL.z + 32)[1]} text={hallName} size={22} />
          )}
        </g>
        {hallFocus && (
          <g key="glow-hall" aria-hidden="true">
            <polygon className="vm-glow" points={hallFront} fill="#F59E0B" fillOpacity={0.1} />
            <polygon className="vm-sweep" pathLength={1} points={hallFront} fill="none" stroke="#F59E0B" strokeWidth={6} strokeLinejoin="round" />
          </g>
        )}

        <CompoundWall />

        {/* Floor names, level with each band at the school facade's right end */}
        {Array.from({ length: floors }, (_, f) => {
          const [x, y] = spt(L, 0, (f + 0.5) * H);
          const text = floorName(f);
          const on = floorFocus && f === focusFloor;
          const ink = on ? "#F59E0B" : "var(--fp-sub, #6B5E52)";
          return (
            <g key={`fn${f}${on ? "on" : ""}`} transform={`translate(${x + 16} ${y})`} className="vm-dim" opacity={dimmed(f) ? 0.45 : 1}>
              <line x1={-12} x2={-2} y1={0} y2={0} stroke={ink} strokeWidth={on ? 4 : 2} />
              <text className={on ? "vm-pop" : undefined} x={4} y={on ? 10 : 8} fontSize={on ? 28 : 22} fontWeight={900} fill={ink} style={{ letterSpacing: ".04em", textTransform: "uppercase" }}>{text}</text>
            </g>
          );
        })}

        {/* Ground-floor facilities */}
        <g className="vm-dim" opacity={dimmed(0) ? 0.35 : 1}>
          {facilityLabels.map(({ name, lift, tip: [x, y] }, i) => {
            const h = calloutSize * 1.7;
            const by = y - lift; // pointer tip, just under the pill
            return (
              <g key={name + i}>
                <line x1={x} y1={y} x2={x} y2={by} stroke="#FFFFFF" strokeWidth={2.5} strokeDasharray="4 3" />
                <circle cx={x} cy={y} r={5} fill="#FFFFFF" stroke={C.ink} strokeOpacity={0.5} strokeWidth={1.5} />
                <path d={`M${x - 8} ${by - 9} L${x + 8} ${by - 9} L${x} ${by} Z`} fill="#FFFFFF" />
                <rect x={x - calloutW / 2} y={by - 8 - h} width={calloutW} height={h} rx={h / 2} fill="#FFFFFF" stroke={C.ink} strokeOpacity={0.12} />
                <text x={x} y={by - 8 - h / 2 + calloutSize * 0.36} textAnchor="middle" fontSize={calloutSize} fontWeight={800} fill={C.ink}>{name}</text>
              </g>
            );
          })}
        </g>

        {/* Stage pins */}
        {pins.map((pin) => {
          const { stage, maxChars, labelLeft, at: [x, y] } = pin;
          const p = PIN[stage.status];
          const selected = stage.key === selectedKey;
          const live = stage.status === "running";
          const where = stage.floor != null ? floorName(stage.floor) : stage.buildingName ?? "";
          const name = `Stage ${stage.stageNumber}${stage.title ? `, ${stage.title}` : ""} — ${where}, ${p.label}${live && stage.runningCompetition ? `: ${stage.runningCompetition.label}` : ""}`;
          // No pill at all beats a stub like "Spe…": the number still marks the stage.
          const title = maxChars >= Math.min(stage.title.length, 6) ? truncate(stage.title, maxChars) : "";
          const pillW = title.length * 12.5 + 28;
          return (
            <g
              key={stage.key}
              className="vm-pin vm-dim"
              opacity={pinDimmed(pin) ? 0.3 : 1}
              transform={`translate(${x} ${y})`}
              {...(interactive
                ? { role: "button", tabIndex: 0, "aria-label": name, "aria-pressed": selected, onClick: () => onSelect!(stage.key), onKeyDown: onKey(stage.key), style: { cursor: "pointer" } }
                : {})}
            >
              <title>{name}</title>
              {/* Remounts on each selection so the bounce replays. */}
              <g key={selected ? `b-${focusFloor}-${focusBuilding}-${selectedKey}` : "rest"} className={selected ? "vm-bounce" : undefined}>
                {labels && title && (
                  <g className="vm-label">
                    <rect x={labelLeft ? -(PIN_R - 6) - (pillW + 8) : PIN_R - 6} y={-19} width={pillW + 8} height={38} rx={19} fill="#FFFFFF" fillOpacity={0.95} stroke={C.ink} strokeOpacity={0.14} />
                    <text x={labelLeft ? -(PIN_R + 14) : PIN_R + 14} textAnchor={labelLeft ? "end" : "start"} y={7} fontSize={21} fontWeight={800} fill={C.ink}>{title}</text>
                  </g>
                )}
                {live && <circle className="vm-pulse" r={PIN_R} fill={p.fill} />}
                <circle className="vm-focus" r={PIN_R + 9} fill="none" stroke="var(--fp-ink, #111)" strokeWidth={3} strokeDasharray="6 5" />
                <circle r={PIN_R + 4} fill="#FFFFFF" stroke={selected ? "var(--fp-ink, #111)" : "rgba(0,0,0,.12)"} strokeWidth={selected ? 4 : 1.5} />
                <circle r={PIN_R - 1} style={{ fill: p.fill }} opacity={stage.status === "upcoming" ? 0.88 : 1} />
                <text textAnchor="middle" y={10} fontSize={28} fontWeight={900} fill="#FFFFFF">{stage.stageNumber}</text>
              </g>
            </g>
          );
        })}
      </motion.svg>

      {legend && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] font-bold" style={{ color: "var(--fp-sub)" }}>
          {(["running", "upcoming", "completed"] as RunState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: PIN[s].fill }} />
              {s === "running" ? "Live" : s === "upcoming" ? "Upcoming" : "Completed"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
