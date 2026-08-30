"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
  });

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*, shakha:shakhas(*)")
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ session: null, profile: null, loading: false });
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!state.profile) return false;
      return roles.includes(state.profile.role);
    },
    [state.profile]
  );

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
