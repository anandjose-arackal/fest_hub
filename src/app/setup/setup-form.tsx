"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapFirstAdmin } from "@/actions/setup";

export function SetupForm() {
  const router = useRouter();
  const [orgNameEn, setOrgNameEn] = useState("");
  const [areaNameEn, setAreaNameEn] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await bootstrapFirstAdmin({ fullName, email, password, orgNameEn, areaNameEn });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/login");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4"
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Create your Super Admin</h1>
        <p className="text-sm text-neutral-500">
          This runs once. It creates the first admin account and your organization&apos;s basic identity.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="orgNameEn">Organization name</label>
        <input
          id="orgNameEn"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={orgNameEn}
          onChange={(e) => setOrgNameEn(e.target.value)}
          placeholder="e.g. Cherupushpa Mission League"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="areaNameEn">Area name</label>
        <input
          id="areaNameEn"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={areaNameEn}
          onChange={(e) => setAreaNameEn(e.target.value)}
          placeholder="e.g. Kalpetta"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="fullName">Your name</label>
        <input
          id="fullName"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
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

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          minLength={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-[var(--fp-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create Super Admin"}
      </button>
    </form>
  );
}
