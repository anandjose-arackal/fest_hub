"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFeastStandings, getOverallStandings, type StandingsRow } from "@/actions/results";
import type { Feast, Shakha } from "@/types";

const PODIUM_COLORS = ["#F5C542", "#C9CDD6", "#E0936A"];

function StandingsBlock({ title, rows, shakhaColor }: { title: string; rows: StandingsRow[]; shakhaColor: (id: string) => string }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">{title}</h2>

      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rows.slice(0, 3).map((r, i) => (
            <div key={r.shakhaId} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: PODIUM_COLORS[i] }}
                >
                  {i + 1}
                </span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: shakhaColor(r.shakhaId) }} />
                <span className="font-semibold text-neutral-800">{r.shakhaName}</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#6B46FF]">{r.grandTotal}</p>
              <p className="text-xs text-neutral-500">🥇{r.firstPlaceCount} 🥈{r.secondPlaceCount} 🥉{r.thirdPlaceCount}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r, i) => (
          <div key={r.shakhaId} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-xs text-neutral-400">#{r.rank ?? i + 1}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: shakhaColor(r.shakhaId) }} />
                {r.shakhaName}
              </span>
              <span className="font-bold" style={{ color: r.grandTotal > 0 ? "#6B46FF" : "#9CA3AF" }}>{r.grandTotal}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-neutral-500">
              <span>Sub Jr: {r.subJuniorPoints || "—"}</span>
              <span>Junior: {r.juniorPoints || "—"}</span>
              <span>Senior: {r.seniorPoints || "—"}</span>
              <span>Super Sr: {r.superSeniorPoints || "—"}</span>
              <span>Elder: {r.elderPoints || "—"}</span>
              <span>Team: {r.teamPoints || "—"}</span>
            </div>
            <div className="mt-1.5 flex gap-1.5 text-[11px]">
              <span>1st: {r.firstPlaceCount || "—"}</span>
              {r.aGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#16A34A18", color: "#16A34A" }}>A×{r.aGradeCount}</span>}
              {r.bGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#D9770618", color: "#D97706" }}>B×{r.bGradeCount}</span>}
              {r.cGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#6B46FF18", color: "#6B46FF" }}>C×{r.cGradeCount}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white sm:block">
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Shakha</th>
              <th className="px-3 py-2">Sub Jr</th>
              <th className="px-3 py-2">Junior</th>
              <th className="px-3 py-2">Senior</th>
              <th className="px-3 py-2">Super Sr</th>
              <th className="px-3 py-2">Elder</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">1st</th>
              <th className="px-3 py-2">A</th>
              <th className="px-3 py-2">B</th>
              <th className="px-3 py-2">C</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.shakhaId} className={i % 2 === 0 ? "bg-white" : "bg-[#f8f7ff]"}>
                <td className="px-3 py-2">{r.rank ?? i + 1}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: shakhaColor(r.shakhaId) }} />
                    {r.shakhaName}
                  </span>
                </td>
                <td className="px-3 py-2">{r.subJuniorPoints || "—"}</td>
                <td className="px-3 py-2">{r.juniorPoints || "—"}</td>
                <td className="px-3 py-2">{r.seniorPoints || "—"}</td>
                <td className="px-3 py-2">{r.superSeniorPoints || "—"}</td>
                <td className="px-3 py-2">{r.elderPoints || "—"}</td>
                <td className="px-3 py-2">{r.teamPoints || "—"}</td>
                <td className="px-3 py-2 font-bold" style={{ color: r.grandTotal > 0 ? "#6B46FF" : "#9CA3AF" }}>{r.grandTotal}</td>
                <td className="px-3 py-2">{r.firstPlaceCount || "—"}</td>
                <td className="px-3 py-2">
                  {r.aGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold" style={{ background: "#16A34A18", color: "#16A34A" }}>{r.aGradeCount}</span>}
                </td>
                <td className="px-3 py-2">
                  {r.bGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold" style={{ background: "#D9770618", color: "#D97706" }}>{r.bGradeCount}</span>}
                </td>
                <td className="px-3 py-2">
                  {r.cGradeCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold" style={{ background: "#6B46FF18", color: "#6B46FF" }}>{r.cGradeCount}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StandingsPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [overall, setOverall] = useState<StandingsRow[]>([]);
  const [feastRows, setFeastRows] = useState<StandingsRow[]>([]);
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
      if (fs && fs.length > 0) setFeastId(fs[0].id);
      setLoading(false);
    });
  }, []);

  const loadFeastRows = useCallback(async (id: string) => {
    if (!id) return;
    setFeastRows(await getFeastStandings(id));
  }, []);

  useEffect(() => {
    loadFeastRows(feastId);
  }, [feastId, loadFeastRows]);

  const shakhaColor = (id: string) => shakhas.find((s) => s.id === id)?.color ?? "#A78BFA";

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#F5C542] to-[#F59E0B] text-white">
          <Trophy className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-neutral-800">Standings</h1>
      </div>

      <StandingsBlock title="Overall Standings — All Feasts" rows={overall} shakhaColor={shakhaColor} />

      <div className="mb-3 flex items-center gap-2">
        <select className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <StandingsBlock title="Feast Standings" rows={feastRows} shakhaColor={shakhaColor} />
    </div>
  );
}
