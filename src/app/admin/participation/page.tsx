"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { setParticipation, setChanceNo } from "@/actions/feast";
import { setTeamParticipation, setTeamChanceNo } from "@/actions/team";
import { getScoreHeadings } from "@/lib/scoresheet-headings";
import { getCompetitionSubject } from "@/lib/competition-subjects";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, Shakha } from "@/types";

type FCRow = FeastCompetition & { competition: Competition & { competition_category?: CompetitionCategory | null } };

interface EntryRow {
  regId: string;
  regNo: string;
  name: string;
  houseName: string;
  shakhaName: string;
  shakhaId: string;
  catSlug: string;
  participated: boolean;
  chanceNo: number | null;
  isTeam: boolean;
}

function sortByChance(a: EntryRow, b: EntryRow) {
  if (a.chanceNo == null && b.chanceNo == null) return a.regNo.localeCompare(b.regNo, undefined, { numeric: true });
  if (a.chanceNo == null) return 1;
  if (b.chanceNo == null) return -1;
  return a.chanceNo - b.chanceNo;
}

export default function ParticipationPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [compId, setCompId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [shakhaFilter, setShakhaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
    supabase.from("shakhas").select("*").order("name").then(({ data }) => setShakhas(data ?? []));
  }, []);

  useEffect(() => {
    if (!feastId) return;
    supabase
      .from("feast_competitions")
      .select("*, competition:competitions(*, competition_category:competition_categories(*))")
      .eq("feast_id", feastId)
      .order("display_order")
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as FCRow[];
        setFeastComps(rows);
        if (rows.length > 0) setCompId(rows[0].id);
      });
  }, [feastId]);

  const selectedFc = feastComps.find((c) => c.id === compId);
  const isGroup = selectedFc?.competition.type === "group";

  const loadEntries = useCallback(async () => {
    if (!compId || !selectedFc) return;
    setLoading(true);
    if (isGroup) {
      const { data } = await supabase
        .from("team_registrations")
        .select("id, team_name, participated, chance_no, shakha:shakhas(id, name), team_registration_members(participant:participants(name))")
        .eq("feast_competition_id", compId);
      const rows: EntryRow[] = (data ?? []).map((t) => {
        const shakha = Array.isArray(t.shakha) ? t.shakha[0] : t.shakha;
        const members = t.team_registration_members ?? [];
        const names = members.map((m) => {
          const p = Array.isArray(m.participant) ? m.participant[0] : m.participant;
          return p?.name ?? "";
        });
        return {
          regId: t.id,
          regNo: t.team_name,
          name: names.join(", "),
          houseName: `${names.length} members`,
          shakhaName: shakha?.name ?? "—",
          shakhaId: shakha?.id ?? "",
          catSlug: "team",
          participated: t.participated,
          chanceNo: t.chance_no,
          isTeam: true,
        };
      });
      setEntries(rows.sort(sortByChance));
    } else {
      const { data } = await supabase
        .from("participant_registrations")
        .select("id, participated, chance_no, participant:participants(name, house_name, registration_number, competition_category_id, shakha:shakhas(id, name))")
        .eq("feast_competition_id", compId);
      const rows: EntryRow[] = (data ?? []).map((r) => {
        const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
        const shakha = Array.isArray(p?.shakha) ? p?.shakha[0] : p?.shakha;
        return {
          regId: r.id,
          regNo: p?.registration_number ?? "—",
          name: p?.name ?? "—",
          houseName: p?.house_name ?? "",
          shakhaName: shakha?.name ?? "—",
          shakhaId: shakha?.id ?? "",
          catSlug: "",
          participated: r.participated,
          chanceNo: r.chance_no,
          isTeam: false,
        };
      });
      setEntries(rows.sort(sortByChance));
    }
    setLoading(false);
  }, [compId, isGroup, selectedFc]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = useMemo(() => {
    let rows = entries;
    if (shakhaFilter) rows = rows.filter((r) => r.shakhaId === shakhaFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.regNo.toLowerCase().includes(q));
    return rows;
  }, [entries, shakhaFilter, search]);

  const markedCount = entries.filter((e) => e.participated).length;

  function showBanner(text: string, error = false) {
    setBanner({ text, error });
    setTimeout(() => setBanner(null), 3000);
  }

  async function toggleParticipated(row: EntryRow) {
    const next = !row.participated;
    setEntries((prev) => prev.map((r) => (r.regId === row.regId ? { ...r, participated: next } : r)));
    const result = row.isTeam ? await setTeamParticipation(row.regId, next) : await setParticipation(row.regId, next);
    if (result.error) {
      setEntries((prev) => prev.map((r) => (r.regId === row.regId ? { ...r, participated: !next } : r)));
      showBanner(result.error, true);
    }
  }

  function editChance(regId: string, value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    setEntries((prev) => prev.map((r) => (r.regId === regId ? { ...r, chanceNo: digits ? Number(digits) : null } : r)));
  }

  async function commitChance(row: EntryRow) {
    const next = row.chanceNo;
    if (next != null && (next < 1 || next > 10000)) {
      showBanner("Chance number must be between 1 and 10000.", true);
      loadEntries();
      return;
    }
    const result = row.isTeam ? await setTeamChanceNo(row.regId, next) : await setChanceNo(row.regId, next);
    if (result.error) {
      showBanner(result.error, true);
      loadEntries();
      return;
    }
    setEntries((prev) => [...prev].sort(sortByChance));
  }

  async function fetchRegNosByComp(participatedOnly: boolean): Promise<{ comp: FCRow; regNos: string[] }[]> {
    const out: { comp: FCRow; regNos: string[] }[] = [];
    for (const fc of feastComps) {
      const group = fc.competition.type === "group";
      if (group) {
        const { data } = await supabase.from("team_registrations").select("team_name, participated").eq("feast_competition_id", fc.id);
        const rows = (data ?? []).filter((r) => !participatedOnly || r.participated);
        if (rows.length > 0) out.push({ comp: fc, regNos: rows.map((r) => r.team_name) });
      } else {
        const { data } = await supabase
          .from("participant_registrations")
          .select("participated, participant:participants(registration_number)")
          .eq("feast_competition_id", fc.id);
        const rows = (data ?? []).filter((r) => !participatedOnly || r.participated);
        const regNos = rows.map((r) => {
          const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
          return p?.registration_number ?? "";
        });
        if (regNos.length > 0) out.push({ comp: fc, regNos });
      }
    }
    return out;
  }

  function renderSheetSection(comp: FCRow, feastTitle: string, regNos: string[]): string {
    const rowCount = Math.max(26, regNos.length);
    const catSlug = comp.competition.competition_category?.slug ?? "";
    const headings = getScoreHeadings(comp.competition.name, catSlug);
    const subject = getCompetitionSubject(comp.competition.name, catSlug);
    const scoreCols = headings.length;
    const SL_W = 7, REG_W = 25, TOT_W = 14;
    const colW = (100 - SL_W - REG_W - TOT_W) / scoreCols;

    const rows = Array.from({ length: rowCount }, (_, i) => {
      const regNo = regNos[i] ?? "";
      return `<tr><td>${i + 1}</td><td class="reg">${regNo}</td>${headings.map(() => `<td></td>`).join("")}<td></td></tr>`;
    }).join("");

    return `
      <div class="sheet">
        <div class="hdr">
          <div style="font-size:22px;font-weight:700;">${feastTitle}</div>
          <div style="font-size:16px;font-weight:600;">${comp.competition.name}</div>
          <div style="font-size:12px;color:#555;">${comp.competition.competition_category?.name ?? ""}</div>
          ${subject ? `<div style="font-family:'Anek Malayalam',Arial,sans-serif;font-size:13px;margin-top:4px;">${subject}</div>` : ""}
        </div>
        <table>
          <thead><tr>
            <th style="width:${SL_W}%">SL</th>
            <th style="width:${REG_W}%">Reg No</th>
            ${headings.map((h) => `<th style="width:${colW}%">${h}</th>`).join("")}
            <th style="width:${TOT_W}%">Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function buildHtml(sections: string[]): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Anek+Malayalam:wght@400;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, sans-serif; }
        .sheet { border-left: 6px solid #BE185D; border-right: 6px solid #BE185D; padding: 0 16px 18px; }
        .sheet:not(:last-child) { page-break-after: always; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        th, td { border: 1px solid #333; padding: 6px 4px; font-size: 11px; text-align: center; }
        thead tr { background: #f0f0f0; text-transform: uppercase; }
        .reg { font-weight: 700; color: #4C1D95; font-family: monospace; }
      </style></head><body>${PRINT_FALLBACK_BUTTON}${sections.join("")}</body></html>`;
  }

  async function exportJudgeSheets() {
    const feast = feasts.find((f) => f.id === feastId);
    const perComp = await fetchRegNosByComp(true);
    const sections = perComp.flatMap(({ comp, regNos }) =>
      Array.from({ length: 3 }, () => renderSheetSection(comp, feast?.name ?? "", regNos))
    );
    if (!openPrintWindow(buildHtml(sections))) showBanner("Allow pop-ups to export the judge sheets.", true);
  }

  async function exportAllPDF() {
    const feast = feasts.find((f) => f.id === feastId);
    const perComp = await fetchRegNosByComp(false);
    const sections = perComp.map(({ comp, regNos }) => renderSheetSection(comp, feast?.name ?? "", regNos));
    if (!openPrintWindow(buildHtml(sections))) showBanner("Allow pop-ups to export the sheets.", true);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#BE185D] to-[#EC4899] text-white">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-neutral-800">Attendance</h1>
      </div>

      {banner && (
        <p className={`mb-3 rounded-md px-3 py-2 text-sm ${banner.error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
          {banner.text}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select className="input max-w-xs" value={compId} onChange={(e) => setCompId(e.target.value)}>
          {feastComps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition.name} · {c.competition.competition_category?.name ?? ""} · {c.competition.gender ?? "common"}
            </option>
          ))}
        </select>
        <select className="input max-w-xs" value={shakhaFilter} onChange={(e) => setShakhaFilter(e.target.value)}>
          <option value="">All Shakhas</option>
          {shakhas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className="input max-w-xs" placeholder="Search name or reg no…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "#BE185D" }}>
          {markedCount} of {entries.length} marked participated
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportJudgeSheets}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#BE185D,#EC4899)" }}
          >
            Export Judge Sheet
          </button>
          <button
            onClick={exportAllPDF}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#831843,#BE185D)" }}
          >
            Export All
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#fce7f3,#fdf2f8)" }}>
                  <th className="px-3 py-2">Took part</th>
                  <th className="px-3 py-2">Chance #</th>
                  <th className="px-3 py-2">{isGroup ? "Team" : "Reg No"}</th>
                  <th className="px-3 py-2">{isGroup ? "Roster" : "Participant"}</th>
                  <th className="px-3 py-2">{isGroup ? "Members" : "House"}</th>
                  <th className="px-3 py-2">Shakha</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.regId}
                    onClick={() => toggleParticipated(row)}
                    className="cursor-pointer border-t border-neutral-100"
                    style={{ background: row.participated ? "#fdf2f8" : undefined }}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={row.participated} readOnly />
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                        maxLength={5}
                        value={row.chanceNo ?? ""}
                        onChange={(e) => editChance(row.regId, e.target.value)}
                        onBlur={() => commitChance(row)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-[#831843]">{row.regNo}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.houseName}</td>
                    <td className="px-3 py-2">{row.shakhaName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((row) => (
              <div
                key={row.regId}
                onClick={() => toggleParticipated(row)}
                className="flex items-center gap-3 rounded-xl border bg-white p-3"
                style={{ borderColor: row.participated ? "#f472b6" : "#e5e5e5", borderWidth: row.participated ? 1.5 : 1 }}
              >
                <input type="checkbox" checked={row.participated} readOnly className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate font-mono text-xs font-semibold text-[#831843]">{row.regNo}</p>
                  <p className="truncate text-xs text-neutral-500">{row.shakhaName}</p>
                </div>
                <input
                  className="w-14 shrink-0 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                  maxLength={5}
                  onClick={(e) => e.stopPropagation()}
                  value={row.chanceNo ?? ""}
                  onChange={(e) => editChance(row.regId, e.target.value)}
                  onBlur={() => commitChance(row)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}
