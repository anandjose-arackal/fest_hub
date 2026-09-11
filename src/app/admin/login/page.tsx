"use client";

import { useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function AdminLoginPage() {
  const { signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setSubmitting(false);
      setError(error);
      return;
    }
    // No router.push here — the layout's needsAwayFromLoginRedirect effect
    // (src/app/admin/layout.tsx) redirects once `session` updates and picks
    // the right destination per role. Navigating here too raced it and fired
    // duplicate RSC fetches for both /admin/login and /admin. Leave
    // `submitting` true so the button stays disabled until that redirect
    // unmounts this page.
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
        <Loader2 className="h-8 w-8 animate-spin text-[#6B46FF]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC] p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="rounded-full" />
          <h1 className="text-lg font-semibold text-neutral-800">Admin Sign In</h1>
        </div>

        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mb-4 space-y-1">
          <label className="text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="mb-6 space-y-1">
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 pr-9 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{
            background: "linear-gradient(145deg, #7C5CFC, #6B46FF)",
            boxShadow: "0 4px 14px rgba(107,70,255,0.35)",
          }}
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
