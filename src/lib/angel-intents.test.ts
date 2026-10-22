import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, nameScore, normalize, resolveIntent, type AngelContext } from "./angel-intents.ts";

const ctx: AngelContext = {
  entities: [
    { id: "s1", name: "Kottiyoor", kind: "shakha" },
    { id: "s2", name: "Padichira", kind: "shakha" },
    { id: "m1", name: "Nilgiris", kind: "meghala" },
    { id: "m2", name: "Chungakkunnu", kind: "meghala" },
    { id: "d1", name: "Mananthavady", kind: "diocese" },
  ],
  competitions: [
    { id: "c1", name: "പ്രസംഗം", categoryName: "Elder", gender: "girl", feastSlug: "arts-fest", feastName: "കലാമത്സരം" },
    { id: "c2", name: "പ്രസംഗം", categoryName: "Junior", gender: "boy", feastSlug: "arts-fest", feastName: "കലാമത്സരം" },
    { id: "c3", name: "മിഷൻ ക്വിസ്", altName: "Mission Quiz", categoryName: "Senior", gender: null, feastSlug: "literature-fest", feastName: "സാഹിത്യമത്സരം" },
  ],
  feasts: [
    { slug: "arts-fest", name: "കലാമത്സരം", type: "arts" },
    { slug: "literature-fest", name: "സാഹിത്യമത്സരം", type: "literature" },
  ],
};

test("normalize keeps Malayalam vowel signs and registration-number slashes", () => {
  assert.equal(normalize("  പ്രസംഗം!! "), "പ്രസംഗം");
  assert.equal(normalize("CML/2026/17547"), "cml/2026/17547");
  assert.equal(normalize("Café  Top"), "cafe top");
});

test("editDistance and nameScore", () => {
  assert.equal(editDistance("nilgiris", "nilgris"), 1);
  assert.equal(nameScore("kottiyoor", "Kottiyoor"), 3);
  assert.equal(nameScore("kotiyoor", "Kottiyoor"), 1);
  assert.equal(nameScore("kot", "Kottiyoor"), 2);
  assert.equal(nameScore("zzz", "Kottiyoor"), 0);
});

test("top shakha / meghala / diocese, with and without a fest", () => {
  assert.deepEqual(resolveIntent("top shakha", ctx), { kind: "top", tier: "shakha", feastSlug: null });
  assert.deepEqual(resolveIntent("best meghala", ctx), { kind: "top", tier: "meghala", feastSlug: null });
  assert.deepEqual(resolveIntent("top diocese", ctx), { kind: "top", tier: "diocese", feastSlug: null });
  assert.deepEqual(resolveIntent("മുൻനിര മേഖല", ctx), { kind: "top", tier: "meghala", feastSlug: null });
  assert.deepEqual(resolveIntent("top shakha arts", ctx), { kind: "top", tier: "shakha", feastSlug: "arts-fest" });
  assert.deepEqual(resolveIntent("rankings", ctx), { kind: "top", tier: "shakha", feastSlug: null });
});

test("named shakha / meghala with score words and typos", () => {
  const a = resolveIntent("Kottiyoor score", ctx);
  assert.equal(a.kind, "entity");
  assert.equal(a.kind === "entity" && a.entity.id, "s1");
  assert.equal(a.kind === "entity" && a.wantsScore, true);
  const b = resolveIntent("nilgris", ctx);
  assert.equal(b.kind === "entity" && b.entity.id, "m1");
  const c = resolveIntent("points of chungakkunnu meghala", ctx);
  assert.equal(c.kind === "entity" && c.entity.id, "m2");
});

test("competition names, narrowed by category and gender", () => {
  const all = resolveIntent("പ്രസംഗം result", ctx);
  assert.equal(all.kind, "competition");
  assert.equal(all.kind === "competition" && all.matches.length, 2);
  const one = resolveIntent("elder girls പ്രസംഗം", ctx);
  assert.deepEqual(one.kind === "competition" && one.matches.map((m) => m.id), ["c1"]);
  const quiz = resolveIntent("mission quiz", ctx);
  assert.deepEqual(quiz.kind === "competition" && quiz.matches.map((m) => m.id), ["c3"]);
  const quizShort = resolveIntent("quiz result", ctx);
  assert.deepEqual(quizShort.kind === "competition" && quizShort.matches.map((m) => m.id), ["c3"]);
  const ml = resolveIntent("മിഷൻ ക്വിസ്", ctx);
  assert.deepEqual(ml.kind === "competition" && ml.matches.map((m) => m.id), ["c3"]);
});

test("people and registration numbers fall through to participant search", () => {
  assert.deepEqual(resolveIntent("Siji Varghese", ctx), { kind: "participant", query: "siji varghese" });
  assert.deepEqual(resolveIntent("CML/2026/17547", ctx), { kind: "participant", query: "CML/2026/17547" });
  assert.deepEqual(resolveIntent("F1405", ctx), { kind: "participant", query: "F1405" });
});

test("help and too-short", () => {
  assert.deepEqual(resolveIntent("help", ctx), { kind: "help" });
  assert.deepEqual(resolveIntent("how to register", ctx), { kind: "help" });
  assert.deepEqual(resolveIntent("a", ctx), { kind: "too-short" });
});
