// One-off tool: publishes results for every competition in a feast by calling
// the real server actions (publishResults / publishTeamResults) — same logic as
// the admin Results screen's "Publish" button.
//
// Run:  node scripts/publish-feast-results.mjs <feast_id> [--dry-run]
//
// --dry-run   list the competitions that would be published, change nothing.
// Competitions without a max score or without scores are reported and skipped
// (the action refuses them). Already-published ones are re-published (idempotent).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// ---- load .env.local into process.env (must happen before importing the actions) ----
function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// process.exit() with open fetch handles crashes libuv on Windows — return + exitCode instead.
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const feastId = args.find((a) => !a.startsWith("--"));

  if (!feastId) {
    console.error("Usage: node scripts/publish-feast-results.mjs <feast_id> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  loadEnvLocal();

  // jiti lets plain Node import the TypeScript actions and resolve the "@/..." alias.
  const jiti = createJiti(import.meta.url, {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  });
  const { getSupabaseAdmin } = await jiti.import("../src/lib/supabase-admin.ts");
  const { publishResults } = await jiti.import("../src/actions/results.ts");
  const { publishTeamResults } = await jiti.import("../src/actions/team-results.ts");

  const admin = getSupabaseAdmin();

  const { data: feast, error: feastErr } = await admin
    .from("feasts")
    .select("id, name")
    .eq("id", feastId)
    .single();
  if (feastErr || !feast) {
    console.error(`Feast ${feastId} not found${feastErr ? `: ${feastErr.message}` : ""}`);
    process.exitCode = 1;
    return;
  }

  const { data: comps, error: compErr } = await admin
    .from("feast_competitions")
    .select(`
      id, max_score, result_status,
      competition:competitions(
        name, gender, type,
        competition_category:competition_categories(name)
      )
    `)
    .eq("feast_id", feastId);
  if (compErr) {
    console.error(`Could not load competitions: ${compErr.message}`);
    process.exitCode = 1;
    return;
  }

  const unwrap = (x) => (Array.isArray(x) ? x[0] : x);
  const rows = (comps ?? [])
    .map((fc) => {
      const comp = unwrap(fc.competition) ?? {};
      const cat = unwrap(comp.competition_category);
      const label = [comp.name, cat?.name, comp.gender].filter(Boolean).join(" · ") || fc.id;
      return { id: fc.id, label, isGroup: comp.type === "group", status: fc.result_status, maxScore: fc.max_score };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  console.log(`Feast: ${feast.name} (${feast.id}) — ${rows.length} competition(s)${dryRun ? " [DRY RUN]" : ""}\n`);

  const published = [];
  const failed = [];

  for (const [i, r] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}] ${r.label}${r.isGroup ? " (group)" : ""}`;
    if (dryRun) {
      console.log(`${tag} — status: ${r.status ?? "draft"}, max score: ${r.maxScore ?? "not set"}`);
      continue;
    }
    const res = r.isGroup ? await publishTeamResults(r.id) : await publishResults(r.id);
    if (res?.error) {
      failed.push({ ...r, error: res.error });
      console.log(`✗ ${tag} — ${res.error}`);
    } else {
      published.push(r);
      console.log(`✓ ${tag}`);
    }
  }

  if (!dryRun) {
    console.log(`\nPublished: ${published.length}   Failed/skipped: ${failed.length}`);
    if (failed.length) process.exitCode = 1;
  }
}

await main();
