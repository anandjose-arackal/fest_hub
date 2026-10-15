import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAllowed, type PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/types";

// Server-only (reads request cookies, uses the service-role client) — call
// it at the top of every non-public server action:
//
//   const auth = await requireRole("results.write");
//   if ("error" in auth) return { error: auth.error };
//
// The browser's Supabase session lives in localStorage, which server actions
// can't see, so auth-context.tsx mirrors the access token into the
// AUTH_COOKIE cookie on every auth change. The token is verified here (JWT
// signature/expiry via getClaims), then the caller's role is read from
// profiles — never trusted from the client.

export const AUTH_COOKIE = "fh-at";

export type RoleCheck = { userId: string; role: UserRole } | { error: string };

export async function requireRole(key: PermissionKey): Promise<RoleCheck> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return { error: "Please sign in again." };

  const admin = getSupabaseAdmin();
  const { data: claims, error: claimsErr } = await admin.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (claimsErr || !userId) return { error: "Your session has expired — please sign in again." };

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
  const role = (profile?.role ?? null) as UserRole | null;
  if (!isAllowed(role, key)) return { error: "You don't have permission to do that." };
  return { userId, role: role! };
}
