import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Creates a new admin user (email + password) via the Supabase Admin API.
// Only admin and me_admin may call this — Decision #6: the source app's
// version of this route only checked that *a* profile existed for the
// caller, never that profile's role. sa_admin is a branch (shakha) admin
// with no back-office capability at all (see admin/layout.tsx), so it's
// excluded here too — they can't reach /admin/users to call this anyway,
// but the API itself shouldn't grant it either.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, full_name, role, scope_id } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (role && !["admin", "me_admin", "sa_admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile } = await getSupabaseAdmin()
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || !["admin", "me_admin"].includes(callerProfile.role)) {
      return NextResponse.json(
        { error: "Only admin or me_admin can create admin users" },
        { status: 403 }
      );
    }

    const { data: newUser, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // The on_auth_user_created trigger auto-creates the profile row (default
    // role 'admin'); update it with the requested role & scope. The scope
    // column (shakha_id/meghala_id/diocese_id) is resolved from the org's
    // *current* hierarchy_level server-side, not trusted from the client —
    // a crafted request otherwise could write scope_id into an arbitrary
    // column of the caller's choosing.
    if (newUser.user) {
      const { data: org } = await getSupabaseAdmin().from("org_settings").select("hierarchy_level").eq("id", true).single();
      const level = org?.hierarchy_level ?? "shakha";
      const scopeColumn = level === "diocese" ? "diocese_id" : level === "meghala" ? "meghala_id" : "shakha_id";
      await getSupabaseAdmin()
        .from("profiles")
        .update({
          full_name: full_name || "",
          role: role || "admin",
          shakha_id: null,
          meghala_id: null,
          diocese_id: null,
          [scopeColumn]: scope_id || null,
        })
        .eq("id", newUser.user.id);
    }

    return NextResponse.json({
      success: true,
      user: { id: newUser.user?.id, email: newUser.user?.email },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
