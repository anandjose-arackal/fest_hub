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

// "F1405" — no feast-specific prefix (an earlier "F5848-1405" format carried
// a slice of the feast UUID). registration_number is unique across every
// feast, so next_reg_number() hands out n from one counter shared by all
// feasts in the database instead of one per feast.
export function formatRegNumber(n: number): string {
  return `F${n}`;
}
