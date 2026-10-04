"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TAG, expireTags } from "@/lib/cache-tags";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { countScopeRegistrations, resolveCapScopeShakhaIds } from "@/lib/reg-cap-scope";
import { leaveTeams, prepareTeamJoin, pruneEmptyTeams } from "@/lib/scope-teams";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { DEFAULT_MAX_PER_SHAKHA, formatRegNumber } from "@/lib/feast-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompStatus } from "@/types";

// ── shared helper ───────────────────────────────────────────────────────
// Returns the subset of feastCompetitionIds that are already at/over cap for
// shakhaId's cap scope (see resolveCapScopeShakhaIds above).
async function findFullCompetitionsForShakha(
  client: SupabaseClient,
  feastCompetitionIds: string[],
  shakhaId: string,
  excludeParticipantId?: string
): Promise<string[]> {
  if (feastCompetitionIds.length === 0) return [];

  // Scope and caps are independent; the count is filtered to the scope in
  // the database (see countScopeRegistrations) rather than read in full.
  const [scopeShakhaIds, { data: fcs }] = await Promise.all([
    resolveCapScopeShakhaIds(client, shakhaId),
    client.from("feast_competitions").select("id, competition:competitions(max_per_shakha)").in("id", feastCompetitionIds),
  ]);
  const counts = await countScopeRegistrations(client, feastCompetitionIds, scopeShakhaIds, excludeParticipantId);

  const capById = new Map<string, number>();
  for (const fc of fcs ?? []) {
    const comp = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    capById.set(fc.id, comp?.max_per_shakha ?? DEFAULT_MAX_PER_SHAKHA);
  }

  return feastCompetitionIds.filter(
    (id) => (counts[id] ?? 0) >= (capById.get(id) ?? DEFAULT_MAX_PER_SHAKHA)
  );
}

// ── registerParticipant — public-facing (Feast Portal) ──────────────────
export interface RegInput {
  feastSlug: string;
  shakhaId: string;
  name: string;
  houseName?: string;
  dob: string;
  gender: string;
  phone?: string;
  feastCompetitionIds: string[];
  // Team events to add this person to (their scope's team, created on its
  // first registration — see lib/scope-teams).
  teamCompetitionIds?: string[];
}
export type RegOutput = { regNo: string };
export type RegError = { error: string };

export async function registerParticipant(input: RegInput): Promise<RegOutput | RegError> {
  try {
    if (!isSupabaseConfigured) {
      const fakeNum = 100 + Math.floor(Math.random() * 900);
      return { regNo: `REG-0${fakeNum}` };
    }

    const { data: feast, error: feastErr } = await supabase
      .from("feasts")
      .select("id")
      .eq("slug", input.feastSlug)
      .single();
    if (feastErr || !feast) return { error: "Fest not found." };

    if (input.feastCompetitionIds.length > 0) {
      const full = await findFullCompetitionsForShakha(supabase, input.feastCompetitionIds, input.shakhaId);
      if (full.length > 0) {
        return {
          error: "The registration limit has been reached for one of the selected competitions. Please deselect it and choose another.",
        };
      }
    }

    const teamPlan = await prepareTeamJoin(feast.id, input.shakhaId, input.teamCompetitionIds ?? []);
    if ("error" in teamPlan) return { error: teamPlan.error };

    const categories = await fetchCompetitionCategories();
    const catSlug = getCategorySlug(input.dob, categories);
    const category = categories.find((c) => c.slug === catSlug);

    const { data: nextNum, error: rpcErr } = await supabase.rpc("next_reg_number", { p_feast_id: feast.id });
    if (rpcErr || nextNum == null) return { error: "Could not allocate a registration number." };

    const regNo = formatRegNumber(nextNum);

    const { data: participant, error: insertErr } = await supabase
      .from("participants")
      .insert({
        feast_id: feast.id,
        shakha_id: input.shakhaId,
        name: input.name,
        house_name: input.houseName || null,
        date_of_birth: input.dob,
        gender: input.gender,
        competition_category_id: category?.id ?? null,
        phone: input.phone || null,
        registration_number: regNo,
      })
      .select("id")
      .single();
    if (insertErr || !participant) return { error: "Something went wrong. Please try again." };

    if (input.feastCompetitionIds.length > 0) {
      const { error: regErr } = await supabase.from("participant_registrations").insert(
        input.feastCompetitionIds.map((fcId) => ({
          participant_id: participant.id,
          feast_competition_id: fcId,
        }))
      );
      if (regErr) console.error("[registerParticipant] registration insert failed:", regErr);
    }

    // All or nothing: if a team can't take them after all, the participant
    // is removed again so the form can be resubmitted without that event.
    const joined = await teamPlan.join(participant.id);
    if (joined.error) {
      await getSupabaseAdmin().from("participants").delete().eq("id", participant.id);
      return { error: joined.error };
    }

    return { regNo };
  } catch (err) {
    console.error("[registerParticipant]", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ── createParticipantAdmin — admin Participants page "Register" ─────────
export interface AdminRegInput {
  feastId: string;
  shakhaId: string;
  name: string;
  houseName?: string;
  dob: string;
  gender: string;
  phone?: string;
  feastCompetitionIds: string[];
  // Team events to add this person to — same scope teams as the portal's
  // registerParticipant (see lib/scope-teams).
  teamCompetitionIds?: string[];
}

export async function createParticipantAdmin(input: AdminRegInput): Promise<{ error?: string; regNo?: string; participantId?: string }> {
  try {
    const admin = getSupabaseAdmin();

    if (input.feastCompetitionIds.length > 0) {
      const full = await findFullCompetitionsForShakha(admin, input.feastCompetitionIds, input.shakhaId);
      if (full.length > 0) {
        return {
          error: "The registration limit has been reached for one of the selected competitions.",
        };
      }
    }

    const teamPlan = await prepareTeamJoin(input.feastId, input.shakhaId, input.teamCompetitionIds ?? []);
    if ("error" in teamPlan) return { error: teamPlan.error };

    const categories = await fetchCompetitionCategories();
    const catSlug = getCategorySlug(input.dob, categories);
    const category = categories.find((c) => c.slug === catSlug);

    const { data: nextNum, error: rpcErr } = await admin.rpc("next_reg_number", { p_feast_id: input.feastId });
    if (rpcErr || nextNum == null) return { error: "Could not allocate a registration number." };

    const regNo = formatRegNumber(nextNum);

    const { data: participant, error: insertErr } = await admin
      .from("participants")
      .insert({
        feast_id: input.feastId,
        shakha_id: input.shakhaId,
        name: input.name,
        house_name: input.houseName || null,
        date_of_birth: input.dob,
        gender: input.gender,
        competition_category_id: category?.id ?? null,
        phone: input.phone || null,
        registration_number: regNo,
      })
      .select("id")
      .single();
    if (insertErr || !participant) return { error: insertErr?.message || "Failed to create participant." };

    if (input.feastCompetitionIds.length > 0) {
      const { error: regErr } = await admin.from("participant_registrations").insert(
        input.feastCompetitionIds.map((fcId) => ({
          participant_id: participant.id,
          feast_competition_id: fcId,
        }))
      );
      if (regErr) return { error: regErr.message };
    }

    // All or nothing, as in registerParticipant.
    const joined = await teamPlan.join(participant.id);
    if (joined.error) {
      await admin.from("participants").delete().eq("id", participant.id);
      return { error: joined.error };
    }

    return { regNo, participantId: participant.id };
  } catch (err) {
    console.error("[createParticipantAdmin]", err);
    return { error: "Something went wrong." };
  }
}

// ── updateParticipant — admin edit ───────────────────────────────────────
export interface UpdateInput {
  participantId: string;
  name: string;
  houseName?: string;
  dob: string;
  gender: string;
  phone?: string;
  feastCompetitionIds: string[];
  // Team events this participant should be on. Omitted = leave their teams
  // as they are (the admin Participants page manages teams separately).
  teamCompetitionIds?: string[];
}

export async function updateParticipant(input: UpdateInput): Promise<{ error?: string }> {
  try {
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("participants")
      .select("shakha_id, feast_id")
      .eq("id", input.participantId)
      .single();
    if (!existing) return { error: "Participant not found." };

    // Diff, don't replace: competition_results and shakha_point_ledger cascade
    // on participant_registrations delete, so dropping and re-inserting every
    // registration wiped this participant's scores on any edit (even a name
    // fix) and left the other entries' published positions with a hole —
    // 2nd missing, the real 3rd stuck at no position. Registrations still
    // selected keep their id (and with it score, chance_no, participated).
    const { data: currentRegs, error: currentErr } = await admin
      .from("participant_registrations")
      .select(REG_WITH_RESULT_SELECT)
      .eq("participant_id", input.participantId);
    if (currentErr) return { error: currentErr.message };

    const wanted = new Set(input.feastCompetitionIds);
    const removed = (currentRegs ?? []).filter((r) => !wanted.has(r.feast_competition_id));
    const lockedError = publishedResultError(removed, "removed from");
    if (lockedError) return { error: lockedError };
    const kept = new Set((currentRegs ?? []).map((r) => r.feast_competition_id));
    const added = input.feastCompetitionIds.filter((id) => !kept.has(id));

    if (input.feastCompetitionIds.length > 0 && existing.shakha_id) {
      const full = await findFullCompetitionsForShakha(
        admin,
        input.feastCompetitionIds,
        existing.shakha_id,
        input.participantId
      );
      if (full.length > 0) {
        return { error: "The registration limit has been reached for one of the selected competitions." };
      }
    }

    // Team events diff the same way. The teams to join must have room
    // before anything is written.
    let teamJoin: ((participantId: string) => Promise<{ error?: string }>) | null = null;
    let teamsToLeave: string[] = [];
    if (input.teamCompetitionIds) {
      const { data: currentTeams } = await admin
        .from("team_registration_members")
        .select("feast_competition_id")
        .eq("participant_id", input.participantId);
      const onTeams = new Set((currentTeams ?? []).map((t) => t.feast_competition_id));
      const wantedTeams = new Set(input.teamCompetitionIds);
      teamsToLeave = [...onTeams].filter((id) => !wantedTeams.has(id));
      const teamsToJoin = [...wantedTeams].filter((id) => !onTeams.has(id));
      if (teamsToJoin.length > 0) {
        if (!existing.shakha_id) return { error: "This participant has no Shakha, so they can't join a team." };
        const prepared = await prepareTeamJoin(existing.feast_id, existing.shakha_id, teamsToJoin);
        if ("error" in prepared) return { error: prepared.error };
        teamJoin = prepared.join;
      }
    }
    // Checks for published team results before removing anything, so a
    // refusal here leaves the participant untouched.
    const leaveResult = await leaveTeams(input.participantId, teamsToLeave);
    if (leaveResult.error) return { error: leaveResult.error };

    const categories = await fetchCompetitionCategories();
    const catSlug = getCategorySlug(input.dob, categories);
    const category = categories.find((c) => c.slug === catSlug);

    const { error: updateErr } = await admin
      .from("participants")
      .update({
        name: input.name,
        house_name: input.houseName || null,
        date_of_birth: input.dob,
        gender: input.gender,
        competition_category_id: category?.id ?? null,
        phone: input.phone || null,
      })
      .eq("id", input.participantId);
    if (updateErr) return { error: updateErr.message };

    if (removed.length > 0) {
      const { error: delErr } = await admin
        .from("participant_registrations")
        .delete()
        .in("id", removed.map((r) => r.id));
      if (delErr) return { error: delErr.message };
    }

    if (added.length > 0) {
      const { error: regErr } = await admin.from("participant_registrations").insert(
        added.map((fcId) => ({
          participant_id: input.participantId,
          feast_competition_id: fcId,
        }))
      );
      if (regErr) return { error: regErr.message };
    }

    if (teamJoin) {
      const joinResult = await teamJoin(input.participantId);
      if (joinResult.error) return { error: joinResult.error };
    }

    // Names/houses/shakhas show on published results.
    expireTags(TAG.results);
    return {};
  } catch (err) {
    console.error("[updateParticipant]", err);
    return { error: "Something went wrong." };
  }
}

export async function deleteParticipant(participantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: regs, error: regsErr } = await admin
    .from("participant_registrations")
    .select(REG_WITH_RESULT_SELECT)
    .eq("participant_id", participantId);
  if (regsErr) return { error: regsErr.message };
  const lockedError = publishedResultError(regs ?? [], "deleted from");
  if (lockedError) return { error: lockedError };

  const { data: teams } = await admin.from("team_registration_members").select("team_registration_id").eq("participant_id", participantId);
  const { error } = await admin.from("participants").delete().eq("id", participantId);
  if (error) return { error: error.message };
  // Their memberships cascade away; a team left with nobody goes too.
  await pruneEmptyTeams((teams ?? []).map((t) => t.team_registration_id));
  return {};
}

// Deleting a registration cascades away its competition_results and
// shakha_point_ledger rows. For a published result that silently breaks the
// competition's published positions and standings, so it's refused until the
// competition is unpublished (republishing afterwards recalculates both).
const REG_WITH_RESULT_SELECT =
  "id, feast_competition_id, competition_results(published_at), feast_competition:feast_competitions(competition:competitions(name))";

interface RegWithResult {
  id: string;
  feast_competition_id: string;
  competition_results: { published_at: string | null } | { published_at: string | null }[] | null;
  feast_competition: { competition: { name: string } | { name: string }[] | null } | { competition: { name: string } | { name: string }[] | null }[] | null;
}

function publishedResultError(regs: RegWithResult[], verb: string): string | null {
  const names = regs
    .filter((r) => {
      const result = Array.isArray(r.competition_results) ? r.competition_results[0] : r.competition_results;
      return !!result?.published_at;
    })
    .map((r) => {
      const fc = Array.isArray(r.feast_competition) ? r.feast_competition[0] : r.feast_competition;
      const competition = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
      return competition?.name ?? "a competition";
    });
  if (names.length === 0) return null;
  return `Results for ${names.join(", ")} are already published. Unpublish them first — this participant can't be ${verb} a published competition.`;
}

// ── attendance / progress ────────────────────────────────────────────────
export async function setParticipation(
  registrationId: string,
  participated: boolean
): Promise<{ error?: string; progressPct?: number | null; compStatus?: CompStatus }> {
  const admin = getSupabaseAdmin();
  const { data: reg, error } = await admin
    .from("participant_registrations")
    .update({ participated })
    .eq("id", registrationId)
    .select("feast_competition_id")
    .single();
  if (error || !reg) return { error: error?.message || "Not found" };
  return recalcCompetitionProgress(reg.feast_competition_id);
}

// Exported — reused by team.ts's setTeamParticipation.
export async function recalcCompetitionProgress(
  feastCompetitionId: string
): Promise<{ error?: string; progressPct?: number | null; compStatus?: CompStatus }> {
  const admin = getSupabaseAdmin();

  const { data: fc } = await admin
    .from("feast_competitions")
    .select("comp_status, competition:competitions(type)")
    .eq("id", feastCompetitionId)
    .single();
  if (!fc) return { error: "Competition not found." };
  if (fc.comp_status === "published") return { progressPct: null, compStatus: "published" };

  const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  const table = competition?.type === "group" ? "team_registrations" : "participant_registrations";

  const { data: rows } = await admin
    .from(table)
    .select("participated, chance_no")
    .eq("feast_competition_id", feastCompetitionId);

  const withChance = (rows ?? []).filter((r) => r.chance_no != null);
  if (withChance.length === 0) return { progressPct: null, compStatus: fc.comp_status };

  const participatedCount = withChance.filter((r) => r.participated).length;
  const progressPct = Math.min(100, Math.round((participatedCount / withChance.length) * 100));
  const compStatus: CompStatus = progressPct >= 100 ? "completed" : "progressing";

  await admin.from("feast_competitions").update({ progress_pct: progressPct, comp_status: compStatus }).eq("id", feastCompetitionId);

  return { progressPct, compStatus };
}

export async function setChanceNo(registrationId: string, chanceNo: number | null): Promise<{ error?: string }> {
  if (chanceNo !== null && (!Number.isInteger(chanceNo) || chanceNo < 1 || chanceNo > 10000)) {
    return { error: "Chance number must be between 1 and 10000." };
  }
  const { error } = await getSupabaseAdmin()
    .from("participant_registrations")
    .update({ chance_no: chanceNo })
    .eq("id", registrationId);
  if (error) return { error: error.message };
  return {};
}

// ── live status board ────────────────────────────────────────────────────
export interface CompStatusInput {
  feastCompetitionId: string;
  compStatus: CompStatus;
  stageId?: string | null;
  scheduledTime?: string | null;
  progressPct?: number | null;
  info?: string | null;
}

export async function updateCompetitionStatus(input: CompStatusInput): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin()
    .from("feast_competitions")
    .update({
      comp_status: input.compStatus,
      stage_id: input.stageId ?? null,
      scheduled_time: input.scheduledTime ?? null,
      progress_pct: input.compStatus === "progressing" ? input.progressPct ?? null : null,
      info: input.info ?? null,
    })
    .eq("id", input.feastCompetitionId);
  if (error) return { error: error.message };
  // Status changes drive the landing page's live-updates feed.
  expireTags(TAG.results);
  return {};
}
