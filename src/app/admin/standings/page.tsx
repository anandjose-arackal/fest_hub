"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, Medal, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFeastStandings, getOverallStandings, type StandingsRow } from "@/actions/results";
import type { Feast, Shakha } from "@/types";

const RANK_COLORS: Record<number, string> = { 1: "#F5C542", 2: "#C9CDD6", 3: "#E0936A" };

const CAT_COLS = [
  { key: "subJuniorPoints", label: "Sub Jr" },
  { key: "juniorPoints", label: "Junior" },
  { key: "seniorPoints", label: "Senior" },
  { key: "superSeniorPoints", label: "Super Sr" },
  { key: "elderPoints", label: "Elder" },
  { key: "teamPoints", label: "Team" },
] as const;

function StandingsBlock({ rows, loading, emptyText, shakhaColor }: { rows: StandingsRow[]; loading: boolean; emptyText: string; shakhaColor: (id: string) => string }) {
  return (
    <>
      {/* Top 3 podium cards */}
      {!loading && rows.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {rows.slice(0, 3).map((s, i) => {
            const rank = s.rank ?? i + 1;
            const c = RANK_COLORS[rank] ?? "#9CA3AF";
            return (
              <div key={s.shakhaId} className="min-w-[140px] flex-1 rounded-2xl border p-4" style={{ background: `${c}12`, borderColor: `${c}44` }}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: c, color: "#2a1d00" }}>{rank}</div>
                  <Medal className="h-3.5 w-3.5" style={{ color: c }} />
                </div>
                <div className="mb-0.5 text-[15px] font-bold text-gray-900">{s.shakhaName}</div>
                <div className="text-2xl font-bold" style={{ color: c }}>{s.grandTotal}</div>
                <div className="mt-0.5 text-xs text-gray-400">total points</div>
                <div className="mt-2 flex gap-2 text-xs text-gray-500">
                  <span>🥇 {s.firstPlaceCount}</span>
                  <span>🥈 {s.secondPlaceCount}</span>
                  <span>🥉 {s.thirdPlaceCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="py-14 text-center text-sm text-neutral-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">{emptyText}</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((s, i) => {
              const rank = s.rank ?? i + 1;
              const rankColor = RANK_COLORS[rank];
              return (
                <div key={s.shakhaId} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {rankColor ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: rankColor, color: "#2a1d00" }}>{rank}</span>
                      ) : (
                        <span className="w-6 text-center text-xs font-medium text-gray-400">{rank}</span>
                      )}
                      <span className="h-2 w-2 rounded-full" style={{ background: shakhaColor(s.shakhaId) }} />
                      {s.shakhaName}
                    </span>
                    <span className="font-bold" style={{ color: s.grandTotal > 0 ? "#6B46FF" : "#9CA3AF" }}>{s.grandTotal}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-gray-500">
                    {CAT_COLS.map((c) => (
                      <span key={c.key}>{c.label}: {s[c.key] || "—"}</span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1.5 text-[11px]">
                    <span className="text-gray-500">1st: {s.firstPlaceCount || "—"}</span>
                    {s.aGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#16A34A18", color: "#16A34A" }}>A×{s.aGradeCount}</span>}
                    {s.bGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#D9770618", color: "#D97706" }}>B×{s.bGradeCount}</span>}
                    {s.cGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#6B46FF18", color: "#6B46FF" }}>C×{s.cGradeCount}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">#</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Shakha</th>
                  {CAT_COLS.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">1st</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">A</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">B</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">C</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const rank = s.rank ?? i + 1;
                  const rankColor = RANK_COLORS[rank];
                  return (
                    <tr key={s.shakhaId} className="border-b border-gray-50 transition-colors hover:bg-gray-50/60">
                      <td className="px-3 py-3">
                        {rankColor ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: rankColor, color: "#2a1d00" }}>{rank}</div>
                        ) : (
                          <span className="text-xs font-medium text-gray-400">{rank}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: shakhaColor(s.shakhaId) }} />
                          <span className="font-semibold text-gray-900">{s.shakhaName}</span>
                        </div>
                      </td>
                      {CAT_COLS.map((c) => (
                        <td key={c.key} className="px-3 py-3 text-center text-[13px] text-gray-600">
                          {s[c.key] > 0 ? <span className="font-semibold">{s[c.key]}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <span className="text-[14px] font-bold" style={{ color: s.grandTotal > 0 ? "#6B46FF" : "#9CA3AF" }}>{s.grandTotal}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500">{s.firstPlaceCount || "—"}</td>
                      <td className="px-3 py-3 text-center">
                        {s.aGradeCount > 0 ? <span className="rounded-full px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#16A34A18", color: "#16A34A" }}>{s.aGradeCount}</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {s.bGradeCount > 0 ? <span className="rounded-full px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#D9770618", color: "#D97706" }}>{s.bGradeCount}</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {s.cGradeCount > 0 ? <span className="rounded-full px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#6B46FF18", color: "#6B46FF" }}>{s.cGradeCount}</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function StandingsPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [overall, setOverall] = useState<StandingsRow[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);
  const [feastRows, setFeastRows] = useState<StandingsRow[]>([]);
  const [feastLoading, setFeastLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("feasts").select("*").order("start_date"),
      supabase.from("shakhas").select("*"),
      getOverallStandings(),
    ]).then(([{ data: fs }, { data: shks }, overallRows]) => {
      setFeasts(fs ?? []);
      setShakhas(shks ?? []);
      setOverall(overallRows);
      setOverallLoading(false);
      if (fs && fs.length > 0) setFeastId(fs[0].id);
      setLoading(false);
    });
  }, []);

  const loadFeastRows = useCallback(async (id: string) => {
    if (!id) return;
    setFeastLoading(true);
    setFeastRows(await getFeastStandings(id));
    setFeastLoading(false);
  }, []);

  useEffect(() => {
    loadFeastRows(feastId);
  }, [feastId, loadFeastRows]);

  const shakhaColor = (id: string) => shakhas.find((s) => s.id === id)?.color ?? "#A78BFA";
  const selectCls = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-purple-200";

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F5C542] to-[#F59E0B] text-white">
          <Trophy className="h-[17px] w-[17px]" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Standings</h1>
          <p className="text-xs text-gray-500">Shakha rankings aggregated from published results</p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-[15px] w-[15px] text-gray-400" />
        <h2 className="text-sm font-bold text-gray-800">Overall Standings — All Fests</h2>
      </div>
      <div className="mb-8">
        <StandingsBlock rows={overall} loading={overallLoading} emptyText="No standings yet across any fest." shakhaColor={shakhaColor} />
      </div>

      <div className="mb-8 h-px bg-gray-100" />

      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-[15px] w-[15px] text-gray-400" />
        <h2 className="text-sm font-bold text-gray-800">Fest Standings</h2>
      </div>
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium text-gray-500">Fest</label>
        <select className={selectCls} value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <StandingsBlock rows={feastRows} loading={feastLoading} emptyText="No standings yet. Publish some results first." shakhaColor={shakhaColor} />
    </div>
  );
}
