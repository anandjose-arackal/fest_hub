"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CalendarDays, Pencil, Trash2, ArrowRight, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Feast, FeastStatus } from "@/types";

const STATUSES: { value: FeastStatus; label: string; classes: string }[] = [
  { value: "draft", label: "Draft", classes: "bg-gray-100 text-gray-500" },
  { value: "registration_open", label: "Registration Open", classes: "bg-green-100 text-green-700" },
  { value: "ongoing", label: "Ongoing", classes: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", classes: "bg-purple-100 text-purple-700" },
];

type FeastRow = Feast & { participant_count: number };

const emptyForm = {
  id: "",
  name: "",
  slug: "",
  type: "literature",
  year: new Date().getFullYear().toString(),
  status: "draft" as FeastStatus,
  venue: "",
  start_date: "",
  end_date: "",
  description: "",
};

export default function FeastsPage() {
  const [feasts, setFeasts] = useState<FeastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("feasts")
      .select("*, participant_count:participants(count)")
      .order("start_date");
    setFeasts(
      (data ?? []).map((f) => ({
        ...f,
        participant_count: (f.participant_count as unknown as { count: number }[])?.[0]?.count ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(f: FeastRow) {
    setEditId(f.id);
    setForm({
      id: f.id,
      name: f.name,
      slug: f.slug,
      type: f.type,
      year: f.year,
      status: f.status as FeastStatus,
      venue: f.venue ?? "",
      start_date: f.start_date ?? "",
      end_date: f.end_date ?? "",
      description: f.description ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      setError("Name and slug are required.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      type: form.type,
      year: form.year,
      status: form.status,
      venue: form.venue || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      description: form.description || null,
    };
    const { error } = editId
      ? await supabase.from("feasts").update(payload).eq("id", editId)
      : await supabase.from("feasts").insert(payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feast and all its data? This cannot be undone.")) return;
    await supabase.from("feasts").delete().eq("id", id);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-white">
            <CalendarDays className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-neutral-800">Feasts</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9]"
        >
          <Plus className="h-4 w-4" /> New Feast
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : feasts.length === 0 ? (
        <p className="text-sm text-neutral-500">No feasts yet. Create your first one.</p>
      ) : (
        <div className="space-y-3">
          {feasts.map((f) => {
            const status = STATUSES.find((s) => s.value === f.status) ?? STATUSES[0];
            return (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-white">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-800">{f.name}</span>
                    <span className="text-xs text-neutral-400">{f.year}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.classes}`}>{status.label}</span>
                  </div>
                  <p className="truncate text-xs text-neutral-500">
                    {f.venue || "No venue"} · {f.participant_count} participants · {f.slug}
                  </p>
                </div>
                <Link
                  href={`/admin/feasts/${f.id}`}
                  className="flex items-center gap-1 text-xs font-semibold text-[#7C3AED] hover:underline"
                >
                  Competitions <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <button onClick={() => openEdit(f)} className="text-neutral-400 hover:text-neutral-700">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(f.id)} className="text-neutral-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editId ? "Edit Feast" : "New Feast"}</h2>
              <button onClick={() => setModalOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <Field label="Name">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Slug" hint="Used in URLs — lowercase, hyphens only">
                <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {["literature", "arts", "sports", "general"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Year">
                  <input className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </Field>
              </div>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FeastStatus })}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Venue">
                <input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </Field>
                <Field label="End date">
                  <input type="date" className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </Field>
              </div>
              <Field label="Description">
                <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d4d4d8;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-neutral-600">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}
