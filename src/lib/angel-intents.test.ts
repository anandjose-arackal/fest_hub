import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, intentFromAi, nameScore, normalize, parseAiReading, resolveIntent, type AngelAiReading, type AngelContext } from "./angel-intents.ts";

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

const reading = (r: Partial<AngelAiReading>): AngelAiReading => ({ intent: "unclear", tier: null, feast: null, name: null, category: null, gender: null, stage: null, reply: null, ...r });

test("parseAiReading drops anything outside the schema", () => {
  assert.equal(parseAiReading(null), null);
  assert.equal(parseAiReading({ intent: "delete everything" }), null);
  assert.deepEqual(
    parseAiReading({ intent: "top", tier: "planet", feast: " arts-fest ", name: "", category: "toddler", gender: "boy", extra: 1 }),
    reading({ intent: "top", feast: "arts-fest", gender: "boy" }),
  );
});

test("intentFromAi: top, help and unknown fests", () => {
  assert.deepEqual(intentFromAi(reading({ intent: "top", tier: "meghala", feast: "arts-fest" }), ctx), { kind: "top", tier: "meghala", feastSlug: "arts-fest" });
  assert.deepEqual(intentFromAi(reading({ intent: "top", feast: "made-up" }), ctx), { kind: "top", tier: "shakha", feastSlug: null });
  assert.deepEqual(intentFromAi(reading({ intent: "help" }), ctx), { kind: "help" });
  assert.equal(intentFromAi(reading({ intent: "unclear" }), ctx), null);
});

test("intentFromAi: entities must be real", () => {
  assert.deepEqual(intentFromAi(reading({ intent: "entity", name: "Nilgiris", tier: "meghala" }), ctx), { kind: "entity", entity: ctx.entities[2], wantsScore: true });
  assert.equal(intentFromAi(reading({ intent: "entity", name: "Nilgiris", tier: "shakha" }), ctx), null);
  assert.equal(intentFromAi(reading({ intent: "entity", name: "Atlantis" }), ctx), null);
});

test("intentFromAi: competitions match by name or English name, then narrow", () => {
  const both = intentFromAi(reading({ intent: "competition", name: "പ്രസംഗം" }), ctx);
  assert.equal(both?.kind === "competition" && both.matches.length, 2);
  assert.deepEqual(intentFromAi(reading({ intent: "competition", name: "പ്രസംഗം", gender: "girl" }), ctx), { kind: "competition", matches: [ctx.competitions[0]] });
  assert.deepEqual(intentFromAi(reading({ intent: "competition", name: "mission quiz" }), ctx), { kind: "competition", matches: [ctx.competitions[2]] });
  // A filter that matches nothing is ignored rather than emptying the list.
  const kept = intentFromAi(reading({ intent: "competition", name: "പ്രസംഗം", category: "super senior" }), ctx);
  assert.equal(kept?.kind === "competition" && kept.matches.length, 2);
  assert.equal(intentFromAi(reading({ intent: "competition", name: "Group Dance" }), ctx), null);
});

test("intentFromAi: participants need a name", () => {
  assert.deepEqual(intentFromAi(reading({ intent: "participant", name: "Anu Joseph" }), ctx), { kind: "participant", query: "Anu Joseph" });
  assert.equal(intentFromAi(reading({ intent: "participant" }), ctx), null);
});

test("own registrations: registered vs left, but not a named person", () => {
  assert.deepEqual(resolveIntent("which items are left", ctx), { kind: "registrations", mode: "left", feastSlug: null });
  assert.deepEqual(resolveIntent("items not registered yet", ctx), { kind: "registrations", mode: "left", feastSlug: null });
  assert.deepEqual(resolveIntent("our registrations in arts", ctx), { kind: "registrations", mode: "registered", feastSlug: "arts-fest" });
  assert.deepEqual(resolveIntent("ബാക്കി ഐറ്റം", ctx), { kind: "registrations", mode: "left", feastSlug: null });
  assert.deepEqual(resolveIntent("is Anu registered", ctx), { kind: "participant", query: "anu" });
  assert.deepEqual(intentFromAi(reading({ intent: "left", feast: "literature-fest" }), ctx), { kind: "registrations", mode: "left", feastSlug: "literature-fest" });
  assert.deepEqual(intentFromAi(reading({ intent: "registered" }), ctx), { kind: "registrations", mode: "registered", feastSlug: null });
});

test("roopatha means diocese", () => {
  assert.deepEqual(resolveIntent("top roopatha", ctx), { kind: "top", tier: "diocese", feastSlug: null });
});

test("top within a meghala or diocese", () => {
  const groups: AngelContext = {
    ...ctx,
    entities: [
      ...ctx.entities,
      { id: "s3", name: "Mananthavady Town", kind: "shakha" },
      { id: "m3", name: "Mananthavady", kind: "meghala" },
    ],
  };
  const m3 = groups.entities[6];
  assert.deepEqual(resolveIntent("best shakha in mananthavady", groups), { kind: "top", tier: "shakha", feastSlug: null, within: m3 });
  assert.deepEqual(resolveIntent("mananthavady meghalayile best shakha", groups), { kind: "top", tier: "shakha", feastSlug: null, within: m3 });
  assert.deepEqual(resolveIntent("top meghala in mananthavady diocese", groups), { kind: "top", tier: "meghala", feastSlug: null, within: ctx.entities[4] });
  assert.deepEqual(resolveIntent("best shakha in mananthavady diocese", groups), { kind: "top", tier: "shakha", feastSlug: null, within: ctx.entities[4] });
  // A shakha is never a group, and a plain name stays a name.
  assert.equal(resolveIntent("top shakha kottiyoor", groups).kind, "entity");
  assert.deepEqual(resolveIntent("mananthavady town score", groups), { kind: "entity", entity: groups.entities[5], wantsScore: true });
  assert.deepEqual(intentFromAi(reading({ intent: "top", tier: "shakha", name: "Mananthavady" }), groups), { kind: "top", tier: "shakha", feastSlug: null, within: m3 });
  assert.deepEqual(intentFromAi(reading({ intent: "top", tier: "meghala", name: "Mananthavady" }), groups), { kind: "top", tier: "meghala", feastSlug: null, within: ctx.entities[4] });
  assert.deepEqual(intentFromAi(reading({ intent: "top", tier: "shakha", name: "Kottiyoor" }), groups), { kind: "top", tier: "shakha", feastSlug: null });
});

test("greetings get a greeting back, but a question with a greeting doesn't", () => {
  assert.deepEqual(resolveIntent("hi", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("Hello Angel!", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("good morning", ctx), { kind: "greeting", variant: "morning" });
  assert.deepEqual(resolveIntent("നമസ്കാരം", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("thank you so much", ctx), { kind: "greeting", variant: "thanks" });
  assert.equal(resolveIntent("hi top shakha", ctx).kind, "top");
  assert.equal(resolveIntent("hi kottiyoor", ctx).kind, "entity");
  assert.deepEqual(intentFromAi(reading({ intent: "greeting" }), ctx), { kind: "greeting", variant: "hello" });
});

test("schedule and stage questions", () => {
  assert.deepEqual(resolveIntent("when is mission quiz", ctx), { kind: "schedule", matches: [ctx.competitions[2]] });
  assert.deepEqual(resolveIntent("പ്രസംഗം എപ്പോൾ", ctx), { kind: "schedule", matches: [ctx.competitions[0], ctx.competitions[1]] });
  assert.deepEqual(resolveIntent("mission quiz result", ctx), { kind: "competition", matches: [ctx.competitions[2]] });
  assert.deepEqual(resolveIntent("mission quiz evide", ctx), { kind: "schedule", matches: [ctx.competitions[2]] });
  assert.deepEqual(resolveIntent("what's on stage 4", ctx), { kind: "stage", number: 4, feastSlug: null });
  assert.deepEqual(resolveIntent("stage4 arts", ctx), { kind: "stage", number: 4, feastSlug: "arts-fest" });
  assert.deepEqual(resolveIntent("വേദി 2", ctx), { kind: "stage", number: 2, feastSlug: null });
  assert.deepEqual(resolveIntent("what's happening now", ctx), { kind: "stage", number: null, feastSlug: null });
  assert.deepEqual(resolveIntent("stage schedule", ctx), { kind: "stage", number: null, feastSlug: null });
  assert.equal(resolveIntent("who is on top", ctx).kind, "top");
  assert.deepEqual(intentFromAi(reading({ intent: "schedule", name: "Mission Quiz" }), ctx), { kind: "schedule", matches: [ctx.competitions[2]] });
  assert.equal(intentFromAi(reading({ intent: "schedule", name: "Group Dance" }), ctx), null);
  assert.deepEqual(intentFromAi(reading({ intent: "stage", stage: 3, feast: "arts-fest" }), ctx), { kind: "stage", number: 3, feastSlug: "arts-fest" });
  assert.equal(parseAiReading({ intent: "stage", stage: 4.5 })?.stage, null);
});

test("intentFromAi accepts a competition copied with its English name", () => {
  assert.deepEqual(intentFromAi(reading({ intent: "schedule", name: "മിഷൻ ക്വിസ് (Mission Quiz)" }), ctx), { kind: "schedule", matches: [ctx.competitions[2]] });
});

test("stretched and chatty greetings still count", () => {
  assert.deepEqual(resolveIntent("hiii angel", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("Helloooo, how are you?", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("hlo", ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(resolveIntent("gud mrng", ctx), { kind: "greeting", variant: "morning" });
  assert.deepEqual(resolveIntent("thanq dear", ctx), { kind: "greeting", variant: "thanks" });
  assert.deepEqual(resolveIntent("nanni", ctx), { kind: "greeting", variant: "thanks" });
  assert.deepEqual(resolveIntent("hai sugamano", ctx), { kind: "greeting", variant: "hello" });
});

test("intentFromAi: the AI's own words for greetings, small talk and unclear", () => {
  assert.deepEqual(intentFromAi(reading({ intent: "greeting", reply: "Hello! 😊" }), ctx), { kind: "chat", text: "Hello! 😊", suggest: true });
  assert.deepEqual(intentFromAi(reading({ intent: "greeting" }), ctx), { kind: "greeting", variant: "hello" });
  assert.deepEqual(intentFromAi(reading({ intent: "smalltalk", reply: "I'm Angel!" }), ctx), { kind: "chat", text: "I'm Angel!", suggest: false });
  assert.equal(intentFromAi(reading({ intent: "smalltalk" }), ctx), null);
  assert.deepEqual(intentFromAi(reading({ intent: "unclear", reply: "Did you mean a shakha?" }), ctx), { kind: "chat", text: "Did you mean a shakha?", suggest: true });
  assert.equal(parseAiReading({ intent: "greeting", reply: "x".repeat(500) })?.reply?.length, 280);
});
