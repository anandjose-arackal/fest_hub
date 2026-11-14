import venues from "@/config/venue.json";
import type { VenuePlan } from "./venue-plan";

// The fest venue's floor plans, keyed by fest slug. Event-specific data, not
// admin-configurable: edit src/config/venue.json to move a stage or a room.
// A string value names another slug whose plan this fest shares.
const VENUES = venues as Record<string, VenuePlan | string>;

/** True when the fest owns its plan rather than sharing another fest's. */
export function ownsVenue(slug: string): boolean {
  return typeof VENUES[slug] === "object" && VENUES[slug] !== null;
}

export function venueFor(slug: string): VenuePlan | null {
  const v = VENUES[slug];
  return (typeof v === "string" ? VENUES[v] : v) as VenuePlan ?? null;
}
