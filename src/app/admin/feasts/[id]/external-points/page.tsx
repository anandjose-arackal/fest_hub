"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFeastStandings, saveExternalFeastPoints } from "@/actions/results";
import type { Feast, Shakha } from "@/types";

export default function ExternalFeastPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: feastId } = use(params);
  const [feast, setFeast] = useState<Feast | null>(null);
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: shks }, standings] = await Promise.all([
      supabase.from("feasts").select("*").eq("id", feastId).single(),
      supabase.from("shakhas").select("*").order("name"),
      getFeastStandings(feastId),
    ]);
    setFeast(f as Feast);
    setShakhas(shks ?? []);
    const byShakha = new Map(standings.map((r) => [r.shakhaId, r.grandTotal]));
    const initial: Record<string, string> = {};
    for (const s of shks ?? []) initial[s.id] = String(byShakha.get(s.id) ?? 0);
    setPoints(initial);
    setLoading(false);
  }, [feastId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const rows = shakhas.map((s) => ({ shakhaId: s.id, points: Number(points[s.id]) || 0 }));
    const { error } = await saveExternalFeastPoints(feastId, rows);
    setSaving(false);
    if (error) { setError(error); return; }
    setSavedAt(Date.now());
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  if (!feast?.is_external) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        This fest isn&apos;t marked as external. Mark it as external from the{" "}
        <Link href="/admin/feasts" className="underline">Fests</Link> list first.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/feasts" className="mb-4 flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Fests
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white">
          <Coins className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">{feast.name}</h1>
          <p className="text-xs text-neutral-500">External fest — enter each shakha&apos;s total points by hand</p>
        </div>
      </div>

      <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
        These totals get summed into <b>Overall Standings</b> alongside every app-tracked fest — there&apos;s no
        category (Sub Jr / Junior / …) breakdown for an external fest, just the grand total per shakha.
      </p>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {shakhas.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">{s.name}</span>
            <input
              type="number"
              className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm"
              value={points[s.id] ?? "0"}
              onChange={(e) => setPoints({ ...points, [s.id]: e.target.value })}
            />
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#fef3c7,#fffbeb)" }}>
              <th className="px-4 py-2">Shakha</th>
              <th className="px-4 py-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {shakhas.map((s, i) => (
              <tr key={s.id} className={i % 2 === 0 ? "bg-white" : "bg-[#fffdf5]"}>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="w-28 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={points[s.id] ?? "0"}
                    onChange={(e) => setPoints({ ...points, [s.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {savedAt && !error && <p className="mt-3 text-sm text-green-600">Saved — overall standings updated.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save points"}
      </button>
    </div>
  );
}
