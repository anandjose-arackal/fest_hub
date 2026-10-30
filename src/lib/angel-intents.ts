// Angel — the portal's assistant chat (src/components/feast/angel). An AI
// reads each question first (src/actions/angel.ts → intentFromAi below);
// this keyword-and-name router answers when that's off or unsure. Either
// way the result only says what to look up — the chat component runs the
// lookup with existing public actions, so answers always come from the DB.
//
// Pure module with no runtime imports, so `node --test` can load it directly.

export type Tier = "shakha" | "meghala" | "diocese";

export interface NamedEntity {
  id: string;
  name: string;
  kind: Tier;
}

export interface CompetitionRef {
  /** feast_competitions.id */
  id: string;
  name: string;
  /** The English name (competitions.name_en), matched as well as `name`. */
  altName?: string | null;
  categoryName: string;
  gender: string | null;
  feastSlug: string;
  feastName: string;
}

export interface FeastRef {
  slug: string;
  name: string;
  type: string;
}

export interface AngelContext {
  entities: NamedEntity[];
  competitions: CompetitionRef[];
  feasts: FeastRef[];
}

export type AngelIntent =
  | { kind: "too-short" }
  | { kind: "greeting"; variant: Greeting }
  /** A reply the AI wrote (greetings, small talk, a clarifying question) — words only, never data. */
  | { kind: "chat"; text: string; suggest: boolean }
  | { kind: "help" }
  /** `within`: rank only the members of this meghala or diocese. */
  | { kind: "top"; tier: Tier; feastSlug: string | null; within?: NamedEntity }
  | { kind: "entity"; entity: NamedEntity; wantsScore: boolean }
  | { kind: "competition"; matches: CompetitionRef[] }
  | { kind: "participant"; query: string }
  /** When and on which stage these competitions run. */
  | { kind: "schedule"; matches: CompetitionRef[] }
  /** What's on one stage (`number`), or on every stage right now (null). */
  | { kind: "stage"; number: number | null; feastSlug: string | null }
  /** A signed-in branch admin's own items: already registered, or with places left under the cap. */
  | { kind: "registrations"; mode: "registered" | "left"; feastSlug: string | null }
  | { kind: "choose"; entity: NamedEntity; competitions: CompetitionRef[]; participantQuery: string };

const TOP_WORDS = ["top", "best", "first", "leading", "leader", "leaders", "winner", "winners", "toppers", "topper", "rank", "ranks", "ranking", "rankings", "standings", "മുൻനിര", "ഒന്നാം", "മികച്ച", "റാങ്ക്", "റാങ്കിംഗ്"];
const TIER_WORDS: Record<Tier, string[]> = {
  shakha: ["shakha", "shakhas", "sakha", "branch", "branches", "ശാഖ", "ശാഖകൾ"],
  meghala: ["meghala", "meghalas", "mekhala", "mekhalas", "region", "regions", "മേഖല", "മേഖലകൾ"],
  diocese: ["diocese", "dioceses", "rupatha", "roopatha", "രൂപത", "രൂപതകൾ"],
};
const SCORE_WORDS = ["score", "scores", "point", "points", "pts", "marks", "mark", "result", "results", "standing", "position", "പോയിന്റ്", "പോയിന്റുകൾ", "സ്കോർ", "ഫലം", "ഫലങ്ങൾ"];
const HELP_WORDS = ["help", "how", "guide", "സഹായം", "എങ്ങനെ"];
export type Greeting = "hello" | "morning" | "afternoon" | "evening" | "night" | "thanks";
const GREETINGS: Record<Greeting, string[]> = {
  hello: ["hi", "hai", "hay", "hy", "hello", "hlo", "hey", "yo", "hola", "namaskaram", "namaskar", "namaste", "ഹായ്", "ഹലോ", "നമസ്കാരം"],
  morning: ["good morning", "gud morning", "gd morning", "good mrng", "gud mrng", "gd mrng", "morning", "gm", "സുപ്രഭാതം"],
  afternoon: ["good afternoon", "gud afternoon", "afternoon"],
  evening: ["good evening", "gud evening", "evening"],
  night: ["good night", "gud night", "gn"],
  thanks: ["thanks", "thank you", "thank u", "thankyou", "thanku", "thanq", "thx", "thnx", "thnks", "tnx", "tq", "tnq", "ty", "nanni", "നന്ദി"],
};
// Words that can ride along with a greeting without asking anything —
// including "how are you", which gets a greeting back.
const GREETING_EXTRAS = [
  "angel", "there", "all", "everyone", "so", "much", "very", "dear", "chechi", "ji", "a", "lot", "you", "u", "ok", "okay",
  "how", "are", "r", "doing", "and", "sugamano", "sukhamano", "sugam", "alle", "സുഖമാണോ", "സുഖം", "അല്ലേ",
];

// "hiii" → "hi", "helloo" → "helo": people stretch greetings.
const squash = (s: string) => s.replace(/(\p{L})\1+/gu, "$1");

function greetingOf(joined: string): Greeting | null {
  let rest = ` ${squash(joined)} `;
  let found: Greeting | null = null;
  // Phrases first, so "good morning" isn't read as an unknown word.
  for (const [kind, phrases] of Object.entries(GREETINGS) as [Greeting, string[]][]) {
    for (const p of phrases.map(squash).sort((a, b) => b.length - a.length)) {
      if (rest.includes(` ${p} `)) {
        found ??= kind;
        rest = rest.split(` ${p} `).join(" ");
      }
    }
  }
  if (!found) return null;
  const extras = new Set(GREETING_EXTRAS.map(squash));
  return tokens(rest.trim().replace(/\s+/g, " ")).every((w) => extras.has(w)) ? found : null;
}

const SCHEDULE_WORDS = [
  "when", "time", "timing", "timings", "schedule", "scheduled", "where", "venue", "stage", "stages", "vedi",
  "eppol", "eppo", "eppozha", "eppozhanu", "eppolanu", "evide", "evideya", "evidanu", "evideyanu", "samayam",
  "എപ്പോൾ", "എപ്പോഴാണ്", "സമയം", "എവിടെ", "എവിടെയാണ്", "വേദി", "വേദികൾ",
];
const NOW_WORDS = ["now", "live", "happening", "going", "on", "currently", "running", "ippo", "ഇപ്പോൾ", "നടക്കുന്നത്"];
// "stage 4", "stage4", "stage no 4", "വേദി 4"
const STAGE_NUMBER = /(?:^| )(?:stage|vedi|വേദി)\s?(?:no |number )?(\d{1,2})(?= |$)/;
const REGISTERED_WORDS = ["registered", "registration", "registrations", "entries", "entered", "രജിസ്റ്റർ", "രജിസ്ട്രേഷൻ"];
const LEFT_WORDS = ["left", "remaining", "balance", "pending", "vacant", "available", "ബാക്കി", "ശേഷിക്കുന്ന"];
// Words that can sit around a registrations question without naming anything.
const MINE_WORDS = ["my", "our", "we", "i", "us", "item", "items", "competition", "competitions", "event", "events", "slot", "slots", "place", "places", "to", "register", "not", "yet", "have", "has", "done", "already", "still", "can", "are", "do", "does", "did", "ഐറ്റം", "ഐറ്റങ്ങൾ", "ഇനം", "ഇനങ്ങൾ", "മത്സരങ്ങൾ"];
const FILLER_WORDS = ["of", "the", "for", "in", "a", "an", "is", "what", "whats", "show", "me", "please", "tell", "about", "and", "who", "which", "list", "find", "search", "get"];
const CATEGORY_WORDS: Record<string, string[]> = {
  "sub junior": ["sub junior", "subjunior", "sub jr", "sub-junior"],
  junior: ["junior", "jr"],
  "super senior": ["super senior", "supersenior", "sup sr", "super-senior"],
  senior: ["senior", "sr"],
  elder: ["elder", "elders"],
};
const GENDER_WORDS: Record<"boy" | "girl", string[]> = {
  boy: ["boy", "boys", "male", "ആൺ", "ആൺകുട്ടികൾ"],
  girl: ["girl", "girls", "female", "പെൺ", "പെൺകുട്ടികൾ"],
};
const FEAST_HINTS: Record<string, string[]> = {
  arts: ["arts", "art", "kala", "kalamalsaram", "കലാ", "കല", "കലാമത്സരം"],
  literature: ["literature", "literary", "sahitya", "sahithya", "സാഹിത്യ", "സാഹിത്യമത്സരം"],
};

// Lowercase, Latin accents folded, punctuation dropped (except "/" and "-",
// which registration numbers use). Malayalam vowel signs are combining
// marks too, so only the Latin diacritics block is stripped.
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}/\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return text ? text.split(" ") : [];
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

// How well `query` (normalized) names `target`: 3 exact, 2 every word of the
// target is in the query (or the query is a 3+ letter prefix of it), 1 one
// typo away (names of 5+ letters), 0 no match.
export function nameScore(query: string, target: string): number {
  const t = normalize(target);
  if (!t || !query) return 0;
  if (query === t) return 3;
  const qTokens = tokens(query);
  const tTokens = tokens(t);
  if (tTokens.every((w) => qTokens.includes(w))) return 2;
  if (query.length >= 3 && t.startsWith(query)) return 2;
  if (t.length >= 5 && editDistance(query, t) <= 1) return 1;
  if (tTokens.length === 1 && t.length >= 5 && qTokens.some((w) => editDistance(w, t) <= 1)) return 1;
  return 0;
}

function has(words: string[], list: string[], joined: string): boolean {
  return list.some((k) => (k.includes(" ") ? joined.includes(k) : words.includes(k)));
}

function stripWords(words: string[], drop: string[]): string[] {
  return words.filter((w) => !drop.includes(w));
}

function feastFromHint(words: string[], feasts: FeastRef[]): string | null {
  for (const [type, hints] of Object.entries(FEAST_HINTS)) {
    if (!hints.some((h) => words.includes(h))) continue;
    const feast = feasts.find((f) => f.type === type) ?? feasts.find((f) => hints.some((h) => normalize(f.name).includes(h)));
    if (feast) return feast.slug;
  }
  return null;
}

const TIER_ORDER: Record<Tier, number> = { shakha: 0, meghala: 1, diocese: 2 };

// The meghala or diocese named in `query` that can contain `tier` members.
// A meghala and a diocese can share a name; then the tier the question named
// wins, else the nearer one (a shakha's meghala before its diocese).
function findGroup(query: string, tier: Tier, entities: NamedEntity[], groupTier: Tier | null = null): NamedEntity | null {
  let best: { entity: NamedEntity; score: number } | null = null;
  for (const entity of entities) {
    if (TIER_ORDER[entity.kind] <= TIER_ORDER[tier]) continue;
    if (groupTier && entity.kind !== groupTier) continue;
    const score = nameScore(query, entity.name);
    const better = score > (best?.score ?? 0) || (best !== null && score === best.score && TIER_ORDER[entity.kind] < TIER_ORDER[best.entity.kind]);
    if (better) best = { entity, score };
  }
  return best && best.score >= 2 ? best.entity : null;
}

function categoryOf(joined: string): string | null {
  // Longest phrases first, so "super senior" isn't read as "senior".
  for (const key of ["sub junior", "super senior", "junior", "senior", "elder"]) {
    if (CATEGORY_WORDS[key].some((w) => new RegExp(`(^| )${w.replace(/[-/]/g, "\\$&")}( |$)`).test(joined))) return key;
  }
  return null;
}

function genderOf(words: string[]): "boy" | "girl" | null {
  if (GENDER_WORDS.boy.some((w) => words.includes(w))) return "boy";
  if (GENDER_WORDS.girl.some((w) => words.includes(w))) return "girl";
  return null;
}

function matchCompetitions(remainder: string, joined: string, words: string[], competitions: CompetitionRef[]): CompetitionRef[] {
  if (!remainder) return [];
  const scoreName = (name: string) => {
    const n = normalize(name);
    if (!n) return 0;
    if (remainder === n) return 3;
    if (remainder.includes(n) && n.length >= 3) return 2;
    if (n.includes(remainder) && remainder.length >= 3) return 2;
    if (n.length >= 5 && tokens(remainder).some((w) => w.length >= 4 && editDistance(w, n) <= 1)) return 1;
    return 0;
  };
  const scored = competitions
    .map((c) => ({ c, score: Math.max(scoreName(c.name), c.altName ? scoreName(c.altName) : 0) }))
    .filter((x) => x.score > 0);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((x) => x.score));
  let matches = scored.filter((x) => x.score === best).map((x) => x.c);
  const category = categoryOf(joined);
  if (category) {
    const narrowed = matches.filter((c) => normalize(c.categoryName).replace(/-/g, " ") === category);
    if (narrowed.length) matches = narrowed;
  }
  const gender = genderOf(words);
  if (gender) {
    const narrowed = matches.filter((c) => c.gender === gender);
    if (narrowed.length) matches = narrowed;
  }
  return matches.slice(0, 8);
}

export function resolveIntent(message: string, ctx: AngelContext): AngelIntent {
  const joined = normalize(message);
  if (joined.replace(/\s/g, "").length < 2) return { kind: "too-short" };
  const words = tokens(joined);

  // "hi", "good morning angel", "thanks" — nothing else asked.
  const greeting = greetingOf(joined);
  if (greeting) return { kind: "greeting", variant: greeting };

  if (words.length <= 4 && has(words, HELP_WORDS, joined)) return { kind: "help" };

  // "stage 4" before registration numbers, which "stage4" would look like.
  const stageNumber = joined.match(STAGE_NUMBER);
  if (stageNumber) return { kind: "stage", number: Number(stageNumber[1]), feastSlug: feastFromHint(words, ctx.feasts) };

  // A registration number ("F1405", "CML/2026/17547") is always a person.
  if (words.some((w) => /\d/.test(w) && /[a-zഀ-ൿ/]/.test(w)) || /^\d{3,}$/.test(joined)) {
    return { kind: "participant", query: message.trim() };
  }

  const feastSlug = feastFromHint(words, ctx.feasts);
  // Lowest tier named is the one asked about; a higher one ("…in X diocese")
  // names the group it's limited to.
  const tiersNamed = (Object.keys(TIER_WORDS) as Tier[]).filter((t) => has(words, TIER_WORDS[t], joined));
  const tierAsked = tiersNamed[0] ?? null;
  const groupTier = tiersNamed.length > 1 ? tiersNamed[tiersNamed.length - 1] : null;
  const topAsked = has(words, TOP_WORDS, joined);
  const wantsScore = has(words, SCORE_WORDS, joined);
  const scheduleAsked = has(words, SCHEDULE_WORDS, joined);

  // Everything that isn't a keyword is the name being asked about.
  const keywordList = [
    ...TOP_WORDS, ...SCORE_WORDS, ...FILLER_WORDS, ...REGISTERED_WORDS, ...LEFT_WORDS, ...SCHEDULE_WORDS,
    ...Object.values(TIER_WORDS).flat(), ...Object.values(FEAST_HINTS).flat(),
  ];
  const remainderWords = stripWords(words, keywordList);
  const remainder = remainderWords.join(" ");

  // "what's on now", "stage schedule" — every stage, nothing named.
  const nowAsked = has(words, NOW_WORDS, joined) && stripWords(remainderWords, NOW_WORDS).length === 0;
  if (!topAsked && !tierAsked && ((scheduleAsked && !remainder) || (nowAsked && (scheduleAsked || words.length <= 4)))) {
    return { kind: "stage", number: null, feastSlug };
  }

  // "which items are left", "our registrations" — about the asker's own
  // branch, so nothing else may be named ("is Anu registered" is a person).
  const leftAsked = has(words, LEFT_WORDS, joined) || (words.includes("not") && has(words, REGISTERED_WORDS, joined));
  if ((leftAsked || has(words, REGISTERED_WORDS, joined)) && stripWords(remainderWords, MINE_WORDS).length === 0) {
    return { kind: "registrations", mode: leftAsked ? "left" : "registered", feastSlug };
  }

  if ((topAsked || tierAsked) && !remainder) {
    return { kind: "top", tier: tierAsked ?? "shakha", feastSlug };
  }

  // "best shakha in Mananthavady meghala": a ranking inside a named group.
  // Checked before plain names, or the shakha "Mananthavady Town" would win.
  if (topAsked && remainder) {
    const tier = tierAsked ?? "shakha";
    const within = findGroup(remainder, tier, ctx.entities, groupTier);
    if (within) return { kind: "top", tier, feastSlug, within };
  }

  // Named shakha / meghala / diocese.
  let bestEntity: { entity: NamedEntity; score: number } | null = null;
  if (remainder) {
    for (const entity of ctx.entities) {
      if (tierAsked && entity.kind !== tierAsked) continue;
      const score = nameScore(remainder, entity.name);
      if (score > (bestEntity?.score ?? 0)) bestEntity = { entity, score };
    }
  }

  // Competition names, with category/gender words removed from the name part.
  const compRemainder = stripWords(remainderWords, [
    ...Object.values(CATEGORY_WORDS).flat().flatMap((w) => w.split(" ")),
    ...Object.values(GENDER_WORDS).flat(),
  ]).join(" ");
  const competitions = matchCompetitions(compRemainder, joined, words, ctx.competitions);

  if (bestEntity && bestEntity.score >= 2 && competitions.length === 0) {
    return { kind: "entity", entity: bestEntity.entity, wantsScore };
  }
  if (competitions.length > 0 && (!bestEntity || bestEntity.score < 2)) {
    return scheduleAsked ? { kind: "schedule", matches: competitions } : { kind: "competition", matches: competitions };
  }
  if (bestEntity && bestEntity.score >= 2 && competitions.length > 0) {
    return { kind: "choose", entity: bestEntity.entity, competitions, participantQuery: remainder };
  }
  if (bestEntity && bestEntity.score === 1) {
    return { kind: "entity", entity: bestEntity.entity, wantsScore };
  }
  if (topAsked || tierAsked) return { kind: "top", tier: tierAsked ?? "shakha", feastSlug };

  return { kind: "participant", query: remainder || message.trim() };
}

// ── AI reading ───────────────────────────────────────────────────────────
// What the AI returns for a question (src/actions/angel.ts asks for exactly
// this shape). Names are meant to be copied from the lists it was given, but
// nothing here trusts that: intentFromAi only accepts names that match the
// portal's own entities and competitions.

export const AI_INTENTS = ["greeting", "smalltalk", "help", "top", "entity", "competition", "schedule", "stage", "participant", "registered", "left", "unclear"] as const;
const MAX_REPLY = 280;
export const AI_CATEGORIES = ["sub junior", "junior", "senior", "super senior", "elder"] as const;

export interface AngelAiReading {
  intent: (typeof AI_INTENTS)[number];
  tier: Tier | null;
  /** feasts.slug */
  feast: string | null;
  /** An entity or competition name from the lists, or a person's name / registration number. */
  name: string | null;
  category: (typeof AI_CATEGORIES)[number] | null;
  gender: "boy" | "girl" | null;
  /** stages.number, for "what's on stage 4". */
  stage: number | null;
  /** Angel's own words for greetings, small talk and unclear questions. */
  reply: string | null;
}

const TIERS: readonly Tier[] = ["shakha", "meghala", "diocese"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseAiReading(raw: unknown): AngelAiReading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const intent = oneOf(r.intent, AI_INTENTS);
  if (!intent) return null;
  return {
    intent,
    tier: oneOf(r.tier, TIERS),
    feast: text(r.feast),
    name: text(r.name),
    category: oneOf(r.category, AI_CATEGORIES),
    gender: oneOf(r.gender, ["boy", "girl"] as const),
    stage: Number.isInteger(r.stage) && (r.stage as number) >= 1 && (r.stage as number) <= 99 ? (r.stage as number) : null,
    reply: text(r.reply)?.slice(0, MAX_REPLY) ?? null,
  };
}

// Competitions whose name (or English name) is exactly the AI's, narrowed by
// fest, category and gender where those don't empty the list.
function namedCompetitions(ai: AngelAiReading, ctx: AngelContext, feastSlug: string | null): CompetitionRef[] {
  if (!ai.name) return [];
  // The list shows "പ്രസംഗം (Speech)"; a copy of the whole entry names it too.
  const paren = ai.name.match(/^(.*?)\s*\((.*)\)\s*$/);
  const queries = new Set([ai.name, ...(paren ? [paren[1], paren[2]] : [])].map(normalize).filter(Boolean));
  let matches = ctx.competitions.filter((c) => queries.has(normalize(c.name)) || (c.altName != null && queries.has(normalize(c.altName))));
  if (feastSlug) matches = narrow(matches, (c) => c.feastSlug === feastSlug);
  if (ai.category) matches = narrow(matches, (c) => normalize(c.categoryName).replace(/-/g, " ") === ai.category);
  if (ai.gender) matches = narrow(matches, (c) => c.gender === ai.gender);
  return matches.slice(0, 8);
}

function narrow<T>(items: T[], keep: (item: T) => boolean): T[] {
  const kept = items.filter(keep);
  return kept.length ? kept : items;
}

// Turns the AI's reading into an intent, or null when it doesn't point at
// something the portal has — the caller then falls back to resolveIntent.
export function intentFromAi(ai: AngelAiReading, ctx: AngelContext): AngelIntent | null {
  const feastSlug = ai.feast && ctx.feasts.some((f) => f.slug === ai.feast) ? ai.feast : null;
  switch (ai.intent) {
    case "help":
      return { kind: "help" };
    case "top": {
      const tier = ai.tier ?? "shakha";
      const within = ai.name ? findGroup(normalize(ai.name), tier, ctx.entities) : null;
      return within ? { kind: "top", tier, feastSlug, within } : { kind: "top", tier, feastSlug };
    }
    case "entity": {
      if (!ai.name) return null;
      const query = normalize(ai.name);
      const pool = ai.tier ? ctx.entities.filter((e) => e.kind === ai.tier) : ctx.entities;
      let best: { entity: NamedEntity; score: number } | null = null;
      for (const entity of pool) {
        const score = nameScore(query, entity.name);
        if (score > (best?.score ?? 0)) best = { entity, score };
      }
      return best && best.score >= 2 ? { kind: "entity", entity: best.entity, wantsScore: true } : null;
    }
    case "greeting":
      return ai.reply ? { kind: "chat", text: ai.reply, suggest: true } : { kind: "greeting", variant: "hello" };
    case "smalltalk":
      return ai.reply ? { kind: "chat", text: ai.reply, suggest: false } : null;
    case "competition":
    case "schedule": {
      const matches = namedCompetitions(ai, ctx, feastSlug);
      return matches.length ? { kind: ai.intent, matches } : null;
    }
    case "stage":
      return { kind: "stage", number: ai.stage, feastSlug };
    case "participant":
      return ai.name ? { kind: "participant", query: ai.name } : null;
    case "registered":
    case "left":
      return { kind: "registrations", mode: ai.intent, feastSlug };
    case "unclear":
      // A friendly "did you mean…?" — the caller still prefers a confident
      // keyword match over it.
      return ai.reply ? { kind: "chat", text: ai.reply, suggest: true } : null;
  }
}
