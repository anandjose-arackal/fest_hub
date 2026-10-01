"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFeastStandings, saveExternalFeastPoints, type ExternalFeastPointsRow, type StandingsRow } from "@/actions/results";
import type { Feast, Shakha } from "@/types";

type CatKey = Exclude<keyof ExternalFeastPointsRow, "shakhaId">;

// Same buckets (and labels) as the standings table.
const CATS: { key: CatKey; label: string; standingsKey: keyof StandingsRow }[] = [
  { key: "subJunior", label: "Sub Jr", standingsKey: "subJuniorPoints" },
  { key: "junior", label: "Junior", standingsKey: "juniorPoints" },
  { key: "senior", label: "Senior", standingsKey: "seniorPoints" },
  { key: "superSenior", label: "Super Sr", standingsKey: "superSeniorPoints" },
  { key: "elder", label: "Elder", standingsKey: "elderPoints" },
  { key: "team", label: "Team", standingsKey: "teamPoints" },
];

type Cells = Record<string, Record<CatKey, string>>;

export default function ExternalFeastPointsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: feastId } = use(params);
  const [feast, setFeast] = useState<Feast | null>(null);
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [cells, setCells] = useState<Cells>({});
  // Saved totals with no matching category breakdown (entered when this
  // page took a single total per shakha) — shown so saving doesn't replace
  // them unnoticed.
  const [legacyTotals, setLegacyTotals] = useState<{ name: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: f }, { data: shks }, standings] = await Promise.all([
        supabase.from("feasts").select("*").eq("id", feastId).single(),
        supabase.from("shakhas").select("*").order("name"),
        getFeastStandings(feastId),
      ]);
      if (cancelled) return;
      const byShakha = new Map(standings.map((r) => [r.shakhaId, r]));
      const initial: Cells = {};
      const legacy: { name: string; total: number }[] = [];
      for (const s of shks ?? []) {
        const row = byShakha.get(s.id);
        initial[s.id] = Object.fromEntries(CATS.map((c) => [c.key, String(row ? (row[c.standingsKey] as number) : 0)])) as Record<CatKey, string>;
        const catSum = row ? CATS.reduce((sum, c) => sum + (row[c.standingsKey] as number), 0) : 0;
        if (row && row.grandTotal !== catSum) legacy.push({ name: s.name, total: row.grandTotal });
      }
      setFeast(f as Feast | null);
      setShakhas(shks ?? []);
      setCells(initial);
      setLegacyTotals(legacy);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [feastId]);

  const rowTotal = (shakhaId: string) => CATS.reduce((sum, c) => sum + (Number(cells[shakhaId]?.[c.key]) || 0), 0);

  function setCell(shakhaId: string, key: CatKey, value: string) {
    setCells((prev) => ({ ...prev, [shakhaId]: { ...prev[shakhaId], [key]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const rows: ExternalFeastPointsRow[] = shakhas.map((s) => ({
      shakhaId: s.id,
      ...(Object.fromEntries(CATS.map((c) => [c.key, Number(cells[s.id]?.[c.key]) || 0])) as Record<CatKey, number>),
    }));
    const { error } = await saveExternalFeastPoints(feastId, rows);
    setSaving(false);
    if (error) { setError(error); return; }
    setLegacyTotals([]);
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

  const pointInput = (shakha: Shakha, c: (typeof CATS)[number], cls: string) => (
    <input
      type="number"
      inputMode="numeric"
      aria-label={`${shakha.name} ${c.label}`}
      className={`rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm ${cls}`}
      value={cells[shakha.id]?.[c.key] ?? "0"}
      onChange={(e) => setCell(shakha.id, c.key, e.target.value)}
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/feasts" className="mb-4 flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Fests
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white">
          <Coins className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">{feast.name}</h1>
          <p className="text-xs text-neutral-500">External fest — enter each shakha&apos;s points per age category by hand</p>
        </div>
      </div>

      <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
        These points are this fest&apos;s shakha standings — the total is the sum of the categories — and get summed into{" "}
        <b>Overall Standings</b> alongside every app-tracked fest. Publishing this fest&apos;s competition results shows grades
        and positions only; it never changes these points.
      </p>

      {legacyTotals.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          These shakhas have a saved total with no category breakdown. Enter their category points — saving replaces the
          total with the sum: {legacyTotals.map((l) => `${l.name} (${l.total})`).join(", ")}.
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {shakhas.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">{s.name}</span>
              <span className="text-sm font-bold text-amber-700">{rowTotal(s.id)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CATS.map((c) => (
                <label key={c.key} className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>{c.label}</span>
                  {pointInput(s, c, "w-16")}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#fef3c7,#fffbeb)" }}>
              <th className="px-4 py-2">Shakha</th>
              {CATS.map((c) => <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>)}
              <th className="px-4 py-2 text-right">Total</th>
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
                {CATS.map((c) => <td key={c.key} className="px-3 py-2 text-right">{pointInput(s, c, "w-20")}</td>)}
                <td className="px-4 py-2 text-right font-bold text-amber-700">{rowTotal(s.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {savedAt && !error && <p className="mt-3 text-sm text-green-600">Saved — standings updated.</p>}

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
