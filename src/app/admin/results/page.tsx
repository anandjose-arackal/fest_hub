"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Medal, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { setMaxScore, saveDraftScores, publishResults, unpublishResults } from "@/actions/results";
import { saveDraftTeamScores, publishTeamResults, unpublishTeamResults } from "@/actions/team-results";
import {
  calcGrade, calcPositions, gradeColor, positionLabel,
  DEFAULT_GRADE_POINTS, DEFAULT_POSITION_POINTS, GROUP_GRADE_POINTS, GROUP_POSITION_POINTS,
  type Grade,
} from "@/lib/result-calculator";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, Shakha } from "@/types";

type FCRow = FeastCompetition & { competition: Competition & { competition_category?: CompetitionCategory | null } };

interface EntryRow {
  regId: string;
  regNo: string;
  name: string;
  sub: string; // house name or member list
  shakhaName: string;
  shakhaId: string;
  chanceNo: number | null;
  savedScore: number | null;
}

interface Preview {
  grade: Grade;
  position: number | null;
  totalPoints: number;
}

export default function ResultsPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [compId, setCompId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [shakhaFilter, setShakhaFilter] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [typedScores, setTypedScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [maxScoreInput, setMaxScoreInput] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
  const isPublished = selectedFc?.result_status === "published";
  const maxScore = selectedFc?.max_score ?? null;
  const gradeScale = isGroup ? GROUP_GRADE_POINTS : DEFAULT_GRADE_POINTS;
  const positionScale = isGroup ? GROUP_POSITION_POINTS : DEFAULT_POSITION_POINTS;

  const loadEntries = useCallback(async () => {
    if (!compId || !selectedFc) return;
    setLoading(true);
    setMaxScoreInput(selectedFc.max_score != null ? String(selectedFc.max_score) : "");
    if (isGroup) {
      const [{ data: teams }, { data: scores }] = await Promise.all([
        supabase
          .from("team_registrations")
          .select("id, team_name, chance_no, shakha:shakhas(id, name), team_registration_members(participant:participants(name))")
          .eq("feast_competition_id", compId),
        supabase.from("team_results").select("team_registration_id, score").eq("feast_competition_id", compId),
      ]);
      const scoreMap = new Map((scores ?? []).map((s) => [s.team_registration_id, Number(s.score)]));
      const rows: EntryRow[] = (teams ?? []).map((t) => {
        const shakha = Array.isArray(t.shakha) ? t.shakha[0] : t.shakha;
        const members = (t.team_registration_members ?? []).map((m) => {
          const p = Array.isArray(m.participant) ? m.participant[0] : m.participant;
          return p?.name ?? "";
        });
        return {
          regId: t.id,
          regNo: t.team_name,
          name: t.team_name,
          sub: members.join(", "),
          shakhaName: shakha?.name ?? "—",
          shakhaId: shakha?.id ?? "",
          chanceNo: t.chance_no,
          savedScore: scoreMap.get(t.id) ?? null,
        };
      });
      setEntries(rows);
    } else {
      const [{ data: regs }, { data: scores }] = await Promise.all([
        supabase
          .from("participant_registrations")
          .select("id, chance_no, participant:participants(name, house_name, registration_number, shakha:shakhas(id, name))")
          .eq("feast_competition_id", compId),
        supabase.from("competition_results").select("participant_registration_id, score").eq("feast_competition_id", compId),
      ]);
      const scoreMap = new Map((scores ?? []).map((s) => [s.participant_registration_id, Number(s.score)]));
      const rows: EntryRow[] = (regs ?? []).map((r) => {
        const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
        const shakha = Array.isArray(p?.shakha) ? p?.shakha[0] : p?.shakha;
        return {
          regId: r.id,
          regNo: p?.registration_number ?? "—",
          name: p?.name ?? "—",
          sub: p?.house_name ?? "",
          shakhaName: shakha?.name ?? "—",
          shakhaId: shakha?.id ?? "",
          chanceNo: r.chance_no,
          savedScore: scoreMap.get(r.id) ?? null,
        };
      });
      setEntries(rows);
    }
    setTypedScores({});
    setLoading(false);
  }, [compId, isGroup, selectedFc]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  function setScore(regId: string, raw: string) {
    const clean = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setTypedScores((prev) => ({ ...prev, [regId]: clean }));
  }

  const preview = useMemo(() => {
    const calcEntries = entries
      .map((e) => {
        const typed = typedScores[e.regId];
        const hasInput = typed != null && typed !== "";
        const hasSaved = e.savedScore != null;
        if (!hasInput && !hasSaved) return null;
        const score = hasInput ? Number(typed) : e.savedScore!;
        if (Number.isNaN(score)) return null;
        return { id: e.regId, score };
      })
      .filter((e): e is { id: string; score: number } => e !== null);

    const posMap = calcPositions(calcEntries, positionScale);
    const map = new Map<string, Preview>();
    for (const e of calcEntries) {
      const { grade, gradePoints } = maxScore ? calcGrade(e.score, maxScore, gradeScale) : { grade: null, gradePoints: 0 };
      const pos = posMap.get(e.id) ?? { position: null, positionPoints: 0 };
      map.set(e.id, { grade, position: pos.position, totalPoints: gradePoints + pos.positionPoints });
    }
    return map;
  }, [entries, typedScores, maxScore, gradeScale, positionScale]);

  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, none: 0 };
    for (const p of preview.values()) {
      if (p.grade === "A") counts.A++;
      else if (p.grade === "B") counts.B++;
      else if (p.grade === "C") counts.C++;
      else counts.none++;
    }
    return counts;
  }, [preview]);

  function showBanner(text: string) {
    setBanner(text);
    setTimeout(() => setBanner(null), 3000);
  }

  async function handleSetMaxScore() {
    if (!compId || !maxScoreInput) return;
    await setMaxScore(compId, Number(maxScoreInput));
    loadEntries();
  }

  async function handleSaveDraft() {
    const scores = entries
      .filter((e) => typedScores[e.regId] != null && typedScores[e.regId] !== "")
      .map((e) => ({ registrationId: e.regId, score: Number(typedScores[e.regId]) }));
    if (scores.length === 0) return;
    setBusy(true);
    const result = isGroup ? await saveDraftTeamScores({ feastCompetitionId: compId, scores }) : await saveDraftScores({ feastCompetitionId: compId, scores });
    setBusy(false);
    if (!result.error) {
      showBanner("Draft saved");
      loadEntries();
    }
  }

  async function handlePublish() {
    setBusy(true);
    const result = isGroup ? await publishTeamResults(compId) : await publishResults(compId);
    setBusy(false);
    setPublishOpen(false);
    if (!result.error) {
      showBanner("Results published and standings updated!");
      loadEntries();
      setFeastComps((prev) => prev.map((c) => (c.id === compId ? { ...c, result_status: "published", comp_status: "published" } : c)));
    } else {
      showBanner(result.error);
    }
  }

  async function handleUnpublish() {
    setBusy(true);
    const result = isGroup ? await unpublishTeamResults(compId, feastId) : await unpublishResults(compId, feastId);
    setBusy(false);
    if (!result.error) {
      showBanner("Reverted to draft");
      loadEntries();
      setFeastComps((prev) => prev.map((c) => (c.id === compId ? { ...c, result_status: "draft", comp_status: "completed" } : c)));
    }
  }

  function sortPdfRows(rows: (EntryRow & Preview)[]) {
    return [...rows].sort((a, b) => {
      const posA = a.position ?? 999;
      const posB = b.position ?? 999;
      if (posA !== posB) return posA - posB;
      const ptsA = a.totalPoints ?? -1;
      const ptsB = b.totalPoints ?? -1;
      if (ptsA !== ptsB) return ptsB - ptsA;
      return a.name.localeCompare(b.name);
    });
  }

  function exportPdf() {
    if (!selectedFc || isGroup) return;
    const rows = entries
      .filter((e) => !shakhaFilter || e.shakhaId === shakhaFilter)
      .map((e) => ({ ...e, ...(preview.get(e.regId) ?? { grade: null, position: null, totalPoints: 0 }) }))
      .filter((r) => r.grade !== null || r.position !== null);
    const sorted = sortPdfRows(rows);
    const feast = feasts.find((f) => f.id === feastId);
    const html = buildResultsHtml(feast?.name ?? "", [
      { title: selectedFc.competition.name, subtitle: `${selectedFc.competition.competition_category?.name ?? ""} · ${selectedFc.competition.gender ?? "Common"}`, rows: sorted },
    ]);
    openPrintWindow(html);
  }

  async function exportAll() {
    const feast = feasts.find((f) => f.id === feastId);
    const sections: { title: string; subtitle: string; rows: (EntryRow & Preview)[] }[] = [];
    for (const fc of feastComps) {
      const group = fc.competition.type === "group";
      let rows: (EntryRow & Preview)[] = [];
      if (group) {
        const [{ data: teams }, { data: scores }] = await Promise.all([
          supabase.from("team_registrations").select("id, team_name, shakha:shakhas(id,name)").eq("feast_competition_id", fc.id),
          supabase.from("team_results").select("team_registration_id, score, grade, position, total_points").eq("feast_competition_id", fc.id),
        ]);
        const scoreMap = new Map((scores ?? []).map((s) => [s.team_registration_id, s]));
        rows = (teams ?? []).map((t) => {
          const shakha = Array.isArray(t.shakha) ? t.shakha[0] : t.shakha;
          const s = scoreMap.get(t.id);
          return {
            regId: t.id, regNo: t.team_name, name: t.team_name, sub: "", shakhaName: shakha?.name ?? "—", shakhaId: shakha?.id ?? "",
            chanceNo: null, savedScore: s ? Number(s.score) : null,
            grade: (s?.grade as Grade) ?? null, position: s?.position ?? null, totalPoints: s?.total_points ?? 0,
          };
        });
      } else {
        const [{ data: regs }, { data: scores }] = await Promise.all([
          supabase.from("participant_registrations").select("id, participant:participants(name, house_name, registration_number, shakha:shakhas(id,name))").eq("feast_competition_id", fc.id),
          supabase.from("competition_results").select("participant_registration_id, score, grade, position, total_points").eq("feast_competition_id", fc.id),
        ]);
        const scoreMap = new Map((scores ?? []).map((s) => [s.participant_registration_id, s]));
        rows = (regs ?? []).map((r) => {
          const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
          const shakha = Array.isArray(p?.shakha) ? p?.shakha[0] : p?.shakha;
          const s = scoreMap.get(r.id);
          return {
            regId: r.id, regNo: p?.registration_number ?? "—", name: p?.name ?? "—", sub: p?.house_name ?? "",
            shakhaName: shakha?.name ?? "—", shakhaId: shakha?.id ?? "", chanceNo: null, savedScore: s ? Number(s.score) : null,
            grade: (s?.grade as Grade) ?? null, position: s?.position ?? null, totalPoints: s?.total_points ?? 0,
          };
        });
      }
      const filteredRows = rows.filter((r) => r.grade !== null || r.position !== null);
      const scoped = shakhaFilter ? filteredRows.filter((r) => r.shakhaId === shakhaFilter) : filteredRows;
      if (shakhaFilter && scoped.length === 0) continue;
      sections.push({
        title: fc.competition.name,
        subtitle: `${fc.competition.competition_category?.name ?? ""} · ${fc.competition.gender ?? "Common"}`,
        rows: sortPdfRows(scoped),
      });
    }
    const feastShakhaName = shakhaFilter ? shakhas.find((s) => s.id === shakhaFilter)?.name : undefined;
    const html = buildResultsHtml(`${feast?.name ?? ""}${feastShakhaName ? ` — ${feastShakhaName}` : ""}`, sections);
    openPrintWindow(html);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#6B46FF] to-[#A855F7] text-white">
          <Medal className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-neutral-800">Results</h1>
      </div>

      {banner && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{banner}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select className="input max-w-xs" value={compId} onChange={(e) => setCompId(e.target.value)}>
          {feastComps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition.type === "group" ? "👥 " : ""}{c.competition.name} {c.result_status === "published" ? "· Published" : ""}
            </option>
          ))}
        </select>
        <select className="input max-w-xs" value={shakhaFilter} onChange={(e) => setShakhaFilter(e.target.value)} title="Filter exported PDFs to one shakha">
          <option value="">All Shakhas (PDF filter)</option>
          {shakhas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {!maxScore && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span>Set max score to unlock score entry</span>
          <input className="w-24 rounded border border-amber-300 px-2 py-1 text-sm" type="number" value={maxScoreInput} onChange={(e) => setMaxScoreInput(e.target.value)} />
          <button onClick={handleSetMaxScore} className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white">Set</button>
        </div>
      )}
      {maxScore != null && (
        <div className="mb-4 flex items-center gap-2 text-sm text-neutral-500">
          Max score: {maxScore}
          <input className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs" type="number" value={maxScoreInput} onChange={(e) => setMaxScoreInput(e.target.value)} />
          <button onClick={handleSetMaxScore} className="rounded bg-neutral-200 px-2 py-1 text-xs font-semibold">Update</button>
        </div>
      )}

      <div className="mb-3 flex gap-1.5 text-xs">
        <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">A: {gradeCounts.A}</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">B: {gradeCounts.B}</span>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">C: {gradeCounts.C}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-500">No grade: {gradeCounts.none}</span>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{isGroup ? "Team" : "Reg No"}</th>
                  {!isGroup && <th className="px-3 py-2">Chance #</th>}
                  <th className="px-3 py-2">Score/{maxScore ?? "?"}</th>
                  <th className="px-3 py-2">{isGroup ? "Members" : "Participant"}</th>
                  <th className="px-3 py-2">Shakha</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const p = preview.get(e.regId);
                  const val = typedScores[e.regId] ?? (e.savedScore != null ? String(e.savedScore) : "");
                  return (
                    <tr key={e.regId} className={i % 2 === 0 ? "bg-white" : "bg-[#f8f7ff]"}>
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{e.regNo}</td>
                      {!isGroup && <td className="px-3 py-2">{e.chanceNo ?? "—"}</td>}
                      <td className="px-3 py-2">
                        <input
                          className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs disabled:bg-neutral-100"
                          disabled={isPublished || !maxScore}
                          value={val}
                          onChange={(ev) => setScore(e.regId, ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">{isGroup ? e.sub : e.name}</td>
                      <td className="px-3 py-2">{e.shakhaName}</td>
                      <td className="px-3 py-2">
                        {p?.grade && <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: gradeColor(p.grade) }}>{p.grade}</span>}
                      </td>
                      <td className="px-3 py-2">{p?.position ? positionLabel(p.position) : "—"}</td>
                      <td className="px-3 py-2 font-semibold">{p?.totalPoints ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {entries.map((e, i) => {
              const p = preview.get(e.regId);
              const val = typedScores[e.regId] ?? (e.savedScore != null ? String(e.savedScore) : "");
              return (
                <div key={e.regId} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i + 1}. {isGroup ? e.name : e.name}</p>
                      <p className="truncate text-xs text-neutral-500">{e.sub}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <span className="font-mono font-semibold text-[#4C1D95]">{e.regNo}</span>
                        {e.chanceNo && <span className="rounded-full bg-neutral-100 px-1.5 py-0.5">#{e.chanceNo}</span>}
                        <span className="text-neutral-400">{e.shakhaName}</span>
                      </p>
                    </div>
                    <span className="text-lg font-bold text-[#6B46FF]">{p?.totalPoints ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-[#ede9fe] px-3 py-2">
                    <input
                      className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs disabled:bg-neutral-100"
                      disabled={isPublished || !maxScore}
                      value={val}
                      onChange={(ev) => setScore(e.regId, ev.target.value)}
                      placeholder={`Score / ${maxScore ?? "?"}`}
                    />
                    {p?.grade && <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: gradeColor(p.grade) }}>{p.grade}</span>}
                    {p?.position && <span className="text-xs font-semibold">{positionLabel(p.position)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={handleSaveDraft} disabled={busy || isPublished} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          Save Draft
        </button>
        {!isPublished ? (
          <button
            onClick={() => setPublishOpen(true)}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#6B46FF,#A855F7)" }}
          >
            Publish Results
          </button>
        ) : (
          <button onClick={handleUnpublish} disabled={busy} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600">
            Unpublish (revert to draft)
          </button>
        )}
        <button
          onClick={exportPdf}
          disabled={!compId || isGroup || entries.length === 0}
          title={isGroup ? "PDF export isn't available for team competitions yet" : ""}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#6B46FF,#A855F7)" }}
        >
          Export PDF
        </button>
        <button onClick={exportAll} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#4C1D95,#6B46FF)" }}>
          Export All
        </button>
      </div>

      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPublishOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-semibold">Publish {isGroup ? "Team " : ""}Results?</h2>
            <ul className="mb-4 space-y-1.5 text-sm text-neutral-600">
              {[
                `Calculate grades for all ${isGroup ? "teams" : "participants"}`,
                "Calculate positions (ties share same rank)",
                "Calculate grade + position points",
                "Write to the point ledger",
                "Rebuild Shakha standings",
                "Mark competition as Published",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-green-600" /> {t}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setPublishOpen(false)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm">Cancel</button>
              <button onClick={handlePublish} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#6B46FF,#A855F7)" }}>
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}

function buildResultsHtml(title: string, sections: { title: string; subtitle: string; rows: (EntryRow & Preview)[] }[]): string {
  const sheets = sections
    .map(
      (s) => `<div class="sheet">
        <div class="hdr">
          <div style="font-size:14px;font-weight:700;color:#6B46FF;">Cherupushpa Mission League</div>
          <div style="font-size:12px;letter-spacing:0.05em;color:#6B46FF;">KALPETTA MEGHALA</div>
          <div style="font-size:18px;font-weight:700;margin-top:6px;">${s.title}</div>
          <div style="font-size:12px;color:#666;">${s.subtitle}</div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Reg No</th><th>Name</th><th>Shakha</th><th>Grade</th><th>Position</th><th>Total</th></tr></thead>
          <tbody>${s.rows
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td class="reg">${r.regNo}</td><td>${r.name}</td><td>${r.shakhaName}</td><td>${r.grade ?? "—"}</td><td>${r.position ? positionLabel(r.position) : "—"}</td><td>${r.totalPoints}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Results — ${title}</title><style>
    @page { size: A4 portrait; margin: 16mm 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, sans-serif; }
    .sheet { border-left: 6px solid #6B46FF; border-right: 6px solid #6B46FF; padding: 0 16px 18px; margin-bottom: 18px; }
    .hdr { text-align: center; margin-bottom: 14px; break-after: avoid; page-break-after: avoid; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    thead tr { background: linear-gradient(90deg,#ede9fe,#f5f3ff); text-transform: uppercase; }
    th, td { border: 1px solid #333; padding: 6px 4px; font-size: 11px; text-align: left; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f8f7ff; }
    .reg { font-family: monospace; font-weight: 700; color: #4C1D95; }
    </style></head><body>${PRINT_FALLBACK_BUTTON}${sheets}</body></html>`;
}
