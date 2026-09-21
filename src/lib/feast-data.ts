// Shared constants used across server actions and admin/portal UI.

export const DEFAULT_MAX_PER_SHAKHA = 2;
export const DEFAULT_MAX_TEAM_MEMBERS = 7;
export const TEAM_CATEGORY_SLUG = "team";

// Poster-heading label per feast type — used by the html-to-image result
// posters (admin/results' ResultPoster and the feast portal's SocialPoster,
// plus scripts/generate-posters.mjs's bulk export) in place of the feast's
// own free-text name, so the heading reads as a fixed competition-type
// banner rather than whatever an admin happened to name the feast. Same
// "type is a shared, org-agnostic classification" convention as
// FEAST_TYPE_CONFIG in use-feast.ts (icon/tint/accent) — a type without an
// entry here (sports/general, or a custom string) falls back to the feast's
// own name.
export const FEAST_TYPE_POSTER_LABEL: Record<string, string> = {
  literature: "സാഹിത്യമത്സരം",
  arts: "കലാമത്സരം",
};

export function feastPosterHeading(feast: { type: string; name: string }): string {
  return FEAST_TYPE_POSTER_LABEL[feast.type] ?? feast.name;
}

// Decision #1 / multi-org: the source app hard-coded a lookup table of
// known feast slugs ("literature_2026" -> "LF26", etc.) that silently broke
// for any org whose slugs weren't in the table. This product has no fixed
// slug vocabulary, so the prefix is always derived from the feast's own
// UUID — collision-proof across feasts/orgs without hardcoding anything.
export function getRegPrefix(feastId: string): string {
  return `F${feastId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}
