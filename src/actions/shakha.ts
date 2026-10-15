"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TAG, expireTags } from "@/lib/cache-tags";
import { requireRole } from "@/lib/require-role";

// shakhas has no authenticated write RLS policy (public read only) — all
// writes go through the service-role client, matching this project's
// convention for tables without a client-writable policy (spec §4.2).

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface ShakhaInput {
  name: string;
  slug?: string;
  color: string;
  meghalaId?: string | null;
}

export async function createShakha(input: ShakhaInput): Promise<{ error?: string }> {
  const auth = await requireRole("masterdata.write");
  if ("error" in auth) return { error: auth.error };
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin()
    .from("shakhas")
    .insert({ name, slug, color: input.color, meghala_id: input.meghalaId || null });
  if (error) return { error: error.message };
  expireTags(TAG.hierarchy, TAG.standings);
  return {};
}

export async function updateShakha(id: string, input: ShakhaInput): Promise<{ error?: string }> {
  const auth = await requireRole("masterdata.write");
  if ("error" in auth) return { error: auth.error };
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin()
    .from("shakhas")
    .update({ name, slug, color: input.color, meghala_id: input.meghalaId || null })
    .eq("id", id);
  if (error) return { error: error.message };
  expireTags(TAG.hierarchy, TAG.standings);
  return {};
}

export async function deleteShakha(id: string): Promise<{ error?: string }> {
  const auth = await requireRole("masterdata.write");
  if ("error" in auth) return { error: auth.error };
  const { error } = await getSupabaseAdmin().from("shakhas").delete().eq("id", id);
  if (error) return { error: error.message };
  expireTags(TAG.hierarchy, TAG.standings);
  return {};
}
