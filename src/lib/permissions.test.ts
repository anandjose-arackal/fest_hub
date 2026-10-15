// Backend authorization: proves trophy_manager can only reach the handover
// actions, and that no server action ships without a role guard. Run with
// `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS, PUBLIC_ACTIONS, isAllowed, type PermissionKey } from "./permissions.ts";

const KEYS = Object.keys(PERMISSIONS) as PermissionKey[];
const HANDOVER_KEYS: PermissionKey[] = ["handover.read", "handover.write"];

test("trophy_manager is allowed only the handover permissions", () => {
  for (const key of KEYS) {
    assert.equal(isAllowed("trophy_manager", key), HANDOVER_KEYS.includes(key), key);
  }
});

test("only admin and trophy_manager can read or mark handovers", () => {
  for (const key of HANDOVER_KEYS) {
    assert.deepEqual([...PERMISSIONS[key]].sort(), ["admin", "trophy_manager"]);
    assert.equal(isAllowed("me_admin", key), false);
    assert.equal(isAllowed("sa_admin", key), false);
  }
});

test("results, publishing, printed status, master data and certificates are admin-only", () => {
  for (const key of ["results.write", "printed.write", "masterdata.write", "certificates.manage", "competitions.status"] as PermissionKey[]) {
    assert.deepEqual([...PERMISSIONS[key]], ["admin"], key);
  }
});

test("existing roles keep their access", () => {
  assert.equal(isAllowed("sa_admin", "registration.write"), true);
  assert.equal(isAllowed("me_admin", "registration.write"), true);
  assert.equal(isAllowed("me_admin", "attendance.write"), true);
  assert.equal(isAllowed("sa_admin", "attendance.write"), false);
  for (const key of KEYS) assert.equal(isAllowed("admin", key), true, key);
});

test("no role / unknown caller is never allowed", () => {
  for (const key of KEYS) {
    assert.equal(isAllowed(null, key), false);
    assert.equal(isAllowed(undefined, key), false);
  }
});

// ── Static scan of src/actions ──────────────────────────────────────────
// Every exported server action must either be a deliberate public read
// (PUBLIC_ACTIONS) or start by calling requireRole() with a key that
// trophy_manager can't pass — unless it's one of the handover actions.

const ACTIONS_DIR = path.join(import.meta.dirname, "..", "actions");

interface ExportedAction {
  file: string;
  name: string;
  body: string;
}

function exportedActions(): ExportedAction[] {
  const out: ExportedAction[] = [];
  for (const file of fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    if (!/^["']use server["'];?/m.test(src)) continue;
    const re = /^export async function (\w+)\s*\(/gm;
    const starts = [...src.matchAll(re)];
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
      out.push({ file, name: m[1], body: src.slice(m.index, end) });
    });
  }
  return out;
}

const actions = exportedActions();

test("the scan finds the action files", () => {
  assert.ok(actions.length > 40, `only found ${actions.length} actions`);
  assert.ok(actions.some((a) => a.name === "publishResults"));
  assert.ok(actions.some((a) => a.name === "markTrophyHandover"));
});

test("every exported server action is guarded or explicitly public", () => {
  const unguarded = actions.filter((a) => !PUBLIC_ACTIONS.includes(a.name) && !/requireRole\(\s*"[\w.]+"\s*\)/.test(a.body));
  assert.deepEqual(unguarded.map((a) => `${a.file}:${a.name}`), []);
});

test("PUBLIC_ACTIONS has no stale entries", () => {
  const names = new Set(actions.map((a) => a.name));
  assert.deepEqual(PUBLIC_ACTIONS.filter((n) => !names.has(n)), []);
});

test("public actions never write", () => {
  const writes = /\.(insert|update|upsert|delete)\(/;
  // rebuildStandings is the server-only helper publish/unpublish call (it
  // takes a SupabaseClient, so a browser can't invoke it usefully).
  const offenders = actions.filter((a) => PUBLIC_ACTIONS.includes(a.name) && a.name !== "rebuildStandings" && a.name !== "bootstrapFirstAdmin" && writes.test(a.body));
  assert.deepEqual(offenders.map((a) => `${a.file}:${a.name}`), []);
});

test("trophy_manager is blocked from every non-handover action", () => {
  const reachable: string[] = [];
  for (const a of actions) {
    if (PUBLIC_ACTIONS.includes(a.name)) continue;
    const keys = [...a.body.matchAll(/requireRole\(\s*"([\w.]+)"\s*\)/g)].map((m) => m[1] as PermissionKey);
    for (const key of keys) {
      assert.ok(KEYS.includes(key), `${a.file}:${a.name} uses unknown permission "${key}"`);
      if (isAllowed("trophy_manager", key) && a.file !== "handover.ts") reachable.push(`${a.file}:${a.name}`);
    }
  }
  assert.deepEqual(reachable, []);
});

test("handover writes are reachable by trophy_manager; printed status is not", () => {
  const byName = new Map(actions.map((a) => [a.name, a.body]));
  for (const name of ["markTrophyHandover", "undoTrophyHandover", "markCertificateHandover", "undoCertificateHandover"]) {
    assert.match(byName.get(name) ?? "", /requireRole\("handover\.write"\)/, name);
  }
  for (const name of ["getTrophyDashboard", "getTrophyBoard", "getCertificateBoard"]) {
    assert.match(byName.get(name) ?? "", /requireRole\("handover\.read"\)/, name);
  }
  for (const name of ["setItemPrinted", "markItemsPrinted", "getPrintedItems", "publishResults", "unpublishResults", "publishTeamResults", "saveDraftScores"]) {
    const key = /requireRole\("([\w.]+)"\)/.exec(byName.get(name) ?? "")?.[1] as PermissionKey | undefined;
    assert.ok(key, `${name} has no guard`);
    assert.equal(isAllowed("trophy_manager", key), false, name);
  }
});
