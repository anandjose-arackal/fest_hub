"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Phone, Calendar, Check, Loader2 } from "lucide-react";
import { useFeast, type FeastCompetitionUI } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { registerParticipant } from "@/actions/feast";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { GlassPanel, GlowBtn, FeastTopBar, StepDots, theme, CATEGORY_COLORS, CATEGORY_LABELS } from "./feast-shared";
import type { CompetitionCategory } from "@/types";

const DEFAULT_MAX_PER_SHAKHA = 2;
const STEPS = ["Details", "Events", "Review"];

function normGender(g: string | null | undefined): string | null {
  if (!g) return null;
  const l = g.toLowerCase();
  if (l === "boy" || l === "boys" || l === "male") return "boy";
  if (l === "girl" || l === "girls" || l === "female") return "girl";
  return l;
}

function TextField({ label, value, onChange, placeholder, type = "text", icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; icon?: typeof User;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-[11.5px] font-semibold tracking-wide" style={{ color: theme.sub, fontFamily: "var(--font-poppins), sans-serif" }}>{label}</label>
      <div className="flex items-center gap-2.5 rounded-[14px] border px-3.5" style={{ background: "rgba(255,255,255,0.72)", borderColor: theme.hairline }}>
        {Icon && <Icon className="h-4 w-4" style={{ color: theme.faint }} />}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          inputMode={type === "tel" ? "tel" : undefined}
          className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none"
          style={{ color: theme.text }}
        />
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2">
      <label className="mb-1.5 block text-[11.5px] font-semibold tracking-wide" style={{ color: theme.sub, fontFamily: "var(--font-poppins), sans-serif" }}>{label}</label>
      <div className="flex items-center gap-2.5 rounded-[14px] border px-3.5" style={{ background: "rgba(255,255,255,0.72)", borderColor: theme.hairline }}>
        <Calendar className="h-4 w-4" style={{ color: theme.faint }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="date"
          max={new Date().toISOString().split("T")[0]}
          min="1940-01-01"
          className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none"
          style={{ color: value ? theme.text : theme.faint }}
        />
      </div>
    </div>
  );
}

function CategoryPill({ slug }: { slug: string }) {
  if (!slug) return <div className="mb-3" />;
  const label = CATEGORY_LABELS[slug];
  const color = CATEGORY_COLORS[slug] || theme.lavender;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl px-3.5 py-2" style={{ background: `${color}18`, border: `1px solid ${color}44` }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-[12.5px] font-semibold" style={{ color }}>Competition Category: <strong>{label}</strong></span>
    </div>
  );
}

function GenderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [{ value: "boy", label: "Boy" }, { value: "girl", label: "Girl" }, { value: "other", label: "Other" }];
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-[11.5px] font-semibold tracking-wide" style={{ color: theme.sub, fontFamily: "var(--font-poppins), sans-serif" }}>Gender</label>
      <div className="flex gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-transform active:scale-95"
              style={on ? { background: "linear-gradient(135deg,#6B46FF,#A78BFA)", color: "#fff", boxShadow: "0 6px 16px rgba(107,70,255,0.3)" } : { background: "rgba(255,255,255,0.72)", color: theme.sub, border: `1px solid ${theme.hairline}` }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FeastRegister({ slug }: { slug: string }) {
  const router = useRouter();
  const { feast } = useFeast(slug);
  const { session } = useAuth();
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  const [adminShakha, setAdminShakha] = useState<{ id: string; name: string } | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [form, setForm] = useState({ name: "", houseName: "", dob: "", gender: "", phone: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [shakhaCounts, setShakhaCounts] = useState<Record<string, number>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { fetchCompetitionCategories().then(setCategories); }, []);
  const catSlug = getCategorySlug(form.dob, categories);

  const toggle = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const cap = feast?.competitions.find((c) => c.id === id)?.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
      return p.length >= 2 || (shakhaCounts[id] ?? 0) >= cap ? p : [...p, id];
    });

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("profiles").select("shakha_id, shakha:shakhas(id, name)").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (!data?.shakha_id) return;
      const sh = Array.isArray(data.shakha) ? data.shakha[0] : data.shakha;
      setAdminShakha({ id: data.shakha_id, name: sh?.name ?? "" });
    });
  }, [session]);

  useEffect(() => { setPicked([]); }, [form.dob, form.gender]);

  useEffect(() => {
    if (!adminShakha || !feast) return;
    const compIds = feast.competitions.filter((c) => c.cat === "Individual").map((c) => c.id);
    if (compIds.length === 0) return;
    (async () => {
      const { data: regs } = await supabase.from("participant_registrations").select("feast_competition_id, participant_id").in("feast_competition_id", compIds);
      if (!regs?.length) { setShakhaCounts({}); return; }
      const participantIds = [...new Set(regs.map((r) => r.participant_id))];
      const { data: parts } = await supabase.from("participants").select("id").in("id", participantIds).eq("shakha_id", adminShakha.id);
      const shakhaSet = new Set((parts ?? []).map((p) => p.id));
      const counts: Record<string, number> = {};
      for (const r of regs) {
        if (!shakhaSet.has(r.participant_id)) continue;
        counts[r.feast_competition_id] = (counts[r.feast_competition_id] ?? 0) + 1;
      }
      setShakhaCounts(counts);
    })();
  }, [adminShakha, feast]);

  const step1ok = !!(form.name.trim() && form.dob && form.gender);

  async function submit() {
    if (!feast) return;
    setSubmitting(true);
    setServerError("");
    const result = await registerParticipant({
      feastSlug: slug,
      shakhaId: adminShakha?.id ?? "",
      name: form.name,
      houseName: form.houseName,
      dob: form.dob,
      gender: form.gender,
      phone: form.phone,
      feastCompetitionIds: picked,
    });
    setSubmitting(false);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }
    const params = new URLSearchParams({
      regNo: result.regNo, name: form.name, houseName: form.houseName, shakha: adminShakha?.name ?? "",
      dob: form.dob, gender: form.gender, category: catSlug, phone: form.phone,
      comps: picked.map((id) => feast.competitions.find((c) => c.id === id)?.name ?? id).join("|"),
    });
    router.push(`/feast/${slug}/success?${params.toString()}`);
  }

  if (!feast) {
    return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;
  }

  const eligibleComps: FeastCompetitionUI[] = feast.competitions.filter((c) => {
    const ng = normGender(c.gender);
    const genderOk = !ng || ng === "common" || ng === normGender(form.gender);
    const catOk = !c.competitionCategorySlug || c.competitionCategorySlug === catSlug;
    return genderOk && catOk && c.cat === "Individual";
  });

  return (
    <div>
      <FeastTopBar title={`Register · ${feast.name}`} onBack={() => (step === 0 ? router.push(`/feast/${slug}`) : setStep((s) => s - 1))} />
      <div className="mb-4"><StepDots steps={STEPS} current={step} /></div>

      {step === 0 && (
        <div>
          <GlassPanel className="mb-3.5 p-4">
            <TextField label="Full Name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Ann Maria Joy" icon={User} />
            <TextField label="House Name" value={form.houseName} onChange={(v) => set("houseName", v)} placeholder="e.g. Thekkedath House" />
            <DateField label="Date of Birth" value={form.dob} onChange={(v) => set("dob", v)} />
            <CategoryPill slug={catSlug} />
            <GenderPicker value={form.gender} onChange={(v) => set("gender", v)} />
            <TextField label="Phone (optional)" value={form.phone} onChange={(v) => set("phone", v.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" type="tel" icon={Phone} />
            {adminShakha && (
              <div className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5" style={{ background: theme.fillStrong, border: `1px solid ${theme.purple}22` }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: theme.purple }} />
                <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{adminShakha.name}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: theme.faint }}>Your Shakha</span>
              </div>
            )}
          </GlassPanel>
          <GlowBtn variant="primary" size="lg" className="w-full" disabled={!step1ok} onClick={() => setStep(1)}>Continue</GlowBtn>
          {!step1ok && <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>Name, date of birth and gender are required</p>}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] leading-relaxed" style={{ color: theme.sub }}>Showing competitions for your category. Select the ones you&apos;d like to enter.</p>
            <span className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= 2 ? { background: "#fef3c7", color: "#b45309" } : { background: `${theme.purple}1a`, color: theme.purple }}>{picked.length} / 2</span>
          </div>
          {picked.length >= 2 && <div className="mb-3 rounded-[14px] px-3.5 py-2.5 text-[12.5px]" style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>Maximum 2 competitions allowed. Deselect one to change.</div>}
          {eligibleComps.length === 0 ? (
            <div className="rounded-2xl py-10 text-center" style={{ background: theme.fill }}>
              <p className="mb-1 text-sm font-semibold" style={{ color: theme.sub }}>No individual competitions available</p>
              <p className="text-xs" style={{ color: theme.faint }}>No individual events match your age group or gender. You can still continue — join a team competition afterwards from &quot;Register Team&quot;.</p>
            </div>
          ) : (
            eligibleComps.map((c) => {
              const on = picked.includes(c.id);
              const cap = c.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
              const full = !on && (shakhaCounts[c.id] ?? 0) >= cap;
              const genderColor = c.gender === "boy" ? "#3B82F6" : c.gender === "girl" ? "#EC4899" : null;
              return (
                <GlassPanel
                  key={c.id}
                  className="mb-2.5 flex cursor-pointer items-center gap-3 p-3"
                  onClick={() => !full && toggle(c.id)}
                  style={{
                    border: on ? `1px solid ${theme.lavender}` : undefined,
                    boxShadow: on ? `0 0 0 3px ${theme.purple}2e, ${theme.softShadow}` : undefined,
                    opacity: full ? 0.45 : 1,
                    cursor: full ? "not-allowed" : "pointer",
                  }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg" style={{ background: `${feast.accent}26` }}>{c.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{c.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px]" style={{ color: theme.sub }}>{c.cat}{c.time ? ` · ${c.time}` : ""}</span>
                      {genderColor && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: `${genderColor}1a`, color: genderColor }}>{c.gender === "boy" ? "Boys" : "Girls"}</span>}
                      {c.competitionCategorySlug && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: `${theme.purple}1a`, color: theme.purple }}>{CATEGORY_LABELS[c.competitionCategorySlug]}</span>}
                      {full && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "#fef3c7", color: "#b45309" }}>Full for your Shakha (max {cap})</span>}
                    </div>
                  </div>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,#6B46FF,#A78BFA)" } : { background: "rgba(255,255,255,0.72)", border: `1px solid ${theme.hairline}` }}>
                    {on && <Check className="h-[15px] w-[15px] text-white" />}
                  </div>
                </GlassPanel>
              );
            })
          )}
          <div className="mb-3 mt-3.5 flex items-center justify-between px-0.5">
            <span className="text-[13px]" style={{ color: theme.sub }}>Selected</span>
            <span className="text-[15px] font-bold" style={{ color: theme.text }}>{picked.length} event{picked.length !== 1 ? "s" : ""}</span>
          </div>
          <GlowBtn variant="primary" size="lg" className="w-full" onClick={() => setStep(2)}>Review Registration</GlowBtn>
          {picked.length === 0 && <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>No individual events selected — you can still register and add them to a team later.</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <GlassPanel strong className="mb-3.5 p-[18px]">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.gold }}>Confirm your details</div>
            {[
              ["Name", form.name], ["House Name", form.houseName || "—"], ["Date of Birth", form.dob],
              ["Gender", form.gender.charAt(0).toUpperCase() + form.gender.slice(1)],
              ["Category", CATEGORY_LABELS[catSlug] || "—"], ["Shakha", adminShakha?.name ?? "—"],
              ...(form.phone ? [["Phone", form.phone]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.hairline}` }}>
                <span className="text-[12.5px]" style={{ color: theme.faint }}>{k}</span>
                <span className="text-[13.5px] font-semibold" style={{ color: k === "Category" ? CATEGORY_COLORS[catSlug] || theme.text : theme.text }}>{v}</span>
              </div>
            ))}
            <div className="mt-3">
              <div className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Competitions ({picked.length})</div>
              {picked.length === 0 ? (
                <p className="text-xs" style={{ color: theme.faint }}>None — you can add them to a team afterwards.</p>
              ) : (
                <div className="flex flex-wrap gap-[7px]">
                  {picked.map((id) => (
                    <span key={id} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: `${theme.purple}2e`, border: `1px solid ${theme.purple}55` }}>
                      {feast.competitions.find((c) => c.id === id)?.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>
          {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
          <GlowBtn variant="gold" size="lg" className="w-full" disabled={submitting} loading={submitting} onClick={submit}>Confirm Registration</GlowBtn>
          <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>Registering under <strong>{adminShakha?.name ?? "your shakha"}</strong></p>
        </div>
      )}
    </div>
  );
}
