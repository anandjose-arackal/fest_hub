"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { useFeast, type FeastCompetitionUI } from "@/hooks/use-feast";
import { supabase } from "@/lib/supabase";
import { updateParticipant, deleteParticipant } from "@/actions/feast";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { GlassPanel, GlowBtn, FeastTopBar, StepDots, theme, CATEGORY_COLORS, CATEGORY_LABELS } from "./feast-shared";
import { TextField, DateField, CategoryPill, GenderPicker, normGender, DEFAULT_MAX_PER_SHAKHA } from "./feast-register";
import type { CompetitionCategory } from "@/types";

const STEPS = ["Details", "Events", "Review"];

export function FeastEditRegister({ slug, participantId }: { slug: string; participantId: string }) {
  const router = useRouter();
  const { feast } = useFeast(slug);
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [form, setForm] = useState({ name: "", houseName: "", dob: "", gender: "", phone: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [shakhaCounts, setShakhaCounts] = useState<Record<string, number>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { fetchCompetitionCategories().then(setCategories); }, []);
  const catSlug = getCategorySlug(form.dob, categories);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: regs }] = await Promise.all([
        supabase.from("participants").select("name, house_name, date_of_birth, gender, phone, shakha_id").eq("id", participantId).single(),
        supabase.from("participant_registrations").select("feast_competition_id").eq("participant_id", participantId),
      ]);
      if (p) {
        setForm({
          name: p.name,
          houseName: p.house_name ?? "",
          dob: p.date_of_birth ?? "",
          gender: normGender(p.gender) ?? "",
          phone: p.phone ?? "",
        });
      }
      setPicked((regs ?? []).map((r) => r.feast_competition_id));
      setLoaded(true);
    })();
  }, [participantId]);

  const toggle = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const cap = feast?.competitions.find((c) => c.id === id)?.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
      return p.length >= 2 || (shakhaCounts[id] ?? 0) >= cap ? p : [...p, id];
    });

  const step1ok = !!(form.name.trim() && form.dob && form.gender);
  const step2ok = picked.length > 0;

  async function submit() {
    setSubmitting(true);
    setServerError("");
    const result = await updateParticipant({
      participantId,
      name: form.name,
      houseName: form.houseName,
      dob: form.dob,
      gender: form.gender,
      phone: form.phone,
      feastCompetitionIds: picked,
    });
    setSubmitting(false);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.push(`/feast/${slug}/registrations`);
  }

  async function handleDelete() {
    await deleteParticipant(participantId);
    router.push(`/feast/${slug}/registrations`);
  }

  if (!feast || !loaded) return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;

  const eligibleComps: FeastCompetitionUI[] = feast.competitions.filter((c) => {
    const ng = normGender(c.gender);
    const genderOk = !ng || ng === "common" || ng === normGender(form.gender);
    const catOk = !c.competitionCategorySlug || c.competitionCategorySlug === catSlug;
    return genderOk && catOk;
  });

  return (
    <div>
      <FeastTopBar title={`Edit · ${feast.name}`} onBack={() => (step === 0 ? router.push(`/feast/${slug}/registrations`) : setStep((s) => s - 1))} />
      <div className="mb-4"><StepDots steps={STEPS} current={step} /></div>

      {step === 0 && (
        <div>
          <GlassPanel className="mb-3.5 p-4">
            <TextField label="Full Name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Ann Maria Joy" />
            <TextField label="House Name" value={form.houseName} onChange={(v) => set("houseName", v)} placeholder="e.g. Thekkedath House" />
            <DateField label="Date of Birth" value={form.dob} onChange={(v) => { set("dob", v); setPicked([]); }} />
            <CategoryPill slug={catSlug} />
            <GenderPicker value={form.gender} onChange={(v) => { set("gender", v); setPicked([]); }} />
            <TextField label="Phone (optional)" value={form.phone} onChange={(v) => set("phone", v.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" type="tel" />
          </GlassPanel>
          <GlowBtn variant="primary" size="lg" className="w-full" disabled={!step1ok} onClick={() => setStep(1)}>Continue</GlowBtn>

          {!confirmingDelete ? (
            <button onClick={() => setConfirmingDelete(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-sm font-semibold" style={{ background: "#fee2e2", color: "#ef4444" }}>
              <Trash2 className="h-4 w-4" /> Remove Registration
            </button>
          ) : (
            <div className="mt-3 rounded-[14px] p-3" style={{ background: "#fee2e2" }}>
              <p className="mb-2 text-sm" style={{ color: "#b91c1c" }}>Delete this registration permanently?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmingDelete(false)} className="flex-1 rounded-lg border border-neutral-300 bg-white py-1.5 text-sm">Cancel</button>
                <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white">Yes, Delete</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] leading-relaxed" style={{ color: theme.sub }}>Update competitions. Saving replaces all selections.</p>
            <span className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= 2 ? { background: "#fef3c7", color: "#b45309" } : { background: `${theme.purple}1a`, color: theme.purple }}>{picked.length} / 2</span>
          </div>
          {eligibleComps.map((c) => {
            const on = picked.includes(c.id);
            const cap = c.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
            const full = !on && (shakhaCounts[c.id] ?? 0) >= cap;
            return (
              <GlassPanel key={c.id} className="mb-2.5 flex cursor-pointer items-center gap-3 p-3" onClick={() => !full && toggle(c.id)} style={{ border: on ? `1px solid ${theme.lavender}` : undefined, opacity: full ? 0.45 : 1 }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg" style={{ background: `${feast.accent}26` }}>{c.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{c.name}</div>
                  {c.competitionCategorySlug && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: `${theme.purple}1a`, color: theme.purple }}>{CATEGORY_LABELS[c.competitionCategorySlug]}</span>}
                </div>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,#6B46FF,#A78BFA)" } : { background: "rgba(255,255,255,0.72)", border: `1px solid ${theme.hairline}` }}>
                  {on && <Check className="h-[15px] w-[15px] text-white" />}
                </div>
              </GlassPanel>
            );
          })}
          <GlowBtn variant="primary" size="lg" className="mt-3.5 w-full" disabled={!step2ok} onClick={() => setStep(2)}>Review Changes</GlowBtn>
        </div>
      )}

      {step === 2 && (
        <div>
          <GlassPanel strong className="mb-3.5 p-[18px]">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.gold }}>Review changes</div>
            {[["Name", form.name], ["House Name", form.houseName || "—"], ["Date of Birth", form.dob], ["Gender", form.gender.charAt(0).toUpperCase() + form.gender.slice(1)], ["Category", CATEGORY_LABELS[catSlug] || "—"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.hairline}` }}>
                <span className="text-[12.5px]" style={{ color: theme.faint }}>{k}</span>
                <span className="text-[13.5px] font-semibold" style={{ color: k === "Category" ? CATEGORY_COLORS[catSlug] || theme.text : theme.text }}>{v}</span>
              </div>
            ))}
            <div className="mt-3">
              <div className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Competitions ({picked.length})</div>
              <div className="flex flex-wrap gap-[7px]">
                {picked.map((id) => <span key={id} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: `${theme.purple}2e` }}>{feast.competitions.find((c) => c.id === id)?.name}</span>)}
              </div>
            </div>
          </GlassPanel>
          {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
          <GlowBtn variant="gold" size="lg" className="w-full" disabled={submitting} loading={submitting} onClick={submit}>Save Changes</GlowBtn>
        </div>
      )}
    </div>
  );
}
