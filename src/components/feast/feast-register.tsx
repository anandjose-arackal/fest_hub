"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { useRouter } from "next/navigation";
import { User, Phone, Calendar, Check, Loader2, Users } from "lucide-react";
import { useFeast, useOrgHierarchy, type FeastCompetitionUI } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { registerParticipant } from "@/actions/feast";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { countScopeRegistrations, loadScopeTeams, resolveCapScope } from "@/lib/reg-cap-scope";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { GlassPanel, GlowBtn, FeastTopBar, ProcessingOverlay, RegistrationClosed, StepDots, theme, CATEGORY_COLORS, CATEGORY_LABELS, catStyle, mix, useSubmitLock } from "./feast-shared";
import { HierarchyPicker, type PickerHierarchy } from "@/components/admin/hierarchy-picker";
import type { CompetitionCategory } from "@/types";

export const DEFAULT_MAX_PER_SHAKHA = 2;
const STEPS = ["Details", "Events", "Review"];

// Matches TextField/DateField's glass-input look above, for the one place a
// plain <select> (HierarchyPicker) needs to sit among them.
const PUBLIC_SELECT_CLASS =
  "h-[52px] w-full rounded-[15px] border bg-[var(--fp-input)] border-[var(--fp-line-2)] px-3.5 text-[15px] font-semibold text-[var(--fp-ink)] outline-none focus:border-[var(--fp-primary-light)]";

export function normGender(g: string | null | undefined): string | null {
  if (!g) return null;
  const l = g.toLowerCase();
  if (l === "boy" || l === "boys" || l === "male") return "boy";
  if (l === "girl" || l === "girls" || l === "female") return "girl";
  return l;
}

const FIELD_LABEL = "fp-cap mb-2 block text-[10.5px]";
const FIELD_BOX =
  "flex h-[52px] items-center gap-2.5 rounded-[15px] border px-3.5 transition-[border-color,box-shadow] focus-within:border-[var(--fp-primary-light)] focus-within:[box-shadow:0_0_0_4px_color-mix(in_srgb,var(--fp-primary)_12%,transparent)]";

export function TextField({ label, value, onChange, placeholder, type = "text", icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; icon?: typeof User;
}) {
  const id = useId();
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className={FIELD_LABEL} style={{ color: theme.sub }}>{label}</label>
      <div className={FIELD_BOX} style={{ background: "var(--fp-input)", borderColor: theme.line2 }}>
        {Icon && <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: theme.faint }} aria-hidden="true" />}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          inputMode={type === "tel" ? "tel" : undefined}
          className="fp-ml h-full min-w-0 flex-1 border-none bg-transparent text-[15px] font-semibold outline-none"
          style={{ color: theme.text }}
        />
      </div>
    </div>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className={FIELD_LABEL} style={{ color: theme.sub }}>{label}</label>
      <div className={FIELD_BOX} style={{ background: "var(--fp-input)", borderColor: theme.line2 }}>
        <Calendar className="h-[18px] w-[18px] shrink-0" style={{ color: theme.faint }} aria-hidden="true" />
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="date"
          max={new Date().toISOString().split("T")[0]}
          min="1940-01-01"
          className="h-full min-w-0 flex-1 border-none bg-transparent text-[15px] font-semibold outline-none"
          style={{ color: value ? theme.text : theme.faint }}
        />
      </div>
    </div>
  );
}

export function CategoryPill({ slug }: { slug: string }) {
  if (!slug) return <div className="mb-3" />;
  const label = CATEGORY_LABELS[slug];
  const cs = catStyle(slug);
  return (
    <div className="mb-3.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5" style={{ background: mix(cs.color, 12), border: `1px solid ${mix(cs.color, 35)}` }} role="status">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cs.color, boxShadow: `0 0 8px ${cs.color}` }} />
      <span className="text-[13px] font-bold" style={{ color: cs.ink }}>Competition category: <strong className="font-extrabold">{label}</strong></span>
    </div>
  );
}

export function GenderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [{ value: "boy", label: "Boy" }, { value: "girl", label: "Girl" }, { value: "other", label: "Other" }];
  return (
    <div className="mb-3.5" role="group" aria-label="Gender">
      <span className={FIELD_LABEL} style={{ color: theme.sub }}>Gender</span>
      <div className="grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: "var(--fp-input)", border: `1px solid ${theme.line2}` }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className="h-11 rounded-xl text-[13.5px] font-extrabold transition-colors"
              style={on ? { background: "var(--fp-chip-on)", color: "var(--fp-chip-on-fg)", boxShadow: "0 6px 16px rgba(var(--fp-primary-rgb),0.25)" } : { color: theme.sub }}
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
  const { adminScope } = useAuth();
  const orgHierarchy = useOrgHierarchy();
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  // When adminScope.level === "shakha" (the default, unchanged case),
  // adminShakha is fixed to that one shakha — no picker, same read-only
  // badge as always. When the signed-in admin's own scope is a meghala or
  // diocese (covers multiple shakhas), adminShakha instead reflects
  // whichever shakha they've picked below via HierarchyPicker.
  const [selectedShakhaId, setSelectedShakhaId] = useState("");
  const pickerHierarchy: PickerHierarchy | null = useMemo(() => {
    if (!adminScope || adminScope.level === "shakha") return null;
    if (adminScope.level === "meghala") {
      return {
        dioceses: [],
        meghalas: [],
        shakhas: orgHierarchy.shakhas.filter((s) => s.meghala_id === adminScope.id),
        hierarchyLevel: "shakha",
      };
    }
    return {
      dioceses: [],
      meghalas: orgHierarchy.meghalas.filter((m) => m.diocese_id === adminScope.id),
      shakhas: orgHierarchy.shakhas,
      hierarchyLevel: "meghala",
    };
  }, [adminScope, orgHierarchy.meghalas, orgHierarchy.shakhas]);
  const adminShakha = useMemo(() => {
    if (!adminScope) return null;
    if (adminScope.level === "shakha") return { id: adminScope.id, name: adminScope.name };
    const sh = orgHierarchy.shakhas.find((s) => s.id === selectedShakhaId);
    return sh ? { id: sh.id, name: sh.name } : null;
  }, [adminScope, selectedShakhaId, orgHierarchy.shakhas]);
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState("");
  const { busy: submitting, run } = useSubmitLock(setServerError);
  const [form, setForm] = useState({ name: "", houseName: "", dob: "", gender: "", phone: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedTeams, setPickedTeams] = useState<string[]>([]);
  const [shakhaCounts, setShakhaCounts] = useState<Record<string, number>>({});
  // Members already on the scope's team, per team event, and the scope's
  // name (the team is named after it).
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [teamScopeName, setTeamScopeName] = useState("");
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // A new date of birth or gender changes which events fit: start over.
    if ((k === "dob" || k === "gender") && form[k] !== v) {
      setPicked([]);
      setPickedTeams([]);
    }
  };

  useEffect(() => { fetchCompetitionCategories().then(setCategories); }, []);
  const catSlug = getCategorySlug(form.dob, categories);

  const toggle = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const cap = feast?.competitions.find((c) => c.id === id)?.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
      return p.length >= 2 || (shakhaCounts[id] ?? 0) >= cap ? p : [...p, id];
    });
  const teamMax = (c: FeastCompetitionUI) => c.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS;
  const toggleTeam = (c: FeastCompetitionUI) =>
    setPickedTeams((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : (teamCounts[c.id] ?? 0) >= teamMax(c) ? p : [...p, c.id]));

  // Mirrors the backend cap check (resolveCapScopeShakhaIds /
  // findFullCompetitionsForShakha in actions/feast.ts): at hierarchy_level
  // 'meghala'/'diocese' the same max_per_shakha cap is shared across every
  // shakha under that meghala/diocese, not just adminShakha itself — so a
  // slot filled by a sibling shakha must show as full here too, or the FE
  // lets it through only for the save to fail with the server's cap error.
  // Team events count the same scope's one team (see lib/scope-teams).
  useEffect(() => {
    if (!adminShakha || !feast) return;
    const compIds = feast.competitions.filter((c) => c.cat === "Individual").map((c) => c.id);
    const teamIds = feast.competitions.filter((c) => c.cat === "Team").map((c) => c.id);
    if (compIds.length === 0 && teamIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const scope = await resolveCapScope(supabase, adminShakha.id);
      const [counts, teams] = await Promise.all([
        countScopeRegistrations(supabase, compIds, scope.shakhaIds),
        loadScopeTeams(supabase, teamIds, scope.shakhaIds),
      ]);
      if (cancelled) return;
      setShakhaCounts(counts);
      setTeamCounts(Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.members])));
      setTeamScopeName(scope.name);
    })();
    return () => { cancelled = true; };
  }, [adminShakha, feast]);

  const step1ok = !!(form.name.trim() && form.dob && form.gender && adminShakha);

  function submit() {
    if (!feast) return;
    run(async () => {
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
        teamCompetitionIds: pickedTeams,
      });
      if ("error" in result) {
        setServerError(result.error);
        return "release";
      }
      const compName = (id: string) => feast.competitions.find((c) => c.id === id)?.name ?? id;
      const params = new URLSearchParams({
        regNo: result.regNo, name: form.name, houseName: form.houseName, shakha: adminShakha?.name ?? "",
        dob: form.dob, gender: form.gender, category: catSlug, phone: form.phone,
        comps: [...picked.map(compName), ...pickedTeams.map((id) => `${compName(id)} (Team)`)].join("|"),
      });
      router.push(`/feast/${slug}/success?${params.toString()}`);
      return "leaving";
    });
  }

  if (!feast) {
    return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;
  }
  if (feast.status === "Completed") return <RegistrationClosed slug={slug} feastName={feast.name} />;

  const fits = (c: FeastCompetitionUI) => {
    const ng = normGender(c.gender);
    const genderOk = !ng || ng === "common" || ng === normGender(form.gender);
    const catOk = !c.competitionCategorySlug || c.competitionCategorySlug === catSlug;
    return genderOk && catOk;
  };
  const eligibleComps = feast.competitions.filter((c) => c.cat === "Individual" && fits(c));
  const eligibleTeams = feast.competitions.filter((c) => c.cat === "Team" && fits(c));
  const chosen = [
    ...picked.map((id) => ({ id, team: false })),
    ...pickedTeams.map((id) => ({ id, team: true })),
  ].map(({ id, team }) => ({ id, team, name: feast.competitions.find((c) => c.id === id)?.name ?? "" }));

  const summarySidebar = (
    <GlassPanel strong className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.gold }}>Registering for</p>
      <p className="mt-0.5 text-[17px] font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{feast.name}</p>
      <p className="mt-1 text-[12.5px]" style={{ color: theme.sub }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>

      <div className="mt-4 space-y-2.5" style={{ borderTop: `1px solid ${theme.hairline}`, paddingTop: 14 }}>
        {form.name ? (
          <SummaryRow label="Name" value={form.name} />
        ) : (
          <p className="text-[12px]" style={{ color: theme.faint }}>Fill in the form to see your registration summary here.</p>
        )}
        {form.houseName && <SummaryRow label="House Name" value={form.houseName} />}
        {form.dob && <SummaryRow label="Date of Birth" value={form.dob} />}
        {catSlug && <SummaryRow label="Category" value={CATEGORY_LABELS[catSlug] ?? catSlug} color={CATEGORY_COLORS[catSlug]} />}
        {form.gender && <SummaryRow label="Gender" value={form.gender.charAt(0).toUpperCase() + form.gender.slice(1)} />}
        {form.phone && <SummaryRow label="Phone" value={form.phone} />}
        {adminShakha && <SummaryRow label="Shakha" value={adminShakha.name} />}
      </div>

      {step >= 1 && (
        <div className="mt-4" style={{ borderTop: `1px solid ${theme.hairline}`, paddingTop: 14 }}>
          <p className="mb-2 text-[12.5px] font-semibold" style={{ color: theme.text }}>Competitions ({chosen.length})</p>
          {chosen.length === 0 ? (
            <p className="text-[12px]" style={{ color: theme.faint }}>None selected yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chosen.map((c) => (
                <span key={c.id} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: theme.text, background: "rgba(var(--fp-primary-rgb),0.10)", border: "1px solid rgba(var(--fp-primary-rgb),0.20)" }}>
                  {c.name}{c.team && <span style={{ color: theme.faint }}> · Team</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );

  return (
    <div>
      <FeastTopBar title={`Register · ${feast.name}`} onBack={() => (step === 0 ? router.push(`/feast/${slug}`) : setStep((s) => s - 1))} />
      <div className="mb-4"><StepDots steps={STEPS} current={step} /></div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
        <div className="min-w-0">

      {step === 0 && (
        <div>
          <GlassPanel className="mb-3.5 p-4">
            <TextField label="Full Name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Ann Maria Joy" icon={User} />
            <TextField label="House Name" value={form.houseName} onChange={(v) => set("houseName", v)} placeholder="e.g. Thekkedath House" />
            <DateField label="Date of Birth" value={form.dob} onChange={(v) => set("dob", v)} />
            <CategoryPill slug={catSlug} />
            <GenderPicker value={form.gender} onChange={(v) => set("gender", v)} />
            <TextField label="Phone (optional)" value={form.phone} onChange={(v) => set("phone", v.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" type="tel" icon={Phone} />
            {adminScope?.level === "shakha" && adminShakha && (
              <div className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5" style={{ background: theme.fillStrong, border: "1px solid rgba(var(--fp-primary-rgb),0.13)" }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: theme.purple }} />
                <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{adminShakha.name}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: theme.faint }}>Your Shakha</span>
              </div>
            )}
            {adminScope && adminScope.level !== "shakha" && pickerHierarchy && (
              <div>
                <label className="fp-cap mb-2 block text-[10.5px]" style={{ color: theme.sub }}>
                  Shakha (within {adminScope.name})
                </label>
                <HierarchyPicker value={selectedShakhaId} onChange={setSelectedShakhaId} hierarchy={pickerHierarchy} className={PUBLIC_SELECT_CLASS} />
              </div>
            )}
          </GlassPanel>
          <GlowBtn variant="primary" size="lg" className="w-full" disabled={!step1ok} onClick={() => setStep(1)}>Continue</GlowBtn>
          {!step1ok && (
            <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>
              {!adminShakha && adminScope?.level !== "shakha" ? "Select your Shakha, and fill in name, date of birth and gender" : "Name, date of birth and gender are required"}
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] leading-relaxed" style={{ color: theme.sub }}>Showing competitions for your category. Select the ones you&apos;d like to enter.</p>
            <span className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= 2 ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{picked.length} / 2</span>
          </div>
          {picked.length >= 2 && <div className="mb-3 rounded-[14px] px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)", border: "1px solid color-mix(in srgb, var(--fp-warn) 30%, transparent)" }}>Maximum 2 competitions allowed. Deselect one to change.</div>}
          {eligibleComps.length === 0 ? (
            <div className="rounded-2xl px-4 py-10 text-center" style={{ background: theme.fill }}>
              <p className="mb-1 text-sm font-semibold" style={{ color: theme.sub }}>No individual competitions available</p>
              <p className="text-xs" style={{ color: theme.faint }}>No individual events match this age group or gender.{eligibleTeams.length > 0 ? " Team events are below." : ""}</p>
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
                    boxShadow: on ? `0 0 0 3px rgba(var(--fp-primary-rgb),0.18), ${theme.softShadow}` : undefined,
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
                      {c.competitionCategorySlug && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{CATEGORY_LABELS[c.competitionCategorySlug]}</span>}
                      {full && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>Slot full (max {cap})</span>}
                    </div>
                  </div>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" } : { background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
                    {on && <Check className="h-[15px] w-[15px] text-white" />}
                  </div>
                </GlassPanel>
              );
            })
          )}
          <TeamEventList
            comps={eligibleTeams}
            picked={pickedTeams}
            counts={teamCounts}
            scopeName={teamScopeName}
            personName={form.name}
            accent={feast.accent}
            onToggle={toggleTeam}
          />
          <div className="mb-3 mt-3.5 flex items-center justify-between px-0.5">
            <span className="text-[13px]" style={{ color: theme.sub }}>Selected</span>
            <span className="text-[15px] font-bold" style={{ color: theme.text }}>{chosen.length} event{chosen.length !== 1 ? "s" : ""}</span>
          </div>
          <GlowBtn variant="primary" size="lg" className="w-full" onClick={() => setStep(2)}>Review Registration</GlowBtn>
          {chosen.length === 0 && <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>No events selected — you can still register now and add events later from My registrations.</p>}
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
              <div className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Competitions ({chosen.length})</div>
              {chosen.length === 0 ? (
                <p className="text-xs" style={{ color: theme.faint }}>None — you can add events later from My registrations.</p>
              ) : (
                <div className="flex flex-wrap gap-[7px]">
                  {chosen.map((c) => (
                    <span key={c.id} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: "rgba(var(--fp-primary-rgb),0.18)", border: "1px solid rgba(var(--fp-primary-rgb),0.33)" }}>
                      {c.name}{c.team && <span style={{ color: theme.sub }}> · {teamScopeName ? `${teamScopeName} team` : "Team"}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>
          {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
          <GlowBtn variant="gold" size="lg" className="w-full" loading={submitting} onClick={submit}>{submitting ? "Registering…" : "Confirm Registration"}</GlowBtn>
          <p className="mt-2.5 text-center text-[11.5px]" style={{ color: theme.faint }}>Registering under <strong>{adminShakha?.name ?? "your shakha"}</strong></p>
        </div>
      )}

        </div>

        {/* Live summary — wide screens only, updates as the form is filled */}
        <div className="sticky top-4 hidden lg:block">{summarySidebar}</div>
      </div>
      {submitting && <ProcessingOverlay label="Registering…" />}
    </div>
  );
}

// Team events, after the individual ones. Picking one puts this person on
// their scope's team for it (created by the scope's first registration).
// `counts` are members already on each team, not counting this person; a
// team at its member limit can't be picked.
export function TeamEventList({ comps, picked, counts, scopeName, personName, accent, onToggle }: {
  comps: FeastCompetitionUI[];
  picked: string[];
  counts: Record<string, number>;
  scopeName: string;
  personName: string;
  accent: string;
  onToggle: (c: FeastCompetitionUI) => void;
}) {
  const headingId = useId();
  if (comps.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <div className="mb-2 flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1" style={{ background: theme.line2 }} />
        <h3 id={headingId} className="fp-cap m-0 flex items-center gap-1.5 text-[10.5px]" style={{ color: theme.sub }}>
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Team events
        </h3>
        <span aria-hidden="true" className="h-px flex-1" style={{ background: theme.line2 }} />
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: theme.sub }}>
        Adds <strong style={{ color: theme.text }}>{personName.trim() || "this person"}</strong> to the{" "}
        {scopeName ? <strong style={{ color: theme.text }}>{scopeName}</strong> : "your"} team. The first registration starts the team.
      </p>
      {comps.map((c) => {
        const on = picked.includes(c.id);
        const max = c.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS;
        const count = counts[c.id] ?? 0;
        const full = !on && count >= max;
        const shown = count + (on ? 1 : 0);
        return (
          <GlassPanel
            key={c.id}
            role="checkbox"
            aria-checked={on}
            aria-disabled={full || undefined}
            tabIndex={full ? -1 : 0}
            onClick={() => !full && onToggle(c)}
            onKeyDown={(e) => {
              if (full || (e.key !== " " && e.key !== "Enter")) return;
              e.preventDefault();
              onToggle(c);
            }}
            className="mb-2.5 flex items-center gap-3 p-3 outline-none focus-visible:[box-shadow:0_0_0_3px_var(--fp-primary-light)]"
            style={{
              border: on ? `1px solid ${theme.lavender}` : undefined,
              boxShadow: on ? `0 0 0 3px rgba(var(--fp-primary-rgb),0.18), ${theme.softShadow}` : undefined,
              opacity: full ? 0.5 : 1,
              cursor: full ? "not-allowed" : "pointer",
            }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg" style={{ background: `${accent}26` }}>{c.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{c.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px]" style={{ color: theme.sub }}>Team{c.time ? ` · ${c.time}` : ""}</span>
                {c.competitionCategorySlug && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{CATEGORY_LABELS[c.competitionCategorySlug]}</span>}
                {full ? (
                  <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>Team full</span>
                ) : count === 0 && !on ? (
                  <span className="text-[10.5px] font-semibold" style={{ color: theme.faint }}>No team yet</span>
                ) : null}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-1 text-[11.5px] font-extrabold tabular-nums"
              style={full ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: theme.surface3, color: on ? theme.text : theme.sub, border: `1px solid ${theme.line2}` }}
              aria-label={`${shown} of ${max} members`}
            >
              <Users className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
              {shown}/{max}
            </span>
            <div aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" } : { background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
              {on && <Check className="h-[15px] w-[15px] text-white" />}
            </div>
          </GlassPanel>
        );
      })}
    </section>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px]" style={{ color: theme.faint }}>{label}</span>
      <span className="truncate text-[12.5px] font-semibold" style={{ color: color ?? theme.text, maxWidth: "60%" }}>{value}</span>
    </div>
  );
}
