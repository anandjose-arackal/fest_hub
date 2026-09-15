"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// meghalas has no authenticated write RLS policy (public read only) — all
// writes go through the service-role client, same convention as shakhas
// (see src/actions/shakha.ts).

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface MeghalaInput {
  name: string;
  slug?: string;
  color: string;
  dioceseId?: string | null;
}

export async function createMeghala(input: MeghalaInput): Promise<{ error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin()
    .from("meghalas")
    .insert({ name, slug, color: input.color, diocese_id: input.dioceseId || null });
  if (error) return { error: error.message };
  return {};
}

export async function updateMeghala(id: string, input: MeghalaInput): Promise<{ error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin()
    .from("meghalas")
    .update({ name, slug, color: input.color, diocese_id: input.dioceseId || null })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteMeghala(id: string): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin().from("meghalas").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
