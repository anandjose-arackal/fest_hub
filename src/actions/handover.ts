"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchAll, fetchAllIn } from "@/lib/fetch-all";
import { requireRole } from "@/lib/require-role";
import {
  certCoverage,
  compareFestsForDashboard,
  compareWinners,
  isPosition,
  tallyCerts,
  trophyCounts,
  type CertEntry,
  type HandoverStamp,
  type TrophyCounts,
  type TrophyItem,
  type TrophyStamp,
  type UnitStamp,
  type WinnerEntry,
} from "@/lib/handover";
import type { Grade } from "@/types";

// Trophy / certificate handover tracking (/admin/trophies) and the item
// "printed" status that gates it. Tables: trophy_handovers,
// certificate_handovers, feast_competition_prints (014_trophy_manager.sql) —
// RLS on with no policies, so everything goes through the service-role
// client here. Handover rows are never deleted: undo stamps undone_at.

type Admin = ReturnType<typeof getSupabaseAdmin>;

function one<T>(x: T | T[] | null | undefined): T | undefined {
  return (Array.isArray(x) ? x[0] : x) ?? undefined;
}

// ── shared reads ─────────────────────────────────────────────────────────

interface ItemInfo {
  id: string;
  feastId: string;
  displayOrder: number;
  competitionName: string;
  categorySlug: string | null;
  categoryName: string | null;
  gender: string | null;
  isTeam: boolean;
}

interface ResultEntry {
  resultId: string;
  isTeam: boolean;
  feastCompetitionId: string;
  position: number | null;
  grade: Grade;
  name: string;
  houseName: string | null;
  members: string | null;
  shakhaId: string | null;
  shakhaName: string;
  meghalaId: string | null;
  meghalaName: string | null;
  certificateCount: number;
}

async function loadPublishedItems(admin: Admin, feastIds: string[]): Promise<{ items: ItemInfo[]; printedAt: Map<string, string>; error?: string }> {
  const fcs = await fetchAllIn(feastIds, (ids, from, to) =>
    admin
      .from("feast_competitions")
      .select("id, feast_id, display_order, competition:competitions(name, type, gender, competition_category:competition_categories(name, slug))")
      .in("feast_id", ids)
      .eq("result_status", "published")
      .order("id")
      .range(from, to)
  );
  if (fcs.error) return { items: [], printedAt: new Map(), error: fcs.error };
  const items: ItemInfo[] = fcs.data.map((fc) => {
    const competition = one(fc.competition);
    const category = one(competition?.competition_category);
    return {
      id: fc.id,
      feastId: fc.feast_id,
      displayOrder: fc.display_order ?? 0,
      competitionName: competition?.name ?? "Competition",
      categorySlug: category?.slug ?? null,
      categoryName: category?.name ?? null,
      gender: competition?.gender ?? null,
      isTeam: competition?.type === "group",
    };
  });
  const prints = await fetchAllIn(items.map((i) => i.id), (ids, from, to) =>
    admin.from("feast_competition_prints").select("feast_competition_id, printed_at").in("feast_competition_id", ids).order("feast_competition_id").range(from, to)
  );
  if (prints.error) return { items, printedAt: new Map(), error: prints.error };
  return { items, printedAt: new Map(prints.data.map((p) => [p.feast_competition_id, p.printed_at])), error: undefined };
}

const SHAKHA_SELECT = "id, name, meghala_id, meghala:meghalas(id, name)";

// Published results that earn a trophy (placedOnly) or any certificate
// (a 1st–3rd place or an A/B/C grade).
async function loadResults(admin: Admin, fcIds: string[], placedOnly: boolean): Promise<{ data: ResultEntry[]; error?: string }> {
  const certFilter = placedOnly ? "position.not.is.null" : "position.not.is.null,grade.not.is.null";
  const [indiv, team] = await Promise.all([
    fetchAllIn(fcIds, (ids, from, to) =>
      admin
        .from("competition_results")
        .select(
          `id, feast_competition_id, position, grade, participant_registration:participant_registrations(participant:participants(name, house_name, shakha_id, shakha:shakhas(${SHAKHA_SELECT})))`
        )
        .in("feast_competition_id", ids)
        .not("published_at", "is", null)
        .or(certFilter)
        .order("id")
        .range(from, to)
    ),
    fetchAllIn(fcIds, (ids, from, to) =>
      admin
        .from("team_results")
        .select(
          `id, feast_competition_id, position, grade, team_registration:team_registrations(team_name, shakha_id, shakha:shakhas(${SHAKHA_SELECT}), team_registration_members(participant:participants(name)))`
        )
        .in("feast_competition_id", ids)
        .not("published_at", "is", null)
        .or(certFilter)
        .order("id")
        .range(from, to)
    ),
  ]);
  if (indiv.error) return { data: [], error: indiv.error };
  if (team.error) return { data: [], error: team.error };

  const out: ResultEntry[] = [];
  for (const r of indiv.data) {
    const participant = one(one(r.participant_registration)?.participant);
    if (!participant) continue;
    const shakha = one(participant.shakha);
    const meghala = one(shakha?.meghala);
    out.push({
      resultId: r.id,
      isTeam: false,
      feastCompetitionId: r.feast_competition_id,
      position: r.position,
      grade: (r.grade ?? null) as Grade,
      name: participant.name,
      houseName: participant.house_name ?? null,
      members: null,
      shakhaId: participant.shakha_id ?? null,
      shakhaName: shakha?.name ?? "—",
      meghalaId: shakha?.meghala_id ?? null,
      meghalaName: meghala?.name ?? null,
      certificateCount: 1,
    });
  }
  for (const r of team.data) {
    const teamReg = one(r.team_registration);
    if (!teamReg) continue;
    const shakha = one(teamReg.shakha);
    const meghala = one(shakha?.meghala);
    const memberNames = (teamReg.team_registration_members ?? []).map((m) => one(m.participant)?.name ?? "").filter(Boolean);
    out.push({
      resultId: r.id,
      isTeam: true,
      feastCompetitionId: r.feast_competition_id,
      position: r.position,
      grade: (r.grade ?? null) as Grade,
      name: teamReg.team_name ?? "Team",
      houseName: null,
      members: memberNames.join(", ") || null,
      shakhaId: teamReg.shakha_id ?? null,
      shakhaName: shakha?.name ?? "—",
      meghalaId: shakha?.meghala_id ?? null,
      meghalaName: meghala?.name ?? null,
      certificateCount: Math.max(1, memberNames.length),
    });
  }
  return { data: out };
}

interface HandoverRow {
  id: string;
  competition_result_id: string | null;
  team_result_id: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  handed_over_by: string | null;
  handed_over_at: string;
}
type TrophyRow = HandoverRow & { position: number; with_certificate: boolean };
type CertRow = HandoverRow & { scope: "meghala" | "shakha" | "result"; meghala_id: string | null; shakha_id: string | null; certificate_count: number };

const HANDOVER_COLS = "id, competition_result_id, team_result_id, receiver_name, receiver_phone, handed_over_by, handed_over_at";

async function loadActiveHandovers(admin: Admin, feastIds: string[], includeCertificates: boolean) {
  const [trophies, certs] = await Promise.all([
    fetchAllIn(feastIds, (ids, from, to) =>
      admin
        .from("trophy_handovers")
        .select(`${HANDOVER_COLS}, position, with_certificate`)
        .in("feast_id", ids)
        .is("undone_at", null)
        .order("id")
        .range(from, to)
    ),
    includeCertificates
      ? fetchAllIn(feastIds, (ids, from, to) =>
          admin
            .from("certificate_handovers")
            .select(`${HANDOVER_COLS}, scope, meghala_id, shakha_id, certificate_count`)
            .in("feast_id", ids)
            .is("undone_at", null)
            .order("id")
            .range(from, to)
        )
      : Promise.resolve({ data: [] as CertRow[], error: null }),
  ]);
  const error = trophies.error ?? certs.error ?? undefined;
  const trophyRows = trophies.data as TrophyRow[];
  const certRows = certs.data as CertRow[];

  const userIds = [...new Set([...trophyRows, ...certRows].map((h) => h.handed_over_by).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await fetchAll((from, to) => admin.from("profiles").select("id, full_name, email").in("id", userIds).order("id").range(from, to));
    for (const p of data) names.set(p.id, p.full_name || p.email);
  }
  const stamp = (h: HandoverRow): HandoverStamp => ({
    id: h.id,
    handedOverAt: h.handed_over_at,
    handedOverByName: h.handed_over_by ? names.get(h.handed_over_by) ?? null : null,
    receiverName: h.receiver_name,
    receiverPhone: h.receiver_phone,
  });
  return { trophyRows, certRows, stamp, error };
}

const resultKey = (isTeam: boolean, resultId: string) => `${isTeam ? "t" : "i"}:${resultId}`;
const rowKey = (h: HandoverRow) => (h.team_result_id ? resultKey(true, h.team_result_id) : resultKey(false, h.competition_result_id!));

type LoadedHandovers = Awaited<ReturnType<typeof loadActiveHandovers>>;

// Active Mekhala/Shakha bulk certificate handovers.
function unitStamps(h: LoadedHandovers): UnitStamp[] {
  return h.certRows
    .filter((c) => c.scope !== "result")
    .map((c) => ({
      ...h.stamp(c),
      scope: c.scope as "meghala" | "shakha",
      unitId: (c.scope === "meghala" ? c.meghala_id : c.shakha_id)!,
      certificateCount: c.certificate_count,
    }));
}

// One certificate entry per published result with a place or a grade, with
// whatever already covers it individually (its trophy, or a 'result'-scope
// certificate handover). Bulk Mekhala/Shakha coverage is worked out from
// these by certCoverage().
function buildCertEntries(results: ResultEntry[], items: ItemInfo[], printedAt: Map<string, string>, h: LoadedHandovers): CertEntry[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const trophyByKey = new Map(h.trophyRows.map((t) => [rowKey(t), t]));
  const individualByKey = new Map(h.certRows.filter((c) => c.scope === "result").map((c) => [rowKey(c), c]));
  const out: CertEntry[] = [];
  for (const r of results) {
    const position = isPosition(r.position) ? r.position : null;
    if (!position && !r.grade) continue;
    const key = resultKey(r.isTeam, r.resultId);
    const trophy = position ? trophyByKey.get(key) : undefined;
    const individual = individualByKey.get(key);
    const item = itemById.get(r.feastCompetitionId);
    out.push({
      resultId: r.resultId,
      isTeam: r.isTeam,
      feastCompetitionId: r.feastCompetitionId,
      competitionName: item?.competitionName ?? "Competition",
      categorySlug: item?.categorySlug ?? null,
      gender: item?.gender ?? null,
      name: r.name,
      houseName: r.houseName,
      members: r.members,
      position,
      grade: r.grade,
      shakhaId: r.shakhaId,
      meghalaId: r.meghalaId,
      count: r.certificateCount,
      printedAt: printedAt.get(r.feastCompetitionId) ?? null,
      individual: individual ? h.stamp(individual) : null,
      withTrophy: trophy?.with_certificate ? h.stamp(trophy) : null,
    });
  }
  return out;
}

// ── Dashboard ────────────────────────────────────────────────────────────

export interface FestTrophySummary {
  feastId: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  publishedItems: number;
  counts: TrophyCounts;
}

export async function getTrophyDashboard(): Promise<{ data?: FestTrophySummary[]; error?: string }> {
  const auth = await requireRole("handover.read");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();

  const { data: feasts, error: feastErr } = await admin
    .from("feasts")
    .select("id, name, status, start_date, end_date, venue")
    .neq("status", "draft");
  if (feastErr) return { error: feastErr.message };
  if (!feasts || feasts.length === 0) return { data: [] };

  const feastIds = feasts.map((f) => f.id);
  const { items, error: itemsErr } = await loadPublishedItems(admin, feastIds);
  if (itemsErr) return { error: itemsErr };
  const [results, handovers] = await Promise.all([
    loadResults(admin, items.map((i) => i.id), true),
    loadActiveHandovers(admin, feastIds, false),
  ]);
  if (results.error) return { error: results.error };
  if (handovers.error) return { error: handovers.error };

  const given = new Set(handovers.trophyRows.map(rowKey));
  const feastOfItem = new Map(items.map((i) => [i.id, i.feastId]));
  const winnersByFeast = new Map<string, { position: 1 | 2 | 3; trophy: boolean }[]>();
  for (const r of results.data) {
    if (!isPosition(r.position)) continue;
    const feastId = feastOfItem.get(r.feastCompetitionId);
    if (!feastId) continue;
    const list = winnersByFeast.get(feastId) ?? [];
    list.push({ position: r.position, trophy: given.has(resultKey(r.isTeam, r.resultId)) });
    winnersByFeast.set(feastId, list);
  }

  const data = [...feasts]
    .sort(compareFestsForDashboard)
    .map((f) => ({
      feastId: f.id,
      name: f.name,
      status: f.status,
      startDate: f.start_date,
      endDate: f.end_date,
      venue: f.venue,
      publishedItems: items.filter((i) => i.feastId === f.id).length,
      counts: trophyCounts([{ winners: winnersByFeast.get(f.id) ?? [] }]),
    }));
  return { data };
}

// ── Trophy board (one fest) ─────────────────────────────────────────────

export interface FeastHeader {
  id: string;
  name: string;
  status: string;
}

export async function getTrophyBoard(feastId: string): Promise<{ data?: { feast: FeastHeader; items: TrophyItem[] }; error?: string }> {
  const auth = await requireRole("handover.read");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();

  const { data: feast } = await admin.from("feasts").select("id, name, status").eq("id", feastId).maybeSingle();
  if (!feast) return { error: "Fest not found." };

  const { items, printedAt, error: itemsErr } = await loadPublishedItems(admin, [feastId]);
  if (itemsErr) return { error: itemsErr };
  const [results, handovers] = await Promise.all([
    loadResults(admin, items.map((i) => i.id), true),
    loadActiveHandovers(admin, [feastId], true),
  ]);
  if (results.error) return { error: results.error };
  if (handovers.error) return { error: handovers.error };

  const trophyByKey = new Map(handovers.trophyRows.map((h) => [rowKey(h), h]));
  // A winner's certificate may also have gone out on its own — individually
  // or in a Mekhala/Shakha bundle (/admin/trophies/certificates).
  const units = unitStamps(handovers);
  const certByKey = new Map(
    buildCertEntries(results.data, items, printedAt, handovers).map((c) => {
      const cov = certCoverage({ ...c, withTrophy: null }, units);
      return [resultKey(c.isTeam, c.resultId), cov.state === "covered" ? cov.handover : null] as const;
    })
  );
  const winnersByItem = new Map<string, WinnerEntry[]>();
  for (const r of results.data) {
    if (!isPosition(r.position)) continue;
    const key = resultKey(r.isTeam, r.resultId);
    const t = trophyByKey.get(key);
    const trophy: TrophyStamp | null = t ? { ...handovers.stamp(t), position: t.position, withCertificate: t.with_certificate } : null;
    const list = winnersByItem.get(r.feastCompetitionId) ?? [];
    list.push({
      resultId: r.resultId,
      isTeam: r.isTeam,
      position: r.position,
      grade: r.grade,
      name: r.name,
      houseName: r.houseName,
      members: r.members,
      shakhaId: r.shakhaId,
      shakhaName: r.shakhaName,
      meghalaId: r.meghalaId,
      meghalaName: r.meghalaName,
      certificateCount: r.certificateCount,
      trophy,
      certificate: certByKey.get(key) ?? null,
    });
    winnersByItem.set(r.feastCompetitionId, list);
  }

  const boardItems: TrophyItem[] = items.map((i) => ({
    feastCompetitionId: i.id,
    competitionName: i.competitionName,
    categorySlug: i.categorySlug,
    categoryName: i.categoryName,
    gender: i.gender,
    isTeam: i.isTeam,
    displayOrder: i.displayOrder,
    printedAt: printedAt.get(i.id) ?? null,
    winners: (winnersByItem.get(i.id) ?? []).sort(compareWinners),
  }));
  return { data: { feast, items: boardItems } };
}

// ── Certificate board (one fest) ────────────────────────────────────────

export interface CertificateBoard {
  feast: FeastHeader;
  /** Every certificate: 1st–3rd place winners and A/B/C grades. */
  certs: CertEntry[];
  units: UnitStamp[];
}

async function buildCertificateBoard(admin: Admin, feastId: string): Promise<{ data?: CertificateBoard; error?: string }> {
  const { data: feast } = await admin.from("feasts").select("id, name, status").eq("id", feastId).maybeSingle();
  if (!feast) return { error: "Fest not found." };

  const { items, printedAt, error: itemsErr } = await loadPublishedItems(admin, [feastId]);
  if (itemsErr) return { error: itemsErr };
  const [results, handovers] = await Promise.all([
    loadResults(admin, items.map((i) => i.id), false),
    loadActiveHandovers(admin, [feastId], true),
  ]);
  if (results.error) return { error: results.error };
  if (handovers.error) return { error: handovers.error };

  return { data: { feast, certs: buildCertEntries(results.data, items, printedAt, handovers), units: unitStamps(handovers) } };
}

export async function getCertificateBoard(feastId: string): Promise<{ data?: CertificateBoard; error?: string }> {
  const auth = await requireRole("handover.read");
  if ("error" in auth) return { error: auth.error };
  return buildCertificateBoard(getSupabaseAdmin(), feastId);
}

// ── Trophy handover writes ──────────────────────────────────────────────

function clean(s: string | null | undefined, max = 120): string | null {
  const t = (s ?? "").trim().slice(0, max);
  return t || null;
}

// The result row behind one trophy / certificate, with what the writes
// validate against: still published, its item's printed status.
async function loadResultForHandover(admin: Admin, resultId: string, isTeam: boolean) {
  const table = isTeam ? "team_results" : "competition_results";
  const select = isTeam
    ? "id, feast_competition_id, position, grade, published_at, team_registration:team_registrations(team_name, shakha_id, team_registration_members(id))"
    : "id, feast_competition_id, position, grade, published_at, participant_registration:participant_registrations(participant:participants(name, shakha_id))";
  const { data: r } = await admin.from(table).select(select).eq("id", resultId).maybeSingle();
  if (!r) return { error: "Result not found." };
  const row = r as unknown as {
    feast_competition_id: string;
    position: number | null;
    grade: Grade;
    published_at: string | null;
    team_registration?: unknown;
    participant_registration?: unknown;
  };
  const [{ data: fc }, { data: print }] = await Promise.all([
    admin.from("feast_competitions").select("feast_id, result_status").eq("id", row.feast_competition_id).single(),
    admin.from("feast_competition_prints").select("printed_at").eq("feast_competition_id", row.feast_competition_id).maybeSingle(),
  ]);
  if (!fc || fc.result_status !== "published" || !row.published_at) return { error: "This result isn't published." };

  let name = "";
  let shakhaId: string | null = null;
  let certificateCount = 1;
  if (isTeam) {
    const team = one(row.team_registration as { team_name: string; shakha_id: string; team_registration_members: unknown[] } | null);
    name = team?.team_name ?? "Team";
    shakhaId = team?.shakha_id ?? null;
    certificateCount = Math.max(1, team?.team_registration_members?.length ?? 0);
  } else {
    const participant = one(one(row.participant_registration as { participant: unknown } | null)?.participant as { name: string; shakha_id: string | null } | null);
    name = participant?.name ?? "";
    shakhaId = participant?.shakha_id ?? null;
  }
  return {
    feastId: fc.feast_id as string,
    feastCompetitionId: row.feast_competition_id,
    position: row.position,
    grade: row.grade,
    printed: !!print,
    name,
    shakhaId,
    certificateCount,
  };
}

export interface MarkTrophyInput {
  resultId: string;
  isTeam: boolean;
  receiverName?: string;
  receiverPhone?: string;
  /** The winner's certificate went out with the trophy. */
  withCertificate: boolean;
}

export async function markTrophyHandover(input: MarkTrophyInput): Promise<{ error?: string }> {
  const auth = await requireRole("handover.write");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();

  const r = await loadResultForHandover(admin, input.resultId, input.isTeam);
  if ("error" in r) return { error: r.error };
  if (!isPosition(r.position)) return { error: "This entry didn't place 1st–3rd, so there's no trophy." };
  if (!r.printed) return { error: "This result isn't printed yet — trophies can be handed over once it is." };

  const { error } = await admin.from("trophy_handovers").insert({
    feast_id: r.feastId,
    feast_competition_id: r.feastCompetitionId,
    competition_result_id: input.isTeam ? null : input.resultId,
    team_result_id: input.isTeam ? input.resultId : null,
    position: r.position,
    winner_name: r.name,
    shakha_id: r.shakhaId,
    with_certificate: input.withCertificate,
    receiver_name: clean(input.receiverName),
    receiver_phone: clean(input.receiverPhone, 30),
    handed_over_by: auth.userId,
  });
  if (error) return { error: error.code === "23505" ? "This trophy is already marked as received." : error.message };
  return {};
}

async function undoHandover(table: "trophy_handovers" | "certificate_handovers", handoverId: string, userId: string, reason?: string): Promise<{ error?: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .update({ undone_at: new Date().toISOString(), undone_by: userId, undo_reason: clean(reason, 300) })
    .eq("id", handoverId)
    .is("undone_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Already undone — refresh to see the latest." };
  return {};
}

export async function undoTrophyHandover(input: { handoverId: string; reason?: string }): Promise<{ error?: string }> {
  const auth = await requireRole("handover.write");
  if ("error" in auth) return { error: auth.error };
  return undoHandover("trophy_handovers", input.handoverId, auth.userId, input.reason);
}

// ── Certificate handover writes ─────────────────────────────────────────

export type MarkCertificateInput =
  | { feastId: string; scope: "meghala" | "shakha"; unitId: string; receiverName: string; receiverPhone: string }
  | { feastId: string; scope: "result"; resultId: string; isTeam: boolean; receiverName?: string; receiverPhone?: string };

export async function markCertificateHandover(input: MarkCertificateInput): Promise<{ error?: string }> {
  const auth = await requireRole("handover.write");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();
  const receiverName = clean(input.receiverName);
  const receiverPhone = clean(input.receiverPhone, 30);

  if (input.scope === "result") {
    const r = await loadResultForHandover(admin, input.resultId, input.isTeam);
    if ("error" in r) return { error: r.error };
    if (r.feastId !== input.feastId) return { error: "Result not found." };
    if (!r.printed) return { error: "This result isn't printed yet." };
    if (!isPosition(r.position) && !r.grade) return { error: "This entry has no certificate." };
    const board = await buildCertificateBoard(admin, input.feastId);
    if (board.error || !board.data) return { error: board.error ?? "Could not load certificates." };
    const cert = board.data.certs.find((c) => c.resultId === input.resultId && c.isTeam === input.isTeam);
    const cov = cert ? certCoverage(cert, board.data.units) : null;
    if (cov?.state === "covered") {
      return {
        error:
          cov.via === "trophy"
            ? "This certificate already went out with the trophy."
            : cov.via === "individual"
              ? "This certificate is already marked as handed over."
              : "This certificate is already covered by a Shakha/Mekhala handover.",
      };
    }
    const { error } = await admin.from("certificate_handovers").insert({
      feast_id: input.feastId,
      scope: "result",
      competition_result_id: input.isTeam ? null : input.resultId,
      team_result_id: input.isTeam ? input.resultId : null,
      certificate_count: r.certificateCount,
      receiver_name: receiverName,
      receiver_phone: receiverPhone,
      handed_over_by: auth.userId,
    });
    if (error) return { error: error.code === "23505" ? "This certificate is already marked as handed over." : error.message };
    return {};
  }

  if (!receiverName || !receiverPhone) return { error: "Enter the receiver's name and phone." };
  const board = await buildCertificateBoard(admin, input.feastId);
  if (board.error || !board.data) return { error: board.error ?? "Could not load certificates." };
  const unitCerts = board.data.certs.filter((c) => (input.scope === "shakha" ? c.shakhaId : c.meghalaId) === input.unitId);
  const tally = tallyCerts(unitCerts, board.data.units);
  if (tally.pending === 0) {
    return {
      error:
        tally.total === 0
          ? "No certificates for this unit."
          : tally.covered > 0 && tally.notPrinted === 0
            ? input.scope === "shakha" && tally.viaMeghala > 0
              ? "Already covered via its Mekhala."
              : "Already handed over."
            : "Nothing printed is pending for this unit.",
    };
  }
  const { error } = await admin.from("certificate_handovers").insert({
    feast_id: input.feastId,
    scope: input.scope,
    meghala_id: input.scope === "meghala" ? input.unitId : null,
    shakha_id: input.scope === "shakha" ? input.unitId : null,
    certificate_count: tally.pending,
    receiver_name: receiverName,
    receiver_phone: receiverPhone,
    handed_over_by: auth.userId,
  });
  if (error) return { error: error.message };
  return {};
}

export async function undoCertificateHandover(input: { handoverId: string; reason?: string }): Promise<{ error?: string }> {
  const auth = await requireRole("handover.write");
  if ("error" in auth) return { error: auth.error };
  return undoHandover("certificate_handovers", input.handoverId, auth.userId, input.reason);
}

// ── Printed status (admin) ──────────────────────────────────────────────

/** feast_competition_id → printed_at for a fest's printed items. */
export async function getPrintedItems(feastId: string): Promise<{ data?: Record<string, string>; error?: string }> {
  const auth = await requireRole("printed.write");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();
  const { data: fcs, error } = await admin.from("feast_competitions").select("id").eq("feast_id", feastId);
  if (error) return { error: error.message };
  const prints = await fetchAllIn((fcs ?? []).map((f) => f.id), (ids, from, to) =>
    admin.from("feast_competition_prints").select("feast_competition_id, printed_at").in("feast_competition_id", ids).order("feast_competition_id").range(from, to)
  );
  if (prints.error) return { error: prints.error };
  return { data: Object.fromEntries(prints.data.map((p) => [p.feast_competition_id, p.printed_at])) };
}

// Marks published items printed. Keeps an existing printed_at (a reprint
// doesn't move it — a later timestamp would un-cover certificates already
// handed out in bulk); unpublished items are skipped.
async function markPrinted(admin: Admin, fcIds: string[], userId: string): Promise<{ error?: string }> {
  if (fcIds.length === 0) return {};
  const { data: published, error } = await admin.from("feast_competitions").select("id").in("id", fcIds).eq("result_status", "published");
  if (error) return { error: error.message };
  if (!published || published.length === 0) return {};
  const { error: upsertErr } = await admin
    .from("feast_competition_prints")
    .upsert(published.map((f) => ({ feast_competition_id: f.id, printed_by: userId })), { onConflict: "feast_competition_id", ignoreDuplicates: true });
  if (upsertErr) return { error: upsertErr.message };
  return {};
}

export async function markItemsPrinted(feastCompetitionIds: string[]): Promise<{ error?: string }> {
  const auth = await requireRole("printed.write");
  if ("error" in auth) return { error: auth.error };
  return markPrinted(getSupabaseAdmin(), [...new Set(feastCompetitionIds)], auth.userId);
}

export async function setItemPrinted(feastCompetitionId: string, printed: boolean): Promise<{ error?: string }> {
  const auth = await requireRole("printed.write");
  if ("error" in auth) return { error: auth.error };
  const admin = getSupabaseAdmin();
  if (!printed) {
    const { error } = await admin.from("feast_competition_prints").delete().eq("feast_competition_id", feastCompetitionId);
    if (error) return { error: error.message };
    return {};
  }
  const { data: fc } = await admin.from("feast_competitions").select("result_status").eq("id", feastCompetitionId).single();
  if (fc?.result_status !== "published") return { error: "Publish the result before marking it printed." };
  return markPrinted(admin, [feastCompetitionId], auth.userId);
}
