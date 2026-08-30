"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calcGrade, calcPositions, DEFAULT_GRADE_POINTS, DEFAULT_POSITION_POINTS, type Grade } from "@/lib/result-calculator";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StandingsRow {
  shakhaId: string;
  shakhaName: string;
  subJuniorPoints: number;
  juniorPoints: number;
  seniorPoints: number;
  superSeniorPoints: number;
  elderPoints: number;
  teamPoints: number;
  grandTotal: number;
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
  aGradeCount: number;
  bGradeCount: number;
  cGradeCount: number;
  rank: number | null;
}

const STANDINGS_SELECT =
  "rank, shakha_id, sub_junior_points, junior_points, senior_points, super_senior_points, elder_points, team_points, grand_total, first_place_count, second_place_count, third_place_count, a_grade_count, b_grade_count, c_grade_count, shakha:shakhas(name)";

function mapStandingsRow(r: {
  rank: number | null;
  shakha_id: string;
  sub_junior_points: number;
  junior_points: number;
  senior_points: number;
  super_senior_points: number;
  elder_points: number;
  team_points: number;
  grand_total: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  a_grade_count: number;
  b_grade_count: number;
  c_grade_count: number;
  shakha: { name: string } | { name: string }[] | null;
}): StandingsRow {
  const shakha = Array.isArray(r.shakha) ? r.shakha[0] : r.shakha;
  return {
    shakhaId: r.shakha_id,
    shakhaName: shakha?.name ?? "—",
    subJuniorPoints: r.sub_junior_points,
    juniorPoints: r.junior_points,
    seniorPoints: r.senior_points,
    superSeniorPoints: r.super_senior_points,
    elderPoints: r.elder_points,
    teamPoints: r.team_points,
    grandTotal: r.grand_total,
    firstPlaceCount: r.first_place_count,
    secondPlaceCount: r.second_place_count,
    thirdPlaceCount: r.third_place_count,
    aGradeCount: r.a_grade_count,
    bGradeCount: r.b_grade_count,
    cGradeCount: r.c_grade_count,
    rank: r.rank,
  };
}

// shakha_feast_standings has no RLS policy at all, so these admin reads must
// go through the service-role client — a direct client-side query would
// silently return zero rows.
export async function getFeastStandings(feastId: string): Promise<StandingsRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("shakha_feast_standings")
    .select(STANDINGS_SELECT)
    .eq("feast_id", feastId)
    .order("rank", { ascending: true, nullsFirst: false });
  return (data ?? []).map(mapStandingsRow);
}

export async function getOverallStandings(): Promise<StandingsRow[]> {
  const { data } = await getSupabaseAdmin().from("shakha_feast_standings").select(STANDINGS_SELECT);
  const bucket = new Map<string, StandingsRow>();
  for (const raw of data ?? []) {
    const row = mapStandingsRow(raw);
    const existing = bucket.get(row.shakhaId);
    if (!existing) {
      bucket.set(row.shakhaId, { ...row, rank: null });
      continue;
    }
    existing.subJuniorPoints += row.subJuniorPoints;
    existing.juniorPoints += row.juniorPoints;
    existing.seniorPoints += row.seniorPoints;
    existing.superSeniorPoints += row.superSeniorPoints;
    existing.elderPoints += row.elderPoints;
    existing.teamPoints += row.teamPoints;
    existing.grandTotal += row.grandTotal;
    existing.firstPlaceCount += row.firstPlaceCount;
    existing.secondPlaceCount += row.secondPlaceCount;
    existing.thirdPlaceCount += row.thirdPlaceCount;
    existing.aGradeCount += row.aGradeCount;
    existing.bGradeCount += row.bGradeCount;
    existing.cGradeCount += row.cGradeCount;
  }
  const rows = [...bucket.values()].sort(
    (a, b) => b.grandTotal - a.grandTotal || a.shakhaName.localeCompare(b.shakhaName)
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ── public leaderboard (Rankings screen) ─────────────────────────────────
export interface LeaderboardRow {
  shakhaId: string;
  name: string;
  rank: number;
  points: number;
  subJunior: number;
  junior: number;
  senior: number;
  superSenior: number;
  elder: number;
  firstCount: number;
  secondCount: number;
  thirdCount: number;
  aGrade: number;
  bGrade: number;
  cGrade: number;
}

function toLeaderboardRow(r: StandingsRow, rank: number): LeaderboardRow {
  return {
    shakhaId: r.shakhaId,
    name: r.shakhaName,
    rank,
    points: r.grandTotal,
    subJunior: r.subJuniorPoints,
    junior: r.juniorPoints,
    senior: r.seniorPoints,
    superSenior: r.superSeniorPoints,
    elder: r.elderPoints,
    firstCount: r.firstPlaceCount,
    secondCount: r.secondPlaceCount,
    thirdCount: r.thirdPlaceCount,
    aGrade: r.aGradeCount,
    bGrade: r.bGradeCount,
    cGrade: r.cGradeCount,
  };
}

// Public-facing (Rankings screen). shakha_feast_standings has no RLS, so
// this still goes through the admin client, same as the standings actions
// above — "public" here just means "no auth required to call", not a
// client-side-queryable table.
export async function getLeaderboard(feastSlug: string): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: feast, error: feastErr } = await admin.from("feasts").select("id").eq("slug", feastSlug).single();
  if (feastErr || !feast) return { error: feastErr?.message ?? "Feast not found" };
  const rows = await getFeastStandings(feast.id);
  return { data: rows.map((r, i) => toLeaderboardRow(r, r.rank ?? i + 1)) };
}

export async function getOverallLeaderboard(): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  const rows = await getOverallStandings();
  return { data: rows.map((r, i) => toLeaderboardRow(r, r.rank ?? i + 1)) };
}

// ── score entry / publishing ──────────────────────────────────────────────
export async function setMaxScore(feastCompetitionId: string, maxScore: number): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin()
    .from("feast_competitions")
    .update({ max_score: maxScore })
    .eq("id", feastCompetitionId);
  if (error) return { error: error.message };
  return {};
}

export interface ScoreEntry {
  registrationId: string;
  score: number;
  grade: Grade;
  position: number | null;
  totalPoints: number;
}

export async function getCompetitionScores(feastCompetitionId: string): Promise<ScoreEntry[]> {
  const { data } = await getSupabaseAdmin()
    .from("competition_results")
    .select("participant_registration_id, score, grade, position, total_points")
    .eq("feast_competition_id", feastCompetitionId);
  return (data ?? []).map((r) => ({
    registrationId: r.participant_registration_id,
    score: Number(r.score),
    grade: r.grade as Grade,
    position: r.position,
    totalPoints: r.total_points,
  }));
}

export async function getScoresForCompetitions(feastCompetitionIds: string[]): Promise<Record<string, ScoreEntry[]>> {
  if (feastCompetitionIds.length === 0) return {};
  const { data } = await getSupabaseAdmin()
    .from("competition_results")
    .select("feast_competition_id, participant_registration_id, score, grade, position, total_points")
    .in("feast_competition_id", feastCompetitionIds);
  const out: Record<string, ScoreEntry[]> = {};
  for (const r of data ?? []) {
    (out[r.feast_competition_id] ??= []).push({
      registrationId: r.participant_registration_id,
      score: Number(r.score),
      grade: r.grade as Grade,
      position: r.position,
      totalPoints: r.total_points,
    });
  }
  return out;
}

export async function getPublishedResults(feastCompetitionId: string) {
  const { data } = await getSupabaseAdmin()
    .from("competition_results")
    .select(
      "id, score, grade, position, total_points, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(name)))"
    )
    .eq("feast_competition_id", feastCompetitionId)
    .not("published_at", "is", null);
  return data ?? [];
}

export interface DraftScore { registrationId: string; score: number; }

export async function saveDraftScores(input: {
  feastCompetitionId: string;
  scores: DraftScore[];
}): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  const rows = input.scores.map((s) => ({
    feast_competition_id: input.feastCompetitionId,
    participant_registration_id: s.registrationId,
    score: s.score,
    grade: null,
    grade_points: 0,
    position: null,
    position_points: 0,
    total_points: 0,
    published_at: null,
  }));
  const { error } = await admin.from("competition_results").upsert(rows, { onConflict: "participant_registration_id" });
  if (error) return { error: error.message };
  return {};
}

export async function publishResults(feastCompetitionId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: fc } = await admin
    .from("feast_competitions")
    .select("id, feast_id, max_score, competition:competitions(competition_category:competition_categories(slug))")
    .eq("id", feastCompetitionId)
    .single();
  if (!fc) return { error: "Competition not found." };
  if (!fc.max_score) return { error: "Set max score before publishing" };

  const { data: draftRows } = await admin
    .from("competition_results")
    .select("id, participant_registration_id, score, participant_registration:participant_registrations(participant:participants(id, shakha_id))")
    .eq("feast_competition_id", feastCompetitionId);
  if (!draftRows || draftRows.length === 0) return { error: "No scores entered yet" };

  const entries = draftRows.map((r) => ({ id: r.participant_registration_id, score: Number(r.score) }));
  const posMap = calcPositions(entries, DEFAULT_POSITION_POINTS);

  const calculated = draftRows.map((r) => {
    const { grade, gradePoints } = calcGrade(Number(r.score), fc.max_score!, DEFAULT_GRADE_POINTS);
    const pos = posMap.get(r.participant_registration_id) ?? { position: null, positionPoints: 0 };
    return {
      feast_competition_id: feastCompetitionId,
      participant_registration_id: r.participant_registration_id,
      score: r.score,
      grade,
      grade_points: gradePoints,
      position: pos.position,
      position_points: pos.positionPoints,
      total_points: gradePoints + pos.positionPoints,
      published_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await admin
    .from("competition_results")
    .upsert(calculated, { onConflict: "participant_registration_id" });
  if (upsertErr) return { error: upsertErr.message };

  await admin.from("shakha_point_ledger").delete().eq("feast_competition_id", feastCompetitionId);

  const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  const category = Array.isArray(competition?.competition_category)
    ? competition?.competition_category[0]
    : competition?.competition_category;
  const categorySlug = category?.slug ?? "unknown";

  const ledgerRows = draftRows
    .map((r, i) => {
      const participantReg = Array.isArray(r.participant_registration) ? r.participant_registration[0] : r.participant_registration;
      const participant = Array.isArray(participantReg?.participant) ? participantReg?.participant[0] : participantReg?.participant;
      if (!participant?.id || !participant?.shakha_id) return null;
      const calc = calculated[i];
      return {
        feast_id: fc.feast_id,
        feast_competition_id: feastCompetitionId,
        participant_registration_id: r.participant_registration_id,
        participant_id: participant.id,
        shakha_id: participant.shakha_id,
        category_slug: categorySlug,
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

export async function unpublishResults(feastCompetitionId: string, feastId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  await admin
    .from("competition_results")
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

const BUCKETS: Record<string, keyof Pick<
  StandingsRow,
  "subJuniorPoints" | "juniorPoints" | "seniorPoints" | "superSeniorPoints" | "elderPoints"
>> = {
  sub_junior: "subJuniorPoints",
  junior: "juniorPoints",
  senior: "seniorPoints",
  super_senior: "superSeniorPoints",
  elder: "elderPoints",
};

// Exported — shared by team-results.ts so individual + team publishing feed
// into one unified standings rebuild.
export async function rebuildStandings(feastId: string, admin: SupabaseClient): Promise<string | null> {
  const { data: shakhas, error: shakhaErr } = await admin.from("shakhas").select("id, name");
  if (shakhaErr) return shakhaErr.message;

  const { data: ledger, error: ledgerErr } = await admin
    .from("shakha_point_ledger")
    .select("shakha_id, category_slug, position, grade, total_points")
    .eq("feast_id", feastId);
  if (ledgerErr) return ledgerErr.message;

  interface Agg {
    subJuniorPoints: number; juniorPoints: number; seniorPoints: number; superSeniorPoints: number;
    elderPoints: number; teamPoints: number; firstPlaceCount: number; secondPlaceCount: number;
    thirdPlaceCount: number; aGradeCount: number; bGradeCount: number; cGradeCount: number;
  }
  const empty = (): Agg => ({
    subJuniorPoints: 0, juniorPoints: 0, seniorPoints: 0, superSeniorPoints: 0, elderPoints: 0, teamPoints: 0,
    firstPlaceCount: 0, secondPlaceCount: 0, thirdPlaceCount: 0, aGradeCount: 0, bGradeCount: 0, cGradeCount: 0,
  });

  const byShakha = new Map<string, Agg>();
  for (const s of shakhas ?? []) byShakha.set(s.id, empty());

  for (const row of ledger ?? []) {
    const agg = byShakha.get(row.shakha_id) ?? empty();
    if (row.category_slug === "team") agg.teamPoints += row.total_points;
    else {
      const key = BUCKETS[row.category_slug];
      if (key) agg[key] += row.total_points;
    }
    if (row.position === 1) agg.firstPlaceCount++;
    else if (row.position === 2) agg.secondPlaceCount++;
    else if (row.position === 3) agg.thirdPlaceCount++;
    if (row.grade === "A") agg.aGradeCount++;
    else if (row.grade === "B") agg.bGradeCount++;
    else if (row.grade === "C") agg.cGradeCount++;
    byShakha.set(row.shakha_id, agg);
  }

  const rows = (shakhas ?? []).map((s) => {
    const agg = byShakha.get(s.id) ?? empty();
    const grandTotal =
      agg.subJuniorPoints + agg.juniorPoints + agg.seniorPoints + agg.superSeniorPoints + agg.elderPoints + agg.teamPoints;
    return { shakhaId: s.id, shakhaName: s.name, ...agg, grandTotal };
  });

  rows.sort(
    (a, b) =>
      b.grandTotal - a.grandTotal ||
      b.firstPlaceCount - a.firstPlaceCount ||
      b.aGradeCount - a.aGradeCount ||
      b.juniorPoints - a.juniorPoints ||
      a.shakhaName.localeCompare(b.shakhaName)
  );

  const upsertRows = rows.map((r, i) => ({
    feast_id: feastId,
    shakha_id: r.shakhaId,
    sub_junior_points: r.subJuniorPoints,
    junior_points: r.juniorPoints,
    senior_points: r.seniorPoints,
    super_senior_points: r.superSeniorPoints,
    elder_points: r.elderPoints,
    team_points: r.teamPoints,
    grand_total: r.grandTotal,
    first_place_count: r.firstPlaceCount,
    second_place_count: r.secondPlaceCount,
    third_place_count: r.thirdPlaceCount,
    a_grade_count: r.aGradeCount,
    b_grade_count: r.bGradeCount,
    c_grade_count: r.cGradeCount,
    rank: i + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await admin
    .from("shakha_feast_standings")
    .upsert(upsertRows, { onConflict: "feast_id,shakha_id" });
  if (upsertErr) return upsertErr.message;

  return null;
}

// ── external feasts (played outside the app; points entered by hand) ──────
// shakha_feast_standings is normally derived from shakha_point_ledger via
// rebuildStandings(). An external feast has no competitions/ledger rows to
// derive from, so this writes its standings row directly — grand_total is
// the only real number, category buckets stay 0 (they show as "—" in the
// standings UI, same as any shakha with no points in that bucket).
export async function saveExternalFeastPoints(
  feastId: string,
  rows: { shakhaId: string; points: number }[]
): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: feast, error: feastErr } = await admin.from("feasts").select("is_external").eq("id", feastId).single();
  if (feastErr || !feast) return { error: feastErr?.message ?? "Feast not found" };
  if (!feast.is_external) return { error: "This feast isn't marked as external." };

  const sorted = [...rows].sort((a, b) => b.points - a.points);
  const upsertRows = sorted.map((r, i) => ({
    feast_id: feastId,
    shakha_id: r.shakhaId,
    sub_junior_points: 0,
    junior_points: 0,
    senior_points: 0,
    super_senior_points: 0,
    elder_points: 0,
    team_points: 0,
    grand_total: r.points,
    first_place_count: 0,
    second_place_count: 0,
    third_place_count: 0,
    a_grade_count: 0,
    b_grade_count: 0,
    c_grade_count: 0,
    rank: i + 1,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("shakha_feast_standings").upsert(upsertRows, { onConflict: "feast_id,shakha_id" });
  if (error) return { error: error.message };
  return {};
}

// ── public reads (screen / search) ────────────────────────────────────────
export interface ParticipantSearchRow {
  participantId: string;
  name: string;
  houseName: string | null;
  shakha: string;
  regNo: string;
  category: string | null;
  results: {
    competitionId: string;
    competitionName: string;
    grade: "A" | "B" | "C" | null;
    position: number | null;
    totalPoints: number;
    isPublished: boolean;
  }[];
}

export async function searchParticipantResults(
  feastSlug: string,
  query: string
): Promise<{ data?: ParticipantSearchRow[]; error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: feast, error: feastErr } = await admin.from("feasts").select("id").eq("slug", feastSlug).single();
  if (feastErr || !feast) return { error: feastErr?.message ?? "Feast not found" };

  const { data, error } = await admin
    .from("participants")
    .select(
      "id, name, house_name, registration_number, competition_category:competition_categories(slug), shakha:shakhas(name), participant_registrations(id, feast_competition:feast_competitions(id, competition:competitions(name)), competition_results(grade, position, total_points, published_at))"
    )
    .eq("feast_id", feast.id)
    .ilike("name", `%${query}%`)
    .limit(25);
  if (error) return { error: error.message };

  const rows: ParticipantSearchRow[] = (data ?? []).map((p) => {
    const shakha = Array.isArray(p.shakha) ? p.shakha[0] : p.shakha;
    const cat = Array.isArray(p.competition_category) ? p.competition_category[0] : p.competition_category;
    const results = (p.participant_registrations ?? []).map((reg) => {
      const fc = Array.isArray(reg.feast_competition) ? reg.feast_competition[0] : reg.feast_competition;
      const competition = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
      const result = Array.isArray(reg.competition_results) ? reg.competition_results[0] : reg.competition_results;
      return {
        competitionId: fc?.id ?? "",
        competitionName: competition?.name ?? "—",
        grade: (result?.grade as "A" | "B" | "C" | null) ?? null,
        position: result?.position ?? null,
        totalPoints: result?.total_points ?? 0,
        isPublished: !!result?.published_at,
      };
    });
    return {
      participantId: p.id,
      name: p.name,
      houseName: p.house_name,
      shakha: shakha?.name ?? "—",
      regNo: p.registration_number ?? "",
      category: cat?.slug ?? null,
      results,
    };
  });

  return { data: rows };
}

// ── /screen big-display data ──────────────────────────────────────────────
export interface ScreenAchiever { name: string; houseName: string | null; shakha: string; }
export interface ScreenPosition { place: 1 | 2 | 3; name: string; houseName: string | null; shakha: string; photoUrl: string | null; }
export interface ScreenCompetitionResult {
  competitionId: string;
  competitionName: string;
  categoryName: string;
  categorySlug: string;
  positions: ScreenPosition[];
  grades: { A: ScreenAchiever[]; B: ScreenAchiever[]; C: ScreenAchiever[] };
}
export interface ScreenData { competitions: ScreenCompetitionResult[] }

// Decision #2: no per-participant photo pipeline exists yet, so unlike the
// source app (which hardcoded one specific prod Supabase storage file as a
// 100%-of-the-time fallback), positions[].photoUrl is always null here —
// the UI shows its generic placeholder silhouette instead.
export async function getScreenData(feastSlug: string): Promise<{ data?: ScreenData; error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: feast, error: feastErr } = await admin.from("feasts").select("id").eq("slug", feastSlug).single();
  if (feastErr || !feast) return { error: feastErr?.message ?? "Feast not found" };

  const { data: fcs, error: fcErr } = await admin
    .from("feast_competitions")
    .select("id, competition:competitions(name, competition_category:competition_categories(name, slug))")
    .eq("feast_id", feast.id)
    .eq("result_status", "published")
    .order("display_order");
  if (fcErr) return { error: fcErr.message };
  if (!fcs || fcs.length === 0) return { data: { competitions: [] } };

  const { data: results, error: resErr } = await admin
    .from("competition_results")
    .select("feast_competition_id, grade, position, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(name)))")
    .in("feast_competition_id", fcs.map((f) => f.id))
    .not("published_at", "is", null);
  if (resErr) return { error: resErr.message };

  const byFc = new Map<string, typeof results>();
  for (const r of results ?? []) {
    (byFc.get(r.feast_competition_id) ?? byFc.set(r.feast_competition_id, []).get(r.feast_competition_id)!).push(r);
  }

  const competitions: ScreenCompetitionResult[] = [];
  for (const fc of fcs) {
    const rows = byFc.get(fc.id) ?? [];
    if (rows.length === 0) continue;
    const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    const category = Array.isArray(competition?.competition_category) ? competition?.competition_category[0] : competition?.competition_category;

    const positions: ScreenPosition[] = [];
    const grades: { A: ScreenAchiever[]; B: ScreenAchiever[]; C: ScreenAchiever[] } = { A: [], B: [], C: [] };

    for (const r of rows) {
      const partReg = Array.isArray(r.participant_registration) ? r.participant_registration[0] : r.participant_registration;
      const participant = Array.isArray(partReg?.participant) ? partReg?.participant[0] : partReg?.participant;
      const shakha = Array.isArray(participant?.shakha) ? participant?.shakha[0] : participant?.shakha;
      if (!participant) continue;
      const entry = { name: participant.name, houseName: participant.house_name, shakha: shakha?.name ?? "—" };

      if (r.position != null && r.position >= 1 && r.position <= 3) {
        positions.push({ place: r.position as 1 | 2 | 3, ...entry, photoUrl: null });
      }
      const grade = r.grade as "A" | "B" | "C" | null;
      if (grade === "A" || grade === "B" || grade === "C") {
        grades[grade].push(entry);
      }
    }

    if (positions.length === 0 && grades.A.length === 0 && grades.B.length === 0 && grades.C.length === 0) continue;

    competitions.push({
      competitionId: fc.id,
      competitionName: competition?.name ?? "Competition",
      categoryName: category?.name ?? "",
      categorySlug: category?.slug ?? "",
      positions: positions.sort((a, b) => a.place - b.place),
      grades,
    });
  }

  return { data: { competitions } };
}
