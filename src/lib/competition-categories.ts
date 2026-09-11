import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { CompetitionCategory } from "@/types";

export type CategorySlug = "sub_junior" | "junior" | "senior" | "super_senior" | "elder";

// Cosmetic labels/colors — not DOB logic, safe to keep as static maps.
// This is the one palette both the app and /screen import (Decision #4:
// the source app had a second, disagreeing CAT_COLOR map inside /screen —
// unified here).
export const CATEGORY_LABELS: Record<string, string> = {
  sub_junior: "Sub Junior",
  junior: "Junior",
  senior: "Senior",
  super_senior: "Super Senior",
  elder: "Elder",
};

export const CATEGORY_COLORS: Record<string, string> = {
  sub_junior: "#34D3EE",
  junior: "#22C55E",
  senior: "#6B46FF",
  super_senior: "#F5A742",
  elder: "#9D99BC",
};

// Offline-dev fallback only, mirrors the seed in
// supabase/migrations/002_feast_core.sql — never used once Supabase is
// configured, since fetchCompetitionCategories() reads the DB then.
const FALLBACK_CATEGORIES: CompetitionCategory[] = [
  { id: "sub_junior", slug: "sub_junior", name: "Sub Junior", min_dob: "2014-01-01", max_dob: null, sort_order: 1, created_at: "" },
  { id: "junior", slug: "junior", name: "Junior", min_dob: "2011-01-01", max_dob: "2013-12-31", sort_order: 2, created_at: "" },
  { id: "senior", slug: "senior", name: "Senior", min_dob: "2007-01-01", max_dob: "2010-12-31", sort_order: 3, created_at: "" },
  { id: "super_senior", slug: "super_senior", name: "Super Senior", min_dob: "1988-01-01", max_dob: "2006-12-31", sort_order: 4, created_at: "" },
  { id: "elder", slug: "elder", name: "Elder", min_dob: null, max_dob: "1987-12-31", sort_order: 5, created_at: "" },
];

let cached: Promise<CompetitionCategory[]> | null = null;

// Decision #3: the DB (competition_categories) is the single source of
// truth for age-category DOB cutoffs — this replaces the source app's
// hardcoded duplicate threshold (which disagreed with the DB seed by 2
// years). Cached module-wide since the categories rarely change.
export function fetchCompetitionCategories(): Promise<CompetitionCategory[]> {
  if (cached) return cached;
  if (!isSupabaseConfigured) {
    cached = Promise.resolve(FALLBACK_CATEGORIES);
    return cached;
  }
  cached = (async () => {
    const { data, error } = await supabase
      .from("competition_categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK_CATEGORIES;
    return data as CompetitionCategory[];
  })();
  return cached;
}

// "Elocution | Sub Junior | Boy" — used by the competition dropdowns on
// /admin/participants and /admin/results. Category/gender are omitted
// (no dangling separator) when the competition doesn't carry one.
export function formatCompetitionOptionLabel(
  name: string,
  gender: string | null | undefined,
  categoryName: string | null | undefined
): string {
  const g = (gender ?? "").toLowerCase();
  const genderLabel = g.startsWith("boy") || g === "male" ? "Boy" : g.startsWith("girl") || g === "female" ? "Girl" : null;
  return [name, categoryName, genderLabel].filter(Boolean).join(" | ");
}

export function getCategorySlug(dob: string, categories: CompetitionCategory[]): CategorySlug | "" {
  if (!dob) return "";
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  for (const cat of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    const min = cat.min_dob ? new Date(cat.min_dob + "T00:00:00") : null;
    const max = cat.max_dob ? new Date(cat.max_dob + "T00:00:00") : null;
    if (min && d < min) continue;
    if (max && d > max) continue;
    return cat.slug as CategorySlug;
  }
  return "";
}
