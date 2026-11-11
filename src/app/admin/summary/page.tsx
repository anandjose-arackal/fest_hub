"use client";

import { useEffect, useMemo, useState } from "react";
import { ListOrdered, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getFeastStandings, getOverallStandings,
  getMeghalaStandings, getOverallMeghalaStandings,
  getDioceseStandings, getOverallDioceseStandings,
  getStandingsGenderSplit,
  type StandingsRow, type GroupStandingsRow,
} from "@/actions/results";
import { useOrgHierarchy, loadOrgSettingsCached as getOrgSettings } from "@/hooks/use-feast";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import { SPLIT_CATEGORIES, type GenderSplit, type SplitCategory, type SplitGender } from "@/lib/standings-split";
import type { Feast, HierarchyLevel, OrgSettings } from "@/types";

// Points summary: the org's top tier ranked overall, per age category and
// per category split into Boys / Girls, plus the Meghala and Shakha top 10 —
// for all fests or one fest, with a print view. Everything is read from the
// existing standings actions (published results only).

type Tier = HierarchyLevel;
const TIER_LABEL: Record<Tier, string> = { shakha: "Shakha", meghala: "Meghala", diocese: "Diocese" };
const CAT_LABEL: Record<SplitCategory, string> = { sub_junior: "Sub Junior", junior: "Junior", senior: "Senior", super_senior: "Super Senior", elder: "Elder" };
const GENDER_LABEL: Record<SplitGender, string> = { boy: "Boys", girl: "Girls", common: "Common" };
const UNASSIGNED = "__unassigned__";
const TOP_N = 10;

interface Row {
  id: string;
  name: string;
  cats: Record<SplitCategory, number>;
  team: number;
  total: number;
}
interface Ranked { id: string; name: string; rank: number | null; pts: number }
interface RankList { title: string; rows: Ranked[] }
interface CategoryBlock { cat: SplitCategory; lists: RankList[] }

function fromStandings(r: StandingsRow): Row {
  return {
    id: r.shakhaId, name: r.shakhaName, team: r.teamPoints, total: r.grandTotal,
    cats: { sub_junior: r.subJuniorPoints, junior: r.juniorPoints, senior: r.seniorPoints, super_senior: r.superSeniorPoints, elder: r.elderPoints },
  };
}
function fromGroup(r: GroupStandingsRow): Row {
  return {
    id: r.groupId, name: r.groupName, team: r.teamPoints, total: r.grandTotal,
    cats: { sub_junior: r.subJuniorPoints, junior: r.juniorPoints, senior: r.seniorPoints, super_senior: r.superSeniorPoints, elder: r.elderPoints },
  };
}

// First to last by `pts`; ties share a rank (1, 1, 3). The "Unassigned"
// bucket (shakhas outside the hierarchy) is listed last, unranked, and only
// when it has points.
function rank(rows: Row[], pts: (r: Row) => number): Ranked[] {
  const ranked = rows
    .filter((r) => r.id !== UNASSIGNED)
    .map((r) => ({ id: r.id, name: r.name, pts: pts(r), rank: 0 as number | null }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  ranked.forEach((r, i) => (r.rank = i > 0 && r.pts === ranked[i - 1].pts ? ranked[i - 1].rank : i + 1));
  const un = rows.find((r) => r.id === UNASSIGNED);
  if (un && pts(un) > 0) ranked.push({ id: un.id, name: un.name, pts: pts(un), rank: null });
  return ranked;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface SummaryData {
  top: Row[];
  split: Record<string, GenderSplit> | null;
  meghala: Row[] | null;
  shakha: Row[] | null;
}

export default function SummaryPage() {
  const hierarchy = useOrgHierarchy();
  const topTier: Tier = hierarchy.hierarchyLevel;
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [scope, setScope] = useState("overall");
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgSettings().then(setOrg);
    supabase.from("feasts").select("*").order("start_date").then(({ data: fs }) => setFeasts(fs ?? []));
  }, []);

  const feast = feasts.find((f) => f.id === scope) ?? null;

  useEffect(() => {
    if (hierarchy.loading) return;
    let cancelled = false;
    const id = scope === "overall" ? null : scope;
    const shakhaRows = () => (id ? getFeastStandings(id) : getOverallStandings()).then((r) => r.map(fromStandings));
    const meghalaRows = () => (id ? getMeghalaStandings(id) : getOverallMeghalaStandings()).then((r) => r.map(fromGroup));
    const dioceseRows = () => (id ? getDioceseStandings(id) : getOverallDioceseStandings()).then((r) => r.map(fromGroup));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch this effect starts
    setLoading(true);
    Promise.all([
      topTier === "diocese" ? dioceseRows() : topTier === "meghala" ? meghalaRows() : shakhaRows(),
      // An external fest's points were entered as totals — no per-item record to split.
      feast?.is_external ? Promise.resolve(null) : getStandingsGenderSplit(id, topTier),
      topTier === "diocese" ? meghalaRows() : Promise.resolve(null),
      topTier !== "shakha" ? shakhaRows() : Promise.resolve(null),
    ]).then(([top, split, meghala, shakha]) => {
      if (cancelled) return;
      setData({ top, split, meghala: topTier === "meghala" ? top : meghala, shakha });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, topTier, hierarchy.loading, feast?.is_external]);

  const view = useMemo(() => {
    if (!data) return null;
    const { top, split } = data;
    const categories: CategoryBlock[] = SPLIT_CATEGORIES.map((cat) => {
      const lists: RankList[] = [{ title: "Overall", rows: rank(top, (r) => r.cats[cat]) }];
      if (split) {
        const g = (r: Row, gender: SplitGender) => split[r.id]?.[cat][gender] ?? 0;
        lists.push({ title: GENDER_LABEL.boy, rows: rank(top, (r) => g(r, "boy")) });
        lists.push({ title: GENDER_LABEL.girl, rows: rank(top, (r) => g(r, "girl")) });
        // Items open to both — shown only when the category has any.
        if (top.some((r) => g(r, "common") > 0)) lists.push({ title: GENDER_LABEL.common, rows: rank(top, (r) => g(r, "common")) });
      }
      return { cat, lists };
    });
    const standings = rank(top, (r) => r.total).map((x) => ({ ...x, row: top.find((r) => r.id === x.id)! }));
    return {
      standings,
      categories,
      meghalaTop: data.meghala && topTier === "diocese" ? rank(data.meghala, (r) => r.total).filter((r) => r.rank !== null).slice(0, TOP_N) : null,
      shakhaTop: data.shakha ? rank(data.shakha, (r) => r.total).filter((r) => r.rank !== null).slice(0, TOP_N) : null,
      showSplit: !!split,
    };
  }, [data, topTier]);

  const scopeTitle = feast ? feast.name : "Overall (all fests)";
  const topLabel = TIER_LABEL[topTier];
  const orgLine = [org?.org_name_en, org?.area_name_en].filter(Boolean).join(" — ");
  const hasPoints = !!view && view.standings.some((r) => r.pts > 0);

  function printSummary() {
    if (!view) return;
    const listTable = (l: RankList, nameHead: string) =>
      `<div class="list"><div class="lt">${esc(l.title)}</div><table><thead><tr><th>#</th><th>${nameHead}</th><th class="num">Pts</th></tr></thead><tbody>${l.rows
        .map((r) => `<tr><td>${r.rank ?? "—"}</td><td>${esc(r.name)}</td><td class="num">${r.pts}</td></tr>`)
        .join("")}</tbody></table></div>`;
    const standingsHtml = `<h2>${topLabel} standings</h2><table><thead><tr><th>#</th><th>${topLabel}</th>${SPLIT_CATEGORIES.map((c) => `<th class="num">${CAT_LABEL[c]}</th>`).join("")}<th class="num">Team</th><th class="num">Total</th></tr></thead><tbody>${view.standings
      .map((s) => `<tr><td>${s.rank ?? "—"}</td><td>${esc(s.name)}</td>${SPLIT_CATEGORIES.map((c) => `<td class="num">${s.row.cats[c]}</td>`).join("")}<td class="num">${s.row.team}</td><td class="num">${s.pts}</td></tr>`)
      .join("")}</tbody></table>`;
    const catHtml = `<h2 class="pb">By age category${view.showSplit ? " — Boys and Girls" : ""}</h2>${view.categories
      .map((b) => `<div class="cat"><h3>${CAT_LABEL[b.cat]}</h3><div class="lists">${b.lists.map((l) => listTable(l, topLabel)).join("")}</div></div>`)
      .join("")}`;
    const topHtml = [
      view.meghalaTop && `<h2>Meghala — top ${TOP_N}</h2>${listTable({ title: "", rows: view.meghalaTop }, "Meghala")}`,
      view.shakhaTop && `<h2>Shakha — top ${TOP_N}</h2>${listTable({ title: "", rows: view.shakhaTop }, "Shakha")}`,
    ].filter(Boolean).join("");
    const title = `Points Summary — ${scopeTitle}`;
    openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A4 portrait; margin: 14mm 12mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, sans-serif; }
      .hdr { text-align: center; margin-bottom: 14px; }
      h2 { margin: 18px 0 6px; font-size: 15px; color: #6B46FF; break-after: avoid; page-break-after: avoid; }
      h2.pb { break-before: page; page-break-before: always; }
      h3 { margin: 0 0 4px; font-size: 13px; color: #0F766E; }
      .cat { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }
      .lists { display: flex; gap: 8px; align-items: flex-start; }
      .list { flex: 1; min-width: 0; }
      .lt { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      thead tr { background: #ede9fe; text-transform: uppercase; }
      th, td { border: 1px solid #333; padding: 4px 5px; font-size: 10.5px; text-align: left; }
      .num { text-align: right; }
      td.num:last-child { font-weight: 700; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      tbody tr:nth-child(even) { background: #f8f7ff; }
      </style></head><body>${PRINT_FALLBACK_BUTTON}
      <div class="hdr">
        ${orgLine ? `<div style="font-size:13px;font-weight:700;color:#6B46FF;">${esc(orgLine)}</div>` : ""}
        <div style="font-size:18px;font-weight:700;margin-top:6px;">${esc(title)}</div>
      </div>
      ${standingsHtml}${topHtml}${catHtml}
      </body></html>`);
  }

  const selectCls = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-purple-200";
  const th = "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6B46FF] to-[#9333EA] text-white">
            <ListOrdered className="h-[17px] w-[17px]" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Points Summary</h1>
            <p className="text-xs text-gray-500">{topLabel} rankings from published results</p>
          </div>
        </div>
        <button
          onClick={printSummary}
          disabled={!view || loading}
          className="flex items-center gap-1.5 rounded-lg bg-[#6B46FF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5a37e6] disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="summary-scope">Show</label>
        <select id="summary-scope" className={`${selectCls} w-full sm:w-auto`} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="overall">Overall (all fests)</option>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {loading || !view ? (
        <p className="py-14 text-center text-sm text-neutral-400">Loading…</p>
      ) : !hasPoints ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">No points yet for {scopeTitle}. Publish some results first.</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-sm font-bold text-gray-800">{topLabel} standings</h2>
            <div className="space-y-2 sm:hidden">
              {view.standings.map((s) => (
                <div key={s.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-gray-900">
                      <span className="w-6 text-center text-xs text-gray-400">{s.rank ?? "—"}</span>
                      {s.name}
                    </span>
                    <span className="font-bold text-[#6B46FF]">{s.pts}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-gray-500">
                    {SPLIT_CATEGORIES.map((c) => <span key={c}>{CAT_LABEL[c]}: {s.row.cats[c]}</span>)}
                    <span>Team: {s.row.team}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm sm:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className={`w-12 text-left ${th}`}>#</th>
                    <th className={`text-left ${th}`}>{topLabel}</th>
                    {SPLIT_CATEGORIES.map((c) => <th key={c} className={`text-right ${th}`}>{CAT_LABEL[c]}</th>)}
                    <th className={`text-right ${th}`}>Team</th>
                    <th className={`text-right ${th}`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {view.standings.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50">
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-400">{s.rank ?? "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{s.name}</td>
                      {SPLIT_CATEGORIES.map((c) => <td key={c} className="px-3 py-2.5 text-right tabular-nums text-gray-600">{s.row.cats[c]}</td>)}
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{s.row.team}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#6B46FF]">{s.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(view.meghalaTop || view.shakhaTop) && (
            <section className="grid gap-6 lg:grid-cols-2">
              {view.meghalaTop && <RankCard title={`Meghala — top ${TOP_N}`} nameHead="Meghala" rows={view.meghalaTop} />}
              {view.shakhaTop && <RankCard title={`Shakha — top ${TOP_N}`} nameHead="Shakha" rows={view.shakhaTop} />}
            </section>
          )}

          <section>
            <h2 className="mb-1 text-sm font-bold text-gray-800">By age category{view.showSplit ? " — Boys and Girls" : ""}</h2>
            {!view.showSplit && <p className="mb-3 text-xs text-gray-500">This fest&apos;s points were entered as totals, so there is no Boys / Girls split.</p>}
            <div className="mt-3 space-y-8">
              {view.categories.map((b) => (
                <div key={b.cat}>
                  <h3 className="mb-2 text-[13px] font-bold text-teal-700">{CAT_LABEL[b.cat]}</h3>
                  <div className={`grid gap-4 sm:grid-cols-2 ${b.lists.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
                    {b.lists.map((l) => <RankCard key={l.title} title={l.title} nameHead={topLabel} rows={l.rows} small />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// One ranked list: a desktop table plus a phone card stack.
function RankCard({ title, nameHead, rows, small }: { title: string; nameHead: string; rows: Ranked[]; small?: boolean }) {
  const th = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400";
  return (
    <div>
      <h4 className={`mb-1.5 font-bold ${small ? "text-xs uppercase tracking-wide text-gray-600" : "text-sm text-gray-800"}`}>{title}</h4>
      <div className="space-y-1.5 sm:hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm">
            <span className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-gray-400">{r.rank ?? "—"}</span>
              <span className="font-medium text-gray-900">{r.name}</span>
            </span>
            <span className="font-bold tabular-nums text-[#6B46FF]">{r.pts}</span>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className={`w-10 text-left ${th}`}>#</th>
              <th className={`text-left ${th}`}>{nameHead}</th>
              <th className={`text-right ${th}`}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 text-xs text-gray-400">{r.rank ?? "—"}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-[#6B46FF]">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
