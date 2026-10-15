// Trophy / certificate handover rules — pure functions, no DB, no React.
// Shared by src/actions/handover.ts (board building + write validation) and
// the /admin/trophies screens, and unit-tested by handover.test.ts.
//
// Type-only imports, so `node --test` can load this file directly.

import type { Grade } from "@/types";

export type Position = 1 | 2 | 3;

export function isPosition(n: number | null | undefined): n is Position {
  return n === 1 || n === 2 || n === 3;
}

/** One active (not undone) handover row, as shown on the boards. */
export interface HandoverStamp {
  id: string;
  handedOverAt: string;
  handedOverByName: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
}

export interface TrophyStamp extends HandoverStamp {
  /** Position at handover time — differs from the winner's current one if the result was re-published differently. */
  position: number;
  withCertificate: boolean;
}

// ════════════════════════════════════════════════════════════════════════
// Trophies
// ════════════════════════════════════════════════════════════════════════

/** One trophy: a placed individual result, or a placed team (one trophy per team). Ties are separate entries. */
export interface WinnerEntry {
  resultId: string;
  isTeam: boolean;
  position: Position;
  grade: Grade;
  /** Participant name, or the team name. */
  name: string;
  houseName: string | null;
  /** Team items: member names, comma-joined. */
  members: string | null;
  shakhaId: string | null;
  shakhaName: string;
  meghalaId: string | null;
  meghalaName: string | null;
  /** Physical certificates this entry gets — 1, or one per team member. */
  certificateCount: number;
  trophy: TrophyStamp | null;
  /** The winner's certificate handed over on its own (when the trophy went out without it). */
  certificate: HandoverStamp | null;
}

export interface TrophyItem {
  feastCompetitionId: string;
  competitionName: string;
  categorySlug: string | null;
  categoryName: string | null;
  gender: string | null;
  isTeam: boolean;
  displayOrder: number;
  printedAt: string | null;
  winners: WinnerEntry[];
}

export type HandoverGroup = "ready" | "not_printed" | "done";
export const GROUP_ORDER: readonly HandoverGroup[] = ["ready", "not_printed", "done"];

/**
 * - done: every winner entry has its trophy.
 * - ready: printed, at least one trophy still to give (partial handovers stay here).
 * - not_printed: not printed yet, something still to give — handover is locked.
 * null when the item has no placed winners (fewer than 3 entries, or no
 * marks) — there's no trophy to track.
 */
export function itemGroup(item: Pick<TrophyItem, "printedAt" | "winners">): HandoverGroup | null {
  if (item.winners.length === 0) return null;
  if (item.winners.every((w) => w.trophy)) return "done";
  return item.printedAt ? "ready" : "not_printed";
}

export function compareWinners(a: WinnerEntry, b: WinnerEntry): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/** Items in screen order: ready → not printed → done, then the fest's own item order. Items with no winners are dropped. */
export function sortItems<T extends TrophyItem>(items: T[]): { item: T; group: HandoverGroup }[] {
  return items
    .map((item) => ({ item, group: itemGroup(item) }))
    .filter((x): x is { item: T; group: HandoverGroup } => x.group !== null)
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        a.item.displayOrder - b.item.displayOrder ||
        a.item.competitionName.localeCompare(b.item.competitionName),
    );
}

export interface TrophyFilter {
  /** Matches the item name, or any winner's name / team name. */
  search?: string;
  categorySlug?: string;
  meghalaId?: string;
  shakhaId?: string;
}

/**
 * Narrows each item to the winners matching the Mekhala/Shakha filter (so
 * the item's group reflects *that unit's* trophies) and drops items left
 * with nothing to show.
 */
export function filterItems<T extends TrophyItem>(items: T[], f: TrophyFilter): T[] {
  const q = f.search?.trim().toLowerCase() ?? "";
  const out: T[] = [];
  for (const item of items) {
    if (f.categorySlug && (item.isTeam ? "team" : item.categorySlug) !== f.categorySlug) continue;
    let winners = item.winners;
    if (f.shakhaId) winners = winners.filter((w) => w.shakhaId === f.shakhaId);
    else if (f.meghalaId) winners = winners.filter((w) => w.meghalaId === f.meghalaId);
    if (q && !item.competitionName.toLowerCase().includes(q)) {
      winners = winners.filter((w) => w.name.toLowerCase().includes(q) || (w.members ?? "").toLowerCase().includes(q));
    }
    if (winners.length === 0) continue;
    out.push(winners === item.winners ? item : { ...item, winners });
  }
  return out;
}

export interface PositionCount {
  given: number;
  total: number;
}
export interface TrophyCounts {
  byPosition: Record<Position, PositionCount>;
  given: number;
  total: number;
}

/** Trophies given vs total per position. Every tied entry counts on its own; a team counts once. */
export function trophyCounts(items: { winners: { position: Position; trophy: unknown }[] }[]): TrophyCounts {
  const byPosition: Record<Position, PositionCount> = { 1: { given: 0, total: 0 }, 2: { given: 0, total: 0 }, 3: { given: 0, total: 0 } };
  for (const item of items) {
    for (const w of item.winners) {
      byPosition[w.position].total++;
      if (w.trophy) byPosition[w.position].given++;
    }
  }
  const total = byPosition[1].total + byPosition[2].total + byPosition[3].total;
  const given = byPosition[1].given + byPosition[2].given + byPosition[3].given;
  return { byPosition, given, total };
}

/** A placed winner's certificate is out if it went with the trophy or was handed over separately. */
export function winnerCertificateGiven(w: Pick<WinnerEntry, "trophy" | "certificate">): boolean {
  return !!w.certificate || !!(w.trophy && w.trophy.withCertificate);
}

// ── Dashboard fest order ───────────────────────────────────────────────

const FEST_STATUS_ORDER: Record<string, number> = { ongoing: 0, registration_open: 1, completed: 2, draft: 3 };

/** Active fests first (ongoing, then open for registration), then the most recent. */
export function compareFestsForDashboard(
  a: { status: string; start_date: string | null; name: string },
  b: { status: string; start_date: string | null; name: string },
): number {
  const sa = FEST_STATUS_ORDER[a.status] ?? 2;
  const sb = FEST_STATUS_ORDER[b.status] ?? 2;
  if (sa !== sb) return sa - sb;
  const da = a.start_date ?? "";
  const db = b.start_date ?? "";
  if (da !== db) return da < db ? 1 : -1;
  return a.name.localeCompare(b.name);
}

// ════════════════════════════════════════════════════════════════════════
// Certificates — every published result with a 1st–3rd place or a grade
// ════════════════════════════════════════════════════════════════════════

/**
 * One certificate entry: a published result that placed 1st–3rd and/or got
 * an A/B/C grade. A team result is one entry covering every member's
 * certificate.
 */
export interface CertEntry {
  resultId: string;
  isTeam: boolean;
  feastCompetitionId: string;
  competitionName: string;
  categorySlug: string | null;
  gender: string | null;
  name: string;
  houseName: string | null;
  members: string | null;
  /** 1–3 for a placed winner, null for a grade-only certificate. */
  position: Position | null;
  grade: Grade;
  shakhaId: string | null;
  meghalaId: string | null;
  /** Physical certificates — 1, or one per team member. */
  count: number;
  printedAt: string | null;
  /** Active individual ('result'-scope) handover. */
  individual: HandoverStamp | null;
  /** Placed winners: the trophy handover, when the certificate went out with it. */
  withTrophy: HandoverStamp | null;
}

export interface UnitStamp extends HandoverStamp {
  scope: "meghala" | "shakha";
  unitId: string;
  certificateCount: number;
}

export type CertCoverage =
  | { state: "covered"; via: "trophy" | "individual" | "shakha" | "meghala"; handover: HandoverStamp }
  | { state: "pending" }
  | { state: "not_printed" };

function time(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * A certificate is covered when it went out with its trophy (placed winners),
 * by its own individual handover, or by a handover
 * to its Shakha — else its Mekhala — made at or after the item was printed.
 * The timestamp rule is what lets certificates go out in batches: a Shakha
 * handed its bundle at 3pm isn't silently "covered" for an item printed at
 * 5pm. The Shakha's own record wins over the Mekhala's, so a Shakha marked
 * before its Mekhala keeps its own record.
 */
export function certCoverage(cert: CertEntry, units: UnitStamp[]): CertCoverage {
  if (cert.withTrophy) return { state: "covered", via: "trophy", handover: cert.withTrophy };
  if (cert.individual) return { state: "covered", via: "individual", handover: cert.individual };
  if (!cert.printedAt) return { state: "not_printed" };
  const printed = time(cert.printedAt);
  const firstAfterPrint = (scope: "shakha" | "meghala", unitId: string | null) =>
    unitId == null
      ? undefined
      : units
          .filter((u) => u.scope === scope && u.unitId === unitId && time(u.handedOverAt) >= printed)
          .sort((a, b) => time(a.handedOverAt) - time(b.handedOverAt))[0];
  const viaShakha = firstAfterPrint("shakha", cert.shakhaId);
  if (viaShakha) return { state: "covered", via: "shakha", handover: viaShakha };
  const viaMeghala = firstAfterPrint("meghala", cert.meghalaId);
  if (viaMeghala) return { state: "covered", via: "meghala", handover: viaMeghala };
  return { state: "pending" };
}

/** Counts are physical certificates (team entries count each member). */
export interface CertTally {
  total: number;
  covered: number;
  pending: number;
  notPrinted: number;
  viaTrophy: number;
  viaIndividual: number;
  viaShakha: number;
  viaMeghala: number;
}

export function emptyTally(): CertTally {
  return { total: 0, covered: 0, pending: 0, notPrinted: 0, viaTrophy: 0, viaIndividual: 0, viaShakha: 0, viaMeghala: 0 };
}

export function tallyCerts(certs: CertEntry[], units: UnitStamp[]): CertTally {
  const t = emptyTally();
  for (const c of certs) addToTally(t, c, certCoverage(c, units));
  return t;
}

function addToTally(t: CertTally, c: CertEntry, cov: CertCoverage) {
  t.total += c.count;
  if (cov.state === "pending") t.pending += c.count;
  else if (cov.state === "not_printed") t.notPrinted += c.count;
  else {
    t.covered += c.count;
    if (cov.via === "trophy") t.viaTrophy += c.count;
    else if (cov.via === "individual") t.viaIndividual += c.count;
    else if (cov.via === "shakha") t.viaShakha += c.count;
    else t.viaMeghala += c.count;
  }
}

export interface HierarchyInput {
  level: "shakha" | "meghala" | "diocese";
  dioceses: { id: string; name: string }[];
  meghalas: { id: string; name: string; diocese_id: string | null }[];
  shakhas: { id: string; name: string; meghala_id: string | null }[];
}

export interface ShakhaUnitRow {
  /** null = certificates whose participant has no Shakha — individual marking only. */
  shakhaId: string | null;
  name: string;
  tally: CertTally;
  /** This Shakha's own active bulk handovers, oldest first. */
  handovers: UnitStamp[];
  /** Has pending certificates — the "Mark handed over" action is available. */
  canMark: boolean;
  certs: CertEntry[];
}

export interface MeghalaUnitRow {
  /** null = Shakhas not assigned to any Mekhala (or every Shakha, for a shakha-level org). */
  meghalaId: string | null;
  name: string;
  dioceseId: string | null;
  tally: CertTally;
  handovers: UnitStamp[];
  canMark: boolean;
  shakhas: ShakhaUnitRow[];
}

export const UNASSIGNED = "__unassigned__";

/**
 * The certificate board: Mekhala rows with their Shakhas nested underneath
 * (a shakha-level org gets one row with meghalaId null holding every
 * Shakha). Every configured unit appears, even with no certificates, so the
 * screen can choose whether to hide empty ones.
 */
export function buildCertificateUnits(certs: CertEntry[], units: UnitStamp[], h: HierarchyInput): MeghalaUnitRow[] {
  const useMeghalas = h.level !== "shakha";
  const knownMeghalas = new Set(h.meghalas.map((m) => m.id));
  const certsByShakha = new Map<string | null, CertEntry[]>();
  for (const c of certs) {
    const list = certsByShakha.get(c.shakhaId);
    if (list) list.push(c);
    else certsByShakha.set(c.shakhaId, [c]);
  }

  const shakhaRow = (shakhaId: string | null, name: string): ShakhaUnitRow => {
    const list = certsByShakha.get(shakhaId) ?? [];
    const tally = tallyCerts(list, units);
    return {
      shakhaId,
      name,
      tally,
      handovers: units.filter((u) => u.scope === "shakha" && u.unitId === shakhaId).sort((a, b) => time(a.handedOverAt) - time(b.handedOverAt)),
      canMark: shakhaId !== null && tally.pending > 0,
      certs: list,
    };
  };

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const rows: MeghalaUnitRow[] = [];

  if (useMeghalas) {
    for (const m of [...h.meghalas].sort(byName)) {
      const shakhas = h.shakhas.filter((s) => s.meghala_id === m.id).sort(byName).map((s) => shakhaRow(s.id, s.name));
      const tally = sumTallies(shakhas.map((s) => s.tally));
      rows.push({
        meghalaId: m.id,
        name: m.name,
        dioceseId: m.diocese_id,
        tally,
        handovers: units.filter((u) => u.scope === "meghala" && u.unitId === m.id).sort((a, b) => time(a.handedOverAt) - time(b.handedOverAt)),
        canMark: tally.pending > 0,
        shakhas,
      });
    }
  }

  const loose = h.shakhas
    .filter((s) => !useMeghalas || !s.meghala_id || !knownMeghalas.has(s.meghala_id))
    .sort(byName)
    .map((s) => shakhaRow(s.id, s.name));
  if (certsByShakha.has(null)) loose.push(shakhaRow(null, "No Shakha"));
  if (loose.length > 0) {
    rows.push({ meghalaId: null, name: useMeghalas ? "Unassigned" : "", dioceseId: null, tally: sumTallies(loose.map((s) => s.tally)), handovers: [], canMark: false, shakhas: loose });
  }
  return rows;
}

function sumTallies(ts: CertTally[]): CertTally {
  const out = emptyTally();
  for (const t of ts) {
    (Object.keys(out) as (keyof CertTally)[]).forEach((k) => {
      out[k] += t[k];
    });
  }
  return out;
}

export interface UnitSummary {
  shakhas: { covered: number; pending: number };
  meghalas: { covered: number; pending: number };
  certificates: CertTally;
}

/**
 * Header summary. A unit counts as covered once it has printed certificates
 * and none still pending, and as pending while any are; units with nothing
 * printed yet count as neither.
 */
export function summarizeUnits(rows: MeghalaUnitRow[]): UnitSummary {
  const s = { covered: 0, pending: 0 };
  const m = { covered: 0, pending: 0 };
  const classify = (t: CertTally, into: { covered: number; pending: number }) => {
    if (t.pending > 0) into.pending++;
    else if (t.total - t.notPrinted > 0) into.covered++;
  };
  for (const row of rows) {
    if (row.meghalaId) classify(row.tally, m);
    for (const sh of row.shakhas) if (sh.shakhaId) classify(sh.tally, s);
  }
  return { shakhas: s, meghalas: m, certificates: sumTallies(rows.map((r) => r.tally)) };
}

/** The Shakha has printed certificates and every one is covered through its Mekhala — no Shakha-level mark possible. */
export function coveredViaMeghala(t: CertTally): boolean {
  return t.pending === 0 && t.viaMeghala > 0 && t.viaShakha === 0;
}
