"use server";

import OpenAI from "openai";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { AI_CATEGORIES, AI_INTENTS, parseAiReading, type AngelAiReading } from "@/lib/angel-intents";

// Angel's AI reading: an OpenAI model turns a free-form question (English,
// Malayalam or Manglish, typos and all) into the structured lookup Angel
// already knows how to run. It never writes the answer itself — the chat
// runs the lookup against the DB — so it can't invent a result. Public (the
// portal has no login), so it's off unless OPENAI_API_KEY is set, and each
// caller is rate-limited. OPENAI_MODEL picks the model.

const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_MESSAGE_LENGTH = 300;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const VOCAB_TTL_MS = 5 * 60_000;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const READING_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...AI_INTENTS] },
    tier: nullable({ type: "string", enum: ["shakha", "meghala", "diocese"] }),
    feast: nullable({ type: "string" }),
    name: nullable({ type: "string" }),
    category: nullable({ type: "string", enum: [...AI_CATEGORIES] }),
    gender: nullable({ type: "string", enum: ["boy", "girl"] }),
    stage: nullable({ type: "integer" }),
  },
  required: ["intent", "tier", "feast", "name", "category", "gender", "stage"],
  additionalProperties: false,
};

const INSTRUCTIONS = `You read questions typed into Angel, the assistant on a fest results portal. Fests are competitions between shakhas (local branches); an org may also group shakhas into meghalas (regions, also spelled mekhala) and meghalas into dioceses (also called rupatha or roopatha, രൂപത). Questions may be in English, Malayalam, or Malayalam typed in English letters, often short and with typos.

Don't answer the question. Say what to look up, as JSON:
- intent "top": who is leading or ranked first. tier = the level being ranked ("shakha" if none is named); feast = a fest's slug if one is named; name = the meghala or diocese the ranking is limited to, if any ("best shakha in Kallody meghala" → tier "shakha", name "Kallody").
- intent "entity": how one named shakha, meghala or diocese is doing. name = its name exactly as in the lists below; tier = its level.
- intent "greeting": only a greeting or thanks ("hi", "good morning", "namaskaram", "thank you"), nothing else asked.
- intent "schedule": when or on which stage a competition is ("when is prasangam", "where is mission quiz", "kathaprasangam evide", "quiz eppozha"; evide = where, eppol/eppozha = when). name, category, gender and feast as for "competition".
- intent "stage": what is on a stage ("what's on stage 4" → stage 4) or on all stages right now ("what's happening now" → stage null). feast if named.
- intent "competition": the result of a competition. name = the competition's name exactly as in the list below (either form); category and gender when the question names them; feast if named.
- intent "participant": a person, by name or registration number. name = the name or number as typed, with obvious typos fixed.
- intent "registered": the asker's own branch's registrations ("which items have we registered", "our entries"). feast if named.
- intent "left": items the asker's own branch can still register for ("which items are left", "what's not registered yet", "balance items"). feast if named.
- intent "help": how to use the portal (how to register, how to find things).
- intent "unclear": anything else, or you can't tell.
Use null for every field that doesn't apply. Only use shakha, meghala, diocese and competition names that appear in the lists; if the name isn't listed it is probably a person, so use "participant".

Competition names are listed mostly in Malayalam script, but people usually type them in English letters or translate them: "prasangam" or "speech" is പ്രസംഗം, "nadodi nritham" or "folk dance" is നാടോടി നൃത്തം. Work out which listed competition they mean and copy its name exactly as written in the list.`;

let client: OpenAI | null = null;
let vocabulary: { text: string; at: number } | null = null;
const recent = new Map<string, number[]>();

function openai(): OpenAI {
  client ??= new OpenAI({ timeout: 20_000, maxRetries: 1 });
  return client;
}

async function loadVocabulary(): Promise<string> {
  if (vocabulary && Date.now() - vocabulary.at < VOCAB_TTL_MS) return vocabulary.text;
  const supabase = getSupabaseAdmin();
  const [shakhas, meghalas, dioceses, feasts, competitions] = await Promise.all([
    supabase.from("shakhas").select("name").order("name"),
    supabase.from("meghalas").select("name").order("name"),
    supabase.from("dioceses").select("name").order("name"),
    supabase.from("feasts").select("slug, name, type").order("slug"),
    supabase.from("competitions").select("name, name_en").order("name"),
  ]);
  const failed = [shakhas, meghalas, dioceses, feasts, competitions].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const names = (rows: { name: string }[] | null) => (rows ?? []).map((r) => r.name).join(", ") || "(none)";
  const compNames = [...new Set((competitions.data ?? []).map((c) => (c.name_en ? `${c.name} (${c.name_en})` : c.name)))];
  const text = [
    `Fests (slug: name, type): ${(feasts.data ?? []).map((f) => `${f.slug}: ${f.name}, ${f.type}`).join("; ") || "(none)"}`,
    `Shakhas: ${names(shakhas.data)}`,
    `Meghalas: ${names(meghalas.data)}`,
    `Dioceses: ${names(dioceses.data)}`,
    `Competitions (Malayalam name, then English name where there is one): ${compNames.join(", ") || "(none)"}`,
  ].join("\n");
  vocabulary = { text, at: Date.now() };
  return text;
}

async function overRateLimit(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5_000) {
    for (const [key, times] of recent) if (times.every((t) => now - t >= RATE_WINDOW_MS)) recent.delete(key);
  }
  return false;
}

export async function readAngelQuestion(message: string): Promise<{ data?: AngelAiReading; error?: string; disabled?: boolean }> {
  if (!process.env.OPENAI_API_KEY) return { error: "Angel's AI isn't configured", disabled: true };
  const question = typeof message === "string" ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (!question) return { error: "Empty question" };
  if (await overRateLimit()) return { error: "Too many questions — wait a minute" };

  try {
    // The instructions and name lists come first and stay byte-identical
    // between questions, so OpenAI's automatic prompt caching can reuse them.
    const response = await openai().responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: `${INSTRUCTIONS}\n\n${await loadVocabulary()}`,
      input: question,
      reasoning: { effort: "low" },
      max_output_tokens: 2048,
      store: false,
      text: { format: { type: "json_schema", name: "angel_reading", schema: READING_SCHEMA, strict: true } },
    });
    if (response.status !== "completed") return { error: `No reading (${response.status})` };
    const reading = parseAiReading(JSON.parse(response.output_text));    return reading ? { data: reading } : { error: "Unreadable reply" };
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) return { error: "Angel's AI is busy" };
    if (err instanceof OpenAI.APIError) {
      console.error("readAngelQuestion:", err.status, err.message);
      return { error: "Angel's AI is unavailable" };
    }
    console.error("readAngelQuestion:", err);
    return { error: "Angel's AI is unavailable" };
  }
}
