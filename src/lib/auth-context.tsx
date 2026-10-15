"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AdminScope } from "@/lib/org-hierarchy";
import type { Profile, UserRole } from "@/types";
import type { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  // Generalizes profile.shakha_id: an sa_admin's single assignment sits at
  // whichever tier is the org's configured top level (see
  // src/lib/org-hierarchy.ts). null for admin/me_admin, who aren't tied to
  // any node (matching profile.shakha_id being optional for them today).
  adminScope: AdminScope | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mirrors the access token into a cookie so server actions can identify the
// caller (src/lib/require-role.ts) — the session itself lives in
// localStorage, which never reaches the server. Same token, same lifetime;
// rewritten on every refresh, cleared on sign-out. Name must match
// require-role.ts's AUTH_COOKIE (not imported: that module is server-only).
function syncAuthCookie(session: Session | null) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (session?.access_token) {
    const maxAge = Math.max(0, (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)) || session.expires_in || 3600;
    document.cookie = `fh-at=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } else {
    document.cookie = `fh-at=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
  });

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*, shakha:shakhas(*), meghala:meghalas(*), diocese:dioceses(*)")
      .eq("id", userId)
      .single();
    return data as Profile | null;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    // onAuthStateChange fires once immediately with the current session
    // (INITIAL_SESSION event) and again on every subsequent auth change — no
    // separate getSession() call needed, and adding one would double-fetch
    // the profile on initial load.
    //
    // The callback itself must stay synchronous: GoTrue awaits it as part of
    // its own initialize() call, and any Supabase query made directly inside
    // it (e.g. fetchProfile) needs getSession(), which awaits that same
    // initialize() promise — a deadlock that blocks every other query on the
    // page until reload. Deferring with setTimeout(0) runs the async work
    // after initialize() has settled.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Synchronous, no Supabase call — safe inside the callback.
      syncAuthCookie(session);
      setTimeout(async () => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setState({ session, profile, loading: false });
        } else {
          setState({ session: null, profile: null, loading: false });
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: "Supabase is not configured for this deployment (missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)." };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    syncAuthCookie(null);
    setState({ session: null, profile: null, loading: false });
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!state.profile) return false;
      return roles.includes(state.profile.role);
    },
    [state.profile]
  );

  // Priority diocese > meghala > shakha is defensive only —
  // profiles_single_scope_check guarantees at most one is ever set.
  const adminScope: AdminScope | null = useMemo(() => {
    const p = state.profile;
    if (!p) return null;
    if (p.diocese_id && p.diocese) return { level: "diocese", id: p.diocese_id, name: p.diocese.name };
    if (p.meghala_id && p.meghala) return { level: "meghala", id: p.meghala_id, name: p.meghala.name };
    if (p.shakha_id && p.shakha) return { level: "shakha", id: p.shakha_id, name: p.shakha.name };
    return null;
  }, [state.profile]);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, hasRole, adminScope }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
