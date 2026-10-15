// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addLedgerPoints, emptySplit, splitCategoryTotal, splitGender, splitGenderTotal } from "./standings-split.ts";

test("splitGender: boys/girls-only items, everything else is common", () => {
  assert.equal(splitGender("boy"), "boy");
  assert.equal(splitGender("Boys"), "boy");
  assert.equal(splitGender("girl"), "girl");
  assert.equal(splitGender("common"), "common");
  assert.equal(splitGender(null), "common");
  assert.equal(splitGender(""), "common");
});

test("addLedgerPoints: points land under the item's category and gender", () => {
  const s = emptySplit();
  addLedgerPoints(s, "junior", "boy", 10);
  addLedgerPoints(s, "junior", "boy", 3);
  addLedgerPoints(s, "junior", "girl", 5);
  addLedgerPoints(s, "junior", "common", 6);
  addLedgerPoints(s, "elder", null, 1);
  assert.deepEqual(s.junior, { boy: 13, girl: 5, common: 6 });
  assert.deepEqual(s.elder, { boy: 0, girl: 0, common: 1 });
  assert.equal(splitCategoryTotal(s, "junior"), 24);
});

test("splitGenderTotal: each gender summed across every age category", () => {
  const s = emptySplit();
  addLedgerPoints(s, "sub_junior", "boy", 5);
  addLedgerPoints(s, "senior", "boy", 3);
  addLedgerPoints(s, "junior", "girl", 8);
  addLedgerPoints(s, "elder", "common", 2);
  addLedgerPoints(s, "team", "boy", 10); // team points stay out
  assert.equal(splitGenderTotal(s, "boy"), 8);
  assert.equal(splitGenderTotal(s, "girl"), 8);
  assert.equal(splitGenderTotal(s, "common"), 2);
});

test("addLedgerPoints: team events and unknown categories are not split", () => {
  const s = emptySplit();
  addLedgerPoints(s, "team", "boy", 10);
  addLedgerPoints(s, "unknown", "girl", 4);
  for (const cat of Object.values(s)) assert.deepEqual(cat, { boy: 0, girl: 0, common: 0 });
});
