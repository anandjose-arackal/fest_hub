import type { Diocese, HierarchyLevel, Meghala, Shakha } from "@/types";

// A shakha's Meghala/Diocese names, "—" when it isn't assigned into that tier.
export interface ShakhaLineage {
  meghala: string;
  diocese: string;
}

export function buildShakhaLineage(hierarchy: { dioceses: Diocese[]; meghalas: Meghala[]; shakhas: Shakha[] }): (shakhaId: string | null | undefined) => ShakhaLineage {
  const meghalaOf = new Map(hierarchy.shakhas.map((s) => [s.id, s.meghala_id]));
  const meghalaById = new Map(hierarchy.meghalas.map((m) => [m.id, m]));
  const dioceseName = new Map(hierarchy.dioceses.map((d) => [d.id, d.name]));
  return (shakhaId) => {
    const mId = shakhaId ? meghalaOf.get(shakhaId) : null;
    const m = mId ? meghalaById.get(mId) : undefined;
    return { meghala: m?.name ?? "—", diocese: (m?.diocese_id && dioceseName.get(m.diocese_id)) || "—" };
  };
}

// The extra columns every Shakha column and export gets: none at 'shakha',
// Meghala at 'meghala', Meghala + Diocese at 'diocese'.
export interface LineageColumn {
  key: keyof ShakhaLineage;
  label: string;
}

export function lineageColumns(level: HierarchyLevel): LineageColumn[] {
  if (level === "diocese") return [{ key: "meghala", label: "Meghala" }, { key: "diocese", label: "Diocese" }];
  if (level === "meghala") return [{ key: "meghala", label: "Meghala" }];
  return [];
}

// "Kalpetta · Mananthavady" — the lineage as one line, for mobile cards and
// badges; unassigned tiers are left out rather than shown as "—".
export function lineageText(l: ShakhaLineage, cols: LineageColumn[]): string {
  return cols.map((c) => l[c.key]).filter((v) => v !== "—").join(" · ");
}

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
