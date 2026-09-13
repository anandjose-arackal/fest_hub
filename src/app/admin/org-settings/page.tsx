"use client";

import { useEffect, useState } from "react";
import { Settings, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateOrgSettings } from "@/actions/org-settings";
import type { OrgSettings } from "@/types";

export default function OrgSettingsPage() {
  const [form, setForm] = useState<Omit<OrgSettings, "id" | "created_at" | "updated_at">>({
    org_name_en: "",
    org_name_local: "",
    area_name_en: "",
    area_name_local: "",
    tagline: "",
    logo_url: "/logo.png",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("org_settings")
      .select("*")
      .eq("id", true)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({
            org_name_en: data.org_name_en,
            org_name_local: data.org_name_local,
            area_name_en: data.area_name_en,
            area_name_local: data.area_name_local,
            tagline: data.tagline,
            logo_url: data.logo_url,
          });
        }
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateOrgSettings({
      orgNameEn: form.org_name_en,
      orgNameLocal: form.org_name_local,
      areaNameEn: form.area_name_en,
      areaNameLocal: form.area_name_local,
      tagline: form.tagline,
      logoUrl: form.logo_url,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-600 to-neutral-800 text-white">
          <Settings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Organization Settings</h1>
          <p className="text-xs text-neutral-500">Shown across the admin panel, Fest Portal, and /screen display.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <Field label="Organization name (English)">
          <input className="input" value={form.org_name_en} onChange={(e) => setForm({ ...form, org_name_en: e.target.value })} />
        </Field>
        <Field label="Organization name (local script)">
          <input className="input" value={form.org_name_local} onChange={(e) => setForm({ ...form, org_name_local: e.target.value })} />
        </Field>
        <Field label="Area name (English)">
          <input className="input" value={form.area_name_en} onChange={(e) => setForm({ ...form, area_name_en: e.target.value })} />
        </Field>
        <Field label="Area name (local script)">
          <input className="input" value={form.area_name_local} onChange={(e) => setForm({ ...form, area_name_local: e.target.value })} />
        </Field>
        <Field label="Tagline">
          <input className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </Field>
        <Field label="Logo URL">
          <input className="input" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
            saved ? "bg-green-600" : "bg-neutral-800 hover:bg-neutral-900"
          }`}
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" /> Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save Settings"
          )}
        </button>
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-neutral-600">{label}</label>
      {children}
    </div>
  );
}
