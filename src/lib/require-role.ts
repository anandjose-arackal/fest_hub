import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllIn } from "@/lib/fetch-all";
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

// The caller's own node (profiles.shakha_id / meghala_id / diocese_id — at
// most one is set). Only an sa_admin is limited by it.
export type CallerScope = { level: "shakha" | "meghala" | "diocese"; id: string } | null;
export type Caller = { userId: string; role: UserRole; scope: CallerScope };
export type RoleCheck = Caller | { error: string };

export async function requireRole(key: PermissionKey): Promise<RoleCheck> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return { error: "Please sign in again." };

  const admin = getSupabaseAdmin();
  const { data: claims, error: claimsErr } = await admin.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (claimsErr || !userId) return { error: "Your session has expired — please sign in again." };

  const { data: profile } = await admin
    .from("profiles")
    .select("role, shakha_id, meghala_id, diocese_id")
    .eq("id", userId)
    .single();
  const role = (profile?.role ?? null) as UserRole | null;
  if (!isAllowed(role, key)) return { error: "You don't have permission to do that." };
  const scope: CallerScope = profile?.shakha_id
    ? { level: "shakha", id: profile.shakha_id }
    : profile?.meghala_id
      ? { level: "meghala", id: profile.meghala_id }
      : profile?.diocese_id
        ? { level: "diocese", id: profile.diocese_id }
        : null;
  return { userId, role: role!, scope };
}

// A branch admin (sa_admin) may only touch shakhas under their own node;
// back-office roles are unrestricted. Returns an error message, or null when
// every shakha id is allowed. A null id (participant with no shakha) is
// outside every branch.
export async function checkShakhaAccess(caller: Caller, shakhaIds: (string | null | undefined)[]): Promise<string | null> {
  if (caller.role !== "sa_admin") return null;
  const denied = "You can only manage your own branch's entries.";
  if (!caller.scope) return "Your account isn't assigned to a branch yet.";
  if (shakhaIds.some((id) => !id)) return denied;

  const scope = caller.scope;
  if (scope.level === "shakha") return shakhaIds.every((id) => id === scope.id) ? null : denied;

  const requested = [...new Set(shakhaIds as string[])];
  const admin = getSupabaseAdmin();
  const { data, error } = await fetchAllIn(requested, (ids, from, to) => {
    const query = scope.level === "diocese"
      ? admin.from("shakhas").select("id, meghala:meghalas!inner(diocese_id)").eq("meghala.diocese_id", scope.id)
      : admin.from("shakhas").select("id").eq("meghala_id", scope.id);
    return query.in("id", ids).order("id").range(from, to);
  });
  return !error && data.length === requested.length ? null : denied;
}
