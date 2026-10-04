import { getOrgSettings } from "@/lib/org-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllIn } from "@/lib/fetch-all";

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
  return (await resolveCapScope(client, shakhaId)).shakhaIds;
}

// The cap scope plus its node's name. Team events field one team per scope,
// named after it (the shakha, meghala or diocese).
export interface CapScope { shakhaIds: string[]; name: string }

export async function resolveCapScope(client: SupabaseClient, shakhaId: string): Promise<CapScope> {
  const [{ hierarchy_level }, { data: shakha }] = await Promise.all([
    getOrgSettings(),
    client.from("shakhas").select("name, meghala_id").eq("id", shakhaId).single(),
  ]);
  const own: CapScope = { shakhaIds: [shakhaId], name: shakha?.name ?? "" };
  if (hierarchy_level === "shakha" || !shakha?.meghala_id) return own;
  const meghalaId: string = shakha.meghala_id;

  const meghalaScope = async (): Promise<CapScope> => {
    const [{ data: meghala }, { data: siblings }] = await Promise.all([
      client.from("meghalas").select("name").eq("id", meghalaId).single(),
      client.from("shakhas").select("id").eq("meghala_id", meghalaId),
    ]);
    return { shakhaIds: siblings?.length ? siblings.map((s) => s.id) : [shakhaId], name: meghala?.name ?? own.name };
  };
  if (hierarchy_level === "meghala") return meghalaScope();

  const { data: meghala } = await client.from("meghalas").select("diocese_id").eq("id", meghalaId).single();
  if (!meghala?.diocese_id) return meghalaScope();

  const [{ data: diocese }, { data: meghalasInDiocese }] = await Promise.all([
    client.from("dioceses").select("name").eq("id", meghala.diocese_id).single(),
    client.from("meghalas").select("id").eq("diocese_id", meghala.diocese_id),
  ]);
  const meghalaIds = (meghalasInDiocese ?? []).map((m) => m.id);
  const { data: siblings } = await client.from("shakhas").select("id").in("meghala_id", meghalaIds);
  return { shakhaIds: siblings?.length ? siblings.map((s) => s.id) : [shakhaId], name: diocese?.name ?? own.name };
}

// Each team event's team for one cap scope, with its member count. A scope
// fields one team per event; should two ever exist (an older import, or two
// first registrations racing), the oldest is the one people join.
export async function loadScopeTeams(
  client: SupabaseClient,
  feastCompetitionIds: string[],
  scopeShakhaIds: string[],
): Promise<Record<string, { id: string; members: number }>> {
  if (feastCompetitionIds.length === 0 || scopeShakhaIds.length === 0) return {};
  const { data } = await client
    .from("team_registrations")
    .select("id, feast_competition_id, created_at, team_registration_members(count)")
    .in("feast_competition_id", feastCompetitionIds)
    .in("shakha_id", scopeShakhaIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const teams: Record<string, { id: string; members: number }> = {};
  for (const t of data ?? []) {
    if (teams[t.feast_competition_id]) continue;
    const agg = Array.isArray(t.team_registration_members) ? t.team_registration_members[0] : t.team_registration_members;
    teams[t.feast_competition_id] = { id: t.id, members: (agg as { count?: number } | undefined)?.count ?? 0 };
  }
  return teams;
}

// Registrations per competition for one cap scope, filtered in the database
// (inner join on the participant's shakha). Reading every registration for
// the competitions and filtering in JS used to stop silently at 1000 rows —
// under-counting, and letting a shakha past its cap — and downloaded the
// whole fest's registrations to count a handful.
export async function countScopeRegistrations(
  client: SupabaseClient,
  feastCompetitionIds: string[],
  scopeShakhaIds: string[],
  excludeParticipantId?: string,
): Promise<Record<string, number>> {
  if (feastCompetitionIds.length === 0 || scopeShakhaIds.length === 0) return {};
  // Smaller id chunks: the shakha scope list shares the same URL.
  const { data } = await fetchAllIn(
    feastCompetitionIds,
    (ids, from, to) =>
      client
        .from("participant_registrations")
        .select("id, feast_competition_id, participant_id, participant:participants!inner(shakha_id)")
        .in("feast_competition_id", ids)
        .in("participant.shakha_id", scopeShakhaIds)
        .order("id")
        .range(from, to),
    60,
  );
  const counts: Record<string, number> = {};
  for (const r of data) {
    if (excludeParticipantId && r.participant_id === excludeParticipantId) continue;
    counts[r.feast_competition_id] = (counts[r.feast_competition_id] ?? 0) + 1;
  }
  return counts;
}
