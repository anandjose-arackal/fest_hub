"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Pencil, Trash2, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getOrgSettings } from "@/lib/org-settings";
import { createMeghala, updateMeghala, deleteMeghala } from "@/actions/meghala";
import type { Diocese, HierarchyLevel, Meghala } from "@/types";

const DEFAULT_COLORS = ["#6B46FF", "#0F766E", "#B45309", "#BE185D", "#1D4ED8", "#15803D", "#B91C1C", "#4338CA"];

export default function MeghalasPage() {
  const [meghalas, setMeghalas] = useState<Meghala[]>([]);
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [hierarchyLevel, setHierarchyLevel] = useState<HierarchyLevel>("shakha");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [dioceseId, setDioceseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: d }, org] = await Promise.all([
      supabase.from("meghalas").select("*").order("name"),
      supabase.from("dioceses").select("*").order("name"),
      getOrgSettings(),
    ]);
    setMeghalas(m ?? []);
    setDioceses(d ?? []);
    setHierarchyLevel(org.hierarchy_level);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setName("");
    setColor(DEFAULT_COLORS[meghalas.length % DEFAULT_COLORS.length]);
    setDioceseId("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(m: Meghala) {
    setEditId(m.id);
    setName(m.name);
    setColor(m.color);
    setDioceseId(m.diocese_id ?? "");
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const input = { name, color, dioceseId: hierarchyLevel === "diocese" ? dioceseId || null : null };
    const result = editId ? await updateMeghala(editId, input) : await createMeghala(input);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this meghala? Shakhas under it are kept but become unassigned, not deleted.")) return;
    const result = await deleteMeghala(id);
    if (result.error) {
      alert(result.error);
      return;
    }
    load();
  }

  const dioceseName = (id: string | null) => dioceses.find((d) => d.id === id)?.name;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#0F766E] to-[#2DD4BF] text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-neutral-800">Meghalas</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59]"
        >
          <Plus className="h-4 w-4" /> New Meghala
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : meghalas.length === 0 ? (
        <p className="text-sm text-neutral-500">No meghalas yet. Add your first one to start grouping shakhas.</p>
      ) : (
        <div className="space-y-2">
          {meghalas.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
              <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: m.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-800">{m.name}</p>
                <p className="text-xs text-neutral-400">
                  {m.slug}
                  {hierarchyLevel === "diocese" && dioceseName(m.diocese_id) && ` · ${dioceseName(m.diocese_id)}`}
                </p>
              </div>
              <button onClick={() => openEdit(m)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(m.id)} className="text-neutral-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editId ? "Edit Meghala" : "New Meghala"}</h2>
              <button onClick={() => setModalOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              {hierarchyLevel === "diocese" && (
                <select className="input" value={dioceseId} onChange={(e) => setDioceseId(e.target.value)}>
                  <option value="">No diocese</option>
                  {dioceses.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Color</label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-7 w-7 rounded-full ring-offset-2"
                      style={{ background: c, boxShadow: color === c ? "0 0 0 2px #0F766E" : undefined }}
                    />
                  ))}
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-7 rounded-full border-none" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSave} disabled={saving || !name.trim()} className="w-full rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
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
