// Run with `npm test` (Node's built-in runner; Node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificateUnits,
  certCoverage,
  compareFestsForDashboard,
  coveredViaMeghala,
  filterItems,
  itemGroup,
  sortItems,
  summarizeUnits,
  tallyCerts,
  trophyCounts,
  winnerCertificateGiven,
  type CertEntry,
  type HierarchyInput,
  type Position,
  type TrophyItem,
  type TrophyStamp,
  type UnitStamp,
  type WinnerEntry,
} from "./handover.ts";

// ── fixtures ────────────────────────────────────────────────────────────

const T0 = "2026-10-12T10:00:00.000Z";
const T1 = "2026-10-12T11:00:00.000Z";
const T2 = "2026-10-12T12:00:00.000Z";

function stamp(id = "h1", at = T1): TrophyStamp {
  return { id, handedOverAt: at, handedOverByName: "Desk", receiverName: null, receiverPhone: null, position: 1, withCertificate: true };
}

let seq = 0;
function winner(position: Position, opts: Partial<WinnerEntry> = {}): WinnerEntry {
  seq++;
  return {
    resultId: `r${seq}`,
    isTeam: false,
    position,
    grade: "A",
    name: `Winner ${seq}`,
    houseName: null,
    members: null,
    shakhaId: "s1",
    shakhaName: "Shakha 1",
    meghalaId: "m1",
    meghalaName: "Mekhala 1",
    certificateCount: 1,
    trophy: null,
    certificate: null,
    ...opts,
  };
}

function item(id: string, winners: WinnerEntry[], opts: Partial<TrophyItem> = {}): TrophyItem {
  return {
    feastCompetitionId: id,
    competitionName: `Item ${id}`,
    categorySlug: "junior",
    categoryName: "Junior",
    gender: "boy",
    isTeam: false,
    displayOrder: 0,
    printedAt: T0,
    winners,
    ...opts,
  };
}

function cert(opts: Partial<CertEntry> = {}): CertEntry {
  seq++;
  return {
    resultId: `c${seq}`,
    isTeam: false,
    feastCompetitionId: "fc1",
    competitionName: "Essay",
    categorySlug: "junior",
    gender: null,
    name: `Participant ${seq}`,
    houseName: null,
    members: null,
    position: null,
    grade: "B",
    shakhaId: "s1",
    meghalaId: "m1",
    count: 1,
    printedAt: T0,
    individual: null,
    withTrophy: null,
    ...opts,
  };
}

function unit(scope: "shakha" | "meghala", unitId: string, at: string, id = `${scope}-${unitId}-${at}`): UnitStamp {
  return { id, scope, unitId, handedOverAt: at, handedOverByName: null, receiverName: "Rep", receiverPhone: "9", certificateCount: 0 };
}

// ── grouping ────────────────────────────────────────────────────────────

test("itemGroup: printed with trophies pending is ready", () => {
  assert.equal(itemGroup(item("a", [winner(1), winner(2)])), "ready");
});

test("itemGroup: partially handed over stays ready", () => {
  assert.equal(itemGroup(item("a", [winner(1, { trophy: stamp() }), winner(2)])), "ready");
});

test("itemGroup: not printed and pending is not_printed", () => {
  assert.equal(itemGroup(item("a", [winner(1)], { printedAt: null })), "not_printed");
});

test("itemGroup: every trophy given is done", () => {
  assert.equal(itemGroup(item("a", [winner(1, { trophy: stamp("x") }), winner(2, { trophy: stamp("y") })])), "done");
});

test("itemGroup: no placed winners means nothing to track", () => {
  assert.equal(itemGroup(item("a", [])), null);
});

test("sortItems: ready, then not printed, then done; display order within a group", () => {
  const items = [
    item("done", [winner(1, { trophy: stamp() })], { displayOrder: 0 }),
    item("np", [winner(1)], { printedAt: null, displayOrder: 1 }),
    item("ready-late", [winner(1)], { displayOrder: 9 }),
    item("ready-early", [winner(1)], { displayOrder: 2 }),
    item("empty", []),
  ];
  const sorted = sortItems(items).map((x) => `${x.group}:${x.item.feastCompetitionId}`);
  assert.deepEqual(sorted, ["ready:ready-early", "ready:ready-late", "not_printed:np", "done:done"]);
});

// ── filters ─────────────────────────────────────────────────────────────

test("filterItems: Shakha filter narrows winners, so the group reflects that unit", () => {
  const it = item("a", [winner(1, { shakhaId: "s1", trophy: stamp() }), winner(2, { shakhaId: "s2" })]);
  assert.equal(itemGroup(it), "ready");
  const [only] = filterItems([it], { shakhaId: "s1" });
  assert.equal(only.winners.length, 1);
  assert.equal(itemGroup(only), "done");
  assert.equal(filterItems([it], { shakhaId: "s3" }).length, 0);
});

test("filterItems: Mekhala filter and search by item or winner name", () => {
  const a = item("a", [winner(1, { meghalaId: "m1", name: "Anu" }), winner(2, { meghalaId: "m2", name: "Binu" })], { competitionName: "Elocution" });
  assert.equal(filterItems([a], { meghalaId: "m2" })[0].winners[0].name, "Binu");
  assert.equal(filterItems([a], { search: "elocu" })[0].winners.length, 2);
  assert.deepEqual(filterItems([a], { search: "anu" })[0].winners.map((w) => w.name), ["Anu"]);
});

test("filterItems: category filter treats team items as 'team'", () => {
  const ind = item("i", [winner(1)], { categorySlug: "junior" });
  const team = item("t", [winner(1, { isTeam: true })], { isTeam: true, categorySlug: null });
  assert.deepEqual(filterItems([ind, team], { categorySlug: "team" }).map((i) => i.feastCompetitionId), ["t"]);
  assert.deepEqual(filterItems([ind, team], { categorySlug: "junior" }).map((i) => i.feastCompetitionId), ["i"]);
});

// ── counts ──────────────────────────────────────────────────────────────

test("trophyCounts: tied winners count separately, a team counts once", () => {
  const items = [
    // Tie for 1st: two 1st-place entries.
    item("tie", [winner(1, { trophy: stamp("a") }), winner(1), winner(2)]),
    // Team item: one entry for the team, however many members.
    item("team", [winner(1, { isTeam: true, certificateCount: 7, trophy: stamp("b") }), winner(3, { isTeam: true, certificateCount: 5 })], { isTeam: true }),
  ];
  const c = trophyCounts(items);
  assert.deepEqual(c.byPosition[1], { given: 2, total: 3 });
  assert.deepEqual(c.byPosition[2], { given: 0, total: 1 });
  assert.deepEqual(c.byPosition[3], { given: 0, total: 1 });
  assert.equal(c.total, 5);
  assert.equal(c.given, 2);
});

test("trophyCounts: empty fest", () => {
  const c = trophyCounts([]);
  assert.equal(c.total, 0);
  assert.equal(c.given, 0);
});

test("winnerCertificateGiven: with the trophy, or separately", () => {
  assert.equal(winnerCertificateGiven({ trophy: stamp(), certificate: null }), true);
  assert.equal(winnerCertificateGiven({ trophy: { ...stamp(), withCertificate: false }, certificate: null }), false);
  assert.equal(winnerCertificateGiven({ trophy: { ...stamp(), withCertificate: false }, certificate: stamp("c") }), true);
  assert.equal(winnerCertificateGiven({ trophy: null, certificate: null }), false);
});

test("compareFestsForDashboard: active first, then most recent", () => {
  const fests = [
    { name: "Old", status: "completed", start_date: "2025-01-01" },
    { name: "New done", status: "completed", start_date: "2026-09-01" },
    { name: "Open", status: "registration_open", start_date: "2026-12-01" },
    { name: "Live", status: "ongoing", start_date: "2026-10-01" },
  ];
  assert.deepEqual([...fests].sort(compareFestsForDashboard).map((f) => f.name), ["Live", "Open", "New done", "Old"]);
});

// ── certificate coverage ───────────────────────────────────────────────

test("certCoverage: unprinted certificates are not_printed, printed ones pending", () => {
  assert.equal(certCoverage(cert({ printedAt: null }), []).state, "not_printed");
  assert.equal(certCoverage(cert(), []).state, "pending");
});

test("certCoverage: a Shakha handover covers only what was printed before it", () => {
  const units = [unit("shakha", "s1", T1)];
  const early = certCoverage(cert({ printedAt: T0 }), units);
  assert.equal(early.state, "covered");
  assert.equal(early.state === "covered" && early.via, "shakha");
  assert.equal(certCoverage(cert({ printedAt: T2 }), units).state, "pending");
});

test("certCoverage: a Mekhala handover covers its Shakhas ('via Mekhala')", () => {
  const cov = certCoverage(cert({ shakhaId: "s2", meghalaId: "m1" }), [unit("meghala", "m1", T1)]);
  assert.equal(cov.state === "covered" && cov.via, "meghala");
});

test("certCoverage: a Shakha's own record wins over its Mekhala's", () => {
  const cov = certCoverage(cert(), [unit("meghala", "m1", T1), unit("shakha", "s1", T2)]);
  assert.equal(cov.state === "covered" && cov.via, "shakha");
});

test("certCoverage: individual handover wins, even if not printed any more", () => {
  const individual = { id: "i", handedOverAt: T1, handedOverByName: null, receiverName: null, receiverPhone: null };
  const cov = certCoverage(cert({ printedAt: null, individual }), []);
  assert.equal(cov.state === "covered" && cov.via, "individual");
});

test("tallyCerts counts physical certificates (team = members)", () => {
  const t = tallyCerts(
    [cert({ count: 4, isTeam: true }), cert(), cert({ printedAt: null }), cert({ shakhaId: "s9", meghalaId: null })],
    [unit("shakha", "s1", T1)],
  );
  assert.deepEqual(t, { total: 7, covered: 5, pending: 1, notPrinted: 1, viaTrophy: 0, viaIndividual: 0, viaShakha: 5, viaMeghala: 0 });
});

// ── 1st–3rd certificates ────────────────────────────────────────────────

test("certCoverage: a winner's certificate given with the trophy shows against the individual", () => {
  const cov = certCoverage(cert({ position: 1, grade: "A", withTrophy: stamp("t1") }), [unit("shakha", "s1", T1)]);
  assert.equal(cov.state === "covered" && cov.via, "trophy");
  assert.equal(cov.state === "covered" && cov.handover.id, "t1");
});

test("certCoverage: a winner's certificate not given with the trophy goes in the Shakha bundle", () => {
  const winner = cert({ position: 2, grade: "A" });
  assert.equal(certCoverage(winner, []).state, "pending");
  const cov = certCoverage(winner, [unit("shakha", "s1", T1)]);
  assert.equal(cov.state === "covered" && cov.via, "shakha");
});

test("tallyCerts: placed and graded certificates count together; with-trophy ones aren't pending", () => {
  const certs = [
    cert({ position: 1, withTrophy: stamp("t1") }),
    cert({ position: 2 }),
    cert({ position: 3, isTeam: true, count: 5 }),
    cert(),
  ];
  const t = tallyCerts(certs, []);
  assert.equal(t.total, 8);
  assert.equal(t.viaTrophy, 1);
  assert.equal(t.covered, 1);
  assert.equal(t.pending, 7);
  // A Shakha marked afterwards takes everything still pending.
  const rows = buildCertificateUnits(certs, [], H);
  assert.equal(rows[0].shakhas[0].tally.pending, 7);
  assert.equal(rows[0].shakhas[0].canMark, true);
});

// ── unit board ──────────────────────────────────────────────────────────

const H: HierarchyInput = {
  level: "meghala",
  dioceses: [],
  meghalas: [
    { id: "m1", name: "Alpha", diocese_id: null },
    { id: "m2", name: "Beta", diocese_id: null },
  ],
  shakhas: [
    { id: "s1", name: "One", meghala_id: "m1" },
    { id: "s2", name: "Two", meghala_id: "m1" },
    { id: "s3", name: "Three", meghala_id: "m2" },
    { id: "s4", name: "Loose", meghala_id: null },
  ],
};

test("buildCertificateUnits: Mekhalas with nested Shakhas, unassigned Shakhas grouped", () => {
  const rows = buildCertificateUnits([cert({ shakhaId: "s1", meghalaId: "m1" }), cert({ shakhaId: "s4", meghalaId: null })], [], H);
  assert.deepEqual(rows.map((r) => [r.meghalaId, r.shakhas.map((s) => s.shakhaId)]), [
    ["m1", ["s1", "s2"]],
    ["m2", ["s3"]],
    [null, ["s4"]],
  ]);
  assert.equal(rows[0].tally.pending, 1);
  assert.equal(rows[0].canMark, true);
  assert.equal(rows[1].canMark, false); // nothing pending
  assert.equal(rows[2].canMark, false); // the unassigned group has no Mekhala to mark
  assert.equal(rows[2].shakhas[0].canMark, true);
});

test("buildCertificateUnits: Mekhala marked → its Shakhas covered via Mekhala and not markable", () => {
  const certs = [cert({ shakhaId: "s1" }), cert({ shakhaId: "s2" })];
  const rows = buildCertificateUnits(certs, [unit("meghala", "m1", T1)], H);
  const alpha = rows[0];
  assert.equal(alpha.canMark, false);
  for (const s of alpha.shakhas.filter((x) => x.tally.total > 0)) {
    assert.equal(s.canMark, false);
    assert.equal(coveredViaMeghala(s.tally), true);
  }
});

test("buildCertificateUnits: a Shakha marked before its Mekhala keeps its own record", () => {
  const certs = [cert({ shakhaId: "s1" }), cert({ shakhaId: "s2" })];
  const rows = buildCertificateUnits(certs, [unit("shakha", "s1", T1), unit("meghala", "m1", T2)], H);
  const [one, two] = rows[0].shakhas;
  assert.equal(one.handovers.length, 1);
  assert.equal(coveredViaMeghala(one.tally), false);
  assert.equal(one.tally.viaShakha, 1);
  assert.equal(coveredViaMeghala(two.tally), true);
});

test("buildCertificateUnits: certificates printed after a bulk handover are pending again", () => {
  const rows = buildCertificateUnits([cert({ shakhaId: "s1", printedAt: T0 }), cert({ shakhaId: "s1", printedAt: T2 })], [unit("shakha", "s1", T1)], H);
  const one = rows[0].shakhas[0];
  assert.equal(one.tally.covered, 1);
  assert.equal(one.tally.pending, 1);
  assert.equal(one.canMark, true);
});

test("buildCertificateUnits: shakha-level org gets one flat group", () => {
  const rows = buildCertificateUnits([cert({ shakhaId: "s3" })], [], { ...H, level: "shakha" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meghalaId, null);
  assert.equal(rows[0].shakhas.length, 4);
});

test("buildCertificateUnits: certificates without a Shakha get their own row, individual marking only", () => {
  const rows = buildCertificateUnits([cert({ shakhaId: null, meghalaId: null })], [], H);
  const none = rows.at(-1)!.shakhas.find((s) => s.shakhaId === null)!;
  assert.equal(none.tally.pending, 1);
  assert.equal(none.canMark, false);
});

test("summarizeUnits: covered vs pending units and certificates", () => {
  const certs = [cert({ shakhaId: "s1" }), cert({ shakhaId: "s2" }), cert({ shakhaId: "s3", meghalaId: "m2", printedAt: null })];
  const rows = buildCertificateUnits(certs, [unit("shakha", "s1", T1)], H);
  const s = summarizeUnits(rows);
  assert.deepEqual(s.shakhas, { covered: 1, pending: 1 }); // s3 is unprinted only → neither
  assert.deepEqual(s.meghalas, { covered: 0, pending: 1 });
  assert.equal(s.certificates.covered, 1);
  assert.equal(s.certificates.pending, 1);
  assert.equal(s.certificates.notPrinted, 1);
});
