"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// dioceses has no authenticated write RLS policy (public read only) — all
// writes go through the service-role client, same convention as shakhas
// (see src/actions/shakha.ts).

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface DioceseInput {
  name: string;
  slug?: string;
  color: string;
}

export async function createDiocese(input: DioceseInput): Promise<{ error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin().from("dioceses").insert({ name, slug, color: input.color });
  if (error) return { error: error.message };
  return {};
}

export async function updateDiocese(id: string, input: DioceseInput): Promise<{ error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  const slug = input.slug?.trim() || slugify(name);
  const { error } = await getSupabaseAdmin().from("dioceses").update({ name, slug, color: input.color }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteDiocese(id: string): Promise<{ error?: string }> {
  const { error } = await getSupabaseAdmin().from("dioceses").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
