// Venue floor plans (src/config/venue.json): types and the pure lookups the
// venue map, floor plan and stage hook share. Rooms sit in a back row, a
// corridor and a front row (or one full-depth row), with x/w as percentages
// of the building's length, read off the venue's floor-plan PDFs.
//
// The main building's floors are `floors`; other buildings on the campus
// (e.g. the hall beside the church) are `annexes`, each with its own floors.

export type RoomKind =
  | "stage" | "topic" | "rest" | "green" | "facility" | "desk" | "entrance"
  | "open" | "passage" | "landing" | "stair" | "lift" | "closed";

export interface PlanRoom {
  label: string;
  kind: RoomKind;
  row: "back" | "front" | "full";
  x: number;
  w: number;
  /** Stage(s) this room serves: the stage itself, or its topic / rest room. */
  stage?: number | number[];
  /** Classroom code, e.g. "IX A". */
  code?: string;
}

export interface PlanFloor {
  floor: number;
  rooms: PlanRoom[];
}

export interface PlanAnnex {
  /** Matches the building drawn on the isometric campus (e.g. "hall"). */
  id: string;
  name: string;
  /** How to find it, for the step-by-step directions (e.g. "the white hall to the right of the church"). */
  directions?: string;
  floors: PlanFloor[];
}

export interface VenuePlan {
  name: string;
  /** Labels for the main building's ground floor on the isometric map. */
  groundLabels: string[];
  floors: PlanFloor[];
  annexes?: PlanAnnex[];
}

/** Which building: the main one, or an annex id. */
export const MAIN = "main";

/** Plan depth in units: back row, corridor, front row (a full row spans all of it). */
export const PLAN_DEPTH = 100;
export const ROW_Y: Record<PlanRoom["row"] | "corridor", [number, number]> = {
  back: [0, 38],
  corridor: [38, 62],
  front: [62, 100],
  full: [0, 100],
};

export type Pt = [number, number];

export function roomStages(room: PlanRoom): number[] {
  return room.stage == null ? [] : Array.isArray(room.stage) ? room.stage : [room.stage];
}

const centreX = (r: PlanRoom) => r.x + r.w / 2;
const centreY = (r: PlanRoom) => (ROW_Y[r.row][0] + ROW_Y[r.row][1]) / 2;

/** Every building's floors, main building first. */
export function buildingsOf(plan: VenuePlan): { building: string; name: string; floors: PlanFloor[] }[] {
  return [{ building: MAIN, name: plan.name, floors: plan.floors }, ...(plan.annexes ?? []).map((a) => ({ building: a.id, name: a.name, floors: a.floors }))];
}

export function floorsOf(plan: VenuePlan, building: string): PlanFloor[] {
  return buildingsOf(plan).find((b) => b.building === building)?.floors ?? [];
}

export function buildingName(plan: VenuePlan, building: string): string {
  return buildingsOf(plan).find((b) => b.building === building)?.name ?? building;
}

/** The stage's own room, its floor and building. */
export function findStageRoom(plan: VenuePlan, stage: number): { building: string; floor: PlanFloor; room: PlanRoom } | null {
  for (const b of buildingsOf(plan)) {
    for (const floor of b.floors) {
      const room = floor.rooms.find((r) => r.kind === "stage" && roomStages(r).includes(stage));
      if (room) return { building: b.building, floor, room };
    }
  }
  return null;
}

/** Building, floor and position along it (0–100, room centre) for the isometric pin. */
export function stagePlacement(plan: VenuePlan | null, stage: number): { building: string; floor: number; position: number } | null {
  const hit = plan && findStageRoom(plan, stage);
  return hit ? { building: hit.building, floor: hit.floor.floor, position: Math.round(centreX(hit.room) * 10) / 10 } : null;
}

/** The stage's topic (വിഷയം) and rest rooms, in any building. */
export function relatedRooms(plan: VenuePlan, stage: number): { building: string; floor: number; room: PlanRoom }[] {
  return buildingsOf(plan).flatMap((b) =>
    b.floors.flatMap((f) =>
      f.rooms.filter((r) => (r.kind === "topic" || r.kind === "rest") && roomStages(r).includes(stage)).map((room) => ({ building: b.building, floor: f.floor, room })),
    ),
  );
}

const ROLE: Partial<Record<RoomKind, string>> = { topic: "Topic room", rest: "Rest room" };

/** "IX A · Topic room X B · Rest room II D" — the stage's room code (or annex name) and its helper rooms. */
export function stageRoomText(plan: VenuePlan | null, stage: number): string | null {
  const hit = plan && findStageRoom(plan, stage);
  if (!plan || !hit) return null;
  const where = hit.building === MAIN ? hit.room.code : buildingName(plan, hit.building);
  const parts = [where, ...relatedRooms(plan, stage).map(({ room }) => `${ROLE[room.kind]}${room.code ? ` ${room.code}` : ""}`)];
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
}

const STARTS: RoomKind[] = ["stair", "lift", "landing", "entrance"];

/**
 * Walking route on one floor, in plan units (x 0–100, y 0–PLAN_DEPTH): from
 * the nearest stair (else lift, landing, entrance) out into the corridor,
 * along it, and just through the target room's door (stopping there keeps
 * the room's label clear). A floor with one full-depth row has no corridor,
 * so the route runs straight across at mid-depth to the room's edge.
 */
export function routeTo(floor: PlanFloor, target: PlanRoom): Pt[] {
  const tx = centreX(target);
  const starts = floor.rooms.filter((r) => r !== target && STARTS.includes(r.kind));
  // Stairs win over a nearer lift: most people walk.
  const byKind = STARTS.map((k) => starts.filter((r) => r.kind === k)).find((list) => list.length > 0) ?? [];
  const start = byKind.sort((a, b) => Math.abs(centreX(a) - tx) - Math.abs(centreX(b) - tx))[0];
  if (!start) return [[tx, centreY(target)]];
  const sx = centreX(start);
  const DOOR = 3;
  const doorY = target.row === "back" ? ROW_Y.back[1] - DOOR : ROW_Y.front[0] + DOOR;
  const edgeX = sx < tx ? target.x + Math.min(2, target.w / 4) : target.x + target.w - Math.min(2, target.w / 4);
  const pts: Pt[] = target.row === "full" || start.row === "full"
    ? [[sx, centreY(start)], [edgeX, centreY(target)]]
    : [[sx, centreY(start)], [sx, PLAN_DEPTH / 2], [tx, PLAN_DEPTH / 2], [tx, doorY]];
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

export interface RouteStep {
  kind: "building" | "floor" | "room" | "helper";
  text: string;
}

/**
 * Step-by-step directions to a stage: reach the building, go up to its floor
 * (by whatever the floor has: stairs, lift or both), then the room, then its
 * topic / rest rooms. `floorLabel` names a floor ("1st floor").
 */
export function routeSteps(plan: VenuePlan, stage: number, floorLabel: (floor: number) => string): RouteStep[] {
  const hit = findStageRoom(plan, stage);
  if (!hit) return [];
  const annex = plan.annexes?.find((a) => a.id === hit.building);
  const steps: RouteStep[] = [
    annex
      ? { kind: "building", text: `Walk to ${annex.name}${annex.directions ? `, ${annex.directions}` : ""}` }
      : { kind: "building", text: `Enter ${plan.name} by the main entrance` },
  ];
  if (hit.floor.floor > 0) {
    const has = (k: RoomKind) => hit.floor.rooms.some((r) => r.kind === k);
    const means = has("lift") && (has("stair") || has("landing")) ? "stairs or lift" : has("lift") ? "lift" : "stairs";
    steps.push({ kind: "floor", text: `Take the ${means} to the ${floorLabel(hit.floor.floor)}` });
  }
  const r = hit.room;
  steps.push({ kind: "room", text: `Stage ${stage} is ${r.code ? `room ${r.code}` : `the ${r.label || "hall"}`}` });
  for (const h of relatedRooms(plan, stage)) {
    const sameFloor = h.building === hit.building && h.floor === hit.floor.floor;
    steps.push({ kind: "helper", text: `${ROLE[h.room.kind]}: ${h.room.code ?? h.room.label}${sameFloor ? ", same floor" : `, ${floorLabel(h.floor)}`}` });
  }
  return steps;
}

// Stairs, the lift and open spaces keep their real width when rooms are evened out.
const FIXED_WIDTH: RoomKind[] = ["stair", "lift", "landing", "passage", "open"];

/**
 * The floor with every room in a row made the same width, for drawing: easier
 * to read than the true proportions. Stairs, lift and open spaces keep their
 * width, and so do halls — the main stage and other rooms on a full-depth row,
 * and a room alone in its row. Room order along the row is kept.
 */
export function evenRooms(floor: PlanFloor): PlanFloor {
  const rooms = floor.rooms.map((r) => ({ ...r }));
  for (const row of ["back", "front"] as const) {
    const inRow = rooms.filter((r) => r.row === row).sort((a, b) => a.x - b.x);
    if (inRow.length < 2) continue;
    const fixed = (r: PlanRoom) => FIXED_WIDTH.includes(r.kind);
    const flex = inRow.filter((r) => !fixed(r));
    if (flex.length === 0) continue;
    const each = (100 - inRow.filter(fixed).reduce((s, r) => s + r.w, 0)) / flex.length;
    let x = 0;
    for (const r of inRow) {
      r.x = x;
      if (!fixed(r)) r.w = each;
      x += r.w;
    }
  }
  return { ...floor, rooms };
}
