#!/usr/bin/env node
// Turns a normalized import file (format: ../SKILL.md "Normalized input")
// into one transactional, re-runnable SQL script plus a review report.
// Pure — never touches the database; every name is resolved against the
// fetch-reference.mjs dump, so the SQL carries real uuids.
//
// Usage (from the repo root):
//   node .claude/skills/feast-data-import/scripts/build-import-sql.mjs \
//     --input <normalized.json> --ref <reference.json> --out <file.sql> [--approved]
//
// Always writes <file>.report.md. The SQL itself is written ONLY with
// --approved, which the skill passes only after the user has reviewed the
// report and replied "approved". Exit 2 = blocking errors (no SQL written).

import fs from "node:fs";

// ── args ────────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
}
if (!args.input || !args.ref || !args.out) {
  console.error("Usage: build-import-sql.mjs --input <normalized.json> --ref <reference.json> --out <file.sql>");
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
const ref = JSON.parse(fs.readFileSync(args.ref, "utf8"));
const reportPath = args.out.replace(/\.sql$/i, "") + ".report.md";

// ── text helpers ────────────────────────────────────────────────────────────
// "Exact" = identical after trimming, collapsing whitespace and ignoring case.
const norm = (s) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
// "Loose" also drops spaces and punctuation — used only to *flag* near-matches.
const loose = (s) => norm(s).replace(/[\s.,\-_'"`()/\\]/g, "");

function levenshtein(a, b) {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}
function similarity(a, b) {
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max([...a].length, [...b].length);
}
function closest(raw, options) {
  let best = null, score = 0;
  for (const o of options) {
    const s = similarity(loose(raw), loose(o));
    if (s > score) { best = o; score = s; }
  }
  return score >= 0.5 ? best : null;
}

// ── collectors ──────────────────────────────────────────────────────────────
const errors = new Map();   // message -> rows[] (blocking)
const warnings = new Map(); // message -> rows[]
const add = (bag, msg, row) => { if (!bag.has(msg)) bag.set(msg, []); if (row) bag.get(msg).push(row); };
const fmtRows = (rows) => (rows.length ? ` _(rows: ${[...new Set(rows)].slice(0, 12).join(", ")}${rows.length > 12 ? ", …" : ""})_` : "");

// ── reference lookups ───────────────────────────────────────────────────────
const feast = ref.feast;
if (input.feast && ![feast.id, feast.slug].includes(input.feast) && norm(input.feast) !== norm(feast.name)) {
  console.error(`Input is for feast "${input.feast}" but the reference dump is for "${feast.slug}". Re-run fetch-reference.mjs.`);
  process.exit(1);
}
const categorySlugs = new Map();
for (const c of ref.categories) { categorySlugs.set(norm(c.slug), c.slug); categorySlugs.set(norm(c.name), c.slug); categorySlugs.set(norm(c.slug.replace(/_/g, " ")), c.slug); }
const shakhaByNorm = new Map(ref.shakhas.map((s) => [norm(s.name), s]));
const shakhaById = new Map(ref.shakhas.map((s) => [s.id, s]));
const fcById = new Map(ref.feast_competitions.map((fc) => [fc.id, fc]));
const fcLabel = (fc) => `${fc.name}${fc.name_en ? ` (${fc.name_en})` : ""} · ${fc.gender ?? "any"} · ${fc.category_slug ?? "all ages"}`;

function resolveCategory(raw, row) {
  if (raw == null || raw === "") return null;
  const hit = categorySlugs.get(norm(raw)) ?? categorySlugs.get(norm(String(raw).replace(/[_-]/g, " ")));
  if (!hit) add(errors, `Unknown age category "${raw}" — map it to one of: ${ref.categories.map((c) => c.slug).join(", ")}`, row);
  return hit ?? null;
}
function resolveGender(raw, row) {
  if (raw == null || raw === "") return null;
  const v = norm(raw);
  if (v.startsWith("boy") || v === "male" || v === "m") return "boy";
  if (v.startsWith("girl") || v === "female" || v === "f") return "girl";
  add(errors, `Unknown gender "${raw}" (expected boy/girl)`, row);
  return null;
}
// ── org hierarchy ───────────────────────────────────────────────────────────
// Every participant/team row stores a leaf shakha_id; meghala/diocese are
// never written — they're read-time groupings (org_settings.hierarchy_level).
// Sheet meghala/diocese names are therefore used to (a) cross-check the
// shakha against the DB tree and (b) fill in a missing shakha only when the
// tier above has exactly one candidate.
const LEVEL = ref.hierarchy_level ?? "shakha";
const meghalas = ref.meghalas ?? [];
const dioceses = ref.dioceses ?? [];
const meghalaById = new Map(meghalas.map((m) => [m.id, m]));
const dioceseById = new Map(dioceses.map((d) => [d.id, d]));
const meghalaOf = (s) => meghalaById.get(s.meghala_id) ?? null;
const dioceseOf = (s) => dioceseById.get(meghalaOf(s)?.diocese_id) ?? null;
const shakhasUnder = (meghala, diocese) =>
  ref.shakhas.filter((s) => (!meghala || s.meghala_id === meghala.id) && (!diocese || dioceseOf(s)?.id === diocese.id));
const placeLabel = (s) => {
  if (LEVEL === "shakha") return s.name;
  const parts = [meghalaOf(s)?.name ?? "no meghala", LEVEL === "diocese" ? dioceseOf(s)?.name ?? "no diocese" : null].filter(Boolean);
  return `${s.name} (${parts.join(" / ")})`;
};
// Mirrors resolveCapScopeShakhaIds() in src/lib/reg-cap-scope.ts: caps and
// "one team per …" widen to the meghala/diocese at those hierarchy levels.
function capScopeOf(s) {
  const m = meghalaOf(s);
  if (LEVEL === "shakha" || !m) return { key: `s:${s.id}`, label: `shakha ${s.name}` };
  const d = LEVEL === "diocese" ? dioceseById.get(m.diocese_id) : null;
  return d ? { key: `d:${d.id}`, label: `diocese ${d.name}` } : { key: `m:${m.id}`, label: `meghala ${m.name}` };
}

function findNamed(raw, list) {
  return list.find((x) => norm(x.name) === norm(raw)) ?? list.find((x) => loose(x.name) === loose(raw)) ?? null;
}
function resolveNamed(kind, raw, list, row, suggestFrom = list) {
  const hit = findNamed(raw, list);
  if (hit) return hit;
  const best = closest(raw, suggestFrom.map((x) => x.name));
  add(errors, `Unknown ${kind} "${raw}"${best ? ` — did you mean "${best}"?` : ""}`, row);
  return null;
}

// loc = raw sheet names { shakha, meghala, diocese }; inferFrom = shakhas
// already known for this row (a team's members) to break a tie.
function resolveShakha(loc, row, inferFrom = []) {
  let rawMeghala = loc.meghala || null, rawDiocese = loc.diocese || null;
  if (rawMeghala && LEVEL === "shakha") {
    add(warnings, 'Sheet has meghala names but org_settings.hierarchy_level is "shakha" — ignored');
    rawMeghala = null;
  }
  if (rawDiocese && LEVEL !== "diocese") {
    add(warnings, `Sheet has diocese names but org_settings.hierarchy_level is "${LEVEL}" — ignored`);
    rawDiocese = null;
  }
  const diocese = rawDiocese ? resolveNamed("diocese", rawDiocese, dioceses, row) : null;
  const meghala = rawMeghala
    ? resolveNamed("meghala", rawMeghala, meghalas, row, diocese ? meghalas.filter((m) => m.diocese_id === diocese.id) : meghalas)
    : null;
  if ((rawDiocese && !diocese) || (rawMeghala && !meghala)) return null;
  if (meghala && diocese && meghala.diocese_id !== diocese.id) {
    add(errors, `Meghala "${meghala.name}" is under diocese "${dioceseById.get(meghala.diocese_id)?.name ?? "none"}" in the DB, but the sheet says "${diocese.name}"`, row);
    return null;
  }

  if (loc.shakha) {
    const hit = findNamed(loc.shakha, ref.shakhas);
    if (!hit) {
      const scope = shakhasUnder(meghala, diocese);
      const best = closest(loc.shakha, (scope.length ? scope : ref.shakhas).map((s) => s.name));
      add(errors, `Unknown shakha "${loc.shakha}"${meghala || diocese ? ` in ${meghala ? `meghala "${meghala.name}"` : `diocese "${diocese.name}"`}` : ""}${best ? ` — did you mean "${best}"?` : ""}`, row);
      return null;
    }
    const dbMeghala = meghalaOf(hit), dbDiocese = dioceseOf(hit);
    if (meghala && dbMeghala && dbMeghala.id !== meghala.id) {
      add(errors, `Shakha "${hit.name}" is under meghala "${dbMeghala.name}" in the DB, but the sheet says "${meghala.name}"`, row);
      return null;
    }
    if (diocese && dbDiocese && dbDiocese.id !== diocese.id) {
      add(errors, `Shakha "${hit.name}" is under diocese "${dbDiocese.name}" in the DB, but the sheet says "${diocese.name}"`, row);
      return null;
    }
    if ((meghala && !dbMeghala) || (diocese && !dbDiocese)) {
      add(warnings, `Shakha "${hit.name}" isn't assigned to ${meghala ? `meghala "${meghala.name}"` : `diocese "${diocese.name}"`} (or any) in the DB — its points will roll up as unassigned until it's placed in /admin/shakhas`, row);
    }
    return hit;
  }

  if (!meghala && !diocese) { add(errors, "Missing shakha", row); return null; }
  const where = meghala ? `meghala "${meghala.name}"` : `diocese "${diocese.name}"`;
  const candidates = shakhasUnder(meghala, diocese);
  if (candidates.length === 1) {
    add(warnings, `No shakha given — used "${candidates[0].name}", the only shakha in ${where}`, row);
    return candidates[0];
  }
  const fromMembers = [...new Set(inferFrom.filter((s) => candidates.includes(s)))];
  if (fromMembers.length === 1) {
    add(warnings, `No shakha given for the team — used "${fromMembers[0].name}", the shakha all its members belong to`, row);
    return fromMembers[0];
  }
  add(
    errors,
    `No shakha given for ${where} — every registration is stored under a shakha; add one of: ${candidates.map((s) => s.name).join(", ") || "(no shakhas in it)"}`,
    row
  );
  return null;
}
// Same predicate the app would need: name or English name, then narrow by
// gender/category unless the competition itself is gender-/age-agnostic.
function resolveCompetition(raw, gender, category, row) {
  if (!raw) { add(errors, "Missing competition", row); return null; }
  const named = ref.feast_competitions.filter((fc) => norm(fc.name) === norm(raw) || (fc.name_en && norm(fc.name_en) === norm(raw)));
  if (!named.length) {
    const best = closest(raw, ref.feast_competitions.flatMap((fc) => [fc.name, fc.name_en].filter(Boolean)));
    add(errors, `Competition "${raw}" is not in this feast${best ? ` — did you mean "${best}"?` : ""}`, row);
    return null;
  }
  const fits = named.filter(
    (fc) =>
      (!gender || !fc.gender || fc.gender === "common" || fc.gender === gender) &&
      (!category || !fc.category_slug || fc.category_slug === category)
  );
  if (fits.length === 1) return fits[0];
  add(
    errors,
    fits.length
      ? `Competition "${raw}" (${gender ?? "?"} / ${category ?? "?"}) is ambiguous: ${fits.map(fcLabel).join(" | ")}`
      : `Competition "${raw}" has no ${gender ?? ""} ${category ?? ""} variant in this feast. Variants: ${named.map(fcLabel).join(" | ")}`,
    row
  );
  return null;
}
function parseGrade(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().toUpperCase().match(/^([ABC])(\s*GRADE)?$/);
  return m ? m[1] : null;
}
function parsePosition(raw) {
  if (raw == null || raw === "") return null;
  const m = String(raw).match(/\d+/);
  if (m) return Number(m[0]) || null;
  const v = norm(raw);
  return v.startsWith("first") ? 1 : v.startsWith("second") ? 2 : v.startsWith("third") ? 3 : null;
}

// ── persons ─────────────────────────────────────────────────────────────────
// Same person = identical (name, house name, age category, shakha).
const isResults = !!input.results;
const personKeyOf = (p) => [norm(p.name), norm(p.house_name), p.category, p.shakha.id].join("|");

// Union-find so reviewed `merges` (row ids the user confirmed are the same
// person) collapse onto one participant.
const parent = new Map();
const find = (k) => { while (parent.get(k) && parent.get(k) !== k) k = parent.get(k); return k; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };

const rawPeople = []; // {row, name, house_name, category, gender, shakha, phone, key}
function collectPerson(src, row, fallback = {}) {
  const name = String(src.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) { add(errors, "Missing participant name", row); return null; }
  const shakha = src.shakha
    ? resolveShakha({ shakha: src.shakha, meghala: src.meghala ?? fallback.meghala, diocese: src.diocese ?? fallback.diocese }, row)
    : fallback.shakhaObj ?? resolveShakha({ meghala: src.meghala ?? fallback.meghala, diocese: src.diocese ?? fallback.diocese }, row);
  const category = resolveCategory(src.category ?? fallback.category, row);
  if (!category) { add(errors, `No age category for "${name}" — needed to derive a DOB`, row); }
  const gender = resolveGender(src.gender ?? fallback.gender, row);
  if (!shakha || !category) return null;
  const p = { row, name, house_name: String(src.house_name ?? "").trim().replace(/\s+/g, " ") || null, category, gender, shakha, phone: src.phone ? String(src.phone).trim() : null };
  p.key = personKeyOf(p);
  if (!parent.has(p.key)) parent.set(p.key, p.key);
  rawPeople.push(p);
  return p;
}

const entries = input.entries ?? [];
const teamsIn = input.teams ?? [];
const indiv = []; // {person, fc, participated, grade, position, row}
entries.forEach((e, i) => {
  const row = e.row ?? `entry#${i + 1}`;
  const p = collectPerson(e, row);
  const fc = resolveCompetition(e.competition, e.competition_gender ?? p?.gender ?? resolveGender(e.gender), e.competition_category ?? p?.category, row);
  if (!p || !fc) return;
  if (fc.type === "group") add(warnings, `"${fc.name}" is a group competition — put it under "teams", not "entries"; imported as an individual registration anyway`, row);
  const absent = !!e.absent;
  const grade = parseGrade(e.grade);
  if (e.grade != null && e.grade !== "" && !grade) add(warnings, `Unrecognised grade "${e.grade}" treated as no grade`, row);
  indiv.push({ person: p, fc, row, participated: isResults ? !absent : !!e.participated, scored: isResults && !absent, grade, position: parsePosition(e.position) });
});

const teams = []; // {fc, shakha, team_name, participated, grade, position, row, members: person[]}
teamsIn.forEach((t, i) => {
  const row = t.row ?? `team#${i + 1}`;
  // A team listed only by meghala/diocese can take its shakha from its members.
  const memberShakhas = (t.members ?? []).map((m) => (m.shakha ? findNamed(m.shakha, ref.shakhas) : null)).filter(Boolean);
  const shakha = resolveShakha({ shakha: t.shakha, meghala: t.meghala, diocese: t.diocese }, row, memberShakhas);
  const fc = resolveCompetition(t.competition, t.competition_gender ?? null, t.competition_category ?? null, row);
  const members = [];
  (t.members ?? []).forEach((m, j) => {
    const mrow = m.row ?? `${row}.m${j + 1}`;
    if (!m.category && !t.category) {
      add(warnings, `Team member "${m.name}" has no age category — skipped (team still imported)`, mrow);
      return;
    }
    const p = collectPerson(m, mrow, { shakhaObj: shakha, meghala: t.meghala, diocese: t.diocese, category: t.category, gender: t.gender });
    if (!p) return;
    members.push(p);
    // registerTeam() only accepts members from the team's own shakha.
    if (shakha && p.shakha.id !== shakha.id) {
      add(warnings, `Team member "${p.name}" is from ${p.shakha.name}, not the team's shakha ${shakha.name} — the app wouldn't allow this; imported anyway`, mrow);
    }
  });
  if (!shakha || !fc) return;
  if (fc.type !== "group") add(warnings, `"${fc.name}" is not a group competition but was listed as a team`, row);
  const absent = !!t.absent;
  teams.push({
    fc, shakha, row, members,
    team_name: String(t.team_name ?? "").trim() || shakha.name,
    participated: isResults ? !absent : !!t.participated,
    scored: isResults && !absent,
    grade: parseGrade(t.grade),
    position: parsePosition(t.position),
  });
});

// Reviewed merges: [["r12", "r40"], ...]
const keyByRow = new Map(rawPeople.map((p) => [String(p.row), p.key]));
for (const group of input.merges ?? []) {
  const keys = group.map((r) => keyByRow.get(String(r)));
  if (keys.some((k) => !k)) { add(errors, `merges entry references unknown row(s): ${group.join(", ")}`); continue; }
  keys.slice(1).forEach((k) => union(keys[0], k));
}

// Build canonical persons (first occurrence's details win).
const persons = new Map(); // canonical key -> person
for (const p of rawPeople) {
  const k = find(p.key);
  let c = persons.get(k);
  if (!c) {
    c = { ...p, key: k, rows: [], existing: null };
    persons.set(k, c);
  } else {
    if (p.gender && c.gender && p.gender !== c.gender) add(warnings, `"${c.name}" appears as both ${c.gender} and ${p.gender} — kept ${c.gender}`, p.row);
    if (p.category !== c.category) add(warnings, `Merged rows for "${c.name}" disagree on category (${c.category} vs ${p.category}) — kept ${c.category}`, p.row);
    if (!c.gender && p.gender) c.gender = p.gender;
    if (!c.phone && p.phone) c.phone = p.phone;
    if (!c.house_name && p.house_name) c.house_name = p.house_name;
  }
  c.rows.push(p.row);
}
const personOf = (p) => persons.get(find(p.key));

// Links to already-registered participants the user confirmed:
// [{ "row": "r12", "registration_number": "F5848-1120" }]
const existingByReg = new Map(ref.participants.map((p) => [String(p.registration_number), p]));
const existingById = new Map(ref.participants.map((p) => [p.id, p]));
for (const l of input.link_existing ?? []) {
  const k = keyByRow.get(String(l.row));
  const target = existingByReg.get(String(l.registration_number)) ?? existingById.get(l.participant_id);
  if (!k || !target) { add(errors, `link_existing entry not found: ${JSON.stringify(l)}`); continue; }
  persons.get(find(k)).existing = { ...target, how: "linked by review" };
}

// Exact matches against this feast's existing participants → reuse.
const existingByKey = new Map();
for (const e of ref.participants) {
  const k = [norm(e.name), norm(e.house_name), e.category_slug, e.shakha_id].join("|");
  if (!existingByKey.has(k)) existingByKey.set(k, e);
}
for (const p of persons.values()) {
  if (p.existing) continue;
  const hit = existingByKey.get([norm(p.name), norm(p.house_name), p.category, p.shakha.id].join("|"));
  if (hit) p.existing = { ...hit, how: "exact match" };
}

// ── potential duplicates (flag only, never merged automatically) ───────────
function nearMatch(a, b) {
  // a/b: {name, house_name, category, shakha_id}
  const na = loose(a.name), nb = loose(b.name), ha = loose(a.house_name), hb = loose(b.house_name);
  const nameSim = similarity(na, nb);
  const houseSim = ha && hb ? similarity(ha, hb) : null;
  const sameShakha = a.shakha_id === b.shakha_id, sameCat = a.category === b.category;
  if (na === nb && (houseSim === null || houseSim >= 0.8)) {
    if (!sameShakha && sameCat) return "same name & house, different shakha";
    if (sameShakha && !sameCat) return "same name & house, different age category";
    if (sameShakha && sameCat) {
      if (houseSim === null) return "same name, house name missing on one side";
      if (norm(a.name) !== norm(b.name)) return "name differs only in spacing/punctuation";
      return "same name, house name spelled slightly differently";
    }
  }
  if (sameShakha && sameCat) {
    if (nameSim >= 0.8 && (houseSim === null || houseSim >= 0.7)) return `similar name spelling (${Math.round(nameSim * 100)}%)`;
    if (houseSim !== null && houseSim >= 0.9 && nameSim >= 0.6) return `same house, similar name (${Math.round(nameSim * 100)}%)`;
  }
  return null;
}
const plist = [...persons.values()];
const view = (p) => ({ name: p.name, house_name: p.house_name, category: p.category, shakha_id: p.shakha.id });
const potential = [];
for (let i = 0; i < plist.length; i++) {
  for (let j = i + 1; j < plist.length; j++) {
    const a = plist[i], b = plist[j];
    if (a.shakha.id !== b.shakha.id && loose(a.name) !== loose(b.name)) continue;
    const why = nearMatch(view(a), view(b));
    if (why) potential.push({ why, a, b });
  }
}
const potentialExisting = [];
for (const p of plist) {
  if (p.existing) continue;
  for (const e of ref.participants) {
    if (e.shakha_id !== p.shakha.id && loose(e.name) !== loose(p.name)) continue;
    const why = nearMatch(view(p), { name: e.name, house_name: e.house_name, category: e.category_slug, shakha_id: e.shakha_id });
    if (why) potentialExisting.push({ why, p, e });
  }
}

// ── registrations / teams (dedupe) ──────────────────────────────────────────
const regs = new Map(); // `${personKey}|${fcId}` -> reg
for (const r of indiv) {
  const person = personOf(r.person);
  const k = `${person.key}|${r.fc.id}`;
  const prev = regs.get(k);
  if (!prev) { regs.set(k, { ...r, person, rows: [r.row] }); continue; }
  prev.rows.push(r.row);
  prev.participated ||= r.participated;
  prev.scored ||= r.scored;
  if ((r.grade && prev.grade && r.grade !== prev.grade) || (r.position && prev.position && r.position !== prev.position)) {
    add(warnings, `"${person.name}" is listed twice for ${fcLabel(r.fc)} with different results — kept the first`, r.row);
  }
  prev.grade ??= r.grade;
  prev.position ??= r.position;
}
const teamMap = new Map(); // `${fcId}|${shakhaId}` -> team (one team per shakha per competition)
for (const t of teams) {
  const k = `${t.fc.id}|${t.shakha.id}`;
  const prev = teamMap.get(k);
  if (!prev) { teamMap.set(k, { ...t, rows: [t.row], members: [...t.members] }); continue; }
  add(warnings, `${t.shakha.name} has more than one team for ${fcLabel(t.fc)} — the app allows one; merged into a single team`, t.row);
  prev.rows.push(t.row);
  prev.members.push(...t.members);
  prev.participated ||= t.participated;
  prev.scored ||= t.scored;
  prev.grade ??= t.grade;
  prev.position ??= t.position;
}
for (const t of teamMap.values()) {
  const seen = new Set();
  t.members = t.members.map(personOf).filter((p) => (seen.has(p.key) ? false : seen.add(p.key)));
  const cap = t.fc.max_team_size ?? 7;
  if (t.members.length > cap) add(warnings, `${t.shakha.name} team for ${fcLabel(t.fc)} has ${t.members.length} members (cap ${cap}) — imported anyway`, t.row);
}
// At meghala/diocese level the app allows one team per meghala/diocese, not
// per shakha — the DB unique key is still per shakha, so only warn.
if (LEVEL !== "shakha") {
  const perScope = new Map();
  for (const t of teamMap.values()) {
    const scope = capScopeOf(t.shakha);
    if (scope.key.startsWith("s:")) continue;
    const k = `${t.fc.id}|${scope.key}`;
    if (!perScope.has(k)) perScope.set(k, { scope, fc: t.fc, teams: [] });
    perScope.get(k).teams.push(t);
  }
  for (const { scope, fc, teams: ts } of perScope.values()) {
    if (ts.length > 1) {
      add(warnings, `${ts.length} teams from ${scope.label} for ${fcLabel(fc)} (${ts.map((t) => t.shakha.name).join(", ")}) — the app allows one team per ${LEVEL}; imported anyway`, ts[0].row);
    }
  }
}

// ── scores ──────────────────────────────────────────────────────────────────
// Grade buckets mirror calcGrade() in src/lib/result-calculator.ts:
// A ≥ 60%, B ≥ 50%, C ≥ 40%, below 40% = no grade. Scores are chosen as a
// percentage of max_score, clear of every bucket edge, and ordered so that
// the app's dense ranking on Publish reproduces the sheet's positions.
const BUCKET = {
  A: { hi: 95, mid: 75, lo: 61 },
  B: { hi: 58, mid: 54, lo: 51 },
  C: { hi: 48, mid: 44, lo: 41 },
  none: { hi: 35, mid: 25, lo: 1 },
};
const GRADE_RANK = { A: 0, B: 1, C: 2, none: 3 };
const scoreNotes = [];

function assignScores(units, fc) {
  const label = fcLabel(fc);
  const notes = [];
  const groups = new Map();
  for (const u of units) {
    const g = u.grade ?? "none";
    const k = `${u.position ?? "-"}|${g}`;
    if (!groups.has(k)) groups.set(k, { position: u.position, grade: g, units: [] });
    groups.get(k).units.push(u);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.position && b.position) return a.position - b.position || GRADE_RANK[a.grade] - GRADE_RANK[b.grade];
    if (a.position) return -1;
    if (b.position) return 1;
    return GRADE_RANK[a.grade] - GRADE_RANK[b.grade];
  });

  let prev = Infinity;
  let prevGroup = null;
  for (const g of ordered) {
    const b = BUCKET[g.grade];
    const want = g.position ? b.hi : b.mid;
    let pct = Math.min(want, prev - 1);
    if (pct < b.lo) {
      pct = want;
      notes.push(
        g.position
          ? `position ${g.position} (${g.grade === "none" ? "no grade" : g.grade}) is graded higher than a better-placed entry — kept the grade, so Publish will rank it higher than the sheet says`
          : `an unplaced ${g.grade === "none" ? "ungraded" : g.grade + "-grade"} entry outranks a placed entry by grade — kept the grade, so Publish will give it a position`
      );
    }
    if (prevGroup && g.position && prevGroup.position === g.position) {
      notes.push(`tied position ${g.position} across different grades — the tie can't survive Publish (scores must differ by grade)`);
    }
    for (const u of g.units) u.pct = pct;
    prev = Math.min(prev, pct);
    prevGroup = g;
  }

  const positions = [...new Set(units.map((u) => u.position).filter(Boolean))].sort((a, b) => a - b);
  const unplaced = units.filter((u) => !u.position).length;
  if (positions.length && units.length < 3) notes.push(`only ${units.length} entr${units.length === 1 ? "y" : "ies"} — the app awards no positions below 3 entries, so the sheet's positions will be dropped on Publish`);
  if (positions.some((p, i) => p !== i + 1)) notes.push(`positions ${positions.join(", ")} have gaps — dense ranking will renumber them consecutively`);
  if (units.length >= 3 && positions.length && positions.length < 3 && unplaced) notes.push(`sheet names no position ${positions.length + 1}, but Publish will award it to the best unplaced entries`);
  if (units.length >= 3 && !positions.length) notes.push("no positions in the sheet — Publish ranks by score, so entries sharing the top grade will tie for 1st");
  if (notes.length) scoreNotes.push({ label, notes: [...new Set(notes)] });
}

const unitsByFc = new Map();
const pushUnit = (fc, u) => { if (!unitsByFc.has(fc.id)) unitsByFc.set(fc.id, []); unitsByFc.get(fc.id).push(u); };
for (const r of regs.values()) if (r.scored) pushUnit(r.fc, r);
for (const t of teamMap.values()) if (t.scored) pushUnit(t.fc, t);
for (const [fcId, units] of unitsByFc) {
  const fc = fcById.get(fcId);
  if (fc.result_status === "published") add(errors, `${fcLabel(fc)} already has published results — unpublish it in /admin/results before importing scores`);
  assignScores(units, fc);
}

// Entry caps, per shakha or per meghala/diocese depending on the hierarchy
// level (import only — existing registrations aren't counted here).
const capCount = new Map();
for (const r of regs.values()) {
  const scope = capScopeOf(r.person.shakha);
  const k = `${r.fc.id}|${scope.key}`;
  if (!capCount.has(k)) capCount.set(k, { fc: r.fc, scope, n: 0 });
  capCount.get(k).n++;
}
for (const { fc, scope, n } of capCount.values()) {
  if (fc.max_per_shakha && n > fc.max_per_shakha) {
    add(warnings, `${scope.label}: ${n} entries for ${fcLabel(fc)} (cap ${fc.max_per_shakha}) — imported anyway, the SQL bypasses the cap`);
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const plistFinal = [...persons.values()];
const newPeople = plistFinal.filter((p) => !p.existing);
const regList = [...regs.values()];
const teamList = [...teamMap.values()];
const scoredCount = regList.filter((r) => r.scored).length + teamList.filter((t) => t.scored).length;
const catMeta = new Map(ref.categories.map((c) => [c.slug, c]));
const md = [];
md.push(`# Import review — ${feast.name} (${feast.slug})`, "");
md.push(`Source: ${input.source ?? "(not given)"} · Mode: ${isResults ? "registrations + results" : "registrations only"} · Hierarchy: ${LEVEL} · Reference fetched ${ref.fetched_at ?? "?"}`, "");
md.push(
  args.approved
    ? `**Status: approved** — SQL generated ${new Date().toISOString()}.`
    : '**Status: awaiting approval** — no SQL has been generated. Review everything below; reply **approved** to generate the import SQL.',
  ""
);
md.push("## Summary", "");
md.push(`- Source rows: ${entries.length} individual, ${teamsIn.length} team`);
md.push(`- Distinct people: **${plistFinal.length}** (${newPeople.length} new, ${plistFinal.length - newPeople.length} already registered in this feast)`);
md.push(`- Rows merged as the same person (exact name + house + category + shakha): ${rawPeople.length - plistFinal.length}`);
md.push(`- Individual registrations: ${regList.length} · Teams: ${teamList.length} · Scores: ${scoredCount}`);
md.push(`- Potential duplicates to review: **${potential.length}** within the sheet, **${potentialExisting.length}** against existing participants`);
md.push(`- Blocking errors: **${errors.size}** · Warnings: ${warnings.size + scoreNotes.length}`, "");
if (errors.size) {
  md.push("## ❌ Blocking errors (fix the normalized input, then re-run)", "");
  for (const [m, rows] of errors) md.push(`- ${m}${fmtRows(rows)}`);
  md.push("");
}
const who = (p) => `**${p.name}** / ${p.house_name ?? "—"} / ${p.category} / ${placeLabel(p.shakha)}`;
if (potential.length) {
  md.push("## ⚠️ Potential duplicates in the sheet (imported as separate people unless merged)", "");
  md.push('To merge, add the rows to `"merges"` in the normalized input, e.g. `[["r12", "r40"]]`.', "");
  for (const { why, a, b } of potential) md.push(`- ${why}: ${who(a)} (rows ${a.rows.join(", ")}) ↔ ${who(b)} (rows ${b.rows.join(", ")})`);
  md.push("");
}
if (potentialExisting.length) {
  md.push("## ⚠️ Possibly already registered (a new participant will be created unless linked)", "");
  md.push('To reuse the existing participant, add `{ "row": "<row>", "registration_number": "<reg no>" }` to `"link_existing"`.', "");
  for (const { why, p, e } of potentialExisting) {
    md.push(`- ${why}: ${who(p)} (rows ${p.rows.join(", ")}) ↔ existing **${e.name}** / ${e.house_name ?? "—"} / ${e.category_slug} / ${shakhaById.has(e.shakha_id) ? placeLabel(shakhaById.get(e.shakha_id)) : "?"} — ${e.registration_number}`);
  }
  md.push("");
}
if (warnings.size) {
  md.push("## Warnings", "");
  for (const [m, rows] of warnings) md.push(`- ${m}${fmtRows(rows)}`);
  md.push("");
}
if (scoreNotes.length) {
  md.push("## Scoring notes (how Publish will rank these)", "");
  for (const s of scoreNotes) md.push(`- **${s.label}**: ${s.notes.join("; ")}`);
  md.push("");
}
md.push("## Scoring rule applied", "");
md.push("Scores are a % of each competition's `max_score` (set to 100 where unset). Grade given → a score inside that grade's bucket; no grade → below the C cut-off (40%). Placed entries score above every unplaced entry so Publish reproduces the positions.", "");
md.push("| | 1st / 2nd / 3rd | unplaced |", "|---|---|---|");
for (const g of ["A", "B", "C", "none"]) {
  const b = BUCKET[g];
  md.push(`| ${g === "none" ? "No grade" : "Grade " + g} | ${b.hi} / ${b.hi - 1} / ${b.hi - 2}% | ${b.mid}% |`);
}
md.push("");
md.push("## Generated DOBs", "");
md.push("The sheet has no DOB, so each new participant gets a placeholder DOB inside their category's cut-offs from `competition_categories`:", "");
for (const c of ref.categories) md.push(`- ${c.slug}: ${c.min_dob ?? "…"} → ${c.max_dob ?? "…"}`);
md.push("");
md.push("## People", "");
md.push("| # | Name | House | Category | Gender | Shakha | Status | Rows |", "|---|---|---|---|---|---|---|---|");
plistFinal.forEach((p, i) =>
  md.push(`| ${i + 1} | ${p.name} | ${p.house_name ?? ""} | ${catMeta.get(p.category)?.name ?? p.category} | ${p.gender ?? ""} | ${placeLabel(p.shakha)} | ${p.existing ? `reuse ${p.existing.registration_number} (${p.existing.how})` : "new"} | ${p.rows.join(", ")} |`)
);
md.push("");
fs.writeFileSync(reportPath, md.join("\n"));

if (errors.size) {
  console.error(`${errors.size} blocking error(s) — no SQL written. See ${reportPath}`);
  for (const [m, rows] of errors) console.error(`  - ${m}${rows.length ? ` [${[...new Set(rows)].slice(0, 5).join(", ")}]` : ""}`);
  process.exit(2);
}

if (!args.approved) {
  if (fs.existsSync(args.out)) fs.unlinkSync(args.out); // never leave a stale, unapproved SQL behind
  console.log(`Wrote ${reportPath}`);
  console.log(`People ${plistFinal.length} (${newPeople.length} new) · registrations ${regList.length} · teams ${teamList.length} · scores ${scoredCount}`);
  console.log(`Potential duplicates: ${potential.length} in sheet, ${potentialExisting.length} vs existing · warnings ${warnings.size + scoreNotes.length}`);
  console.log('AWAITING APPROVAL — no SQL written. Re-run with --approved only after the user replies "approved".');
  process.exit(0);
}

// ── SQL ─────────────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const cmt = (s) => String(s).replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /");
const F = q(feast.id);
const regPrefix = `F${feast.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`; // getRegPrefix() in src/lib/feast-data.ts

const ord = new Map(plistFinal.map((p, i) => [p.key, i + 1]));
const valuesBlock = (rows) => rows.map((r, i) => `  ${r.sql}${i === rows.length - 1 ? ";" : ","}${r.comment ? ` -- ${cmt(r.comment)}` : ""}`).join("\n");
const describe = (u) => [u.position ? `pos ${u.position}` : null, u.grade ? `grade ${u.grade}` : u.scored ? "no grade" : null, u.scored ? null : u.participated ? "participated" : "registration only"].filter(Boolean).join(", ");

const personRows = plistFinal.map((p) => ({
  sql: `(${ord.get(p.key)}, ${q(p.name)}, ${q(p.house_name)}, ${q(p.shakha.id)}, ${q(p.category)}, ${q(p.gender)}, ${q(p.phone)}, ${p.existing ? q(p.existing.id) : "null"})`,
  comment: `${placeLabel(p.shakha)} · rows ${p.rows.join(", ")}${p.existing ? ` · reuse ${p.existing.registration_number}` : ""}`,
}));
const regRows = regList.map((r) => ({
  sql: `(${ord.get(r.person.key)}, ${q(r.fc.id)}, ${r.participated}, ${r.scored ? r.pct : "null"})`,
  comment: `${r.person.name} → ${fcLabel(r.fc)}${describe(r) ? ` · ${describe(r)}` : ""}`,
}));
const teamRows = teamList.map((t, i) => ({
  sql: `(${i + 1}, ${q(t.fc.id)}, ${q(t.shakha.id)}, ${q(t.team_name)}, ${t.participated}, ${t.scored ? t.pct : "null"})`,
  comment: `${placeLabel(t.shakha)} → ${fcLabel(t.fc)}${describe(t) ? ` · ${describe(t)}` : ""}`,
}));
const memberRows = teamList.flatMap((t, i) => t.members.map((m) => ({ sql: `(${i + 1}, ${ord.get(m.key)})`, comment: `${m.name} → ${t.shakha.name} ${t.fc.name}` })));

const sql = `-- ════════════════════════════════════════════════════════════════════════
-- Feast Hub data import (generated by .claude/skills/feast-data-import)
-- Feast:   ${cmt(feast.name)} (${feast.slug}) ${feast.id}
-- Source:  ${cmt(input.source ?? "(not given)")}
-- Built:   ${new Date().toISOString()} (approved by the user after reviewing the report)
-- People ${plistFinal.length} (${newPeople.length} new) · registrations ${regList.length} · teams ${teamList.length} · scores ${scoredCount}
--
-- Review ${reportPath.split(/[\\/]/).pop()} first. Run in the Supabase SQL editor.
-- This is a data import, NOT a migration — don't put it in supabase/migrations.
-- Uuids come from the database the reference was fetched from; running it
-- against another database fails the guard block below instead of guessing.
--
-- Safe to re-run: people matching an existing participant exactly are
-- reused, registrations/teams are upserted, and scores are only written
-- while a result is still a draft. Scores land as drafts — open
-- /admin/results and Publish each competition to compute grades,
-- positions, points and standings.
-- ════════════════════════════════════════════════════════════════════════

begin;

drop table if exists _imp_team_member, _imp_team, _imp_reg, _imp_person;

create temp table _imp_person (
  ord            int primary key,
  name           text not null,
  house_name     text,
  shakha_id      uuid not null,
  category_slug  text not null,
  gender         text,
  phone          text,
  participant_id uuid,              -- pre-set = reviewed/exact link to an existing participant
  is_new         boolean not null default false
);

create temp table _imp_reg (
  person_ord   int not null,
  fc_id        uuid not null,
  participated boolean not null,
  score_pct    numeric,             -- % of max_score; null = registration only
  primary key (person_ord, fc_id)
);

create temp table _imp_team (
  ord                  int primary key,
  fc_id                uuid not null,
  shakha_id            uuid not null,
  team_name            text not null,
  participated         boolean not null,
  score_pct            numeric,
  team_registration_id uuid
);

create temp table _imp_team_member (
  team_ord   int not null,
  person_ord int not null,
  primary key (team_ord, person_ord)
);
${personRows.length ? `
insert into _imp_person (ord, name, house_name, shakha_id, category_slug, gender, phone, participant_id) values
${valuesBlock(personRows)}
` : ""}${regRows.length ? `
insert into _imp_reg (person_ord, fc_id, participated, score_pct) values
${valuesBlock(regRows)}
` : ""}${teamRows.length ? `
insert into _imp_team (ord, fc_id, shakha_id, team_name, participated, score_pct) values
${valuesBlock(teamRows)}
` : ""}${memberRows.length ? `
insert into _imp_team_member (team_ord, person_ord) values
${valuesBlock(memberRows)}
` : ""}
-- ── Guard: everything must belong to this feast / database ──────────────
do $$
declare v_bad text;
begin
  if not exists (select 1 from feasts where id = ${F}) then
    raise exception 'Feast ${feast.id} not found — this SQL was generated against a different database';
  end if;

  select string_agg(distinct x.fc_id::text, ', ') into v_bad
  from (select fc_id from _imp_reg union select fc_id from _imp_team) x
  where not exists (select 1 from feast_competitions fc where fc.id = x.fc_id and fc.feast_id = ${F});
  if v_bad is not null then raise exception 'Competitions not attached to this feast: %', v_bad; end if;

  select string_agg(distinct x.shakha_id::text, ', ') into v_bad
  from (select shakha_id from _imp_person union select shakha_id from _imp_team) x
  where not exists (select 1 from shakhas s where s.id = x.shakha_id);
  if v_bad is not null then raise exception 'Unknown shakhas: %', v_bad; end if;

  select string_agg(distinct i.category_slug, ', ') into v_bad
  from _imp_person i
  where not exists (select 1 from competition_categories cc where cc.slug = i.category_slug);
  if v_bad is not null then raise exception 'Unknown age categories: %', v_bad; end if;

  select string_agg(distinct c.name, ', ') into v_bad
  from feast_competitions fc join competitions c on c.id = fc.competition_id
  where fc.result_status = 'published'
    and fc.id in (select fc_id from _imp_reg where score_pct is not null
                  union select fc_id from _imp_team where score_pct is not null);
  if v_bad is not null then raise exception 'Already published — unpublish in /admin/results first: %', v_bad; end if;
end $$;

-- ── Publish needs a max_score; default to 100 where unset ───────────────
update feast_competitions set max_score = 100
where max_score is null
  and id in (select fc_id from _imp_reg where score_pct is not null
             union select fc_id from _imp_team where score_pct is not null);

-- ── Participants: reuse exact matches (name + house + category + shakha) ─
update _imp_person i set participant_id = (
  select p.id
  from participants p
  join competition_categories cc on cc.id = p.competition_category_id
  where p.feast_id = ${F}
    and p.shakha_id = i.shakha_id
    and cc.slug = i.category_slug
    and lower(regexp_replace(btrim(p.name), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g'))
    and lower(regexp_replace(btrim(coalesce(p.house_name, '')), '\\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(coalesce(i.house_name, '')), '\\s+', ' ', 'g'))
  order by p.created_at
  limit 1
)
where i.participant_id is null;

update _imp_person set participant_id = gen_random_uuid(), is_new = true where participant_id is null;

-- New participants. The sheet has no DOB, so each gets a placeholder DOB
-- inside its category's own cut-offs (competition_categories is the single
-- source of truth). Registration numbers follow createParticipantAdmin():
-- getRegPrefix(feast) || '-' || next_reg_number(feast).
insert into participants
  (id, feast_id, shakha_id, name, house_name, date_of_birth, gender, competition_category_id, phone, registration_number)
select
  i.participant_id, ${F}, i.shakha_id, i.name, i.house_name,
  case
    when cc.min_dob is not null and cc.max_dob is not null then cc.min_dob + (cc.max_dob - cc.min_dob) / 2
    when cc.min_dob is not null then cc.min_dob + 730
    else cc.max_dob - 3650
  end,
  i.gender, cc.id, i.phone,
  '${regPrefix}-' || next_reg_number(${F})
from _imp_person i
join competition_categories cc on cc.slug = i.category_slug
where i.is_new
order by i.ord;

-- ── Individual registrations + draft scores ─────────────────────────────
insert into participant_registrations (participant_id, feast_competition_id, participated)
select i.participant_id, r.fc_id, r.participated
from _imp_reg r
join _imp_person i on i.ord = r.person_ord
on conflict (participant_id, feast_competition_id)
  do update set participated = participant_registrations.participated or excluded.participated;

insert into competition_results (feast_competition_id, participant_registration_id, score)
select r.fc_id, pr.id, round(r.score_pct * fc.max_score / 100.0, 2)
from _imp_reg r
join _imp_person i on i.ord = r.person_ord
join participant_registrations pr on pr.participant_id = i.participant_id and pr.feast_competition_id = r.fc_id
join feast_competitions fc on fc.id = r.fc_id
where r.score_pct is not null
on conflict (participant_registration_id)
  do update set score = excluded.score, updated_at = now()
  where competition_results.published_at is null;

-- ── Teams (one per shakha per competition) + members + draft scores ─────
insert into team_registrations (feast_id, feast_competition_id, shakha_id, team_name, participated)
select ${F}, t.fc_id, t.shakha_id, t.team_name, t.participated
from _imp_team t
on conflict (feast_competition_id, shakha_id)
  do update set participated = team_registrations.participated or excluded.participated;

update _imp_team t set team_registration_id = tr.id
from team_registrations tr
where tr.feast_competition_id = t.fc_id and tr.shakha_id = t.shakha_id;

insert into team_registration_members (team_registration_id, participant_id, feast_competition_id)
select t.team_registration_id, i.participant_id, t.fc_id
from _imp_team_member m
join _imp_team t on t.ord = m.team_ord
join _imp_person i on i.ord = m.person_ord
on conflict do nothing;

insert into team_results (feast_competition_id, team_registration_id, score)
select t.fc_id, t.team_registration_id, round(t.score_pct * fc.max_score / 100.0, 2)
from _imp_team t
join feast_competitions fc on fc.id = t.fc_id
where t.score_pct is not null
on conflict (team_registration_id)
  do update set score = excluded.score, updated_at = now()
  where team_results.published_at is null;

commit;

select
  (select count(*) from _imp_person where is_new)     as participants_created,
  (select count(*) from _imp_person where not is_new) as participants_reused,
  (select count(*) from _imp_reg)                     as registrations,
  (select count(*) from _imp_reg where score_pct is not null)  as individual_scores,
  (select count(*) from _imp_team)                    as teams,
  (select count(*) from _imp_team where score_pct is not null) as team_scores;
`;

fs.writeFileSync(args.out, sql);
console.log(`Wrote ${args.out}`);
console.log(`Wrote ${reportPath}`);
console.log(`People ${plistFinal.length} (${newPeople.length} new) · registrations ${regList.length} · teams ${teamList.length} · scores ${scoredCount}`);
console.log(`Potential duplicates: ${potential.length} in sheet, ${potentialExisting.length} vs existing · warnings ${warnings.size + scoreNotes.length}`);
