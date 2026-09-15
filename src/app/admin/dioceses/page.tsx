"use client";

import { useEffect, useState, useCallback } from "react";
import { Church, Pencil, Trash2, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createDiocese, updateDiocese, deleteDiocese } from "@/actions/diocese";
import type { Diocese } from "@/types";

const DEFAULT_COLORS = ["#6B46FF", "#0F766E", "#B45309", "#BE185D", "#1D4ED8", "#15803D", "#B91C1C", "#4338CA"];

export default function DiocesesPage() {
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("dioceses").select("*").order("name");
    setDioceses(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setName("");
    setColor(DEFAULT_COLORS[dioceses.length % DEFAULT_COLORS.length]);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(d: Diocese) {
    setEditId(d.id);
    setName(d.name);
    setColor(d.color);
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const result = editId ? await updateDiocese(editId, { name, color }) : await createDiocese({ name, color });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this diocese? Meghalas under it are kept but become unassigned, not deleted.")) return;
    const result = await deleteDiocese(id);
    if (result.error) {
      alert(result.error);
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#6B46FF] to-[#A78BFA] text-white">
            <Church className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-neutral-800">Dioceses</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[#6B46FF] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5735d9]"
        >
          <Plus className="h-4 w-4" /> New Diocese
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : dioceses.length === 0 ? (
        <p className="text-sm text-neutral-500">No dioceses yet. Add your first one to start grouping meghalas.</p>
      ) : (
        <div className="space-y-2">
          {dioceses.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
              <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: d.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-800">{d.name}</p>
                <p className="text-xs text-neutral-400">{d.slug}</p>
              </div>
              <button onClick={() => openEdit(d)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(d.id)} className="text-neutral-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editId ? "Edit Diocese" : "New Diocese"}</h2>
              <button onClick={() => setModalOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Color</label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-7 w-7 rounded-full ring-offset-2"
                      style={{ background: c, boxShadow: color === c ? "0 0 0 2px #6B46FF" : undefined }}
                    />
                  ))}
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-7 rounded-full border-none" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSave} disabled={saving || !name.trim()} className="w-full rounded-lg bg-[#6B46FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
