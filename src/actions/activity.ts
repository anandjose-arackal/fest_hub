"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type ActivityType = "published" | "completed" | "started";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  competitionName: string;
  categoryName: string | null;
  gender: string | null;
  feastName: string;
  feastSlug: string;
  at: string; // ISO timestamp
}

const TYPE_BY_STATUS: Record<string, ActivityType | null> = {
  published: "published",
  completed: "completed",
  progressing: "started",
  upcoming: null,
};

// Derives a "recent activity" feed straight from feast_competitions state —
// there's no separate notifications table (and no realtime infra anywhere
// in this app, by design; see AGENTS.md's polling convention), so this
// reads whatever most recently transitioned comp_status, using the
// updated_at trigger added in migration 009.
export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("feast_competitions")
    .select(
      "id, comp_status, updated_at, competition:competitions(name, gender, competition_category:competition_categories(name)), feast:feasts(name, slug, status)"
    )
    .neq("comp_status", "upcoming")
    .order("updated_at", { ascending: false })
    .limit(limit * 2); // over-fetch since draft feasts get filtered out below

  if (error || !data) return [];

  const items: ActivityItem[] = [];
  for (const row of data) {
    const type = TYPE_BY_STATUS[row.comp_status];
    if (!type) continue;
    const competition = Array.isArray(row.competition) ? row.competition[0] : row.competition;
    const category = Array.isArray(competition?.competition_category) ? competition?.competition_category[0] : competition?.competition_category;
    const feast = Array.isArray(row.feast) ? row.feast[0] : row.feast;
    if (!feast || feast.status === "draft") continue;

    items.push({
      id: row.id,
      type,
      competitionName: competition?.name ?? "Competition",
      categoryName: category?.name ?? null,
      gender: competition?.gender ?? null,
      feastName: feast.name,
      feastSlug: feast.slug,
      at: row.updated_at,
    });
    if (items.length >= limit) break;
  }

  return items;
}
