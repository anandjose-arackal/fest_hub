"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TAG, expireTags } from "@/lib/cache-tags";

export interface BootstrapInput {
  fullName: string;
  email: string;
  password: string;
  orgNameEn: string;
  areaNameEn: string;
}

export interface BootstrapResult {
  error?: string;
}

// Spec §4.3, option 1: the very first admin is created here, and only here
// — this action re-checks profiles is still empty (race-safety against two
// people loading /setup at once) before doing anything. Once any profile
// exists, /setup permanently refuses (see page.tsx's redirect).
export async function bootstrapFirstAdmin(input: BootstrapInput): Promise<BootstrapResult> {
  const { fullName, email, password, orgNameEn, areaNameEn } = input;
  if (!email || !password || password.length < 8) {
    return { error: "Email and an 8+ character password are required" };
  }

  const admin = getSupabaseAdmin();

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return { error: "Setup has already been completed" };
  }

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || "" },
    // Marks an app-created account; self sign-ups get no profile (migration 020).
    app_metadata: { fh_provisioned: true },
  });
  if (createError) return { error: createError.message };
  if (!newUser.user) return { error: "Failed to create user" };

  // Upsert, not update: written here rather than trusting the signup trigger.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: newUser.user.id, email, full_name: fullName || "", role: "admin" });
  if (profileError) return { error: profileError.message };

  if (orgNameEn || areaNameEn) {
    await admin
      .from("org_settings")
      .update({
        org_name_en: orgNameEn || "Fest Hub",
        area_name_en: areaNameEn || "",
      })
      .eq("id", true);
    expireTags(TAG.org);
  }

  return {};
}
