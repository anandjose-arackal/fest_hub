"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { resolveCapScopeShakhaIds } from "@/lib/reg-cap-scope";
import { recalcCompetitionProgress } from "@/actions/feast";
import type { CompStatus } from "@/types";

async function getMaxTeamSize(feastCompetitionId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("feast_competitions")
    .select("competition:competitions(max_team_size)")
    .eq("id", feastCompetitionId)
    .single();
  const competition = Array.isArray(data?.competition) ? data?.competition[0] : data?.competition;
  return competition?.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS;
}

export interface RegisterTeamInput {
  feastId: string;
  feastCompetitionId: string;
  shakhaId: string;
  teamName: string;
  participantIds: string[];
}

export async function registerTeam(input: RegisterTeamInput): Promise<{ error?: string; teamId?: string }> {
  const admin = getSupabaseAdmin();
  const teamName = input.teamName.trim();
  const participantIds = [...new Set(input.participantIds)];
  if (!teamName) return { error: "Team name is required." };
  if (participantIds.length === 0) return { error: "Select at least one member." };

  const { data: fc } = await admin
    .from("feast_competitions")
    .select("id, competition:competitions(type, max_team_size)")
    .eq("id", input.feastCompetitionId)
    .single();
  if (!fc) return { error: "Competition not found." };
  const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  if (competition?.type !== "group") return { error: "This competition does not accept team registrations." };

  const maxTeamMembers = competition?.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS;
  if (participantIds.length > maxTeamMembers) return { error: `Maximum ${maxTeamMembers} members allowed.` };

  // "One team per shakha" widens to "one team per meghala/diocese" at those
  // hierarchy_level tiers, same scope resolution as the individual-cap check
  // in actions/feast.ts — see resolveCapScopeShakhaIds.
  const scopeShakhaIds = await resolveCapScopeShakhaIds(admin, input.shakhaId);
  const { data: existingTeams } = await admin
    .from("team_registrations")
    .select("id")
    .eq("feast_competition_id", input.feastCompetitionId)
    .in("shakha_id", scopeShakhaIds);
  if (existingTeams?.length) return { error: "A team has already been registered for this competition." };

  const { data: members } = await admin
    .from("participants")
    .select("id, shakha_id, feast_id")
    .in("id", participantIds);
  const allBelong = (members ?? []).every((m) => m.shakha_id === input.shakhaId && m.feast_id === input.feastId);
  if (!allBelong || (members?.length ?? 0) !== participantIds.length) {
    return { error: "All members must belong to your Shakha." };
  }

  const { data: clashes } = await admin
    .from("team_registration_members")
    .select("participant_id")
    .eq("feast_competition_id", input.feastCompetitionId)
    .in("participant_id", participantIds);
  if ((clashes?.length ?? 0) > 0) {
    return { error: "One or more selected members are already on a team for this competition." };
  }

  const { data: team, error: teamErr } = await admin
    .from("team_registrations")
    .insert({
      feast_id: input.feastId,
      feast_competition_id: input.feastCompetitionId,
      shakha_id: input.shakhaId,
      team_name: teamName,
    })
    .select("id")
    .single();
  if (teamErr || !team) {
    if ((teamErr as { code?: string })?.code === "23505") {
      return { error: "Your Shakha has already registered a team for this competition." };
    }
    return { error: teamErr?.message || "Failed to create team." };
  }

  const { error: memberErr } = await admin.from("team_registration_members").insert(
    participantIds.map((pid) => ({
      team_registration_id: team.id,
      participant_id: pid,
      feast_competition_id: input.feastCompetitionId,
    }))
  );
  if (memberErr) {
    // Never leave a team with no/partial roster behind.
    await admin.from("team_registrations").delete().eq("id", team.id);
    return { error: memberErr.message };
  }

  return { teamId: team.id };
}

export interface UpdateTeamInput {
  teamId: string;
  teamName: string;
  participantIds: string[];
}

export async function updateTeam(input: UpdateTeamInput): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  const teamName = input.teamName.trim();
  const participantIds = [...new Set(input.participantIds)];
  if (!teamName) return { error: "Team name is required." };
  if (participantIds.length === 0) return { error: "Select at least one member." };

  const { data: team } = await admin
    .from("team_registrations")
    .select("id, feast_id, feast_competition_id, shakha_id")
    .eq("id", input.teamId)
    .single();
  if (!team) return { error: "Team not found." };

  const maxTeamMembers = await getMaxTeamSize(team.feast_competition_id);
  if (participantIds.length > maxTeamMembers) return { error: `Maximum ${maxTeamMembers} members allowed.` };

  const { data: members } = await admin
    .from("participants")
    .select("id, shakha_id, feast_id")
    .in("id", participantIds);
  const allBelong = (members ?? []).every((m) => m.shakha_id === team.shakha_id && m.feast_id === team.feast_id);
  if (!allBelong || (members?.length ?? 0) !== participantIds.length) {
    return { error: "All members must belong to the team's Shakha." };
  }

  const { data: clashes } = await admin
    .from("team_registration_members")
    .select("participant_id, team_registration_id")
    .eq("feast_competition_id", team.feast_competition_id)
    .in("participant_id", participantIds);
  const conflicting = (clashes ?? []).some((c) => c.team_registration_id !== team.id);
  if (conflicting) return { error: "One or more selected members are already on a team for this competition." };

  const { error: updateErr } = await admin
    .from("team_registrations")
    .update({ team_name: teamName, updated_at: new Date().toISOString() })
    .eq("id", team.id);
  if (updateErr) return { error: updateErr.message };

  // "Replace" semantics: matches the individual-registration edit flow.
  await admin.from("team_registration_members").delete().eq("team_registration_id", team.id);
  const { error: memberErr } = await admin.from("team_registration_members").insert(
    participantIds.map((pid) => ({
      team_registration_id: team.id,
      participant_id: pid,
      feast_competition_id: team.feast_competition_id,
    }))
  );
  if (memberErr) return { error: memberErr.message };

  return {};
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin().from("team_registrations").delete().eq("id", teamId);
  if (error) return { error: error.message };
  return {};
}

export async function setTeamParticipation(
  teamRegistrationId: string,
  participated: boolean
): Promise<{ error?: string; progressPct?: number | null; compStatus?: CompStatus }> {
  const admin = getSupabaseAdmin();
  const { data: team, error } = await admin
    .from("team_registrations")
    .update({ participated })
    .eq("id", teamRegistrationId)
    .select("feast_competition_id")
    .single();
  if (error || !team) return { error: error?.message || "Not found" };
  return recalcCompetitionProgress(team.feast_competition_id);
}

export async function setTeamChanceNo(teamRegistrationId: string, chanceNo: number | null): Promise<{ error?: string }> {
  if (chanceNo !== null && (!Number.isInteger(chanceNo) || chanceNo < 1 || chanceNo > 10000)) {
    return { error: "Chance number must be between 1 and 10000." };
  }
  const { error } = await getSupabaseAdmin()
    .from("team_registrations")
    .update({ chance_no: chanceNo })
    .eq("id", teamRegistrationId);
  if (error) return { error: error.message };
  return {};
}
