// Bulk-generates the admin result poster (src/lib/poster-render.tsx) for every
// competition that has 1st/2nd/3rd place results, one PNG per competition —
// the color theme is picked by age category (CATEGORY_THEME below), not
// looped over all 4 themes.
//
// Data comes straight from Supabase via the service-role key (read-only) —
// no browser login needed. Rendering still needs a real browser (the poster's
// feast-name heading auto-fits its font size via a DOM-measuring effect), so
// this drives headless Chromium to the app's own /poster-render page, which
// takes a complete PosterData payload in the URL and renders it with no
// Supabase calls of its own.
//
// Usage (from the project root, with the dev server already running):
//   node --env-file=.env.local scripts/generate-posters.mjs
//
// Env vars:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (from .env.local)
//   POSTER_BASE_URL   default http://localhost:3000
//   POSTER_OUT_DIR    default poster-exports

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.POSTER_BASE_URL || "http://localhost:3000";
const OUT_DIR = process.env.POSTER_OUT_DIR || "poster-exports";

// One theme per age category (competition_categories.slug), per AGENTS.md's
// sub_junior | junior | senior | super_senior | elder. Only 4 poster themes
// exist (maroon/blue/purple/pink) for 5 categories, so Sub Junior and Elder
// share pink.
const CATEGORY_THEME = {
  sub_junior: "pink",
  junior: "blue",
  senior: "purple",
  super_senior: "maroon",
  elder: "pink",
};
const DEFAULT_THEME = "maroon";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/generate-posters.mjs"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Keeps Malayalam (and other script) text intact for a readable filename —
// only strips characters Windows/macOS/Linux actually disallow in filenames
// and collapses whitespace, rather than a \p{L}\p{N} allowlist (which drops
// combining vowel signs/virama, since Unicode categorizes those as marks,
// not letters, fragmenting Malayalam conjuncts into a run of underscores).
function slug(s) {
  return (
    String(s ?? "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_") || "x"
  );
}

function one(x) {
  return Array.isArray(x) ? x[0] : x;
}

// Mirrors FEAST_TYPE_POSTER_LABEL/feastPosterHeading() in src/lib/feast-data.ts —
// the poster heading is the feast's type-banner, not its free-text name.
const FEAST_TYPE_POSTER_LABEL = {
  literature: "സാഹിത്യമത്സരം",
  arts: "കലാമത്സരം",
};
function feastPosterHeading(feast) {
  return FEAST_TYPE_POSTER_LABEL[feast?.type] ?? feast?.name ?? "";
}

// Mirrors openPoster()'s categoryLabel in src/app/admin/results/page.tsx.
// "common"-gender competitions (e.g. Drawing) print no Boys/Girls suffix.
function categoryLabelFor(competition) {
  const category = one(competition.competition_category);
  const gender = competition.gender?.toLowerCase();
  return [category?.name, gender === "boy" ? "Boys" : gender === "girl" ? "Girls" : null].filter(Boolean).join(" · ");
}

async function main() {
  const { data: org, error: orgErr } = await supabase.from("org_settings").select("*").single();
  if (orgErr || !org) throw new Error(`Couldn't load org_settings: ${orgErr?.message ?? "not found"}`);

  const [{ data: shakhas }, { data: meghalas }] = await Promise.all([
    supabase.from("shakhas").select("id, name, meghala_id"),
    supabase.from("meghalas").select("id, name"),
  ]);
  const shakhaById = new Map((shakhas ?? []).map((s) => [s.id, s]));
  const meghalaById = new Map((meghalas ?? []).map((m) => [m.id, m]));

  // Mirrors groupLabelFor() in src/app/admin/results/page.tsx.
  function groupLabelFor(shakhaId, shakhaName) {
    if (org.hierarchy_level && org.hierarchy_level !== "shakha") {
      const shakha = shakhaById.get(shakhaId);
      const meghala = shakha?.meghala_id ? meghalaById.get(shakha.meghala_id) : null;
      if (meghala) return `${meghala.name} Meghala`;
    }
    return `${shakhaName ?? "—"} Shakha`;
  }

  const { data: feasts, error: feastsErr } = await supabase.from("feasts").select("id, name, type");
  if (feastsErr) throw new Error(feastsErr.message);
  const feastById = new Map((feasts ?? []).map((f) => [f.id, f]));

  const { data: fcs, error: fcErr } = await supabase
    .from("feast_competitions")
    .select("id, feast_id, competition:competitions(id, name, type, gender, competition_category:competition_categories(name, slug))")
    .order("display_order");
  if (fcErr) throw new Error(fcErr.message);

  const jobs = [];
  for (const fc of fcs ?? []) {
    const competition = one(fc.competition);
    if (!competition) continue;
    const isGroup = competition.type === "group";
    let winners = [];

    if (isGroup) {
      const { data: rows, error } = await supabase
        .from("team_results")
        .select("position, team_registration:team_registrations(team_name, shakha:shakhas(id, name))")
        .eq("feast_competition_id", fc.id)
        .in("position", [1, 2, 3]);
      if (error) {
        console.warn(`  ! skipping ${fc.id} (team_results: ${error.message})`);
        continue;
      }
      winners = (rows ?? []).map((r) => {
        const team = one(r.team_registration);
        const shakha = one(team?.shakha);
        return { place: r.position, name: team?.team_name ?? "—", houseName: "", shakhaName: groupLabelFor(shakha?.id, shakha?.name) };
      });
    } else {
      const { data: rows, error } = await supabase
        .from("competition_results")
        .select("position, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(id, name)))")
        .eq("feast_competition_id", fc.id)
        .in("position", [1, 2, 3]);
      if (error) {
        console.warn(`  ! skipping ${fc.id} (competition_results: ${error.message})`);
        continue;
      }
      winners = (rows ?? []).map((r) => {
        const reg = one(r.participant_registration);
        const p = one(reg?.participant);
        const shakha = one(p?.shakha);
        return { place: r.position, name: p?.name ?? "—", houseName: p?.house_name ?? "", shakhaName: groupLabelFor(shakha?.id, shakha?.name) };
      });
    }

    if (winners.length === 0) continue; // no 1st/2nd/3rd yet — nothing to generate
    const feast = feastById.get(fc.feast_id);
    const categorySlug = one(competition.competition_category)?.slug;
    const theme = CATEGORY_THEME[categorySlug];
    if (!theme) console.warn(`  ! ${competition.name}: unrecognized category "${categorySlug}" — defaulting to ${DEFAULT_THEME}`);
    jobs.push({
      feastName: feastPosterHeading(feast),
      competitionName: competition.name,
      categoryLabel: categoryLabelFor(competition),
      winners,
      theme: theme ?? DEFAULT_THEME,
    });
  }

  if (jobs.length === 0) {
    console.log("No competitions with 1st/2nd/3rd place results found — nothing to generate.");
    return;
  }

  console.log(`Found ${jobs.length} competition(s) with results — 1 poster each.`);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });

  let count = 0;
  for (const job of jobs) {
    const posterData = {
      org,
      feastName: job.feastName,
      competitionName: job.competitionName,
      categoryLabel: job.categoryLabel,
      winners: job.winners,
      theme: job.theme,
    };
    const encoded = Buffer.from(JSON.stringify(posterData), "utf-8").toString("base64url");
    const url = `${BASE_URL}/poster-render?data=${encoded}`;

    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("#poster-capture img");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400); // settle the font-fit effect's re-render

    const fileName = `${slug(job.feastName)}__${slug(job.competitionName)}__${slug(job.categoryLabel)}.png`;
    // Screenshot the poster's own 1080x1920 root node, not the #poster-capture
    // wrapper around it — the wrapper measures full viewport width despite
    // display:inline-block (something in the page's inherited layout
    // stretches it), which would otherwise pad every export with blank
    // margin on the right.
    await page.locator("#poster-capture > div").first().screenshot({ path: path.join(OUT_DIR, fileName) });
    count++;
    console.log(`  ✓ [${job.theme}] ${fileName}`);
  }

  await browser.close();
  console.log(`Done — ${count} posters written to ${path.resolve(OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
