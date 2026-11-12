#!/usr/bin/env node
// Read-only dump of everything a feast import needs to map sheet spellings
// onto real DB rows: the feast, its competitions (with gender / category /
// caps / max_score), shakhas, age categories, and the feast's existing
// participants (for duplicate detection against what's already registered).
//
// Usage (from the repo root):
//   node --env-file=.env.local .claude/skills/feast-data-import/scripts/fetch-reference.mjs <feast-slug|feast-id|feast-name> [out.json]
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local).
// Never writes to the database.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [feastArg, outPath = "reference.json"] = process.argv.slice(2);
if (!feastArg) {
  console.error("Usage: fetch-reference.mjs <feast-slug|feast-id|feast-name> [out.json]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
// .in() puts every id in the URL; chunk so a big fest does not exceed the URL limit.
async function allIn(ids, make) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 60) rows.push(...(await all(() => make(ids.slice(i, i + 60)))));
  return rows;
}
const one = (x) => (Array.isArray(x) ? x[0] : x);

async function all(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const { data: feasts, error: feastErr } = await db.from("feasts").select("id, name, slug, type, year, status");
if (feastErr) throw new Error(feastErr.message);
const needle = feastArg.trim().toLowerCase();
const feast =
  feasts.find((f) => f.id === feastArg || f.slug.toLowerCase() === needle) ??
  feasts.find((f) => f.name.trim().toLowerCase() === needle);
if (!feast) {
  console.error(`Feast "${feastArg}" not found. Available:`);
  for (const f of feasts) console.error(`  ${f.slug}  (${f.name}, ${f.year}, ${f.status})  ${f.id}`);
  if (!feasts.length) console.error("  (none — create the feast in /admin/feasts first)");
  // exitCode, not process.exit(): exiting mid-flight after network I/O trips
  // a libuv assertion on Windows.
  process.exitCode = 1;
} else {
  await dump(feast);
}

async function dump(feast) {
  const categories = await all(() =>
    db.from("competition_categories").select("id, slug, name, min_dob, max_dob, sort_order").order("sort_order")
  );
  const shakhas = await all(() => db.from("shakhas").select("id, name, meghala_id").order("name"));
  // Optional Diocese → Meghala tiers above shakha (org_settings.hierarchy_level).
  const meghalas = await all(() => db.from("meghalas").select("id, name, diocese_id").order("name"));
  const dioceses = await all(() => db.from("dioceses").select("id, name").order("name"));
  const { data: org } = await db.from("org_settings").select("hierarchy_level").maybeSingle();
  const hierarchy_level = org?.hierarchy_level ?? "shakha";

  // Older databases predate competitions.name_en (added to 001 after they were
  // created), so retry without it rather than failing the whole dump.
  const fcQuery = (nameEn) => () =>
    db
      .from("feast_competitions")
      .select(
        `id, max_score, result_status, competition:competitions(name, ${nameEn ? "name_en, " : ""}type, gender, max_per_shakha, max_team_size, competition_category:competition_categories(slug))`
      )
      .eq("feast_id", feast.id)
      .order("display_order");
  const fcRows = await all(fcQuery(true)).catch((e) => {
    if (!/name_en/.test(e.message)) throw e;
    return all(fcQuery(false));
  });
  const feast_competitions = fcRows.map((fc) => {
    const c = one(fc.competition) ?? {};
    return {
      id: fc.id,
      name: c.name,
      name_en: c.name_en ?? null,
      type: c.type,
      gender: c.gender ?? null,
      category_slug: one(c.competition_category)?.slug ?? null,
      max_per_shakha: c.max_per_shakha,
      max_team_size: c.max_team_size ?? null,
      max_score: fc.max_score,
      result_status: fc.result_status,
    };
  });

  const pRows = await all(() =>
    db
      .from("participants")
      .select("id, name, house_name, gender, shakha_id, registration_number, competition_category:competition_categories(slug)")
      .eq("feast_id", feast.id)
      .order("created_at")
  );
  const participants = pRows.map((p) => ({
    id: p.id,
    name: p.name,
    house_name: p.house_name,
    gender: p.gender,
    shakha_id: p.shakha_id,
    category_slug: one(p.competition_category)?.slug ?? null,
    registration_number: p.registration_number,
  }));

  // Registrations with their chance numbers — build-score-import.mjs matches a
  // score sheet's chance number to one of these (individual or team).
  const fcIds = feast_competitions.map((fc) => fc.id);
  const regRows = fcIds.length
    ? await allIn(fcIds, (ids) =>
        db
          .from("participant_registrations")
          .select("id, feast_competition_id, chance_no, participant:participants(id, name, house_name, registration_number, shakha_id)")
          .in("feast_competition_id", ids)
          .order("chance_no")
      )
    : [];
  const registrations = regRows.map((r) => {
    const p = one(r.participant) ?? {};
    return {
      id: r.id,
      feast_competition_id: r.feast_competition_id,
      chance_no: r.chance_no,
      participant_id: p.id ?? null,
      name: p.name ?? null,
      house_name: p.house_name ?? null,
      registration_number: p.registration_number ?? null,
      shakha_id: p.shakha_id ?? null,
    };
  });

  const teamRows = fcIds.length
    ? await allIn(fcIds, (ids) =>
        db
          .from("team_registrations")
          .select("id, feast_competition_id, chance_no, team_name, shakha_id")
          .in("feast_competition_id", ids)
          .order("chance_no")
      )
    : [];
  const team_registrations = teamRows.map((t) => ({
    id: t.id,
    feast_competition_id: t.feast_competition_id,
    chance_no: t.chance_no,
    team_name: t.team_name,
    shakha_id: t.shakha_id,
  }));

  // Existing scores, so a score import can flag drafts it doesn't overwrite.
  const resRows = fcIds.length
    ? await allIn(fcIds, (ids) =>
        db
          .from("competition_results")
          .select("feast_competition_id, participant_registration_id, score, published_at")
          .in("feast_competition_id", ids)
      )
    : [];
  const results = resRows.map((r) => ({
    feast_competition_id: r.feast_competition_id,
    participant_registration_id: r.participant_registration_id,
    score: r.score,
    published_at: r.published_at,
  }));

  const teamResRows = fcIds.length
    ? await allIn(fcIds, (ids) =>
        db
          .from("team_results")
          .select("feast_competition_id, team_registration_id, score, published_at")
          .in("feast_competition_id", ids)
      )
    : [];
  const team_results = teamResRows.map((r) => ({
    feast_competition_id: r.feast_competition_id,
    team_registration_id: r.team_registration_id,
    score: r.score,
    published_at: r.published_at,
  }));

  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        feast,
        hierarchy_level,
        categories,
        dioceses,
        meghalas,
        shakhas,
        feast_competitions,
        participants,
        registrations,
        team_registrations,
        results,
        team_results,
      },
      null,
      2
    )
  );

  console.log(`Feast: ${feast.name} (${feast.slug}, ${feast.id})`);
  console.log(`Categories: ${categories.map((c) => `${c.slug}=${c.name}`).join(", ")}`);
  console.log(`Hierarchy level: ${hierarchy_level}`);
  if (hierarchy_level === "shakha") {
    console.log(`Shakhas (${shakhas.length}): ${shakhas.map((s) => s.name).join(", ")}`);
  } else {
    const meghalaName = new Map(meghalas.map((m) => [m.id, m.name]));
    const shakhaList = (meghalaId) => shakhas.filter((s) => s.meghala_id === meghalaId).map((s) => s.name).join(", ") || "(no shakhas)";
    const printMeghala = (m, indent) => console.log(`${indent}Meghala ${m.name}: ${shakhaList(m.id)}`);
    if (hierarchy_level === "diocese") {
      for (const d of dioceses) {
        console.log(`  Diocese ${d.name}`);
        for (const m of meghalas.filter((m) => m.diocese_id === d.id)) printMeghala(m, "    ");
      }
      const loose = meghalas.filter((m) => !m.diocese_id);
      if (loose.length) { console.log("  (meghalas not in any diocese)"); for (const m of loose) printMeghala(m, "    "); }
    } else {
      for (const m of meghalas) printMeghala(m, "  ");
    }
    const unassigned = shakhas.filter((s) => !s.meghala_id || !meghalaName.has(s.meghala_id));
    if (unassigned.length) console.log(`  (shakhas not in any meghala): ${unassigned.map((s) => s.name).join(", ")}`);
  }
  console.log(`Existing participants in this feast: ${participants.length}`);
  console.log(
    `Registrations with chance numbers: ${registrations.filter((r) => r.chance_no != null).length} individual, ${team_registrations.filter((t) => t.chance_no != null).length} team`
  );
  console.log(`Competitions (${feast_competitions.length}):`);
  for (const fc of feast_competitions) {
    console.log(
      `  ${fc.name}${fc.name_en ? ` / ${fc.name_en}` : ""} · ${fc.type} · ${fc.gender ?? "-"} · ${fc.category_slug ?? "any"} · max_score=${fc.max_score ?? "unset"} · ${fc.result_status}`
    );
  }
  console.log(`\nWrote ${outPath}`);
}
