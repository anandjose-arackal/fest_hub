"use client";

import { useEffect, useState, useCallback, use } from "react";
import { Trash2, Plus, X, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createStage, updateStage, deleteStage } from "@/actions/stage";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, Stage } from "@/types";

type FCRow = FeastCompetition & { competition: Competition & { competition_category?: CompetitionCategory | null } };

function genderPill(gender: string | null) {
  if (gender === "boy") return { label: "Boy", classes: "bg-blue-50 text-blue-600" };
  if (gender === "girl") return { label: "Girl", classes: "bg-pink-50 text-pink-600" };
  return { label: "Common", classes: "bg-gray-50 text-gray-500" };
}

export default function FeastLineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: feastId } = use(params);
  const [feast, setFeast] = useState<Feast | null>(null);
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [allComps, setAllComps] = useState<Competition[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addCompId, setAddCompId] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [maxSlots, setMaxSlots] = useState("");
  const [venue, setVenue] = useState("");

  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ id: "", number: "1", title: "", venue: "" });
  const [stageError, setStageError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: fcs }, { data: comps }, { data: stgs }] = await Promise.all([
      supabase.from("feasts").select("id,name,slug,year").eq("id", feastId).single(),
      supabase
        .from("feast_competitions")
        .select("*, competition:competitions(*, competition_category:competition_categories(*))")
        .eq("feast_id", feastId)
        .order("display_order"),
      supabase.from("competitions").select("*").order("name"),
      supabase.from("stages").select("*").eq("feast_id", feastId).order("number"),
    ]);
    setFeast(f as Feast);
    setFeastComps((fcs ?? []) as unknown as FCRow[]);
    setAllComps(comps ?? []);
    setStages(stgs ?? []);
    setLoading(false);
  }, [feastId]);

  useEffect(() => {
    load();
  }, [load]);

  const alreadyAdded = new Set(feastComps.map((fc) => fc.competition_id));
  const availableComps = allComps.filter((c) => !alreadyAdded.has(c.id));

  async function handleAdd() {
    if (!addCompId) return;
    const displayOrder = (feastComps.at(-1)?.display_order ?? -1) + 1;
    await supabase.from("feast_competitions").insert({
      feast_id: feastId,
      competition_id: addCompId,
      display_order: displayOrder,
      time_slot: timeSlot || null,
      max_slots: maxSlots ? Number(maxSlots) : null,
      venue: venue || null,
    });
    setAddOpen(false);
    setAddCompId("");
    setTimeSlot("");
    setMaxSlots("");
    setVenue("");
    load();
  }

  async function handleRemove(fcId: string) {
    if (!confirm("Remove this competition from the fest?")) return;
    await supabase.from("feast_competitions").delete().eq("id", fcId);
    load();
  }

  async function handleAssignStage(fcId: string, stageId: string) {
    await supabase.from("feast_competitions").update({ stage_id: stageId || null }).eq("id", fcId);
    load();
  }

  function openCreateStage() {
    setStageForm({ id: "", number: String((stages.at(-1)?.number ?? 0) + 1), title: "", venue: "" });
    setStageError(null);
    setStageModalOpen(true);
  }

  function openEditStage(s: Stage) {
    setStageForm({ id: s.id, number: String(s.number), title: s.title, venue: s.venue ?? "" });
    setStageError(null);
    setStageModalOpen(true);
  }

  async function handleSaveStage() {
    const input = { feastId, number: Number(stageForm.number) || 1, title: stageForm.title, venue: stageForm.venue };
    const result = stageForm.id ? await updateStage(stageForm.id, input) : await createStage(input);
    if (result.error) {
      setStageError(result.error);
      return;
    }
    setStageModalOpen(false);
    load();
  }

  async function handleDeleteStage(id: string) {
    if (!confirm("Delete this stage? Competitions assigned to it will become unassigned.")) return;
    await deleteStage(id);
    load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">{feast?.name}</h1>
        <p className="text-sm text-neutral-500">Add, reorder and configure events for this fest.</p>
      </div>

      {/* Stages */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            <Layers className="h-4 w-4" /> Stages
          </h2>
          <button onClick={openCreateStage} className="flex items-center gap-1 text-xs font-semibold text-[#7C3AED]">
            <Plus className="h-3.5 w-3.5" /> Add Stage
          </button>
        </div>
        {stages.length === 0 ? (
          <p className="text-xs text-neutral-400">No stages yet — competitions can still be added below without one.</p>
        ) : (
          <div className="space-y-2">
            {stages.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <div>
                  <span className="text-sm font-medium">Stage {s.number} — {s.title}</span>
                  {s.venue && <span className="ml-2 text-xs text-neutral-400">{s.venue}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditStage(s)} className="text-xs text-neutral-500 hover:text-neutral-800">Edit</button>
                  <button onClick={() => handleDeleteStage(s.id)} className="text-neutral-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Competitions */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Competitions</h2>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Competition
          </button>
        </div>

        <div className="space-y-2">
          {feastComps.map((fc, idx) => {
            const pill = genderPill(fc.competition.gender);
            return (
              <div key={fc.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-neutral-800">{fc.competition.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${pill.classes}`}>{pill.label}</span>
                      {fc.competition.competition_category && (
                        <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600">
                          {fc.competition.competition_category.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">
                      {fc.competition.type} · {fc.time_slot || "no time"} · {fc.venue || "no venue"} · {fc.max_slots ?? "∞"} slots
                    </p>
                    <select
                      className="mt-1.5 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                      value={fc.stage_id ?? ""}
                      onChange={(e) => handleAssignStage(fc.id, e.target.value)}
                    >
                      <option value="">No stage</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>Stage {s.number} — {s.title}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => handleRemove(fc.id)} className="text-neutral-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Add Competition</h2>
              <button onClick={() => setAddOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <select className="input" value={addCompId} onChange={(e) => setAddCompId(e.target.value)}>
                <option value="">Select competition…</option>
                {availableComps.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input className="input" placeholder="Time slot" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} />
              <input className="input" placeholder="Max slots" type="number" value={maxSlots} onChange={(e) => setMaxSlots(e.target.value)} />
              <input className="input" placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              <button
                onClick={handleAdd}
                disabled={!addCompId}
                className="w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {stageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setStageModalOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{stageForm.id ? "Edit Stage" : "Add Stage"}</h2>
              <button onClick={() => setStageModalOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <input className="input" type="number" placeholder="Stage number" value={stageForm.number} onChange={(e) => setStageForm({ ...stageForm, number: e.target.value })} />
              <input className="input" placeholder="Title (e.g. Speech B)" value={stageForm.title} onChange={(e) => setStageForm({ ...stageForm, title: e.target.value })} />
              <input className="input" placeholder="Venue (optional)" value={stageForm.venue} onChange={(e) => setStageForm({ ...stageForm, venue: e.target.value })} />
              {stageError && <p className="text-sm text-red-600">{stageError}</p>}
              <button onClick={handleSaveStage} className="w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </div>
  );
}
