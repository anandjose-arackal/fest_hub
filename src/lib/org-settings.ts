import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { OrgSettings } from "@/types";

// Decision (spec §4.1): org/area identity is admin-editable configuration
// (the org_settings singleton row), never a hardcoded literal string. Every
// place that used to hardcode an org/area name reads through this instead.
const FALLBACK: OrgSettings = {
  id: true,
  org_name_en: "Feast Hub",
  org_name_local: "",
  area_name_en: "",
  area_name_local: "",
  tagline: "Feast Portal",
  logo_url: "/logo.png",
  created_at: "",
  updated_at: "",
};

export async function getOrgSettings(): Promise<OrgSettings> {
  if (!isSupabaseConfigured) return FALLBACK;
  const { data, error } = await supabase.from("org_settings").select("*").eq("id", true).single();
  if (error || !data) return FALLBACK;
  return data as OrgSettings;
}
