// Angel — the portal's assistant chat (src/components/feast/angel). It looks
// like a chatbot, but there's no AI behind it: this router reads a message
// with plain keyword and name matching and says what to look up. The chat
// component runs the lookup with existing public actions.
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
  | { kind: "help" }
  | { kind: "top"; tier: Tier; feastSlug: string | null }
  | { kind: "entity"; entity: NamedEntity; wantsScore: boolean }
  | { kind: "competition"; matches: CompetitionRef[] }
  | { kind: "participant"; query: string }
  | { kind: "choose"; entity: NamedEntity; competitions: CompetitionRef[]; participantQuery: string };

const TOP_WORDS = ["top", "best", "first", "leading", "leader", "leaders", "winner", "winners", "toppers", "topper", "rank", "ranks", "ranking", "rankings", "standings", "മുൻനിര", "ഒന്നാം", "മികച്ച", "റാങ്ക്", "റാങ്കിംഗ്"];
const TIER_WORDS: Record<Tier, string[]> = {
  shakha: ["shakha", "shakhas", "sakha", "branch", "branches", "ശാഖ", "ശാഖകൾ"],
  meghala: ["meghala", "meghalas", "mekhala", "mekhalas", "region", "regions", "മേഖല", "മേഖലകൾ"],
  diocese: ["diocese", "dioceses", "rupatha", "roopatha", "രൂപത", "രൂപതകൾ"],
};
const SCORE_WORDS = ["score", "scores", "point", "points", "pts", "marks", "mark", "result", "results", "standing", "position", "പോയിന്റ്", "പോയിന്റുകൾ", "സ്കോർ", "ഫലം", "ഫലങ്ങൾ"];
const HELP_WORDS = ["help", "how", "guide", "സഹായം", "എങ്ങനെ"];
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

  if (words.length <= 4 && has(words, HELP_WORDS, joined)) return { kind: "help" };

  // A registration number ("F1405", "CML/2026/17547") is always a person.
  if (words.some((w) => /\d/.test(w) && /[a-zഀ-ൿ/]/.test(w)) || /^\d{3,}$/.test(joined)) {
    return { kind: "participant", query: message.trim() };
  }

  const feastSlug = feastFromHint(words, ctx.feasts);
  const tierAsked = (Object.keys(TIER_WORDS) as Tier[]).find((t) => has(words, TIER_WORDS[t], joined)) ?? null;
  const topAsked = has(words, TOP_WORDS, joined);
  const wantsScore = has(words, SCORE_WORDS, joined);

  // Everything that isn't a keyword is the name being asked about.
  const keywordList = [
    ...TOP_WORDS, ...SCORE_WORDS, ...FILLER_WORDS,
    ...Object.values(TIER_WORDS).flat(), ...Object.values(FEAST_HINTS).flat(),
  ];
  const remainderWords = stripWords(words, keywordList);
  const remainder = remainderWords.join(" ");

  if ((topAsked || tierAsked) && !remainder) {
    return { kind: "top", tier: tierAsked ?? "shakha", feastSlug };
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
    return { kind: "competition", matches: competitions };
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
