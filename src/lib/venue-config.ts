import venues from "@/config/venue.json";
import type { VenuePlan } from "./venue-plan";

// The fest venue's floor plans, keyed by fest slug. Event-specific data, not
// admin-configurable: edit src/config/venue.json to move a stage or a room.
const VENUES = venues as Record<string, VenuePlan>;

export function venueFor(slug: string): VenuePlan | null {
  return VENUES[slug] ?? null;
}
