"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// stages has no authenticated write RLS policy — admin writes go through
// the service-role client (spec §4.4: a real relation replacing the
// source app's free-text feast_competitions.stage column).

export interface StageInput {
  feastId: string;
  number: number;
  title: string;
  venue?: string;
}

export async function createStage(input: StageInput): Promise<{ error?: string }> {
  if (!input.title.trim()) return { error: "Title is required." };
  const { error } = await getSupabaseAdmin().from("stages").insert({
    feast_id: input.feastId,
    number: input.number,
    title: input.title.trim(),
    venue: input.venue || null,
  });
  if (error) return { error: error.message };
  return {};
}

export async function updateStage(id: string, input: StageInput): Promise<{ error?: string }> {
  if (!input.title.trim()) return { error: "Title is required." };
  const { error } = await getSupabaseAdmin()
    .from("stages")
    .update({ number: input.number, title: input.title.trim(), venue: input.venue || null })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteStage(id: string): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin().from("stages").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function assignCompetitionStage(
  feastCompetitionId: string,
  stageId: string | null,
  displayOrder?: number
): Promise<{ error?: string }> {
  const payload: { stage_id: string | null; display_order?: number } = { stage_id: stageId };
  if (displayOrder != null) payload.display_order = displayOrder;
  const { error } = await getSupabaseAdmin().from("feast_competitions").update(payload).eq("id", feastCompetitionId);
  if (error) return { error: error.message };
  return {};
}
