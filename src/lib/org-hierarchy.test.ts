// Run with `npm test` (Node's built-in runner; Node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShakhaLineage, lineageColumns, lineageText } from "./org-hierarchy.ts";

const base = { slug: "", color: "", created_at: "" };
const hierarchy = {
  dioceses: [{ ...base, id: "d1", name: "Mananthavady" }],
  meghalas: [
    { ...base, id: "m1", name: "Kalpetta", diocese_id: "d1" },
    { ...base, id: "m2", name: "Loose", diocese_id: null },
  ],
  shakhas: [
    { ...base, id: "s1", name: "A", meghala_id: "m1" },
    { ...base, id: "s2", name: "B", meghala_id: "m2" },
    { ...base, id: "s3", name: "C", meghala_id: null },
  ],
};

test("lineage resolves meghala and diocese, dash when unassigned", () => {
  const of = buildShakhaLineage(hierarchy);
  assert.deepEqual(of("s1"), { meghala: "Kalpetta", diocese: "Mananthavady" });
  assert.deepEqual(of("s2"), { meghala: "Loose", diocese: "—" });
  assert.deepEqual(of("s3"), { meghala: "—", diocese: "—" });
  assert.deepEqual(of(null), { meghala: "—", diocese: "—" });
  assert.deepEqual(of("missing"), { meghala: "—", diocese: "—" });
});

test("columns follow the hierarchy level", () => {
  assert.deepEqual(lineageColumns("shakha").map((c) => c.key), []);
  assert.deepEqual(lineageColumns("meghala").map((c) => c.key), ["meghala"]);
  assert.deepEqual(lineageColumns("diocese").map((c) => c.key), ["meghala", "diocese"]);
});

test("lineage text skips unassigned tiers", () => {
  const of = buildShakhaLineage(hierarchy);
  const cols = lineageColumns("diocese");
  assert.equal(lineageText(of("s1"), cols), "Kalpetta · Mananthavady");
  assert.equal(lineageText(of("s2"), cols), "Loose");
  assert.equal(lineageText(of("s3"), cols), "");
  assert.equal(lineageText(of("s1"), lineageColumns("meghala")), "Kalpetta");
});
