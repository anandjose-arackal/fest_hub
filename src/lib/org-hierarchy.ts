import type { HierarchyLevel, Meghala, Shakha } from "@/types";

// An admin's own assignment (profiles.shakha_id / meghala_id / diocese_id —
// exactly one is ever set, see profiles_single_scope_check) generalized to
// whichever tier is the org's configured top level. Defined here (not in
// auth-context.tsx) so this file and auth-context.tsx can import from each
// other without a cycle.
export interface AdminScope {
  level: HierarchyLevel;
  id: string;
  name: string;
}

// Resolves an admin's scope node down to the concrete leaf shakha ids it
// covers. A shakha-scoped admin covers just themselves (today's behavior,
// unchanged); a meghala/diocese-scoped admin covers every shakha beneath
// their node — this is why registration and "My Registrations" need a
// descendant-set membership check instead of a single shakha_id equality
// once hierarchy_level is above 'shakha'.
export function getDescendantShakhaIds(
  scope: AdminScope,
  hierarchy: { meghalas: Meghala[]; shakhas: Shakha[] }
): string[] {
  if (scope.level === "shakha") return [scope.id];
  if (scope.level === "meghala") {
    return hierarchy.shakhas.filter((s) => s.meghala_id === scope.id).map((s) => s.id);
  }
  const meghalaIds = new Set(hierarchy.meghalas.filter((m) => m.diocese_id === scope.id).map((m) => m.id));
  return hierarchy.shakhas.filter((s) => s.meghala_id && meghalaIds.has(s.meghala_id)).map((s) => s.id);
}
