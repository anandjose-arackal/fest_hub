import { supabase } from "@/lib/supabase";

// What the podium LED screen shows (podium_display, 026), read with the anon
// client by both /podium and its operator page. For mode 'item' the fest is
// the picked item's; for 'standings' it's the row's own feast_id.
export interface PodiumPick {
  mode: "item" | "standings";
  fcId: string | null;
  feastSlug: string | null;
  feastName: string | null;
  updatedAt: string | null;
}

export async function readPodiumPick(): Promise<PodiumPick | null> {
  const { data, error } = await supabase
    .from("podium_display")
    .select("mode, feast_competition_id, updated_at, feast:feasts(slug, name), feast_competition:feast_competitions(feast:feasts(slug, name))")
    .eq("id", true)
    .maybeSingle();
  if (error) return null;
  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);
  const mode = data?.mode === "standings" ? "standings" : "item";
  const feast = mode === "standings" ? one(data?.feast) : one(one(data?.feast_competition)?.feast);
  return {
    mode,
    fcId: mode === "item" ? data?.feast_competition_id ?? null : null,
    feastSlug: feast?.slug ?? null,
    feastName: feast?.name ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}
