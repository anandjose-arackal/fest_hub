import { getOrgSettings } from "@/lib/org-settings";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by individual-registration caps (competitions.max_per_shakha, see
// src/actions/feast.ts) and the team-registration "one team per shakha"
// rule (src/actions/team.ts): both are configured per shakha in the DB, but
// enforced at whichever tier org_settings.hierarchy_level currently is. At
// the 'shakha' default this is exactly that shakha's own scope (unchanged).
// At 'meghala'/'diocese' it widens to every shakha under the registering
// shakha's meghala/diocese, so e.g. "2 per shakha" becomes "2 total across
// the whole meghala" and "one team per shakha" becomes "one team per
// diocese" — the org only configures one value/rule, not one per tier. A
// shakha with no meghala/diocese assignment falls back to just itself
// (mirrors getDescendantShakhaIds/standings' "__unassigned__" handling —
// there's no group to share the scope with).
export async function resolveCapScopeShakhaIds(client: SupabaseClient, shakhaId: string): Promise<string[]> {
  const { hierarchy_level } = await getOrgSettings();
  if (hierarchy_level === "shakha") return [shakhaId];

  const { data: shakha } = await client.from("shakhas").select("meghala_id").eq("id", shakhaId).single();
  if (!shakha?.meghala_id) return [shakhaId];

  if (hierarchy_level === "meghala") {
    const { data: siblings } = await client.from("shakhas").select("id").eq("meghala_id", shakha.meghala_id);
    return siblings?.length ? siblings.map((s) => s.id) : [shakhaId];
  }

  const { data: meghala } = await client.from("meghalas").select("diocese_id").eq("id", shakha.meghala_id).single();
  if (!meghala?.diocese_id) {
    const { data: siblings } = await client.from("shakhas").select("id").eq("meghala_id", shakha.meghala_id);
    return siblings?.length ? siblings.map((s) => s.id) : [shakhaId];
  }

  const { data: meghalasInDiocese } = await client.from("meghalas").select("id").eq("diocese_id", meghala.diocese_id);
  const meghalaIds = (meghalasInDiocese ?? []).map((m) => m.id);
  const { data: siblings } = await client.from("shakhas").select("id").in("meghala_id", meghalaIds);
  return siblings?.length ? siblings.map((s) => s.id) : [shakhaId];
}
