// Shared constants used across server actions and admin/portal UI.

export const DEFAULT_MAX_PER_SHAKHA = 2;
export const DEFAULT_MAX_TEAM_MEMBERS = 7;
export const TEAM_CATEGORY_SLUG = "team";

// Decision #1 / multi-org: the source app hard-coded a lookup table of
// known feast slugs ("literature_2026" -> "LF26", etc.) that silently broke
// for any org whose slugs weren't in the table. This product has no fixed
// slug vocabulary, so the prefix is always derived from the feast's own
// UUID — collision-proof across feasts/orgs without hardcoding anything.
export function getRegPrefix(feastId: string): string {
  return `F${feastId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}
