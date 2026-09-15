"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ClipboardCheck, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { setParticipation, setChanceNo } from "@/actions/feast";
import { setTeamParticipation, setTeamChanceNo } from "@/actions/team";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/competition-categories";
import { getScoreHeadings } from "@/lib/scoresheet-headings";
import { getCompetitionSubject } from "@/lib/competition-subjects";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { HierarchyPicker } from "@/components/admin/hierarchy-picker";
import type { Competition, CompetitionCategory, Feast, FeastCompetition } from "@/types";

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
  /** Last value actually persisted — compared against chanceNo to know whether the Save button should show. */
  savedChanceNo: number | null;
  isTeam: boolean;
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
      style={{ borderColor: checked ? "#BE185D" : "#cbd5e1", background: checked ? "#BE185D" : "#fff" }}
    >
      {checked && <Check className="h-[15px] w-[15px]" color="#fff" strokeWidth={3} />}
    </span>
  );
}

function ChanceInput({ value, onChange }: { value: number | null; onChange: (raw: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className="w-14 rounded-lg border-2 px-1 py-1.5 text-center text-sm font-bold outline-none transition-colors"
      style={{ borderColor: "#f472b6", color: "#1e1b4b" }}
      onFocus={(ev) => (ev.currentTarget.style.borderColor = "#BE185D")}
      onBlurCapture={(ev) => (ev.currentTarget.style.borderColor = "#f472b6")}
    />
  );
}

// Always rendered at a fixed size — dirty state toggles opacity/scale rather
// than mounting/unmounting, so its appearance never shifts surrounding
// layout. Square on every breakpoint per the phone-UI requirement.
function SaveChanceButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty || saving}
      tabIndex={dirty ? 0 : -1}
      title="Save chance number"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150 ease-out"
      style={{
        background: "#BE185D",
        opacity: dirty ? 1 : 0,
        transform: dirty ? "scale(1)" : "scale(0.6)",
        pointerEvents: dirty ? "auto" : "none",
      }}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <Check className="h-3.5 w-3.5" color="#fff" strokeWidth={3} />}
    </button>
  );
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
  const hierarchy = useOrgHierarchy();
  const [shakhaFilter, setShakhaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ text: string; error?: boolean } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
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
          savedChanceNo: t.chance_no,
          isTeam: true,
        };
      });
      setEntries(rows.sort(sortByChance));
    } else {
      const { data } = await supabase
        .from("participant_registrations")
        .select("id, participated, chance_no, participant:participants(name, house_name, registration_number, competition_category:competition_categories(slug), shakha:shakhas(id, name))")
        .eq("feast_competition_id", compId);
      const rows: EntryRow[] = (data ?? []).map((r) => {
        const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
        const shakha = Array.isArray(p?.shakha) ? p?.shakha[0] : p?.shakha;
        const cat = Array.isArray(p?.competition_category) ? p?.competition_category[0] : p?.competition_category;
        return {
          regId: r.id,
          regNo: p?.registration_number ?? "—",
          name: p?.name ?? "—",
          houseName: p?.house_name ?? "",
          shakhaName: shakha?.name ?? "—",
          shakhaId: shakha?.id ?? "",
          catSlug: cat?.slug ?? "",
          participated: r.participated,
          chanceNo: r.chance_no,
          savedChanceNo: r.chance_no,
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

  async function saveChance(row: EntryRow) {
    const next = row.chanceNo;
    if (next != null && (next < 1 || next > 10000)) {
      showBanner("Chance number must be between 1 and 10000.", true);
      loadEntries();
      return;
    }
    setSavingId(row.regId);
    const result = row.isTeam ? await setTeamChanceNo(row.regId, next) : await setChanceNo(row.regId, next);
    setSavingId(null);
    if (result.error) {
      showBanner(result.error, true);
      loadEntries();
      return;
    }
    setEntries((prev) => prev.map((r) => (r.regId === row.regId ? { ...r, savedChanceNo: next } : r)));
    // Flash the row in place first, then re-sort once the flash finishes —
    // resorting immediately would yank the row out from under the animation.
    setJustSavedId(row.regId);
    setTimeout(() => {
      setJustSavedId((id) => (id === row.regId ? null : id));
      setEntries((prev) => [...prev].sort(sortByChance));
    }, 900);
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
        <HierarchyPicker value={shakhaFilter} onChange={setShakhaFilter} hierarchy={hierarchy} className="input max-w-xs" emptyLabel="All Shakhas" />
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
          <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white shadow-md sm:block">
            <table className="w-full text-sm">
              <thead style={{ background: "linear-gradient(90deg,#fce7f3,#fdf2f8)" }}>
                <tr className="border-b-2" style={{ borderColor: "#f9a8d4" }}>
                  {(isGroup ? ["Took part", "Chance #", "Team", "Roster", "Members", "Shakha"] : ["Took part", "Chance #", "Reg No", "Participant", "House", "Shakha"]).map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: "#831843" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const isEven = i % 2 === 0;
                  const catColor = row.catSlug ? (CATEGORY_COLORS[row.catSlug] ?? "#BE185D") : "#BE185D";
                  return (
                    <tr
                      key={row.regId}
                      onClick={() => toggleParticipated(row)}
                      className={`cursor-pointer border-b transition-colors${row.regId === justSavedId ? " row-saved-flash" : ""}`}
                      style={{ borderColor: "#e5e7eb", background: row.participated ? "#fdf2f8" : isEven ? "#fff" : "#fafafa" }}
                    >
                      <td className="px-3 py-3"><Checkbox checked={row.participated} /></td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <ChanceInput value={row.chanceNo} onChange={(v) => editChance(row.regId, v)} />
                          <SaveChanceButton dirty={row.chanceNo !== row.savedChanceNo} saving={savingId === row.regId} onClick={() => saveChance(row)} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block rounded-lg px-2.5 py-1 font-mono text-[13px] font-black tracking-wide text-white" style={{ background: "#831843" }}>{row.regNo}</span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[14px] font-bold leading-tight" style={{ color: "#1e1b4b" }}>{row.name}</p>
                        {!isGroup && row.catSlug && (
                          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: catColor }}>
                            {CATEGORY_LABELS[row.catSlug] ?? row.catSlug}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#5B21B6" }}>{row.houseName || "—"}</span></td>
                      <td className="whitespace-nowrap px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#374151" }}>{row.shakhaName}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 sm:hidden">
            {filtered.map((row) => {
              const catColor = row.catSlug ? (CATEGORY_COLORS[row.catSlug] ?? "#BE185D") : "#BE185D";
              return (
                <div
                  key={row.regId}
                  onClick={() => toggleParticipated(row)}
                  className={`cursor-pointer overflow-hidden rounded-xl bg-white${row.regId === justSavedId ? " row-saved-flash" : ""}`}
                  style={{ border: row.participated ? "1.5px solid #f472b6" : "1.5px solid #e5e7eb", boxShadow: "0 2px 8px rgba(190,24,93,0.06)" }}
                >
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <Checkbox checked={row.participated} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-black leading-tight" style={{ color: "#1e1b4b" }}>{row.name}</p>
                      {row.houseName && <p className="mt-0.5 text-[12px] font-black" style={{ color: "#5B21B6" }}>{row.houseName}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md px-2 py-0.5 font-mono text-[12px] font-black tracking-wide text-white" style={{ background: "#831843" }}>{row.regNo}</span>
                        <span className="text-[12px] font-bold" style={{ color: "#374151" }}>{row.shakhaName}</span>
                      </div>
                    </div>
                    {!isGroup && row.catSlug && (
                      <span className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black text-white" style={{ background: catColor }}>
                        {CATEGORY_LABELS[row.catSlug] ?? row.catSlug}
                      </span>
                    )}
                    <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <ChanceInput value={row.chanceNo} onChange={(v) => editChance(row.regId, v)} />
                      <SaveChanceButton dirty={row.chanceNo !== row.savedChanceNo} saving={savingId === row.regId} onClick={() => saveChance(row)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
        .row-saved-flash { animation: rowSavedFlash 900ms ease-out; }
        @keyframes rowSavedFlash {
          0% { background-color: rgba(190, 24, 93, 0.16); }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
}
