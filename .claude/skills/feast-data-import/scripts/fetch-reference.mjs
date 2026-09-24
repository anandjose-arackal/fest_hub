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

  const fcRows = await all(() =>
    db
      .from("feast_competitions")
      .select(
        "id, max_score, result_status, competition:competitions(name, name_en, type, gender, max_per_shakha, max_team_size, competition_category:competition_categories(slug))"
      )
      .eq("feast_id", feast.id)
      .order("display_order")
  );
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

  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { fetched_at: new Date().toISOString(), feast, hierarchy_level, categories, dioceses, meghalas, shakhas, feast_competitions, participants },
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
  console.log(`Competitions (${feast_competitions.length}):`);
  for (const fc of feast_competitions) {
    console.log(
      `  ${fc.name}${fc.name_en ? ` / ${fc.name_en}` : ""} · ${fc.type} · ${fc.gender ?? "-"} · ${fc.category_slug ?? "any"} · max_score=${fc.max_score ?? "unset"} · ${fc.result_status}`
    );
  }
  console.log(`\nWrote ${outPath}`);
}
