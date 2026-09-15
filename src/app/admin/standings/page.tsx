"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, Medal, Globe, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getFeastStandings, getOverallStandings,
  getMeghalaStandings, getOverallMeghalaStandings,
  getDioceseStandings, getOverallDioceseStandings,
  type StandingsRow, type GroupStandingsRow,
} from "@/actions/results";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { getOrgSettings } from "@/lib/org-settings";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { Diocese, Feast, HierarchyLevel, Meghala, OrgSettings, Shakha } from "@/types";

type Tier = "shakha" | "meghala" | "diocese";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Builds a print-ready hierarchical standings report — flat at the shakha
// tier (no standings export exists today at all, so this is new even for a
// 'shakha'-level org), grouped by Meghala with member shakhas nested
// beneath at the meghala tier, and Diocese > Meghala > Shakha nested at the
// diocese tier. Always computed from fresh per-shakha rows (not whatever
// tier happens to be selected on screen) since nesting needs shakha-level
// granularity regardless of which tier is being exported.
function buildStandingsHtml(
  title: string,
  orgLine: string,
  shakhaRows: StandingsRow[],
  tier: Tier,
  hierarchy: { shakhas: Shakha[]; meghalas: Meghala[]; dioceses: Diocese[] }
): string {
  const shakhaMeghalaId = new Map(hierarchy.shakhas.map((s) => [s.id, s.meghala_id]));
  const meghalaById = new Map(hierarchy.meghalas.map((m) => [m.id, m]));
  const dioceseNameById = new Map(hierarchy.dioceses.map((d) => [d.id, d.name]));
  const UNASSIGNED = "__unassigned__";

  const shakhaTableHtml = (rows: StandingsRow[]) => {
    const sorted = [...rows].sort((a, b) => b.grandTotal - a.grandTotal || a.shakhaName.localeCompare(b.shakhaName));
    return `<table><thead><tr><th>#</th><th>Shakha</th><th class="num">Total</th></tr></thead><tbody>${sorted
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.shakhaName)}</td><td class="num">${r.grandTotal}</td></tr>`)
      .join("")}</tbody></table>`;
  };

  let bodyHtml: string;

  if (tier === "shakha") {
    bodyHtml = shakhaTableHtml(shakhaRows);
  } else if (tier === "meghala") {
    const groups = new Map<string, { name: string; total: number; rows: StandingsRow[] }>();
    for (const r of shakhaRows) {
      const mId = shakhaMeghalaId.get(r.shakhaId) || UNASSIGNED;
      const name = mId === UNASSIGNED ? "Unassigned" : meghalaById.get(mId)?.name ?? "Unassigned";
      const g = groups.get(mId) ?? { name, total: 0, rows: [] };
      g.total += r.grandTotal;
      g.rows.push(r);
      groups.set(mId, g);
    }
    const sortedGroups = [...groups.entries()].sort(([idA, a], [idB, b]) =>
      idA === UNASSIGNED ? 1 : idB === UNASSIGNED ? -1 : b.total - a.total
    );
    bodyHtml = sortedGroups
      .map(([id, g], i) => `<h2>${id === UNASSIGNED ? "" : `${i + 1}. `}${esc(g.name)} — ${g.total} pts</h2>${shakhaTableHtml(g.rows)}`)
      .join("");
  } else {
    const dioceseGroups = new Map<string, { name: string; total: number; meghalas: Map<string, { name: string; total: number; rows: StandingsRow[] }> }>();
    for (const r of shakhaRows) {
      const mId = shakhaMeghalaId.get(r.shakhaId) || UNASSIGNED;
      const meghala = mId === UNASSIGNED ? undefined : meghalaById.get(mId);
      const dId = meghala?.diocese_id || UNASSIGNED;
      const dName = dId === UNASSIGNED ? "Unassigned" : dioceseNameById.get(dId) ?? "Unassigned";
      const dGroup = dioceseGroups.get(dId) ?? { name: dName, total: 0, meghalas: new Map() };
      dGroup.total += r.grandTotal;
      const mName = mId === UNASSIGNED ? "Unassigned" : meghala?.name ?? "Unassigned";
      const mGroup = dGroup.meghalas.get(mId) ?? { name: mName, total: 0, rows: [] };
      mGroup.total += r.grandTotal;
      mGroup.rows.push(r);
      dGroup.meghalas.set(mId, mGroup);
      dioceseGroups.set(dId, dGroup);
    }
    const sortedDioceses = [...dioceseGroups.entries()].sort(([idA, a], [idB, b]) =>
      idA === UNASSIGNED ? 1 : idB === UNASSIGNED ? -1 : b.total - a.total
    );
    bodyHtml = sortedDioceses
      .map(([dId, d], i) => {
        const sortedMeghalas = [...d.meghalas.entries()].sort(([idA, a], [idB, b]) =>
          idA === UNASSIGNED ? 1 : idB === UNASSIGNED ? -1 : b.total - a.total
        );
        const meghalaHtml = sortedMeghalas
          .map(([, m]) => `<h3>${esc(m.name)} — ${m.total} pts</h3>${shakhaTableHtml(m.rows)}`)
          .join("");
        return `<h2>${dId === UNASSIGNED ? "" : `${i + 1}. `}${esc(d.name)} — ${d.total} pts</h2>${meghalaHtml}`;
      })
      .join("");
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 portrait; margin: 16mm 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, sans-serif; }
    .hdr { text-align: center; margin-bottom: 18px; }
    h2 { margin: 18px 0 6px; font-size: 15px; color: #6B46FF; break-after: avoid; page-break-after: avoid; }
    h3 { margin: 10px 0 4px; font-size: 12.5px; color: #0F766E; break-after: avoid; page-break-after: avoid; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    thead tr { background: linear-gradient(90deg,#ede9fe,#f5f3ff); text-transform: uppercase; }
    th, td { border: 1px solid #333; padding: 5px 6px; font-size: 11px; text-align: left; }
    .num { text-align: right; font-weight: 700; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f8f7ff; }
    </style></head><body>${PRINT_FALLBACK_BUTTON}
    <div class="hdr">
      ${orgLine ? `<div style="font-size:13px;font-weight:700;color:#6B46FF;">${esc(orgLine)}</div>` : ""}
      <div style="font-size:18px;font-weight:700;margin-top:6px;">${esc(title)}</div>
    </div>
    ${bodyHtml}
    </body></html>`;
}

function groupToStandingsRow(r: GroupStandingsRow): StandingsRow {
  return {
    shakhaId: r.groupId,
    shakhaName: r.groupName,
    subJuniorPoints: r.subJuniorPoints,
    juniorPoints: r.juniorPoints,
    seniorPoints: r.seniorPoints,
    superSeniorPoints: r.superSeniorPoints,
    elderPoints: r.elderPoints,
    teamPoints: r.teamPoints,
    grandTotal: r.grandTotal,
    firstPlaceCount: r.firstPlaceCount,
    secondPlaceCount: r.secondPlaceCount,
    thirdPlaceCount: r.thirdPlaceCount,
    aGradeCount: r.aGradeCount,
    bGradeCount: r.bGradeCount,
    cGradeCount: r.cGradeCount,
    rank: r.rank,
  };
}

function tiersFor(level: HierarchyLevel): Tier[] {
  if (level === "diocese") return ["shakha", "meghala", "diocese"];
  if (level === "meghala") return ["shakha", "meghala"];
  return ["shakha"];
}

const RANK_COLORS: Record<number, string> = { 1: "#F5C542", 2: "#C9CDD6", 3: "#E0936A" };

const CAT_COLS = [
  { key: "subJuniorPoints", label: "Sub Jr" },
  { key: "juniorPoints", label: "Junior" },
  { key: "seniorPoints", label: "Senior" },
  { key: "superSeniorPoints", label: "Super Sr" },
  { key: "elderPoints", label: "Elder" },
  { key: "teamPoints", label: "Team" },
] as const;

function StandingsBlock({ rows, loading, emptyText, shakhaColor, groupLabel = "Shakha" }: { rows: StandingsRow[]; loading: boolean; emptyText: string; shakhaColor: (id: string) => string; groupLabel?: string }) {
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
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">{groupLabel}</th>
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

const TIER_LABEL: Record<Tier, string> = { shakha: "Shakha", meghala: "Meghala", diocese: "Diocese" };

export default function StandingsPage() {
  const hierarchy = useOrgHierarchy();
  const [tier, setTier] = useState<Tier>("shakha");
  const availableTiers = tiersFor(hierarchy.hierarchyLevel);

  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [overall, setOverall] = useState<StandingsRow[]>([]);
  const [overallLoading, setOverallLoading] = useState(true);
  const [feastRows, setFeastRows] = useState<StandingsRow[]>([]);
  const [feastLoading, setFeastLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgSettings | null>(null);

  useEffect(() => {
    getOrgSettings().then(setOrg);
    supabase.from("feasts").select("*").order("start_date").then(({ data: fs }) => {
      setFeasts(fs ?? []);
      if (fs && fs.length > 0) setFeastId(fs[0].id);
      setLoading(false);
    });
  }, []);

  const loadOverall = useCallback(async (t: Tier) => {
    setOverallLoading(true);
    const rows =
      t === "shakha" ? await getOverallStandings() :
      t === "meghala" ? (await getOverallMeghalaStandings()).map(groupToStandingsRow) :
      (await getOverallDioceseStandings()).map(groupToStandingsRow);
    setOverall(rows);
    setOverallLoading(false);
  }, []);

  useEffect(() => {
    loadOverall(tier);
  }, [tier, loadOverall]);

  const loadFeastRows = useCallback(async (id: string, t: Tier) => {
    if (!id) return;
    setFeastLoading(true);
    const rows =
      t === "shakha" ? await getFeastStandings(id) :
      t === "meghala" ? (await getMeghalaStandings(id)).map(groupToStandingsRow) :
      (await getDioceseStandings(id)).map(groupToStandingsRow);
    setFeastRows(rows);
    setFeastLoading(false);
  }, []);

  useEffect(() => {
    loadFeastRows(feastId, tier);
  }, [feastId, tier, loadFeastRows]);

  const orgLine = [org?.org_name_en, org?.area_name_en].filter(Boolean).join(" — ");

  // Always fetched fresh at shakha granularity regardless of the currently
  // selected on-screen tier — the Meghala/Diocese nesting needs per-shakha
  // rows to group, and `overall`/`feastRows` state above may already be
  // tier-adapted (see loadOverall/loadFeastRows) if a non-Shakha tier is
  // currently selected on screen.
  async function exportOverallPdf() {
    const shakhaRows = await getOverallStandings();
    const html = buildStandingsHtml("Overall Standings — All Fests", orgLine, shakhaRows, tier, hierarchy);
    openPrintWindow(html);
  }

  async function exportFeastPdf() {
    if (!feastId) return;
    const shakhaRows = await getFeastStandings(feastId);
    const feastName = feasts.find((f) => f.id === feastId)?.name ?? "Fest";
    const html = buildStandingsHtml(`${feastName} Standings`, orgLine, shakhaRows, tier, hierarchy);
    openPrintWindow(html);
  }

  // "Shakha" tier falls back to hierarchy.shakhas' own colors (unchanged);
  // Meghala/Diocese tiers key off their own color, and the synthetic
  // "unassigned" bucket (a shakha never linked into the org's hierarchy)
  // gets a flat neutral gray rather than the default-fallback purple.
  const rowColor = (id: string) => {
    if (id === "__unassigned__") return "#9CA3AF";
    if (tier === "meghala") return hierarchy.meghalas.find((m) => m.id === id)?.color ?? "#A78BFA";
    if (tier === "diocese") return hierarchy.dioceses.find((d) => d.id === id)?.color ?? "#A78BFA";
    return hierarchy.shakhas.find((s) => s.id === id)?.color ?? "#A78BFA";
  };
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
          <p className="text-xs text-gray-500">{TIER_LABEL[tier]} rankings aggregated from published results</p>
        </div>
      </div>

      {availableTiers.length > 1 && (
        <div className="mb-5 flex gap-2">
          {availableTiers.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tier === t ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-400"
              }`}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-[15px] w-[15px] text-gray-400" />
          <h2 className="text-sm font-bold text-gray-800">Overall Standings — All Fests</h2>
        </div>
        <button onClick={exportOverallPdf} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-400">
          <Download className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>
      <div className="mb-8">
        <StandingsBlock rows={overall} loading={overallLoading} emptyText="No standings yet across any fest." shakhaColor={rowColor} groupLabel={TIER_LABEL[tier]} />
      </div>

      <div className="mb-8 h-px bg-gray-100" />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-[15px] w-[15px] text-gray-400" />
          <h2 className="text-sm font-bold text-gray-800">Fest Standings</h2>
        </div>
        <button onClick={exportFeastPdf} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-400">
          <Download className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium text-gray-500">Fest</label>
        <select className={selectCls} value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <StandingsBlock rows={feastRows} loading={feastLoading} emptyText="No standings yet. Publish some results first." shakhaColor={rowColor} groupLabel={TIER_LABEL[tier]} />
    </div>
  );
}
