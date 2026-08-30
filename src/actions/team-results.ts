"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calcGrade, calcPositions, GROUP_GRADE_POINTS, GROUP_POSITION_POINTS, type Grade } from "@/lib/result-calculator";
import { rebuildStandings, type ScoreEntry, type DraftScore } from "@/actions/results";
import { TEAM_CATEGORY_SLUG } from "@/lib/feast-data";

export async function getTeamCompetitionScores(feastCompetitionId: string): Promise<ScoreEntry[]> {
  const { data } = await getSupabaseAdmin()
    .from("team_results")
    .select("team_registration_id, score, grade, position, total_points")
    .eq("feast_competition_id", feastCompetitionId);
  return (data ?? []).map((r) => ({
    registrationId: r.team_registration_id,
    score: Number(r.score),
    grade: r.grade as Grade,
    position: r.position,
    totalPoints: r.total_points,
  }));
}

export async function getScoresForTeamCompetitions(feastCompetitionIds: string[]): Promise<Record<string, ScoreEntry[]>> {
  if (feastCompetitionIds.length === 0) return {};
  const { data } = await getSupabaseAdmin()
    .from("team_results")
    .select("feast_competition_id, team_registration_id, score, grade, position, total_points")
    .in("feast_competition_id", feastCompetitionIds);
  const out: Record<string, ScoreEntry[]> = {};
  for (const r of data ?? []) {
    (out[r.feast_competition_id] ??= []).push({
      registrationId: r.team_registration_id,
      score: Number(r.score),
      grade: r.grade as Grade,
      position: r.position,
      totalPoints: r.total_points,
    });
  }
  return out;
}

export async function saveDraftTeamScores(input: {
  feastCompetitionId: string;
  scores: DraftScore[];
}): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  const rows = input.scores.map((s) => ({
    feast_competition_id: input.feastCompetitionId,
    team_registration_id: s.registrationId,
    score: s.score,
    grade: null,
    grade_points: 0,
    position: null,
    position_points: 0,
    total_points: 0,
    published_at: null,
  }));
  const { error } = await admin.from("team_results").upsert(rows, { onConflict: "team_registration_id" });
  if (error) return { error: error.message };
  return {};
}

export async function publishTeamResults(feastCompetitionId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: fc } = await admin
    .from("feast_competitions")
    .select("id, feast_id, max_score, competition:competitions(type)")
    .eq("id", feastCompetitionId)
    .single();
  if (!fc) return { error: "Competition not found." };
  const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  if (competition?.type !== "group") return { error: "This is not a team competition" };
  if (!fc.max_score) return { error: "Set max score before publishing" };

  const { data: draftRows } = await admin
    .from("team_results")
    .select("team_registration_id, score, team_registration:team_registrations(id, shakha_id)")
    .eq("feast_competition_id", feastCompetitionId);
  if (!draftRows || draftRows.length === 0) return { error: "No scores entered yet" };

  const entries = draftRows.map((r) => ({ id: r.team_registration_id, score: Number(r.score) }));
  const posMap = calcPositions(entries, GROUP_POSITION_POINTS);

  const calculated = draftRows.map((r) => {
    const { grade, gradePoints } = calcGrade(Number(r.score), fc.max_score!, GROUP_GRADE_POINTS);
    const pos = posMap.get(r.team_registration_id) ?? { position: null, positionPoints: 0 };
    return {
      feast_competition_id: feastCompetitionId,
      team_registration_id: r.team_registration_id,
      score: r.score,
      grade,
      grade_points: gradePoints,
      position: pos.position,
      position_points: pos.positionPoints,
      total_points: gradePoints + pos.positionPoints,
      published_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await admin.from("team_results").upsert(calculated, { onConflict: "team_registration_id" });
  if (upsertErr) return { error: upsertErr.message };

  await admin.from("shakha_point_ledger").delete().eq("feast_competition_id", feastCompetitionId);

  const ledgerRows = draftRows
    .map((r, i) => {
      const teamReg = Array.isArray(r.team_registration) ? r.team_registration[0] : r.team_registration;
      if (!teamReg?.shakha_id) return null;
      const calc = calculated[i];
      return {
        feast_id: fc.feast_id,
        feast_competition_id: feastCompetitionId,
        team_registration_id: r.team_registration_id,
        shakha_id: teamReg.shakha_id,
        category_slug: TEAM_CATEGORY_SLUG,
        score: r.score,
        grade: calc.grade,
        position: calc.position,
        grade_points: calc.grade_points,
        position_points: calc.position_points,
        total_points: calc.total_points,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (ledgerRows.length > 0) {
    const { error: ledgerErr } = await admin.from("shakha_point_ledger").insert(ledgerRows);
    if (ledgerErr) return { error: ledgerErr.message };
  }

  const rebuildErr = await rebuildStandings(fc.feast_id, admin);
  if (rebuildErr) return { error: rebuildErr };

  await admin.from("feast_competitions").update({ result_status: "published", comp_status: "published" }).eq("id", feastCompetitionId);
  return {};
}

export async function unpublishTeamResults(feastCompetitionId: string, feastId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  await admin
    .from("team_results")
    .update({ grade: null, grade_points: 0, position: null, position_points: 0, total_points: 0, published_at: null })
    .eq("feast_competition_id", feastCompetitionId);
  await admin.from("shakha_point_ledger").delete().eq("feast_competition_id", feastCompetitionId);
  await rebuildStandings(feastId, admin);
  const { error } = await admin
    .from("feast_competitions")
    .update({ result_status: "draft", comp_status: "completed" })
    .eq("id", feastCompetitionId);
  if (error) return { error: error.message };
  return {};
}

export async function getPublishedTeamResults(feastCompetitionId: string) {
  const { data } = await getSupabaseAdmin()
    .from("team_results")
    .select(
      "id, score, grade, position, total_points, team_registration:team_registrations(team_name, shakha:shakhas(name), team_registration_members(participant:participants(name)))"
    )
    .eq("feast_competition_id", feastCompetitionId)
    .not("published_at", "is", null);
  return data ?? [];
}
