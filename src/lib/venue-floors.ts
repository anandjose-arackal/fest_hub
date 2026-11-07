// Pure helpers for the venue map (src/components/feast/venue-map.tsx):
// floor naming, how many floors to draw, and where each stage pin sits
// along its floor's facade.

const SUFFIX = ["th", "st", "nd", "rd"];

export function floorName(floor: number): string {
  if (floor === 0) return "Ground floor";
  const v = floor % 100;
  return `${floor}${SUFFIX[(v - 20) % 10] ?? SUFFIX[v] ?? SUFFIX[0]} floor`;
}

/** Floors to draw: up to the highest floor any stage uses, at least the ground floor. */
export function floorCount(floors: (number | null | undefined)[]): number {
  let max = 0;
  for (const f of floors) if (f != null && f > max) max = f;
  return max + 1;
}

/**
 * Pins on one floor, by stage number, spread evenly across [from, to] of the
 * facade (fractions of its length). Returns each item with its fraction.
 */
export function spreadAlong<T>(items: T[], from = 0.06, to = 0.94): { item: T; t: number }[] {
  const n = items.length;
  return items.map((item, i) => ({ item, t: from + ((to - from) * (i + 0.5)) / n }));
}

/** Stages grouped by floor, top floor first (mirrors the map); stages without a floor last under `null`. */
export function groupByFloor<T extends { floor: number | null; stageNumber: number }>(stages: T[]): { floor: number | null; stages: T[] }[] {
  const map = new Map<number | null, T[]>();
  for (const s of stages) {
    const k = s.floor ?? null;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
    .map(([floor, list]) => ({ floor, stages: list.sort((x, y) => x.stageNumber - y.stageNumber) }));
}

/**
 * Pins on one floor, left to right: at each stage's mapPosition when every
 * stage on the floor has one, otherwise spread evenly by stage number (a
 * half-positioned floor would let pinned and spread stages collide). `gap` /
 * `gapLeft` are the distances to the neighbouring pins, or to the facade's ends.
 */
export function placeOnFloor<T extends { stageNumber: number; mapPosition: number | null }>(items: T[]): { item: T; t: number; gap: number; gapLeft: number }[] {
  const positioned = items.length > 0 && items.every((s) => s.mapPosition != null);
  const placed = positioned
    ? items.map((item) => ({ item, t: 0.04 + (0.92 * item.mapPosition!) / 100 }))
    : spreadAlong([...items].sort((a, b) => a.stageNumber - b.stageNumber));
  placed.sort((a, b) => a.t - b.t);
  return placed.map((p, i) => ({ ...p, gap: (placed[i + 1]?.t ?? 1) - p.t, gapLeft: p.t - (placed[i - 1]?.t ?? 0) }));
}
