// Team events, registered one person at a time from the normal registration
// form. Each cap scope (shakha, or meghala/diocese per
// org_settings.hierarchy_level — see resolveCapScope) fields one team per
// team event, named after the scope. The scope's first registration for the
// event creates the team; later ones join it, up to
// competitions.max_team_size (DEFAULT_MAX_TEAM_MEMBERS when unset).
//
// Server-only: writes through the service-role client. Import it from
// "use server" actions, never from a client component.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { loadScopeTeams, resolveCapScope } from "@/lib/reg-cap-scope";

interface TeamComp { feastId: string; name: string; max: number; published: boolean }

const UNIQUE_VIOLATION = "23505";

async function loadTeamComps(admin: SupabaseClient, ids: string[]): Promise<Map<string, TeamComp>> {
  const { data } = await admin
    .from("feast_competitions")
    .select("id, feast_id, result_status, competition:competitions(name, type, max_team_size)")
    .in("id", ids);
  const comps = new Map<string, TeamComp>();
  for (const fc of data ?? []) {
    const c = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    if (c?.type !== "group") continue;
    comps.set(fc.id, {
      feastId: fc.feast_id,
      name: c.name,
      max: c.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS,
      published: fc.result_status === "published",
    });
  }
  return comps;
}

async function memberCount(admin: SupabaseClient, teamId: string): Promise<number> {
  const { count } = await admin
    .from("team_registration_members")
    .select("id", { count: "exact", head: true })
    .eq("team_registration_id", teamId);
  return count ?? 0;
}

// Deletes the teams left with no members, unless a score is already
// recorded against one.
export async function pruneEmptyTeams(teamIds: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  const ids = [...new Set(teamIds)];
  if (ids.length === 0) return;
  const [{ data: withMembers }, { data: withResults }] = await Promise.all([
    admin.from("team_registration_members").select("team_registration_id").in("team_registration_id", ids),
    admin.from("team_results").select("team_registration_id").in("team_registration_id", ids),
  ]);
  const keep = new Set([...(withMembers ?? []), ...(withResults ?? [])].map((r) => r.team_registration_id));
  const empty = ids.filter((id) => !keep.has(id));
  if (empty.length > 0) await admin.from("team_registrations").delete().in("id", empty);
}

// Checks every picked team event before anything is written: it must be a
// team event of this fest, with room left in the scope's team. Returns the
// error to show, or `join`, which adds a participant (once they exist) to
// each team — creating the team on the scope's first registration. `join`
// undoes its own changes if any event fails.
export async function prepareTeamJoin(
  feastId: string,
  shakhaId: string,
  feastCompetitionIds: string[],
): Promise<{ error: string } | { join: (participantId: string) => Promise<{ error?: string }> }> {
  const ids = [...new Set(feastCompetitionIds)];
  if (ids.length === 0) return { join: async () => ({}) };

  const admin = getSupabaseAdmin();
  const [comps, scope] = await Promise.all([loadTeamComps(admin, ids), resolveCapScope(admin, shakhaId)]);
  if (ids.some((id) => comps.get(id)?.feastId !== feastId)) {
    return { error: "One of the selected team events isn't part of this fest." };
  }
  const existing = await loadScopeTeams(admin, ids, scope.shakhaIds);
  for (const id of ids) {
    const comp = comps.get(id)!;
    if ((existing[id]?.members ?? 0) >= comp.max) {
      return { error: `The ${scope.name} team for ${comp.name} is full (${comp.max} members). Deselect it to continue.` };
    }
  }

  async function joinOne(id: string, participantId: string, created: string[], joined: string[]): Promise<string | null> {
    const comp = comps.get(id)!;
    let teamId = existing[id]?.id;
    if (!teamId) {
      const { data: team, error } = await admin
        .from("team_registrations")
        .insert({ feast_id: feastId, feast_competition_id: id, shakha_id: shakhaId, team_name: scope.name })
        .select("id")
        .single();
      if (error && error.code !== UNIQUE_VIOLATION) return error.message;
      if (team) created.push(team.id);
      // Someone else in the scope may have created the team at the same
      // moment: everyone joins the oldest, and an empty extra goes.
      teamId = (await loadScopeTeams(admin, [id], scope.shakhaIds))[id]?.id;
      if (!teamId) return "Couldn't create the team. Please try again.";
    }

    const { data: member, error: memberErr } = await admin
      .from("team_registration_members")
      .insert({ team_registration_id: teamId, participant_id: participantId, feast_competition_id: id })
      .select("id")
      .single();
    if (memberErr) {
      if (memberErr.code === UNIQUE_VIOLATION) return null; // already on this event's team
      return memberErr.message;
    }
    joined.push(member.id);
    // Two registrations can pass the room check together; the later one
    // backs out rather than overfill the team.
    if ((await memberCount(admin, teamId)) > comp.max) {
      return `The ${scope.name} team for ${comp.name} filled up just now (${comp.max} members). Deselect it and try again.`;
    }
    return null;
  }

  return {
    join: async (participantId: string) => {
      const created: string[] = [];
      const joined: string[] = [];
      const errors = await Promise.all(ids.map((id) => joinOne(id, participantId, created, joined)));
      const error = errors.find((e) => e !== null);
      if (error) {
        if (joined.length > 0) await admin.from("team_registration_members").delete().in("id", joined);
        await pruneEmptyTeams(created);
        return { error };
      }
      // Drop any empty duplicate this call created while racing another.
      await pruneEmptyTeams(created);
      return {};
    },
  };
}

// Takes a participant off the given team events' teams, and deletes a team
// left empty. Refused once that event's results are published.
export async function leaveTeams(participantId: string, feastCompetitionIds: string[]): Promise<{ error?: string }> {
  const ids = [...new Set(feastCompetitionIds)];
  if (ids.length === 0) return {};
  const admin = getSupabaseAdmin();
  const [{ data: rows, error }, comps] = await Promise.all([
    admin
      .from("team_registration_members")
      .select("id, team_registration_id, feast_competition_id")
      .eq("participant_id", participantId)
      .in("feast_competition_id", ids),
    loadTeamComps(admin, ids),
  ]);
  if (error) return { error: error.message };
  const locked = (rows ?? []).map((r) => comps.get(r.feast_competition_id)).filter((c) => c?.published).map((c) => c!.name);
  if (locked.length > 0) {
    return { error: `Results for ${locked.join(", ")} are already published. Unpublish them first — this participant can't be removed from a published team.` };
  }
  if (!rows?.length) return {};
  const { error: delErr } = await admin.from("team_registration_members").delete().in("id", rows.map((r) => r.id));
  if (delErr) return { error: delErr.message };
  await pruneEmptyTeams(rows.map((r) => r.team_registration_id));
  return {};
}
