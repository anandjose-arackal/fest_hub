"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Medal, Check, ImageDown, Download, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { setMaxScore, saveDraftScores, publishResults, unpublishResults, getCompetitionScores } from "@/actions/results";
import { saveDraftTeamScores, publishTeamResults, unpublishTeamResults, getTeamCompetitionScores } from "@/actions/team-results";
import {
  calcGrade, calcPositions, positionLabel,
  DEFAULT_GRADE_POINTS, DEFAULT_POSITION_POINTS, GROUP_GRADE_POINTS, GROUP_POSITION_POINTS,
  type Grade,
} from "@/lib/result-calculator";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import { formatCompetitionOptionLabel } from "@/lib/competition-categories";
import { getOrgSettings } from "@/lib/org-settings";
import { ResultPoster, POSTER_WIDTH, POSTER_HEIGHT, POSTER_THEMES, type PosterData, type PosterWinner, type PosterTheme } from "@/lib/poster-render";
import { toPng } from "html-to-image";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, Meghala, OrgSettings, Shakha } from "@/types";

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
  gradePoints: number;
  position: number | null;
  positionPoints: number;
  totalPoints: number;
}

// ─── Grade / position cells — matches cml-mission-hub's admin/results table ──

const GRADE_SOLID: Record<string, { bg: string; pts: string }> = {
  A: { bg: "#15803D", pts: "#14532D" },
  B: { bg: "#B45309", pts: "#78350F" },
  C: { bg: "#5B21B6", pts: "#3B0764" },
};

function GradeCell({ grade, pts }: { grade: Grade; pts: number }) {
  if (!grade) return <span className="text-sm font-bold" style={{ color: "#6B7280" }}>—</span>;
  const { bg, pts: ptsColor } = GRADE_SOLID[grade];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="inline-flex w-full items-center justify-center rounded-lg px-3 py-1 text-[13px] font-black leading-none text-white"
        style={{ background: bg }}
      >
        Grade {grade}
      </span>
      <span className="text-[12px] font-black" style={{ color: ptsColor }}>+{pts} pts</span>
    </div>
  );
}

const POS_COLORS: Record<number, { bg: string; pts: string }> = {
  1: { bg: "#92400E", pts: "#78350F" },
  2: { bg: "#374151", pts: "#1F2937" },
  3: { bg: "#7C2D12", pts: "#6B2510" },
};
const POS_EMOJI: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function PosCell({ pos, pts }: { pos: number | null; pts: number }) {
  if (!pos) return <span className="text-sm font-bold" style={{ color: "#6B7280" }}>—</span>;
  const style = POS_COLORS[pos] ?? { bg: "#374151", pts: "#1F2937" };
  const emoji = POS_EMOJI[pos] ?? "";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1 text-[13px] font-black leading-none text-white"
        style={{ background: style.bg }}
      >
        {emoji} {positionLabel(pos)}
      </span>
      {pts > 0 && <span className="text-[12px] font-black" style={{ color: style.pts }}> +{pts} pts</span>}
    </div>
  );
}

export default function ResultsPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [compId, setCompId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [meghalas, setMeghalas] = useState<Meghala[]>([]);
  const [shakhaFilter, setShakhaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "published">("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [typedScores, setTypedScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState<string | null>(null);
  const [maxScoreInput, setMaxScoreInput] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterData, setPosterData] = useState<PosterData | null>(null);
  const [posterTheme, setPosterTheme] = useState<PosterTheme>("maroon");
  const [posterDownloading, setPosterDownloading] = useState(false);
  const [posterScale, setPosterScale] = useState(0.3);
  const posterRef = useRef<HTMLDivElement>(null);
  const posterWrapRef = useRef<HTMLDivElement>(null);

  // Scales the fixed-size (1080×1920) poster node down to fit the modal via
  // CSS transform rather than re-rendering it smaller, so html-to-image
  // always captures the same full-resolution node the preview is showing.
  useEffect(() => {
    if (!posterOpen) return;
    const el = posterWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setPosterScale(w / POSTER_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [posterOpen]);

  useEffect(() => {
    getOrgSettings().then(setOrg);
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
    supabase.from("shakhas").select("*").order("name").then(({ data }) => setShakhas(data ?? []));
    supabase.from("meghalas").select("*").order("name").then(({ data }) => setMeghalas(data ?? []));
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

  const visibleFeastComps = useMemo(
    () => (statusFilter ? feastComps.filter((c) => c.result_status === statusFilter) : feastComps),
    [feastComps, statusFilter]
  );

  // Status filter can drop the currently-selected competition out of the
  // list — jump to the first still-visible one so compId never points at a
  // competition that's no longer in the dropdown.
  useEffect(() => {
    if (visibleFeastComps.length > 0 && !visibleFeastComps.some((c) => c.id === compId)) {
      setCompId(visibleFeastComps[0].id);
    }
  }, [visibleFeastComps, compId]);

  const loadEntries = useCallback(async (showLoading: boolean = true) => {
    if (!compId || !selectedFc) return;
    if (showLoading) setLoading(true);
    setMaxScoreInput(selectedFc.max_score != null ? String(selectedFc.max_score) : "");
    try {
      if (isGroup) {
        const [{ data: teams, error: teamsErr }, scoreEntries] = await Promise.all([
          supabase
            .from("team_registrations")
            .select("id, team_name, chance_no, shakha:shakhas(id, name), team_registration_members(participant:participants(name))")
            .eq("feast_competition_id", compId),
          getTeamCompetitionScores(compId),
        ]);
        // A failed fetch must not blank out an already-populated table —
        // bail out and keep whatever was last shown, rather than replacing
        // good data with an empty array because this reload happened to fail.
        if (teamsErr) {
          showBanner(`Couldn't refresh entries: ${teamsErr.message}`);
          return;
        }
        const scoreMap = new Map(scoreEntries.map((s) => [s.registrationId, s.score]));
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
        const [{ data: regs, error: regsErr }, scoreEntries] = await Promise.all([
          supabase
            .from("participant_registrations")
            .select("id, chance_no, participant:participants(name, house_name, registration_number, shakha:shakhas(id, name))")
            .eq("feast_competition_id", compId),
          getCompetitionScores(compId),
        ]);
        if (regsErr) {
          showBanner(`Couldn't refresh entries: ${regsErr.message}`);
          return;
        }
        const scoreMap = new Map(scoreEntries.map((s) => [s.registrationId, s.score]));
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
    } catch (err) {
      // A thrown server action (e.g. a stale reference right after a dev
      // hot-reload) must not silently wipe the table either — same
      // preserve-what-was-last-shown contract as the query-error branches.
      showBanner(err instanceof Error ? `Couldn't refresh entries: ${err.message}` : "Couldn't refresh entries");
    } finally {
      setLoading(false);
    }
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
        // Once the user has touched this cell, its typed value is the only
        // truth — an explicit "" (cleared) means no score, full stop. Only
        // fall back to the last saved score for cells nobody has edited yet.
        const touched = Object.prototype.hasOwnProperty.call(typedScores, e.regId);
        const typed = typedScores[e.regId];
        if (touched && typed === "") return null;
        const score = touched ? Number(typed) : e.savedScore;
        if (score == null || Number.isNaN(score)) return null;
        return { id: e.regId, score };
      })
      .filter((e): e is { id: string; score: number } => e !== null);

    const posMap = calcPositions(calcEntries, positionScale);
    const map = new Map<string, Preview>();
    for (const e of calcEntries) {
      const { grade, gradePoints } = maxScore ? calcGrade(e.score, maxScore, gradeScale) : { grade: null, gradePoints: 0 };
      const pos = posMap.get(e.id) ?? { position: null, positionPoints: 0 };
      map.set(e.id, { grade, gradePoints, position: pos.position, positionPoints: pos.positionPoints, totalPoints: gradePoints + pos.positionPoints });
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

  function showSuccess(text: string) {
    setSuccessPulse(text);
    setTimeout(() => setSuccessPulse(null), 1600);
  }

  async function handleSetMaxScore() {
    if (!compId || !maxScoreInput) return;
    const value = Number(maxScoreInput);
    const result = await setMaxScore(compId, value);
    if (result.error) {
      showBanner(result.error);
      return;
    }
    // Patch feastComps locally instead of loadEntries() — loadEntries()
    // resets maxScoreInput from selectedFc.max_score, which is still the
    // stale value from this same feastComps state until we update it here,
    // so calling it right after setMaxScore() would stomp what was just typed.
    setFeastComps((prev) => prev.map((c) => (c.id === compId ? { ...c, max_score: value } : c)));
    showSuccess("Max score updated");
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
      showSuccess("Result saved successfully");
      loadEntries(false);
    } else {
      showBanner(result.error);
    }
  }

  async function handlePublish() {
    setBusy(true);
    const result = isGroup ? await publishTeamResults(compId) : await publishResults(compId);
    setBusy(false);
    setPublishOpen(false);
    if (!result.error) {
      showSuccess("Results published and standings updated!");
      loadEntries(false);
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
      showSuccess("Reverted to draft");
      loadEntries(false);
      setFeastComps((prev) => prev.map((c) => (c.id === compId ? { ...c, result_status: "draft", comp_status: "completed" } : c)));
    } else {
      showBanner(result.error);
    }
  }

  // Above shakha level, the poster shows the winner's Meghala instead (with
  // "Meghala" appended) rather than the shakha — falls back to the shakha
  // name if the org's set to meghala/diocese level but this shakha isn't
  // assigned into a meghala yet.
  function groupLabelFor(shakhaId: string, shakhaName: string): string {
    if (org?.hierarchy_level && org.hierarchy_level !== "shakha") {
      const shakha = shakhas.find((s) => s.id === shakhaId);
      const meghala = shakha?.meghala_id ? meghalas.find((m) => m.id === shakha.meghala_id) : null;
      if (meghala) return `${meghala.name} Meghala`;
    }
    return `${shakhaName} Shakha`;
  }

  function openPoster() {
    if (!selectedFc || !org) {
      showBanner("Still loading organization settings — try again in a moment.");
      return;
    }
    const winners: PosterWinner[] = entries
      .map((e) => ({ e, p: preview.get(e.regId) }))
      .filter((x): x is { e: EntryRow; p: Preview } => x.p != null && x.p.position != null && x.p.position <= 3)
      .map(({ e, p }) => ({ place: p.position as 1 | 2 | 3, name: e.name, houseName: isGroup ? "" : e.sub, shakhaName: groupLabelFor(e.shakhaId, e.shakhaName) }));
    if (winners.length === 0) {
      showBanner("No 1st/2nd/3rd place results yet for this competition.");
      return;
    }
    const feast = feasts.find((f) => f.id === feastId);
    const gender = selectedFc.competition.gender?.toLowerCase();
    const categoryLabel = [
      selectedFc.competition.competition_category?.name,
      gender === "boy" ? "Boys" : gender === "girl" ? "Girls" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    setPosterData({
      org,
      feastName: feast?.name ?? "",
      competitionName: selectedFc.competition.name,
      categoryLabel,
      winners,
      theme: posterTheme,
    });
    setPosterOpen(true);
  }

  async function downloadPoster() {
    if (!posterRef.current || !posterData) return;
    setPosterDownloading(true);
    try {
      const dataUrl = await toPng(posterRef.current, { cacheBust: true, width: POSTER_WIDTH, height: POSTER_HEIGHT });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${posterData.competitionName.replace(/\s+/g, "_")}_result.png`;
      a.click();
    } catch (err) {
      showBanner(err instanceof Error ? `Couldn't generate the image: ${err.message}` : "Couldn't generate the image.");
    } finally {
      setPosterDownloading(false);
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
      .map((e) => ({ ...e, ...(preview.get(e.regId) ?? { grade: null, gradePoints: 0, position: null, positionPoints: 0, totalPoints: 0 }) }))
      .filter((r) => r.grade !== null || r.position !== null);
    const sorted = sortPdfRows(rows);
    const feast = feasts.find((f) => f.id === feastId);
    const orgLine = [org?.org_name_en, org?.area_name_en].filter(Boolean).join(" — ");
    const html = buildResultsHtml(feast?.name ?? "", [
      { title: selectedFc.competition.name, subtitle: `${selectedFc.competition.competition_category?.name ?? ""} · ${selectedFc.competition.gender ?? "Common"}`, rows: sorted },
    ], orgLine);
    openPrintWindow(html);
  }

  async function exportAll() {
    const feast = feasts.find((f) => f.id === feastId);
    const sections: { title: string; subtitle: string; rows: (EntryRow & Preview)[] }[] = [];
    for (const fc of feastComps) {
      const group = fc.competition.type === "group";
      let rows: (EntryRow & Preview)[] = [];
      if (group) {
        const [{ data: teams }, scoreEntries] = await Promise.all([
          supabase.from("team_registrations").select("id, team_name, shakha:shakhas(id,name)").eq("feast_competition_id", fc.id),
          getTeamCompetitionScores(fc.id),
        ]);
        const scoreMap = new Map(scoreEntries.map((s) => [s.registrationId, s]));
        rows = (teams ?? []).map((t) => {
          const shakha = Array.isArray(t.shakha) ? t.shakha[0] : t.shakha;
          const s = scoreMap.get(t.id);
          return {
            regId: t.id, regNo: t.team_name, name: t.team_name, sub: "", shakhaName: shakha?.name ?? "—", shakhaId: shakha?.id ?? "",
            chanceNo: null, savedScore: s ? s.score : null,
            grade: (s?.grade as Grade) ?? null, gradePoints: 0, position: s?.position ?? null, positionPoints: 0, totalPoints: s?.totalPoints ?? 0,
          };
        });
      } else {
        const [{ data: regs }, scoreEntries] = await Promise.all([
          supabase.from("participant_registrations").select("id, participant:participants(name, house_name, registration_number, shakha:shakhas(id,name))").eq("feast_competition_id", fc.id),
          getCompetitionScores(fc.id),
        ]);
        const scoreMap = new Map(scoreEntries.map((s) => [s.registrationId, s]));
        rows = (regs ?? []).map((r) => {
          const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
          const shakha = Array.isArray(p?.shakha) ? p?.shakha[0] : p?.shakha;
          const s = scoreMap.get(r.id);
          return {
            regId: r.id, regNo: p?.registration_number ?? "—", name: p?.name ?? "—", sub: p?.house_name ?? "",
            shakhaName: shakha?.name ?? "—", shakhaId: shakha?.id ?? "", chanceNo: null, savedScore: s ? s.score : null,
            grade: (s?.grade as Grade) ?? null, gradePoints: 0, position: s?.position ?? null, positionPoints: 0, totalPoints: s?.totalPoints ?? 0,
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
    const orgLine = [org?.org_name_en, org?.area_name_en].filter(Boolean).join(" — ");
    const html = buildResultsHtml(`${feast?.name ?? ""}${feastShakhaName ? ` — ${feastShakhaName}` : ""}`, sections, orgLine);
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

      {banner && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{banner}</p>}

      {successPulse && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div className="success-pulse flex flex-col items-center gap-3">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full"
              style={{ background: "linear-gradient(135deg,#22C55E,#15803D)", boxShadow: "0 16px 40px rgba(21,128,61,0.5)" }}
            >
              <Check className="h-14 w-14 text-white" strokeWidth={3.5} />
            </div>
            <p className="max-w-[280px] rounded-full bg-black/80 px-4 py-2 text-center text-sm font-semibold text-white">{successPulse}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          className="input max-w-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | "draft" | "published")}
          title="Filter the competition list by result status"
        >
          <option value="">All Status</option>
          <option value="published">Published</option>
          <option value="draft">In Progress</option>
        </select>
        <select className="input max-w-xs" value={compId} onChange={(e) => setCompId(e.target.value)}>
          {visibleFeastComps.length === 0 && <option value="">No competitions match this filter</option>}
          {visibleFeastComps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition.type === "group" ? "👥 " : ""}
              {formatCompetitionOptionLabel(c.competition.name, c.competition.gender, c.competition.competition_category?.name)}
              {c.result_status === "published" ? " · Published" : ""}
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {!maxScore && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <span className="text-sm font-semibold text-amber-700">Set max score to unlock score entry</span>
            <input className="w-28 rounded-lg border border-amber-300 px-3 py-2 text-base font-semibold text-amber-900" type="number" value={maxScoreInput} onChange={(e) => setMaxScoreInput(e.target.value)} />
            <button onClick={handleSetMaxScore} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">Set</button>
          </div>
        )}
        {maxScore != null && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-sm font-semibold text-neutral-600">Max score:</span>
            <span className="text-lg font-black" style={{ color: "#4C1D95" }}>{maxScore}</span>
            <input className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-base font-semibold text-neutral-800" type="number" value={maxScoreInput} onChange={(e) => setMaxScoreInput(e.target.value)} />
            <button onClick={handleSetMaxScore} className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: "#6B46FF" }}>Update</button>
          </div>
        )}

        {selectedFc && (
          <p className="min-w-[200px] flex-1 text-center text-base font-black sm:text-lg" style={{ color: "#1e1b4b" }}>
            {formatCompetitionOptionLabel(selectedFc.competition.name, selectedFc.competition.gender, selectedFc.competition.competition_category?.name)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-neutral-600">Grades:</span>
          {[
            { label: "A", count: gradeCounts.A, dot: "#16A34A", bg: "#DCFCE7", text: "#15803D" },
            { label: "B", count: gradeCounts.B, dot: "#D97706", bg: "#FEF3C7", text: "#92400E" },
            { label: "C", count: gradeCounts.C, dot: "#7C3AED", bg: "#EDE9FE", text: "#5B21B6" },
            { label: "—", count: gradeCounts.none, dot: "#9CA3AF", bg: "#F3F4F6", text: "#6B7280" },
          ].map((g) => (
            <span key={g.label} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: g.bg, color: g.text }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.dot }} />
              {g.label} <span className="tabular-nums">{g.count}</span>
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mb-4 hidden overflow-hidden rounded-xl border border-[#1e1b4b] bg-white shadow-md sm:block">
            <table className="w-full min-w-[780px] text-sm">
              <thead style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
                <tr className="border-b-2" style={{ borderColor: "#c4b5fd" }}>
                  {["#", isGroup ? "Team" : "Reg No", ...(isGroup ? [] : ["Chance #"]), `Score / ${maxScore ?? "?"}`, isGroup ? "Members" : "Participant", "Shakha", "Grade", "Position", "Total"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: "#1e1b4b" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const p = preview.get(e.regId);
                  const val = typedScores[e.regId] ?? (e.savedScore != null ? String(e.savedScore) : "");
                  const isEven = i % 2 === 0;
                  return (
                    <tr
                      key={e.regId}
                      className="border-b transition-colors"
                      style={{ borderColor: "#e5e7eb", background: isEven ? "#fff" : "#f8f7ff" }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = "#ede9fe")}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = isEven ? "#fff" : "#f8f7ff")}
                    >
                      <td className="px-3 py-3 text-xs font-black" style={{ color: "#4C1D95" }}>{i + 1}</td>
                      <td className="px-3 py-3">
                        <span className="inline-block rounded-lg px-2.5 py-1 font-mono text-[13px] font-black tracking-wide text-white" style={{ background: "#4C1D95" }}>
                          {e.regNo}
                        </span>
                      </td>
                      {!isGroup && (
                        <td className="px-3 py-3 text-center">
                          <span className="text-[14px] font-black" style={{ color: e.chanceNo != null ? "#6B46FF" : "#D1D5DB" }}>{e.chanceNo ?? "—"}</span>
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <input
                          className="w-20 rounded-lg border-[3px] px-2 py-1.5 text-center text-[15px] font-black outline-none transition-colors disabled:opacity-50"
                          style={{ borderColor: "#a78bfa", color: "#1e1b4b" }}
                          disabled={isPublished || !maxScore}
                          value={val}
                          onChange={(ev) => setScore(e.regId, ev.target.value)}
                          onFocus={(ev) => (ev.currentTarget.style.borderColor = "#6B46FF")}
                          onBlur={(ev) => (ev.currentTarget.style.borderColor = "#a78bfa")}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {isGroup ? (
                          <p className="max-w-[220px] text-[12px] leading-snug" style={{ color: "#6B7280" }}>{e.sub}</p>
                        ) : (
                          <>
                            <p className="text-[14px] font-bold leading-tight" style={{ color: "#1e1b4b" }}>{e.name}</p>
                            {e.sub && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: "#7C3AED" }}>{e.sub}</p>}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className="text-[13px] font-semibold" style={{ color: "#4B5563" }}>{e.shakhaName}</span>
                      </td>
                      <td className="px-3 py-3 text-center"><GradeCell grade={p?.grade ?? null} pts={p?.gradePoints ?? 0} /></td>
                      <td className="px-3 py-3 text-center"><PosCell pos={p?.position ?? null} pts={p?.positionPoints ?? 0} /></td>
                      <td className="px-3 py-3">
                        {p ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[20px] font-black leading-none" style={{ color: p.totalPoints > 0 ? "#6B46FF" : "#D1D5DB" }}>{p.totalPoints}</span>
                            <span className="text-[10px] font-semibold" style={{ color: "#A78BFA" }}>pts</span>
                          </div>
                        ) : <span className="text-sm font-medium text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mb-4 space-y-2.5 sm:hidden">
            {entries.map((e, i) => {
              const p = preview.get(e.regId);
              const val = typedScores[e.regId] ?? (e.savedScore != null ? String(e.savedScore) : "");
              return (
                <div key={e.regId} className="overflow-hidden rounded-xl" style={{ border: "1.5px solid #ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
                  <div className="flex items-center gap-2.5 bg-white px-3.5 pb-2.5 pt-3">
                    <span className="w-5 shrink-0 font-mono text-[13px] font-black" style={{ color: "#4C1D95" }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-black leading-tight" style={{ color: "#1e1b4b" }}>{e.name}</p>
                      {e.sub && <p className="mt-0.5 text-[12px] leading-snug" style={{ color: isGroup ? "#6B7280" : "#5B21B6", fontWeight: isGroup ? 500 : 800 }}>{e.sub}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md px-2 py-0.5 font-mono text-[12px] font-black tracking-wide text-white" style={{ background: "#4C1D95" }}>{e.regNo}</span>
                        {e.chanceNo != null && (
                          <span className="rounded-md px-2 py-0.5 font-mono text-[12px] font-black tracking-wide text-white" style={{ background: "#6B46FF" }}>#{e.chanceNo}</span>
                        )}
                        <span className="text-[12px] font-bold" style={{ color: "#374151" }}>{e.shakhaName}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {p ? (
                        <>
                          <span className="text-[24px] font-black leading-none" style={{ color: p.totalPoints > 0 ? "#4C1D95" : "#9CA3AF" }}>{p.totalPoints}</span>
                          <p className="text-[10px] font-black" style={{ color: "#5B21B6" }}>pts</p>
                        </>
                      ) : <span className="text-[20px] font-black" style={{ color: "#9CA3AF" }}>—</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t px-3.5 py-3" style={{ background: "#ede9fe", borderColor: "#ddd6fe" }}>
                    <span className="shrink-0 text-[11px] font-black uppercase tracking-widest" style={{ color: "#4C1D95" }}>Score</span>
                    <input
                      className="w-20 rounded-lg border-[3px] bg-white px-3 py-2 text-center text-[16px] font-black outline-none transition-colors disabled:opacity-40"
                      style={{ borderColor: "#a78bfa", color: "#1e1b4b" }}
                      disabled={isPublished || !maxScore}
                      value={val}
                      onChange={(ev) => setScore(e.regId, ev.target.value)}
                      onFocus={(ev) => (ev.currentTarget.style.borderColor = "#7C3AED")}
                      onBlur={(ev) => (ev.currentTarget.style.borderColor = "#a78bfa")}
                      placeholder="—"
                    />
                    <span className="shrink-0 text-[13px] font-black" style={{ color: "#4C1D95" }}>/ {maxScore ?? "?"}</span>
                    {p ? (
                      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                        <GradeCell grade={p.grade} pts={p.gradePoints} />
                        <PosCell pos={p.position} pts={p.positionPoints} />
                      </div>
                    ) : <span className="ml-auto text-[12px] font-bold" style={{ color: "#6D28D9" }}>enter score</span>}
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
        <button
          onClick={openPoster}
          disabled={!compId || entries.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#8B1538,#B8264F)" }}
        >
          <ImageDown className="h-4 w-4" /> Generate Poster
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

      {posterOpen && posterData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPosterOpen(false)}>
          {/* flex column capped to the viewport height, with the header and
              action buttons shrink-0 so they stay reachable and only the
              theme picker + poster preview scroll — otherwise on a desktop
              browser window shorter than the poster preview (9:16 at up to
              384px wide is ~683px tall), the Download button gets pushed
              below the fold with no way to reach it. Same pattern as the
              public share overlay (social-poster-overlay.tsx). */}
          <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h2 className="text-base font-bold">🖼️ Result Poster (9:16)</h2>
              <button onClick={() => setPosterOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mb-3 flex gap-1.5">
                {POSTER_THEMES.map((th) => (
                  <button
                    key={th.id}
                    onClick={() => {
                      setPosterTheme(th.id);
                      setPosterData((d) => (d ? { ...d, theme: th.id } : d));
                    }}
                    className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-xs font-bold ${posterData.theme === th.id ? "border-[#8B1538] bg-[#8B1538]/10 text-[#8B1538]" : "border-neutral-200 text-neutral-500"}`}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
              <div
                ref={posterWrapRef}
                style={{ width: "100%", aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}`, overflow: "hidden", borderRadius: 16, border: "1px solid #eee", background: "#f4f4f5" }}
              >
                <div style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT, transform: `scale(${posterScale})`, transformOrigin: "top left" }}>
                  <ResultPoster ref={posterRef} data={posterData} />
                </div>
              </div>
            </div>
            <div className="mt-4 flex shrink-0 gap-2">
              <button onClick={() => setPosterOpen(false)} className="flex-1 rounded-xl border-2 border-neutral-200 py-2 text-sm font-semibold">Close</button>
              <button
                onClick={downloadPoster}
                disabled={posterDownloading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#8B1538,#B8264F)" }}
              >
                <Download className="h-4 w-4" /> {posterDownloading ? "Generating…" : "Download Image"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
        .success-pulse { animation: successPulse 1.6s ease forwards; }
        @keyframes successPulse {
          0% { opacity: 0; transform: scale(0.4); }
          18% { opacity: 1; transform: scale(1.1); }
          30% { transform: scale(1); }
          78% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.92); }
        }
      `}</style>
    </div>
  );
}

function buildResultsHtml(title: string, sections: { title: string; subtitle: string; rows: (EntryRow & Preview)[] }[], orgLine?: string): string {
  const sheets = sections
    .map(
      (s) => `<div class="sheet">
        <div class="hdr">
          ${orgLine ? `<div style="font-size:13px;font-weight:700;letter-spacing:0.03em;color:#6B46FF;">${orgLine}</div>` : ""}
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
