"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveCapScopeShakhaIds } from "@/lib/reg-cap-scope";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { DEFAULT_MAX_PER_SHAKHA, getRegPrefix } from "@/lib/feast-data";
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

  const scopeShakhaIds = new Set(await resolveCapScopeShakhaIds(client, shakhaId));

  const { data: regs } = await client
    .from("participant_registrations")
    .select("feast_competition_id, participant_id, participant:participants!inner(shakha_id)")
    .in("feast_competition_id", feastCompetitionIds);

  const { data: fcs } = await client
    .from("feast_competitions")
    .select("id, competition:competitions(max_per_shakha)")
    .in("id", feastCompetitionIds);

  const capById = new Map<string, number>();
  for (const fc of fcs ?? []) {
    const comp = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    capById.set(fc.id, comp?.max_per_shakha ?? DEFAULT_MAX_PER_SHAKHA);
  }

  const countById = new Map<string, number>();
  for (const r of regs ?? []) {
    const participant = Array.isArray(r.participant) ? r.participant[0] : r.participant;
    if (!participant?.shakha_id || !scopeShakhaIds.has(participant.shakha_id)) continue;
    if (excludeParticipantId && r.participant_id === excludeParticipantId) continue;
    countById.set(r.feast_competition_id, (countById.get(r.feast_competition_id) ?? 0) + 1);
  }

  return feastCompetitionIds.filter(
    (id) => (countById.get(id) ?? 0) >= (capById.get(id) ?? DEFAULT_MAX_PER_SHAKHA)
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

    const categories = await fetchCompetitionCategories();
    const catSlug = getCategorySlug(input.dob, categories);
    const category = categories.find((c) => c.slug === catSlug);

    const { data: nextNum, error: rpcErr } = await supabase.rpc("next_reg_number", { p_feast_id: feast.id });
    if (rpcErr || nextNum == null) return { error: "Could not allocate a registration number." };

    const regNo = `${getRegPrefix(feast.id)}-${nextNum}`;

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

    const categories = await fetchCompetitionCategories();
    const catSlug = getCategorySlug(input.dob, categories);
    const category = categories.find((c) => c.slug === catSlug);

    const { data: nextNum, error: rpcErr } = await admin.rpc("next_reg_number", { p_feast_id: input.feastId });
    if (rpcErr || nextNum == null) return { error: "Could not allocate a registration number." };

    const regNo = `${getRegPrefix(input.feastId)}-${nextNum}`;

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
}

export async function updateParticipant(input: UpdateInput): Promise<{ error?: string }> {
  try {
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("participants")
      .select("shakha_id")
      .eq("id", input.participantId)
      .single();
    if (!existing) return { error: "Participant not found." };

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

    // "Replace" semantics: delete all existing registrations, re-insert the
    // new selected set — matches the source app's edit flow.
    await admin.from("participant_registrations").delete().eq("participant_id", input.participantId);

    if (input.feastCompetitionIds.length > 0) {
      const { error: regErr } = await admin.from("participant_registrations").insert(
        input.feastCompetitionIds.map((fcId) => ({
          participant_id: input.participantId,
          feast_competition_id: fcId,
        }))
      );
      if (regErr) return { error: regErr.message };
    }

    return {};
  } catch (err) {
    console.error("[updateParticipant]", err);
    return { error: "Something went wrong." };
  }
}

export async function deleteParticipant(participantId: string): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin().from("participants").delete().eq("id", participantId);
  if (error) return { error: error.message };
  return {};
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
  return {};
}
