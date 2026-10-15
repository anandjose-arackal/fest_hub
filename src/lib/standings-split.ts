// Boys / Girls / Common split of each age category's standings points —
// pure functions, shared by src/actions/results.ts (getStandingsGenderSplit)
// and /admin/standings, unit-tested by standings-split.test.ts.
//
// shakha_feast_standings only stores one total per age category, so the
// split is worked out on read from shakha_point_ledger: each ledger row's
// item gender decides its column. Team events aren't split (they keep their
// own Team column); "common" is any individual item that isn't boys- or
// girls-only.

export const SPLIT_CATEGORIES = ["sub_junior", "junior", "senior", "super_senior", "elder"] as const;
export type SplitCategory = (typeof SPLIT_CATEGORIES)[number];
export type SplitGender = "boy" | "girl" | "common";
export const SPLIT_GENDERS: readonly SplitGender[] = ["boy", "girl", "common"];

export type GenderSplit = Record<SplitCategory, Record<SplitGender, number>>;

export function emptySplit(): GenderSplit {
  const out = {} as GenderSplit;
  for (const c of SPLIT_CATEGORIES) out[c] = { boy: 0, girl: 0, common: 0 };
  return out;
}

/** competitions.gender → column. Anything that isn't boys/girls-only is common. */
export function splitGender(gender: string | null | undefined): SplitGender {
  const g = (gender ?? "").toLowerCase();
  if (g.startsWith("boy") || g === "male") return "boy";
  if (g.startsWith("girl") || g === "female") return "girl";
  return "common";
}

function isSplitCategory(slug: string): slug is SplitCategory {
  return (SPLIT_CATEGORIES as readonly string[]).includes(slug);
}

/** Adds one ledger row's points. Team rows (category "team") and unknown categories are skipped. */
export function addLedgerPoints(split: GenderSplit, categorySlug: string, itemGender: string | null | undefined, points: number): void {
  if (!isSplitCategory(categorySlug)) return;
  split[categorySlug][splitGender(itemGender)] += points;
}

export function splitCategoryTotal(split: GenderSplit, category: SplitCategory): number {
  const s = split[category];
  return s.boy + s.girl + s.common;
}

/** One gender's points across every age category (the Total column's Boys / Girls / Common). */
export function splitGenderTotal(split: GenderSplit, gender: SplitGender): number {
  return SPLIT_CATEGORIES.reduce((sum, c) => sum + split[c][gender], 0);
}
