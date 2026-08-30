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

  const filtered = catFilter ? comps.filter((c) => c.competition.competition_category?.name === catFilter) : comps;

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
    <div className="mx-auto max-w-3xl">
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
      </div>

      <div className="space-y-3">
        {filtered.map((fc) => {
          const d = drafts[fc.id];
          if (!d) return null;
          const gender = genderTag(fc.competition.gender);
          const status = STATUS_OPTIONS.find((s) => s.value === d.compStatus) ?? STATUS_OPTIONS[0];
          const dirty = isDirty(fc);
          return (
            <div key={fc.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-neutral-800">{fc.competition.name}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: gender.fg, background: gender.bg }}>
                    {gender.label}
                  </span>
                  {fc.competition.competition_category && (
                    <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600">
                      {fc.competition.competition_category.name}
                    </span>
                  )}
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: status.color }}>
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              <textarea
                className="input mt-2"
                rows={2}
                placeholder="Info (venue / rules / announcements)"
                value={d.info}
                onChange={(e) => setDraft(fc.id, { info: e.target.value })}
              />

              {(dirty || saved === fc.id) && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{dirty ? "Unsaved changes" : ""}</span>
                  <button
                    onClick={() => handleSave(fc)}
                    disabled={saving === fc.id}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                      saved === fc.id ? "bg-green-600" : "bg-[#6B46FF]"
                    }`}
                  >
                    {saved === fc.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Saved
                      </>
                    ) : saving === fc.id ? (
                      "Saving…"
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              )}
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
