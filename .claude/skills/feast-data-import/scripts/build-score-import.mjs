#!/usr/bin/env node
// Turns a normalized, chance-number-keyed score sheet into one transactional,
// re-runnable SQL script plus a review report. Pure — never touches the DB;
// every chance number is resolved against the fetch-reference.mjs dump.
//
// This is the score-only mode: it does NOT create participants, registrations
// or teams. It writes draft competition_results (or team_results) for the
// registrations whose chance_no matches, and leaves Publish to compute grade,
// position, points and standings.
//
// Usage (from the repo root):
//   node .claude/skills/feast-data-import/scripts/build-score-import.mjs \
//     --input <normalized-score.json> --ref <reference.json> --out <file.sql> [--approved]
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
  console.error("Usage: build-score-import.mjs --input <normalized.json> --ref <reference.json> --out <file.sql>");
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
const ref = JSON.parse(fs.readFileSync(args.ref, "utf8"));
const reportPath = args.out.replace(/\.sql$/i, "") + ".report.md";

// ── text helpers ────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const q = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const cmt = (s) => String(s).replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /");

// ── collectors ──────────────────────────────────────────────────────────────
const errors = new Map(); // message -> rows[] (blocking)
const warnings = new Map(); // message -> rows[]
const add = (bag, msg, row) => {
  if (!bag.has(msg)) bag.set(msg, []);
  if (row) bag.get(msg).push(row);
};
const fmtRows = (rows) => (rows.length ? ` _(rows: ${[...new Set(rows)].slice(0, 12).join(", ")}${rows.length > 12 ? ", …" : ""})_` : "");

// ── feast ───────────────────────────────────────────────────────────────────
const feast = ref.feast;
if (input.feast && ![feast.id, feast.slug].includes(input.feast) && norm(input.feast) !== norm(feast.name)) {
  console.error(`Input is for feast "${input.feast}" but the reference dump is for "${feast.slug}". Re-run fetch-reference.mjs.`);
  process.exit(1);
}
const fcLabel = (fc) => `${fc.name}${fc.name_en ? ` (${fc.name_en})` : ""} · ${fc.gender ?? "any"} · ${fc.category_slug ?? "all ages"}`;
const shakhaName = new Map((ref.shakhas ?? []).map((s) => [s.id, s.name]));

// ── resolve the competition ─────────────────────────────────────────────────
// The 29 literature items are variants of a few names, split by gender and age
// category, so name alone is often ambiguous. `competition` may be a string or
// { name, name_en, gender, category }; gender/category may also sit at the top
// level of the input.
const compInput = typeof input.competition === "string" ? { name: input.competition } : input.competition ?? {};
const names = [compInput.name, compInput.name_en, input.competition_name, input.competition_name_en]
  .filter(Boolean)
  .map(norm);
const gender = compInput.gender ?? input.gender ?? null;
const category = compInput.category ?? input.category ?? null;

let fc = null;
if (!names.length) {
  add(errors, 'Missing competition — set "competition" (name or name_en) in the normalized input');
} else {
  const named = ref.feast_competitions.filter(
    (c) => names.some((n) => norm(c.name) === n || (c.name_en && norm(c.name_en) === n))
  );
  const fits = named.filter(
    (c) =>
      (!gender || !c.gender || c.gender === "common" || c.gender === gender) &&
      (!category || !c.category_slug || c.category_slug === category)
  );
  if (fits.length === 1) fc = fits[0];
  else if (!named.length) {
    add(errors, `Competition "${compInput.name ?? compInput.name_en}" is not in this feast. Available: ${ref.feast_competitions.map(fcLabel).join(" | ")}`);
  } else if (fits.length) {
    add(errors, `Competition is ambiguous: ${fits.map(fcLabel).join(" | ")} — add gender/category to the normalized input`);
  } else {
    add(errors, `No ${gender ?? ""} ${category ?? ""} variant of "${compInput.name ?? compInput.name_en}". Variants: ${named.map(fcLabel).join(" | ")}`);
  }
}
const isTeam = fc?.type === "group";

// ── score maximum ───────────────────────────────────────────────────────────
// The sheet's own maximum (e.g. 30 for three marks out of 10). Scores are
// stored as a percentage of the competition's max_score, so if max_score is
// already set to something else the marks are scaled by max_score / score_max.
const scoreMax = Number(input.score_max);
if (!Number.isFinite(scoreMax) || scoreMax <= 0) {
  add(errors, 'Missing/invalid "score_max" — the maximum possible sum in the sheet (e.g. 30 for three marks out of 10, or 100 if the sum is out of 100)');
}

// ── read the sheet rows ─────────────────────────────────────────────────────
const entriesIn = input.entries ?? input.results ?? [];
if (!entriesIn.length) add(errors, 'No score rows in the normalized input ("entries")');

const byChanceInput = new Map();
entriesIn.forEach((e, i) => {
  const row = e.row ?? `csv:${i + 2}`;
  const chance = Number(e.chance_no);
  const score = Number(e.score);
  if (!Number.isInteger(chance) || chance < 1 || chance > 99999) {
    add(errors, `Invalid chance number "${e.chance_no}"`, row);
    return;
  }
  if (scoreMax > 0 && (!Number.isFinite(score) || score < 0 || score > scoreMax)) {
    add(errors, `Score "${e.score}" is not between 0 and score_max (${scoreMax})`, row);
    return;
  }
  if (!byChanceInput.has(chance)) byChanceInput.set(chance, []);
  byChanceInput.get(chance).push({ chance_no: chance, score, row });
});
for (const [chance, rows] of byChanceInput) {
  if (rows.length > 1) add(errors, `Chance number ${chance} appears ${rows.length} times in the sheet`, rows.map((r) => r.row).join(", "));
}
const entries = [...byChanceInput.values()].map((rows) => rows[0]);

// ── match against the feast's registrations ─────────────────────────────────
const matched = [];
let byChanceDb = new Map();
let existingResults = [];
if (fc) {
  if (fc.result_status === "published") {
    add(errors, `${fcLabel(fc)} already has published results — unpublish it in /admin/results before importing scores`);
  }
  if (!Array.isArray(ref.registrations)) {
    add(errors, "reference.json has no registrations — re-run fetch-reference.mjs with the current script");
  } else {
    const source = isTeam ? ref.team_registrations ?? [] : ref.registrations;
    for (const r of source) {
      if (r.feast_competition_id !== fc.id || r.chance_no == null) continue;
      if (!byChanceDb.has(r.chance_no)) byChanceDb.set(r.chance_no, []);
      byChanceDb.get(r.chance_no).push(r);
    }
    for (const e of entries) {
      const hits = byChanceDb.get(e.chance_no) ?? [];
      if (!hits.length) {
        add(errors, `Chance number ${e.chance_no} is not registered in ${fcLabel(fc)}`, e.row);
      } else if (hits.length > 1) {
        add(errors, `Chance number ${e.chance_no} matches ${hits.length} registrations in ${fcLabel(fc)} — ambiguous`, e.row);
      } else {
        matched.push({ ...e, reg: hits[0] });
      }
    }

    const missingFromSheet = [...byChanceDb.keys()].filter((c) => !byChanceInput.has(c));
    if (missingFromSheet.length) {
      add(
        warnings,
        `${missingFromSheet.length} registration(s) in this competition have a chance number but no row in the sheet — they will not get a score, and Publish will ignore them`,
        missingFromSheet.slice(0, 12).join(", ")
      );
    }

    const noChance = source.filter((r) => r.feast_competition_id === fc.id && r.chance_no == null);
    if (noChance.length) {
      const names = noChance.map((r) => (isTeam ? r.team_name : r.name)).filter(Boolean).slice(0, 12).join(", ");
      add(
        warnings,
        `${noChance.length} registration(s) in this competition have no chance number — assign one on /admin/participation if they should be scored${names ? `: ${names}` : ""}`
      );
    }

    existingResults = (isTeam ? ref.team_results ?? [] : ref.results ?? []).filter((r) => r.feast_competition_id === fc.id);
    const matchedIds = new Set(matched.map((m) => m.reg.id));
    const stale = existingResults.filter((r) => !matchedIds.has(isTeam ? r.team_registration_id : r.participant_registration_id));
    if (stale.length) {
      add(
        warnings,
        `${stale.length} existing draft score(s) in this competition are not in the sheet — they stay in place and will also be published`,
        stale.slice(0, 12).map((r) => (isTeam ? r.team_registration_id : r.participant_registration_id)).join(", ")
      );
    }
  }
}

// ── max_score plan ──────────────────────────────────────────────────────────
const setMaxScore = input.set_max_score !== false;
let maxPlan = null;
if (fc) {
  const existing = fc.max_score == null ? null : Number(fc.max_score);
  if (existing == null && !setMaxScore) {
    add(errors, "Competition max_score is unset and \"set_max_score\": false — Publish refuses without max_score");
  } else if (existing == null) {
    maxPlan = { kind: "set", from: null, to: scoreMax, factor: 1 };
  } else if (existing === scoreMax) {
    maxPlan = { kind: "same", from: existing, to: existing, factor: 1 };
  } else {
    maxPlan = { kind: "scale", from: existing, to: existing, factor: existing / scoreMax };
  }
}

// ── preview grade / position (mirrors src/lib/result-calculator.ts) ─────────
const gradeOf = (pct) => (pct >= 60 ? "A" : pct >= 50 ? "B" : pct >= 40 ? "C" : null);
const previewPositions = new Map();
if (matched.length >= 3) {
  const sorted = [...matched].filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  let pos = 1;
  sorted.forEach((m, i) => {
    if (i > 0 && sorted[i].score < sorted[i - 1].score) pos += 1;
    previewPositions.set(m.chance_no, pos <= 3 ? pos : null);
  });
}

// ── report ──────────────────────────────────────────────────────────────────
const md = [];
md.push(`# Score import review — ${feast.name} (${feast.slug})`, "");
md.push(
  `Source: ${input.source ?? "(not given)"} · Mode: scores by chance number · Type: ${isTeam ? "team" : "individual"} · Reference fetched ${ref.fetched_at ?? "?"}`,
  ""
);
md.push(
  args.approved
    ? `**Status: approved** — SQL generated ${new Date().toISOString()}.`
    : "**Status: awaiting approval** — no SQL has been generated. Review everything below; reply **approved** to generate the import SQL.",
  ""
);
if (fc) md.push(`Competition: **${fcLabel(fc)}**`, "");
md.push("## Summary", "");
md.push(`- Sheet rows: ${entriesIn.length} · matched to a registration: **${matched.length}** · unmatched: **${entries.length - matched.length}**`);
if (maxPlan) {
  md.push(
    maxPlan.kind === "set"
      ? `- Sheet maximum: **${scoreMax}** · competition max_score is unset → the SQL sets it to **${scoreMax}** (the sum is stored as-is)`
      : maxPlan.kind === "same"
        ? `- Sheet maximum: **${scoreMax}** · competition max_score is already **${scoreMax}** (the sum is stored as-is)`
        : `- Sheet maximum: **${scoreMax}** · competition max_score is **${maxPlan.from}** → scores are scaled by **${maxPlan.factor.toFixed(4)}** (a ${scoreMax}-mark sum becomes a score out of ${maxPlan.from})`
  );
}
md.push(`- Existing draft scores in this competition: ${existingResults.length}`);
md.push(`- Blocking errors: **${errors.size}** · Warnings: ${warnings.size}`, "");

if (errors.size) {
  md.push("## ❌ Blocking errors (fix the normalized input, then re-run)", "");
  for (const [m, rows] of errors) md.push(`- ${m}${fmtRows(rows)}`);
  md.push("");
}
if (warnings.size) {
  md.push("## Warnings", "");
  for (const [m, rows] of warnings) md.push(`- ${m}${fmtRows(rows)}`);
  md.push("");
}

if (matched.length) {
  md.push("## Scores", "");
  md.push(
    `Preview only — Publish recomputes grade/position from every draft score in the competition. Positions appear only with 3+ entries, ties share a position, and a score of 0 never places.`,
    ""
  );
  md.push("| # | Chance | " + (isTeam ? "Team" : "Participant") + " | Shakha | Sheet score | % | Grade | Position | Rows |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  matched.forEach((m, i) => {
    const pct = (m.score / scoreMax) * 100;
    const grade = gradeOf(pct);
    const pos = previewPositions.get(m.chance_no);
    const who = isTeam
      ? m.reg.team_name
      : `${m.reg.name ?? "?"} / ${m.reg.house_name ?? "—"} / ${m.reg.registration_number ?? "—"}`;
    const shakha = shakhaName.get(m.reg.shakha_id) ?? "?";
    md.push(
      `| ${i + 1} | ${m.chance_no} | ${who} | ${shakha} | ${m.score} | ${pct.toFixed(1)}% | ${grade ?? "—"} | ${pos ?? "—"} | ${m.row} |`
    );
  });
  md.push("");
}

if (fc && Array.isArray(ref.registrations)) {
  const unmatched = entries.filter((e) => !matched.some((m) => m.chance_no === e.chance_no)).map((e) => e.chance_no);
  if (unmatched.length) {
    md.push("## Chance numbers not matched", "");
    md.push(`These sheet rows have no registration in **${fcLabel(fc)}**: ${unmatched.join(", ")}`, "");
  }
}
fs.writeFileSync(reportPath, md.join("\n"));

if (errors.size) {
  console.error(`${errors.size} blocking error(s) — no SQL written. See ${reportPath}`);
  for (const [m, rows] of errors) console.error(`  - ${m}${rows.length ? ` [${[...new Set(rows)].slice(0, 5).join(", ")}]` : ""}`);
  process.exit(2);
}

if (!args.approved) {
  if (fs.existsSync(args.out)) fs.unlinkSync(args.out); // never leave a stale, unapproved SQL behind
  console.log(`Wrote ${reportPath}`);
  console.log(`Matched ${matched.length} of ${entries.length} sheet rows · errors 0 · warnings ${warnings.size}`);
  console.log('AWAITING APPROVAL — no SQL written. Re-run with --approved only after the user replies "approved".');
  process.exit(0);
}

// ── SQL ─────────────────────────────────────────────────────────────────────
if (!fc) {
  console.error("No competition resolved — cannot generate SQL.");
  process.exit(2);
}
const F = q(feast.id);
const FC = q(fc.id);
const valuesBlock = matched.map((m, i) => `  (${m.chance_no}, ${m.score})${i === matched.length - 1 ? ";" : ","}`).join("\n");
const regTable = isTeam ? "team_registrations" : "participant_registrations";
const resTable = isTeam ? "team_results" : "competition_results";
const regFk = isTeam ? "team_registration_id" : "participant_registration_id";

const sql = `-- ════════════════════════════════════════════════════════════════════════
-- Feast Hub score import by chance number (generated by .claude/skills/feast-data-import)
-- Feast:   ${cmt(feast.name)} (${feast.slug}) ${feast.id}
-- Item:    ${cmt(fcLabel(fc))} ${fc.id}
-- Source:  ${cmt(input.source ?? "(not given)")}
-- Built:   ${new Date().toISOString()} (approved by the user after reviewing the report)
-- Rows:    ${matched.length} matched · sheet maximum ${scoreMax}
--
-- Review ${reportPath.split(/[\\/]/).pop()} first. Run in the Supabase SQL editor.
-- This is a data import, NOT a migration — don't put it in supabase/migrations.
--
-- Safe to re-run: scores are upserted on the registration, and only while the
-- result is still a draft. Scores land as drafts — open /admin/results and
-- Publish this competition to compute grade, position, points and standings.
-- ════════════════════════════════════════════════════════════════════════

begin;

drop table if exists _score_import;

create temp table _score_import (
  chance_no integer primary key,
  score     numeric not null check (score >= 0 and score <= ${scoreMax})
);

insert into _score_import (chance_no, score) values
${valuesBlock}

-- ── Guard: feast/item must match, not published, chance numbers resolve ──
do $$
declare v_bad text;
begin
  if not exists (select 1 from feasts where id = ${F}) then
    raise exception 'Feast ${feast.id} not found — this SQL was generated against a different database';
  end if;

  if not exists (select 1 from feast_competitions where id = ${FC} and feast_id = ${F}) then
    raise exception 'Competition ${fc.id} is not attached to feast ${feast.id}';
  end if;

  if exists (select 1 from feast_competitions where id = ${FC} and result_status = 'published') then
    raise exception 'Already published — unpublish it in /admin/results first';
  end if;

  select string_agg(i.chance_no::text, ', ' order by i.chance_no) into v_bad
  from _score_import i
  where not exists (
    select 1 from ${regTable} r
    where r.feast_competition_id = ${FC} and r.chance_no = i.chance_no
  );
  if v_bad is not null then
    raise exception 'Chance numbers not registered in this competition: %', v_bad;
  end if;

  select string_agg(x.chance_no::text, ', ' order by x.chance_no) into v_bad
  from (
    select chance_no from ${regTable}
    where feast_competition_id = ${FC}
      and chance_no in (select chance_no from _score_import)
    group by chance_no having count(*) > 1
  ) x;
  if v_bad is not null then
    raise exception 'Chance numbers registered more than once (ambiguous): %', v_bad;
  end if;
end $$;

${maxPlan.kind === "set" ? `-- ── Publish needs max_score; the sheet's own maximum is the natural one ──
update feast_competitions set max_score = ${scoreMax}
where id = ${FC} and max_score is null;

` : ""}-- ── Draft scores, matched on chance number ──────────────────────────────
insert into ${resTable} (feast_competition_id, ${regFk}, score)
select ${FC}, r.id, round(i.score * fc.max_score / ${scoreMax}::numeric, 2)
from _score_import i
join ${regTable} r on r.feast_competition_id = ${FC} and r.chance_no = i.chance_no
join feast_competitions fc on fc.id = ${FC}
on conflict (${regFk})
  do update set score = excluded.score, updated_at = now()
  where ${resTable}.published_at is null;

commit;

select
  (select count(*) from _score_import) as scores_imported,
  (select max_score from feast_competitions where id = ${FC}) as competition_max_score,
  (select count(*) from ${resTable} where feast_competition_id = ${FC}) as draft_scores;
`;

fs.writeFileSync(args.out, sql);
console.log(`Wrote ${args.out}`);
console.log(`Wrote ${reportPath}`);
console.log(`Matched ${matched.length} of ${entries.length} sheet rows · errors 0 · warnings ${warnings.size}`);
