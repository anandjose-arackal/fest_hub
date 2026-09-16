"use client";

import { useEffect, useState } from "react";
import { Settings, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateOrgSettings } from "@/actions/org-settings";
import type { HierarchyLevel, OrgSettings, PortalTheme } from "@/types";

const HIERARCHY_OPTIONS: { value: HierarchyLevel; label: string; hint: string }[] = [
  { value: "shakha", label: "Shakha only", hint: "Default — flat list of shakhas, no grouping." },
  { value: "meghala", label: "Meghala → Shakha", hint: "Shakhas grouped under meghalas." },
  { value: "diocese", label: "Diocese → Meghala → Shakha", hint: "Full three-level hierarchy." },
];

// Swatches mirror globals.css's [data-fp-theme] custom properties — kept as
// literal hex here purely for this admin preview, not read by the portal.
const THEME_OPTIONS: { value: PortalTheme; label: string; swatches: string[] }[] = [
  { value: "violet", label: "Violet Bloom", swatches: ["#6B46FF", "#EC4899", "#F5C542"] },
  { value: "ocean", label: "Ocean Breeze", swatches: ["#172D9D", "#FF6F91", "#00E2E0"] },
  { value: "sunset", label: "Tropic Sunrise", swatches: ["#E8823D", "#18C5C7", "#F5B942"] },
  { value: "aurora", label: "Aurora Skies", swatches: ["#5B6EE8", "#F696D5", "#18BBD9"] },
  { value: "carnival", label: "Carnival Spark", swatches: ["#9A6BC2", "#EA1A7F", "#FEC603"] },
  { value: "amethyst", label: "Amethyst Dusk", swatches: ["#605399", "#D562BE", "#F0B429"] },
  { value: "midnight", label: "Midnight Mode", swatches: ["#171325", "#8B6FFF", "#FF6FB0"] },
  { value: "emerald", label: "Emerald Night", swatches: ["#0D1A16", "#16D9A0", "#FF7A5C"] },
];

export default function OrgSettingsPage() {
  const [form, setForm] = useState<Omit<OrgSettings, "id" | "created_at" | "updated_at">>({
    org_name_en: "",
    org_name_local: "",
    area_name_en: "",
    area_name_local: "",
    tagline: "",
    logo_url: "/logo.png",
    hierarchy_level: "shakha",
    theme: "violet",
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
            hierarchy_level: data.hierarchy_level ?? "shakha",
            theme: data.theme ?? "violet",
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
      hierarchyLevel: form.hierarchy_level,
      theme: form.theme,
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
        <Field label="Grouping level">
          <div className="space-y-1.5">
            {HIERARCHY_OPTIONS.map((opt) => {
              const active = form.hierarchy_level === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, hierarchy_level: opt.value })}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                  }`}
                >
                  <span className="font-semibold">{opt.label}</span>
                  <span className={`block text-xs ${active ? "text-neutral-300" : "text-neutral-500"}`}>{opt.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Narrowing this later doesn&apos;t delete existing Meghala/Diocese assignments — they&apos;re just no longer shown.
          </p>
        </Field>

        <Field label="Fest Portal color theme">
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => {
              const active = form.theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, theme: opt.value })}
                  className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center transition-colors ${
                    active ? "border-neutral-800 bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-400"
                  }`}
                >
                  <span className="flex gap-1">
                    {opt.swatches.map((c) => (
                      <span key={c} className="h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />
                    ))}
                  </span>
                  <span className={`text-xs font-semibold ${active ? "text-neutral-900" : "text-neutral-600"}`}>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Applies to the public Fest Portal only — the admin panel keeps this look regardless.
          </p>
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
