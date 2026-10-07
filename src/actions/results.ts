"use server";

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchAll, fetchAllIn } from "@/lib/fetch-all";
import { TAG, TTL, expireTags } from "@/lib/cache-tags";
import { calcGrade, calcPositions, DEFAULT_GRADE_POINTS, DEFAULT_POSITION_POINTS, NO_GRADE_POINTS, NO_POSITION_POINTS, type Grade } from "@/lib/result-calculator";
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
  const admin = getSupabaseAdmin();
  const { data } = await fetchAll((from, to) =>
    admin.from("shakha_feast_standings").select(STANDINGS_SELECT).order("id").range(from, to)
  );
  const bucket = new Map<string, StandingsRow>();
  for (const raw of data) {
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

// Public-facing (Rankings screen, landing widgets, /screen). The fest is
// matched by slug through an inner join, so this is one round trip instead
// of slug→id then standings.
const STANDINGS_BY_SLUG_SELECT =
  "rank, shakha_id, sub_junior_points, junior_points, senior_points, super_senior_points, elder_points, team_points, grand_total, first_place_count, second_place_count, third_place_count, a_grade_count, b_grade_count, c_grade_count, shakha:shakhas(name), feast:feasts!inner(slug)";

async function readFeastStandingsBySlug(feastSlug: string): Promise<StandingsRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("shakha_feast_standings")
    .select(STANDINGS_BY_SLUG_SELECT)
    .eq("feast.slug", feastSlug)
    .order("rank", { ascending: true, nullsFirst: false });
  return (data ?? []).map(mapStandingsRow);
}

type LeaderboardTier = "shakha" | "meghala" | "diocese";

// Shared by every viewer: one database read per publish (the standings tag
// is expired by rebuildStandings) instead of one per phone refresh.
const cachedLeaderboard = unstable_cache(
  async (scope: "feast" | "overall", tier: LeaderboardTier, feastSlug: string): Promise<LeaderboardRow[]> => {
    if (tier === "shakha") {
      const rows = scope === "overall" ? await getOverallStandings() : await readFeastStandingsBySlug(feastSlug);
      return rows.map((r, i) => toLeaderboardRow(r, r.rank ?? i + 1));
    }
    const [rows, groupMap] = await Promise.all([
      scope === "overall" ? getOverallStandings() : readFeastStandingsBySlug(feastSlug),
      getShakhaGroupMap(tier),
    ]);
    return groupStandingsRows(rows, groupMap).map((r, i) => toLeaderboardRowFromGroup(r, r.rank ?? i + 1));
  },
  ["fp-leaderboard"],
  { tags: [TAG.standings, TAG.hierarchy], revalidate: TTL.standard },
);

export async function getLeaderboard(feastSlug: string): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("feast", "shakha", feastSlug) };
}

export async function getOverallLeaderboard(): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("overall", "shakha", "") };
}

// ── Meghala/Diocese rollups (optional org hierarchy) ─────────────────────
// Computed on read by rolling the existing shakha_feast_standings rows up
// through shakhas.meghala_id / meghalas.diocese_id — no new ledger/
// standings tables, no changes to rebuildStandings' write path above. A
// shakha with no meghala_id (or a meghala with no diocese_id, for a
// diocese rollup) buckets into a surfaced "__unassigned__" group sorted
// last, rather than silently dropping its points — that keeps a
// misconfigured shakha (never assigned under the org's chosen hierarchy)
// visible instead of invisible in the grouped report.
export interface GroupStandingsRow {
  groupId: string;
  groupName: string;
  memberShakhaIds: string[];
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

const UNASSIGNED_GROUP = { id: "__unassigned__", name: "Unassigned" };

async function getShakhaGroupMap(level: "meghala" | "diocese"): Promise<Map<string, { id: string; name: string }>> {
  const admin = getSupabaseAdmin();
  const map = new Map<string, { id: string; name: string }>();

  if (level === "meghala") {
    const { data } = await admin.from("shakhas").select("id, meghala:meghalas(id, name)");
    for (const row of (data ?? []) as unknown as { id: string; meghala: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
      const m = Array.isArray(row.meghala) ? row.meghala[0] : row.meghala;
      map.set(row.id, m ? { id: m.id, name: m.name } : UNASSIGNED_GROUP);
    }
    return map;
  }

  const { data } = await admin
    .from("shakhas")
    .select("id, meghala:meghalas(diocese:dioceses(id, name))");
  for (const row of (data ?? []) as unknown as {
    id: string;
    meghala: { diocese: { id: string; name: string } | { id: string; name: string }[] | null } | { diocese: { id: string; name: string } | { id: string; name: string }[] | null }[] | null;
  }[]) {
    const m = Array.isArray(row.meghala) ? row.meghala[0] : row.meghala;
    const d = m ? (Array.isArray(m.diocese) ? m.diocese[0] : m.diocese) : null;
    map.set(row.id, d ? { id: d.id, name: d.name } : UNASSIGNED_GROUP);
  }
  return map;
}

function groupStandingsRows(rows: StandingsRow[], groupMap: Map<string, { id: string; name: string }>): GroupStandingsRow[] {
  const buckets = new Map<string, GroupStandingsRow>();
  for (const r of rows) {
    const g = groupMap.get(r.shakhaId) ?? UNASSIGNED_GROUP;
    let bucket = buckets.get(g.id);
    if (!bucket) {
      bucket = {
        groupId: g.id,
        groupName: g.name,
        memberShakhaIds: [],
        subJuniorPoints: 0,
        juniorPoints: 0,
        seniorPoints: 0,
        superSeniorPoints: 0,
        elderPoints: 0,
        teamPoints: 0,
        grandTotal: 0,
        firstPlaceCount: 0,
        secondPlaceCount: 0,
        thirdPlaceCount: 0,
        aGradeCount: 0,
        bGradeCount: 0,
        cGradeCount: 0,
        rank: null,
      };
      buckets.set(g.id, bucket);
    }
    bucket.memberShakhaIds.push(r.shakhaId);
    bucket.subJuniorPoints += r.subJuniorPoints;
    bucket.juniorPoints += r.juniorPoints;
    bucket.seniorPoints += r.seniorPoints;
    bucket.superSeniorPoints += r.superSeniorPoints;
    bucket.elderPoints += r.elderPoints;
    bucket.teamPoints += r.teamPoints;
    bucket.grandTotal += r.grandTotal;
    bucket.firstPlaceCount += r.firstPlaceCount;
    bucket.secondPlaceCount += r.secondPlaceCount;
    bucket.thirdPlaceCount += r.thirdPlaceCount;
    bucket.aGradeCount += r.aGradeCount;
    bucket.bGradeCount += r.bGradeCount;
    bucket.cGradeCount += r.cGradeCount;
  }

  const list = [...buckets.values()].sort((a, b) => {
    if (a.groupId === UNASSIGNED_GROUP.id) return 1;
    if (b.groupId === UNASSIGNED_GROUP.id) return -1;
    return b.grandTotal - a.grandTotal || a.groupName.localeCompare(b.groupName);
  });
  list.forEach((g, i) => {
    if (g.groupId !== UNASSIGNED_GROUP.id) g.rank = i + 1;
  });
  return list;
}

export async function getMeghalaStandings(feastId: string): Promise<GroupStandingsRow[]> {
  const [rows, groupMap] = await Promise.all([getFeastStandings(feastId), getShakhaGroupMap("meghala")]);
  return groupStandingsRows(rows, groupMap);
}

export async function getDioceseStandings(feastId: string): Promise<GroupStandingsRow[]> {
  const [rows, groupMap] = await Promise.all([getFeastStandings(feastId), getShakhaGroupMap("diocese")]);
  return groupStandingsRows(rows, groupMap);
}

export async function getOverallMeghalaStandings(): Promise<GroupStandingsRow[]> {
  const [rows, groupMap] = await Promise.all([getOverallStandings(), getShakhaGroupMap("meghala")]);
  return groupStandingsRows(rows, groupMap);
}

export async function getOverallDioceseStandings(): Promise<GroupStandingsRow[]> {
  const [rows, groupMap] = await Promise.all([getOverallStandings(), getShakhaGroupMap("diocese")]);
  return groupStandingsRows(rows, groupMap);
}

function toLeaderboardRowFromGroup(r: GroupStandingsRow, rank: number): LeaderboardRow {
  return {
    shakhaId: r.groupId,
    name: r.groupName,
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

export async function getMeghalaLeaderboard(feastSlug: string): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("feast", "meghala", feastSlug) };
}

export async function getDioceseLeaderboard(feastSlug: string): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("feast", "diocese", feastSlug) };
}

export async function getOverallMeghalaLeaderboard(): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("overall", "meghala", "") };
}

export async function getOverallDioceseLeaderboard(): Promise<{ data?: LeaderboardRow[]; error?: string }> {
  return { data: await cachedLeaderboard("overall", "diocese", "") };
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
  const admin = getSupabaseAdmin();
  const { data } = await fetchAllIn(feastCompetitionIds, (ids, from, to) =>
    admin
      .from("competition_results")
      .select("feast_competition_id, participant_registration_id, score, grade, position, total_points")
      .in("feast_competition_id", ids)
      .order("id")
      .range(from, to)
  );
  const out: Record<string, ScoreEntry[]> = {};
  for (const r of data) {
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

const cachedPublishedResults = unstable_cache(
  async (feastCompetitionId: string) => {
    const { data } = await getSupabaseAdmin()
      .from("competition_results")
      .select(
        "id, score, grade, position, total_points, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(name, meghala:meghalas(name))))"
      )
      .eq("feast_competition_id", feastCompetitionId)
      .not("published_at", "is", null);
    return data ?? [];
  },
  ["fp-published-results"],
  { tags: [TAG.results, TAG.hierarchy], revalidate: TTL.standard },
);

export async function getPublishedResults(feastCompetitionId: string) {
  return cachedPublishedResults(feastCompetitionId);
}

// Most recently published result among the given feast competitions —
// drives the public Results screen's "Latest result" card. Read-only; checks
// both individual and team results since either table can hold the newest.
export async function getLatestPublishedCompetition(
  feastCompetitionIds: string[],
): Promise<{ feastCompetitionId: string; publishedAt: string } | null> {
  if (feastCompetitionIds.length === 0) return null;
  return cachedLatestPublished([...feastCompetitionIds].sort());
}

const cachedLatestPublished = unstable_cache(
  async (feastCompetitionIds: string[]) => readLatestPublished(feastCompetitionIds),
  ["fp-latest-published"],
  { tags: [TAG.results], revalidate: TTL.standard },
);

async function readLatestPublished(feastCompetitionIds: string[]): Promise<{ feastCompetitionId: string; publishedAt: string } | null> {
  const admin = getSupabaseAdmin();
  const latest = (table: "competition_results" | "team_results") =>
    admin
      .from(table)
      .select("feast_competition_id, published_at")
      .in("feast_competition_id", feastCompetitionIds)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  const [ind, team] = await Promise.all([latest("competition_results"), latest("team_results")]);
  const picks = [ind.data, team.data].filter((r): r is { feast_competition_id: string; published_at: string } => !!r?.published_at);
  if (picks.length === 0) return null;
  picks.sort((a, b) => b.published_at.localeCompare(a.published_at));
  return { feastCompetitionId: picks[0].feast_competition_id, publishedAt: picks[0].published_at };
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

  // The competition row (with its fest's external flag) and the draft scores
  // are independent reads — fetch them together.
  const [{ data: fc }, { data: draftRows }] = await Promise.all([
    admin
      .from("feast_competitions")
      .select("id, feast_id, max_score, feast:feasts(is_external), competition:competitions(competition_category:competition_categories(slug))")
      .eq("id", feastCompetitionId)
      .single(),
    admin
      .from("competition_results")
      .select("id, participant_registration_id, score, participant_registration:participant_registrations(participant:participants(id, shakha_id))")
      .eq("feast_competition_id", feastCompetitionId),
  ]);
  if (!fc) return { error: "Competition not found." };
  if (!fc.max_score) return { error: "Set max score before publishing" };
  if (!draftRows || draftRows.length === 0) return { error: "No scores entered yet" };

  // External feast: grade/position still published (winners), points stay 0.
  const fcFeast = Array.isArray(fc.feast) ? fc.feast[0] : fc.feast;
  const external = !!fcFeast?.is_external;
  const entries = draftRows.map((r) => ({ id: r.participant_registration_id, score: Number(r.score) }));
  const posMap = calcPositions(entries, external ? NO_POSITION_POINTS : DEFAULT_POSITION_POINTS);

  const calculated = draftRows.map((r) => {
    const { grade, gradePoints } = calcGrade(Number(r.score), fc.max_score!, external ? NO_GRADE_POINTS : DEFAULT_GRADE_POINTS);
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

  const ledgerRows = (external ? [] : draftRows)
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

  const [rebuildErr] = await Promise.all([
    rebuildStandings(fc.feast_id, admin, external),
    admin.from("feast_competitions").update({ result_status: "published", comp_status: "published" }).eq("id", feastCompetitionId),
  ]);
  expireTags(TAG.results);
  if (rebuildErr) return { error: rebuildErr };
  return {};
}

export async function unpublishResults(feastCompetitionId: string, feastId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  // Clearing the results and dropping their ledger rows touch different
  // tables — run them together, then rebuild once both are done.
  await Promise.all([
    admin
      .from("competition_results")
      .update({ grade: null, grade_points: 0, position: null, position_points: 0, total_points: 0, published_at: null })
      .eq("feast_competition_id", feastCompetitionId),
    admin.from("shakha_point_ledger").delete().eq("feast_competition_id", feastCompetitionId),
  ]);
  const [, { error }] = await Promise.all([
    rebuildStandings(feastId, admin),
    admin.from("feast_competitions").update({ result_status: "draft", comp_status: "completed" }).eq("id", feastCompetitionId),
  ]);
  expireTags(TAG.results);
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

// An external feast's points were calculated outside the app: its
// standings are what an admin typed into /admin/feasts/[id]/external-points
// (saveExternalFeastPoints), and its published results carry grade/position
// only — no points, no ledger rows. Publishing must never sum them again.
export async function isExternalFeast(feastId: string, admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("feasts").select("is_external").eq("id", feastId).single();
  return !!data?.is_external;
}

// Exported — shared by team-results.ts so individual + team publishing feed
// into one unified standings rebuild. A no-op for an external feast, whose
// standings are entered by hand instead.
// `knownExternal` lets a caller that already read the fest's flag skip the
// lookup. The ledger is paged: a fest with more than 1000 published entries
// would otherwise be summed from a silently truncated list.
export async function rebuildStandings(feastId: string, admin: SupabaseClient, knownExternal?: boolean): Promise<string | null> {
  if (knownExternal ?? (await isExternalFeast(feastId, admin))) return null;

  const [{ data: shakhas, error: shakhaErr }, { data: ledger, error: ledgerErr }] = await Promise.all([
    admin.from("shakhas").select("id, name"),
    fetchAll((from, to) =>
      admin
        .from("shakha_point_ledger")
        .select("shakha_id, category_slug, position, grade, total_points")
        .eq("feast_id", feastId)
        .order("id")
        .range(from, to)
    ),
  ]);
  if (shakhaErr) return shakhaErr.message;
  if (ledgerErr) return ledgerErr;

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
  expireTags(TAG.standings);
  if (upsertErr) return upsertErr.message;

  return null;
}

// ── external feasts (points calculated outside the app; entered by hand) ──
// shakha_feast_standings is normally derived from shakha_point_ledger via
// rebuildStandings(). An external feast's points come from outside — it may
// have no competitions at all, or competitions whose results are published
// here for grade/position only (no points, no ledger rows; see
// isExternalFeast) — so this writes its standings row directly: the
// hand-entered age-category (and team) points, grand_total = their sum.
// Place/grade counts stay 0.
export interface ExternalFeastPointsRow {
  shakhaId: string;
  subJunior: number;
  junior: number;
  senior: number;
  superSenior: number;
  elder: number;
  team: number;
}

export async function saveExternalFeastPoints(feastId: string, rows: ExternalFeastPointsRow[]): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: feast, error: feastErr } = await admin.from("feasts").select("is_external").eq("id", feastId).single();
  if (feastErr || !feast) return { error: feastErr?.message ?? "Fest not found" };
  if (!feast.is_external) return { error: "This feast isn't marked as external." };

  const withTotals = rows.map((r) => ({ ...r, total: r.subJunior + r.junior + r.senior + r.superSenior + r.elder + r.team }));
  const sorted = withTotals.sort((a, b) => b.total - a.total);
  const upsertRows = sorted.map((r, i) => ({
    feast_id: feastId,
    shakha_id: r.shakhaId,
    sub_junior_points: r.subJunior,
    junior_points: r.junior,
    senior_points: r.senior,
    super_senior_points: r.superSenior,
    elder_points: r.elder,
    team_points: r.team,
    grand_total: r.total,
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
  expireTags(TAG.standings);
  if (error) return { error: error.message };
  return {};
}

// ── public reads (screen / search) ────────────────────────────────────────
export interface ParticipantSearchRow {
  participantId: string;
  name: string;
  houseName: string | null;
  shakha: string;
  meghalaName: string | null;
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
  // Matches name, house name or registration number. Characters that are
  // syntax in a PostgREST or() filter (",", "(", ")") or LIKE wildcards are
  // dropped from the term rather than escaped.
  const term = query.replace(/[,()*%_\\"]/g, " ").replace(/\s+/g, " ").trim();
  if (!term) return { data: [] };
  const { data, error } = await getSupabaseAdmin()
    .from("participants")
    .select(
      "id, name, house_name, registration_number, feast:feasts!inner(slug), competition_category:competition_categories(slug), shakha:shakhas(name, meghala:meghalas(name)), participant_registrations(id, feast_competition:feast_competitions(id, competition:competitions(name)), competition_results(grade, position, total_points, published_at))"
    )
    .eq("feast.slug", feastSlug)
    .or(`name.ilike.%${term}%,house_name.ilike.%${term}%,registration_number.ilike.%${term}%`)
    .limit(25);
  if (error) return { error: error.message };

  const rows: ParticipantSearchRow[] = (data ?? []).map((p) => {
    const shakha = Array.isArray(p.shakha) ? p.shakha[0] : p.shakha;
    const shakhaMeghala = Array.isArray(shakha?.meghala) ? shakha?.meghala[0] : shakha?.meghala;
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
      meghalaName: shakhaMeghala?.name ?? null,
      regNo: p.registration_number ?? "",
      category: cat?.slug ?? null,
      results,
    };
  });

  return { data: rows };
}

// ── Results for one top-level group (Search → "Results by …") ─────────────
// Every published place and grade won by one shakha, meghala or diocese
// (whichever org_settings.hierarchy_level is), item by item.
export type GroupLevel = "shakha" | "meghala" | "diocese";

export interface GroupResultEntry {
  id: string;
  name: string;
  houseName: string | null; // team entries: the members, comma-separated
  shakha: string;
  position: number | null;
  grade: "A" | "B" | "C" | null;
  totalPoints: number;
  isTeam: boolean;
}

export interface GroupResultCompetition {
  feastCompetitionId: string;
  name: string;
  categorySlug: string | null;
  gender: string | null;
  isTeam: boolean;
  entries: GroupResultEntry[];
}

export async function getGroupResults(
  feastSlug: string,
  level: GroupLevel,
  groupId: string,
): Promise<{ data?: GroupResultCompetition[]; error?: string }> {
  if (!feastSlug || !groupId || !["shakha", "meghala", "diocese"].includes(level)) return { error: "Unknown group." };
  try {
    return { data: await cachedGroupResults(feastSlug, level, groupId) };
  } catch (err) {
    console.error("[getGroupResults]", err);
    return { error: "Couldn't load results. Please try again." };
  }
}

const cachedGroupResults = unstable_cache(
  async (feastSlug: string, level: GroupLevel, groupId: string) => readGroupResults(feastSlug, level, groupId),
  ["fp-group-results"],
  { tags: [TAG.results, TAG.hierarchy], revalidate: TTL.standard },
);

async function groupShakhaIds(admin: SupabaseClient, level: GroupLevel, groupId: string): Promise<string[]> {
  if (level === "shakha") return [groupId];
  if (level === "meghala") {
    const { data } = await admin.from("shakhas").select("id").eq("meghala_id", groupId);
    return (data ?? []).map((s) => s.id);
  }
  const { data: meghalas } = await admin.from("meghalas").select("id").eq("diocese_id", groupId);
  const meghalaIds = (meghalas ?? []).map((m) => m.id);
  if (meghalaIds.length === 0) return [];
  const { data } = await admin.from("shakhas").select("id").in("meghala_id", meghalaIds);
  return (data ?? []).map((s) => s.id);
}

const CATEGORY_ORDER = ["sub_junior", "junior", "senior", "super_senior", "elder"];
const GENDER_ORDER: Record<string, number> = { girl: 0, boy: 1 };

async function readGroupResults(feastSlug: string, level: GroupLevel, groupId: string): Promise<GroupResultCompetition[]> {
  const admin = getSupabaseAdmin();
  const [shakhaIds, { data: fcs, error: fcErr }] = await Promise.all([
    groupShakhaIds(admin, level, groupId),
    admin
      .from("feast_competitions")
      .select("id, display_order, feast:feasts!inner(slug), competition:competitions(name, type, gender, competition_category:competition_categories(slug))")
      .eq("feast.slug", feastSlug)
      .eq("result_status", "published"),
  ]);
  if (fcErr) throw new Error(fcErr.message);
  if (shakhaIds.length === 0 || !fcs?.length) return [];
  const fcIds = fcs.map((f) => f.id);

  // Filtered to the group's shakhas in the database (inner joins), paged
  // past the 1000-row cap. Small id chunks: the shakha list shares the URL.
  const [indiv, team] = await Promise.all([
    fetchAllIn(
      fcIds,
      (ids, from, to) =>
        admin
          .from("competition_results")
          .select("id, feast_competition_id, grade, position, total_points, participant_registration:participant_registrations!inner(participant:participants!inner(name, house_name, shakha_id, shakha:shakhas(name)))")
          .in("feast_competition_id", ids)
          .in("participant_registration.participant.shakha_id", shakhaIds)
          .not("published_at", "is", null)
          .order("id")
          .range(from, to),
      30,
    ),
    fetchAllIn(
      fcIds,
      (ids, from, to) =>
        admin
          .from("team_results")
          .select("id, feast_competition_id, grade, position, total_points, team_registration:team_registrations!inner(team_name, shakha_id, shakha:shakhas(name), team_registration_members(participant:participants(name)))")
          .in("feast_competition_id", ids)
          .in("team_registration.shakha_id", shakhaIds)
          .not("published_at", "is", null)
          .order("id")
          .range(from, to),
      30,
    ),
  ]);
  if (indiv.error) throw new Error(indiv.error);
  if (team.error) throw new Error(team.error);

  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);
  const byComp = new Map<string, GroupResultEntry[]>();
  const add = (fcId: string, e: GroupResultEntry) => {
    // Only entries that won something: a place, a grade, or both.
    if (e.position == null && e.grade == null) return;
    byComp.set(fcId, [...(byComp.get(fcId) ?? []), e]);
  };

  for (const r of indiv.data) {
    const participant = one(one(r.participant_registration)?.participant);
    add(r.feast_competition_id, {
      id: r.id,
      name: participant?.name ?? "—",
      houseName: participant?.house_name ?? null,
      shakha: one(participant?.shakha)?.name ?? "—",
      position: r.position,
      grade: r.grade as Grade | null,
      totalPoints: r.total_points ?? 0,
      isTeam: false,
    });
  }
  for (const r of team.data) {
    const t = one(r.team_registration);
    const members = (t?.team_registration_members ?? []).map((m) => one(m.participant)?.name).filter(Boolean);
    add(r.feast_competition_id, {
      id: r.id,
      name: t?.team_name ?? "Team",
      houseName: members.join(", ") || null,
      shakha: one(t?.shakha)?.name ?? "—",
      position: r.position,
      grade: r.grade as Grade | null,
      totalPoints: r.total_points ?? 0,
      isTeam: true,
    });
  }

  const gradeRank = (g: string | null) => (g === "A" ? 0 : g === "B" ? 1 : g === "C" ? 2 : 3);
  const comps: { comp: GroupResultCompetition; order: number }[] = [];
  for (const fc of fcs) {
    const entries = byComp.get(fc.id);
    if (!entries?.length) continue;
    const c = one(fc.competition);
    const isTeam = c?.type === "group";
    entries.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || gradeRank(a.grade) - gradeRank(b.grade) || a.name.localeCompare(b.name));
    comps.push({
      comp: {
        feastCompetitionId: fc.id,
        name: c?.name ?? "—",
        categorySlug: isTeam ? null : one(c?.competition_category)?.slug ?? null,
        gender: c?.gender ?? null,
        isTeam,
        entries,
      },
      order: fc.display_order ?? 0,
    });
  }
  // Age group (team events last), then girls before boys, then the fest's own order.
  const catRank = (x: GroupResultCompetition) => (x.isTeam ? 99 : CATEGORY_ORDER.indexOf(x.categorySlug ?? "") + 1 || 50);
  comps.sort((a, b) =>
    catRank(a.comp) - catRank(b.comp) ||
    (GENDER_ORDER[a.comp.gender ?? ""] ?? 2) - (GENDER_ORDER[b.comp.gender ?? ""] ?? 2) ||
    a.order - b.order ||
    a.comp.name.localeCompare(b.comp.name),
  );
  return comps.map((x) => x.comp);
}

// ── /screen big-display data ──────────────────────────────────────────────
// For a team entry `name` is the team name and `houseName` its members.
export interface ScreenAchiever { name: string; houseName: string | null; shakha: string; meghalaName: string | null; }
export interface ScreenPosition extends ScreenAchiever { place: 1 | 2 | 3; }
export interface ScreenCompetitionResult {
  competitionId: string;
  competitionName: string;
  categoryName: string;
  categorySlug: string;
  gender: string | null;
  isTeam: boolean;
  positions: ScreenPosition[];
  grades: { A: ScreenAchiever[]; B: ScreenAchiever[]; C: ScreenAchiever[] };
}
export interface ScreenData { competitions: ScreenCompetitionResult[] }

// Individual and team results alike, in running order.
// Every /screen display polls this; cached so a hall full of screens (and
// the public results it mirrors) costs one read per publish.
export async function getScreenData(feastSlug: string): Promise<{ data?: ScreenData; error?: string }> {
  return cachedScreenData(feastSlug);
}

const cachedScreenData = unstable_cache(
  async (feastSlug: string) => readScreenData(feastSlug),
  // v3: entries carry `gender` and `isTeam`, and team results are included;
  // the bump keeps older cached shapes out.
  ["fp-screen-data-v3"],
  { tags: [TAG.results, TAG.hierarchy], revalidate: TTL.live },
);

async function readScreenData(feastSlug: string): Promise<{ data?: ScreenData; error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: fcs, error: fcErr } = await admin
    .from("feast_competitions")
    .select("id, feast:feasts!inner(slug), competition:competitions(name, gender, type, competition_category:competition_categories(name, slug))")
    .eq("feast.slug", feastSlug)
    .eq("result_status", "published")
    .order("display_order");
  if (fcErr) return { error: fcErr.message };
  if (!fcs || fcs.length === 0) return { data: { competitions: [] } };

  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);
  const ids = fcs.map((f) => f.id);
  const [individual, team] = await Promise.all([
    fetchAllIn(ids, (chunk, from, to) =>
      admin
        .from("competition_results")
        .select("id, feast_competition_id, grade, position, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(name, meghala:meghalas(name))))")
        .in("feast_competition_id", chunk)
        .not("published_at", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchAllIn(ids, (chunk, from, to) =>
      admin
        .from("team_results")
        .select("id, feast_competition_id, grade, position, team_registration:team_registrations(team_name, shakha:shakhas(name, meghala:meghalas(name)), team_registration_members(participant:participants(name)))")
        .in("feast_competition_id", chunk)
        .not("published_at", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);
  if (individual.error) return { error: individual.error };
  if (team.error) return { error: team.error };

  // Both tables reduce to the same row shape; a team's members stand in for
  // the house name.
  type Row = { fcId: string; grade: string | null; position: number | null; entry: ScreenAchiever };
  const rows: Row[] = [];
  for (const r of individual.data) {
    const participant = one(one(r.participant_registration)?.participant);
    if (!participant) continue;
    const shakha = one(participant.shakha);
    rows.push({
      fcId: r.feast_competition_id, grade: r.grade, position: r.position,
      entry: { name: participant.name, houseName: participant.house_name, shakha: shakha?.name ?? "—", meghalaName: one(shakha?.meghala)?.name ?? null },
    });
  }
  for (const r of team.data) {
    const reg = one(r.team_registration);
    if (!reg) continue;
    const shakha = one(reg.shakha);
    const members = (reg.team_registration_members ?? []).map((m) => one(m.participant)?.name).filter(Boolean).join(", ");
    rows.push({
      fcId: r.feast_competition_id, grade: r.grade, position: r.position,
      entry: { name: reg.team_name, houseName: members || null, shakha: shakha?.name ?? "—", meghalaName: one(shakha?.meghala)?.name ?? null },
    });
  }

  const byFc = new Map<string, Row[]>();
  for (const r of rows) (byFc.get(r.fcId) ?? byFc.set(r.fcId, []).get(r.fcId)!).push(r);

  const competitions: ScreenCompetitionResult[] = [];
  for (const fc of fcs) {
    const fcRows = byFc.get(fc.id) ?? [];
    if (fcRows.length === 0) continue;
    const competition = one(fc.competition);
    const category = one(competition?.competition_category);

    const positions: ScreenPosition[] = [];
    const grades: { A: ScreenAchiever[]; B: ScreenAchiever[]; C: ScreenAchiever[] } = { A: [], B: [], C: [] };
    for (const r of fcRows) {
      if (r.position != null && r.position >= 1 && r.position <= 3) positions.push({ place: r.position as 1 | 2 | 3, ...r.entry });
      if (r.grade === "A" || r.grade === "B" || r.grade === "C") grades[r.grade].push(r.entry);
    }
    if (positions.length === 0 && grades.A.length === 0 && grades.B.length === 0 && grades.C.length === 0) continue;

    competitions.push({
      competitionId: fc.id,
      competitionName: competition?.name ?? "Competition",
      categoryName: category?.name ?? "",
      categorySlug: category?.slug ?? "",
      gender: competition?.gender ?? null,
      isTeam: competition?.type === "group",
      positions: positions.sort((a, b) => a.place - b.place),
      grades,
    });
  }

  return { data: { competitions } };
}

// ── dashboard "Latest result" ────────────────────────────────────────────
export interface LatestResult {
  feastCompetitionId: string;
  publishedAt: string;
  feastName: string;
  feastSlug: string;
  feastType: string;
  competitionName: string;
  categorySlug: string | null;
  gender: string | null;
  isTeam: boolean;
  participants: number;
  rows: unknown[];
}

// The most recently published competition in a non-draft fest, with its
// published rows — the dashboard's "Latest result" card. Same freshness
// signal as the landing banner (feast_competitions.updated_at) and cached
// like the other public reads.
// The home page features a result only for its first few days; after that
// the card goes away until the next publish. Checked outside the cache so
// the age is measured at request time, not when the entry was cached.
const LATEST_RESULT_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

export async function getLatestResult(): Promise<LatestResult | null> {
  const latest = await cachedLatestResult();
  if (!latest) return null;
  const age = Date.now() - new Date(latest.publishedAt).getTime();
  return Number.isFinite(age) && age <= LATEST_RESULT_MAX_AGE_MS ? latest : null;
}

const cachedLatestResult = unstable_cache(async () => readLatestResult(), ["fp-latest-result"], {
  tags: [TAG.results, TAG.hierarchy],
  revalidate: TTL.live,
});

async function readLatestResult(): Promise<LatestResult | null> {
  const { data: fc } = await getSupabaseAdmin()
    .from("feast_competitions")
    .select(
      "id, updated_at, feast:feasts!inner(name, slug, type, status), competition:competitions(name, type, gender, competition_category:competition_categories(slug)), participant_registrations(count)"
    )
    .eq("result_status", "published")
    .neq("feast.status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fc) return null;
  const feast = Array.isArray(fc.feast) ? fc.feast[0] : fc.feast;
  const comp = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  const cat = Array.isArray(comp?.competition_category) ? comp?.competition_category[0] : comp?.competition_category;
  const regCount = Array.isArray(fc.participant_registrations) ? fc.participant_registrations[0] : fc.participant_registrations;
  const isTeam = comp?.type === "group";
  // Imported lazily: team-results imports this module (rebuildStandings).
  const { getPublishedTeamResults } = await import("@/actions/team-results");
  const [rows, latest] = await Promise.all([
    isTeam ? getPublishedTeamResults(fc.id) : cachedPublishedResults(fc.id),
    readLatestPublished([fc.id]),
  ]);
  return {
    feastCompetitionId: fc.id,
    publishedAt: latest?.publishedAt ?? fc.updated_at,
    feastName: feast?.name ?? "",
    feastSlug: feast?.slug ?? "",
    feastType: feast?.type ?? "",
    competitionName: comp?.name ?? "Competition",
    categorySlug: cat?.slug ?? null,
    gender: comp?.gender ?? null,
    isTeam,
    participants: Number((regCount as { count?: number } | undefined)?.count ?? 0),
    rows,
  };
}

export interface PublishedResultsFeast {
  slug: string;
  name: string;
}

// Drives the Fest Portal dashboard's "Result Published" banner — feast-level,
// not a hardcoded slug: any feast with at least one result_status='published'
// competition is eligible, and the one whose results changed most recently
// wins (feast_competitions.updated_at, same signal getRecentActivity uses).
// A draft feast never surfaces here even if its competitions are published.
export async function getLatestPublishedResultsFeast(): Promise<PublishedResultsFeast | null> {
  return cachedLatestResultsFeast();
}

const cachedLatestResultsFeast = unstable_cache(
  async () => readLatestPublishedResultsFeast(),
  ["fp-latest-results-feast"],
  { tags: [TAG.results], revalidate: TTL.live },
);

async function readLatestPublishedResultsFeast(): Promise<PublishedResultsFeast | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("feast_competitions")
    .select("updated_at, feast:feasts(name, slug, status)")
    .eq("result_status", "published")
    .order("updated_at", { ascending: false })
    .limit(20); // over-fetch past the first draft-feast row, same guard as getRecentActivity

  if (error || !data) return null;

  for (const row of data) {
    const feast = Array.isArray(row.feast) ? row.feast[0] : row.feast;
    if (!feast || feast.status === "draft") continue;
    return { slug: feast.slug, name: feast.name };
  }
  return null;
}
