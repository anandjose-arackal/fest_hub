"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface OrgSettingsInput {
  orgNameEn: string;
  orgNameLocal?: string;
  areaNameEn?: string;
  areaNameLocal?: string;
  tagline?: string;
  logoUrl?: string;
}

export async function updateOrgSettings(input: OrgSettingsInput): Promise<{ error?: string }> {
  if (!input.orgNameEn.trim()) return { error: "Organization name is required." };
  const { error } = await getSupabaseAdmin()
    .from("org_settings")
    .update({
      org_name_en: input.orgNameEn.trim(),
      org_name_local: input.orgNameLocal ?? "",
      area_name_en: input.areaNameEn ?? "",
      area_name_local: input.areaNameLocal ?? "",
      tagline: input.tagline ?? "",
      logo_url: input.logoUrl || "/logo.png",
    })
    .eq("id", true);
  if (error) return { error: error.message };
  return {};
}
