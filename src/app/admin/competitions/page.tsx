"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Layers, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateCompetitionStatus } from "@/actions/feast";
import type { CompStatus, Competition, CompetitionCategory, Feast, FeastCompetition, Stage } from "@/types";

type FCRow = FeastCompetition & {
  competition: Competition & { competition_category?: CompetitionCategory | null };
};

const STATUS_OPTIONS: { value: CompStatus; label: string; color: string }[] = [
  { value: "upcoming", label: "Upcoming", color: "#6B7280" },
  { value: "progressing", label: "Live", color: "#D97706" },
  { value: "completed", label: "Completed", color: "#16A34A" },
  { value: "published", label: "Published", color: "#6B46FF" },
];

function genderTag(gender: string | null) {
  if (gender === "boy") return { label: "Boys", fg: "#3B82F6", bg: "#EFF6FF" };
  if (gender === "girl") return { label: "Girls", fg: "#EC4899", bg: "#FDF2F8" };
  return { label: "Common", fg: "#7C3AED", bg: "#F5F3FF" };
}

interface Draft {
  compStatus: CompStatus;
  stageId: string;
  scheduledTime: string;
  progressPct: string;
  info: string;
}

export default function CompetitionsStatusBoard() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [comps, setComps] = useState<FCRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompStatus | "">("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!feastId) return;
    const [{ data: fcs }, { data: stgs }] = await Promise.all([
      supabase
        .from("feast_competitions")
        .select("*, competition:competitions(*, competition_category:competition_categories(*))")
        .eq("feast_id", feastId)
        .order("display_order"),
      supabase.from("stages").select("*").eq("feast_id", feastId).order("number"),
    ]);
    const rows = (fcs ?? []) as unknown as FCRow[];
    setComps(rows);
    setStages(stgs ?? []);
    const initial: Record<string, Draft> = {};
    for (const fc of rows) {
      initial[fc.id] = {
        compStatus: fc.comp_status,
        stageId: fc.stage_id ?? "",
        scheduledTime: fc.scheduled_time ?? "",
        progressPct: fc.progress_pct != null ? String(fc.progress_pct) : "",
        info: fc.info ?? "",
      };
    }
    setDrafts(initial);
  }, [feastId]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(comps.map((c) => c.competition.competition_category?.name).filter(Boolean))] as string[],
    [comps]
  );

  const filtered = comps.filter((c) => {
    const catOk = !catFilter || c.competition.competition_category?.name === catFilter;
    const statusOk = !statusFilter || (drafts[c.id]?.compStatus ?? c.comp_status) === statusFilter;
    return catOk && statusOk;
  });

  function setDraft(fcId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [fcId]: { ...prev[fcId], ...patch } }));
  }

  function isDirty(fc: FCRow) {
    const d = drafts[fc.id];
    if (!d) return false;
    return (
      d.compStatus !== fc.comp_status ||
      d.stageId !== (fc.stage_id ?? "") ||
      d.scheduledTime !== (fc.scheduled_time ?? "") ||
      d.progressPct !== (fc.progress_pct != null ? String(fc.progress_pct) : "") ||
      d.info !== (fc.info ?? "")
    );
  }

  async function handleSave(fc: FCRow) {
    const d = drafts[fc.id];
    setSaving(fc.id);
    const result = await updateCompetitionStatus({
      feastCompetitionId: fc.id,
      compStatus: d.compStatus,
      stageId: d.stageId || null,
      scheduledTime: d.scheduledTime || null,
      progressPct: d.progressPct ? Number(d.progressPct) : null,
      info: d.info || null,
    });
    setSaving(null);
    if (!result.error) {
      setSaved(fc.id);
      setTimeout(() => setSaved(null), 2000);
      load();
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#6B46FF] to-[#A855F7] text-white">
          <Layers className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-neutral-800">Competitions</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        {categories.length > 0 && (
          <select className="input max-w-xs" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CompStatus | "")}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white shadow-md sm:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
            <tr className="border-b-2" style={{ borderColor: "#c4b5fd" }}>
              {["Competition", "Status", "Stage", "Time", "Progress %", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: "#1e1b4b" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((fc, i) => {
              const d = drafts[fc.id];
              if (!d) return null;
              const gender = genderTag(fc.competition.gender);
              const dirty = isDirty(fc);
              const isEven = i % 2 === 0;
              const status = STATUS_OPTIONS.find((s) => s.value === d.compStatus) ?? STATUS_OPTIONS[0];
              return (
                <tr
                  key={fc.id}
                  className="border-b align-top transition-colors"
                  style={{ borderColor: "#e5e7eb", background: isEven ? "#fff" : "#f8f7ff" }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "#ede9fe")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = isEven ? "#fff" : "#f8f7ff")}
                >
                  <td className="px-3 py-3"><CompetitionCell fc={fc} gender={gender} /></td>
                  <td className="px-3 py-3">
                    <select
                      className="input min-w-[120px]"
                      style={{ borderColor: status.color, color: status.color, fontWeight: 700 }}
                      value={d.compStatus}
                      onChange={(e) => setDraft(fc.id, { compStatus: e.target.value as CompStatus })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <select className="input min-w-[150px]" value={d.stageId} onChange={(e) => setDraft(fc.id, { stageId: e.target.value })}>
                      <option value="">No stage</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>Stage {s.number} — {s.title}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input className="input min-w-[110px]" placeholder="e.g. 10:30 AM" value={d.scheduledTime} onChange={(e) => setDraft(fc.id, { scheduledTime: e.target.value })} />
                  </td>
                  <td className="px-3 py-3">
                    {d.compStatus === "progressing" ? (
                      <input
                        className="input w-20"
                        type="number"
                        min={0}
                        max={100}
                        value={d.progressPct}
                        onChange={(e) => setDraft(fc.id, { progressPct: e.target.value })}
                      />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <SaveButton dirty={dirty} saving={saving === fc.id} saved={saved === fc.id} onClick={() => handleSave(fc)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((fc) => {
          const d = drafts[fc.id];
          if (!d) return null;
          const gender = genderTag(fc.competition.gender);
          const dirty = isDirty(fc);
          return (
            <div key={fc.id} className="overflow-hidden rounded-xl bg-white" style={{ border: "1.5px solid #ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
              <div className="p-3.5">
                <CompetitionCell fc={fc} gender={gender} />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select className="input" value={d.compStatus} onChange={(e) => setDraft(fc.id, { compStatus: e.target.value as CompStatus })}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <select className="input" value={d.stageId} onChange={(e) => setDraft(fc.id, { stageId: e.target.value })}>
                    <option value="">No stage</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>Stage {s.number} — {s.title}</option>
                    ))}
                  </select>
                  <input className="input" placeholder="Scheduled time" value={d.scheduledTime} onChange={(e) => setDraft(fc.id, { scheduledTime: e.target.value })} />
                  {d.compStatus === "progressing" && (
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Progress %"
                      value={d.progressPct}
                      onChange={(e) => setDraft(fc.id, { progressPct: e.target.value })}
                    />
                  )}
                </div>

                <div className="mt-2.5">
                  <SaveButton dirty={dirty} saving={saving === fc.id} saved={saved === fc.id} onClick={() => handleSave(fc)} full />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}

function CompetitionCell({ fc, gender }: { fc: FCRow; gender: { label: string; fg: string; bg: string } }) {
  return (
    <div className="border-l-4 pl-3" style={{ borderColor: gender.fg }}>
      <p className="text-[16px] font-extrabold leading-snug tracking-tight" style={{ color: "#1e1b4b" }}>{fc.competition.name}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-3 py-1 text-[12.5px] font-bold text-white" style={{ background: gender.fg }}>
          {gender.label}
        </span>
        {fc.competition.competition_category && (
          <span className="rounded-full bg-[#6B46FF] px-3 py-1 text-[12.5px] font-bold text-white">
            {fc.competition.competition_category.name}
          </span>
        )}
      </div>
    </div>
  );
}

function SaveButton({ dirty, saving, saved, onClick, full }: { dirty: boolean; saving: boolean; saved: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || (!dirty && !saved)}
      className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
        full ? "w-full" : ""
      } ${saved ? "bg-green-600" : "bg-[#6B46FF]"}`}
    >
      {saved ? (
        <>
          <Check className="h-3.5 w-3.5" /> Saved
        </>
      ) : saving ? (
        "Saving…"
      ) : (
        "Save"
      )}
    </button>
  );
}
