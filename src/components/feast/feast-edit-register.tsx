"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { useFeast, type FeastCompetitionUI } from "@/hooks/use-feast";
import { supabase } from "@/lib/supabase";
import { updateParticipant, deleteParticipant } from "@/actions/feast";
import { countScopeRegistrations, loadScopeTeams, resolveCapScope } from "@/lib/reg-cap-scope";
import { fetchCompetitionCategories, getCategorySlug } from "@/lib/competition-categories";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { GlassPanel, GlowBtn, FeastTopBar, ProcessingOverlay, StepDots, theme, CATEGORY_COLORS, CATEGORY_LABELS, useSubmitLock } from "./feast-shared";
import { TextField, DateField, CategoryPill, GenderPicker, TeamEventList, normGender, DEFAULT_MAX_PER_SHAKHA } from "./feast-register";
import type { CompetitionCategory } from "@/types";

const STEPS = ["Details", "Events", "Review"];

export function FeastEditRegister({ slug, participantId }: { slug: string; participantId: string }) {
  const router = useRouter();
  const { feast } = useFeast(slug);
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [serverError, setServerError] = useState("");
  // Save and delete share one lock: neither can start while the other runs.
  const { busy: submitting, run } = useSubmitLock(setServerError);
  const [busyLabel, setBusyLabel] = useState("Saving changes…");
  const [form, setForm] = useState({ name: "", houseName: "", dob: "", gender: "", phone: "" });
  const [picked, setPicked] = useState<string[]>([]);
  // Team events they're on when the page opened, and what's picked now.
  const [onTeams, setOnTeams] = useState<string[]>([]);
  const [pickedTeams, setPickedTeams] = useState<string[]>([]);
  const [shakhaId, setShakhaId] = useState<string | null>(null);
  const [shakhaCounts, setShakhaCounts] = useState<Record<string, number>>({});
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [teamScopeName, setTeamScopeName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { fetchCompetitionCategories().then(setCategories); }, []);
  const catSlug = getCategorySlug(form.dob, categories);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: regs }, { data: teams }] = await Promise.all([
        supabase.from("participants").select("name, house_name, date_of_birth, gender, phone, shakha_id").eq("id", participantId).single(),
        supabase.from("participant_registrations").select("feast_competition_id").eq("participant_id", participantId),
        supabase.from("team_registration_members").select("feast_competition_id").eq("participant_id", participantId),
      ]);
      const teamIds = (teams ?? []).map((t) => t.feast_competition_id);
      setOnTeams(teamIds);
      setPickedTeams(teamIds);
      if (p) {
        setForm({
          name: p.name,
          houseName: p.house_name ?? "",
          dob: p.date_of_birth ?? "",
          gender: normGender(p.gender) ?? "",
          phone: p.phone ?? "",
        });
        setShakhaId(p.shakha_id);
      }
      setPicked((regs ?? []).map((r) => r.feast_competition_id));
      setLoaded(true);
    })();
  }, [participantId]);

  // Mirrors feast-register.tsx's cap-scope check (and the backend's
  // findFullCompetitionsForShakha) — without it this page never masked any
  // competition as full at all, since shakhaCounts was declared but never
  // populated, letting an over-cap swap through to a server-side rejection
  // at save. excludeParticipantId keeps this participant's own existing
  // picks from counting against themselves.
  // Team counts leave this participant out too, so a team they're already
  // on reads as "with them" and never as full against them.
  useEffect(() => {
    if (!shakhaId || !feast || !loaded) return;
    const compIds = feast.competitions.filter((c) => c.cat === "Individual").map((c) => c.id);
    const teamIds = feast.competitions.filter((c) => c.cat === "Team").map((c) => c.id);
    if (compIds.length === 0 && teamIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const scope = await resolveCapScope(supabase, shakhaId);
      const [counts, teams] = await Promise.all([
        countScopeRegistrations(supabase, compIds, scope.shakhaIds, participantId),
        loadScopeTeams(supabase, teamIds, scope.shakhaIds),
      ]);
      if (cancelled) return;
      setShakhaCounts(counts);
      setTeamCounts(Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, Math.max(0, t.members - (onTeams.includes(id) ? 1 : 0))])));
      setTeamScopeName(scope.name);
    })();
    return () => { cancelled = true; };
  }, [shakhaId, feast, participantId, loaded, onTeams]);

  const toggle = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const cap = feast?.competitions.find((c) => c.id === id)?.maxPerShakha ?? DEFAULT_MAX_PER_SHAKHA;
      return p.length >= 2 || (shakhaCounts[id] ?? 0) >= cap ? p : [...p, id];
    });
  const toggleTeam = (c: FeastCompetitionUI) =>
    setPickedTeams((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : (teamCounts[c.id] ?? 0) >= (c.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS) ? p : [...p, c.id]));

  const step1ok = !!(form.name.trim() && form.dob && form.gender);
  const step2ok = picked.length + pickedTeams.length > 0;

  function submit() {
    run(async () => {
      setBusyLabel("Saving changes…");
      setServerError("");
      const result = await updateParticipant({
        participantId,
        name: form.name,
        houseName: form.houseName,
        dob: form.dob,
        gender: form.gender,
        phone: form.phone,
        feastCompetitionIds: picked,
        teamCompetitionIds: pickedTeams,
      });
      if (result.error) {
        setServerError(result.error);
        return "release";
      }
      router.push(`/feast/${slug}/registrations`);
      return "leaving";
    });
  }

  function handleDelete() {
    run(async () => {
      setBusyLabel("Removing registration…");
      setServerError("");
      const result = await deleteParticipant(participantId);
      if (result.error) {
        setServerError(result.error);
        return "release";
      }
      router.push(`/feast/${slug}/registrations`);
      return "leaving";
    });
  }

  if (!feast || !loaded) return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;

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
              {serverError && <p className="mb-2 text-xs" style={{ color: "#b91c1c" }}>{serverError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setConfirmingDelete(false)} className="flex-1 rounded-lg border border-[var(--fp-line-2)] bg-[var(--fp-surface)] py-1.5 text-sm text-[var(--fp-ink)]">Cancel</button>
                <button onClick={handleDelete} disabled={submitting} className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Yes, Delete</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] leading-relaxed" style={{ color: theme.sub }}>Update competitions. Saving replaces all selections.</p>
            <span className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= 2 ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{picked.length} / 2</span>
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
                  {c.competitionCategorySlug && <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{CATEGORY_LABELS[c.competitionCategorySlug]}</span>}
                </div>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,var(--fp-primary),var(--fp-primary-light))" } : { background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
                  {on && <Check className="h-[15px] w-[15px] text-white" />}
                </div>
              </GlassPanel>
            );
          })}
          <TeamEventList
            comps={eligibleTeams}
            picked={pickedTeams}
            counts={teamCounts}
            scopeName={teamScopeName}
            personName={form.name}
            accent={feast.accent}
            onToggle={toggleTeam}
          />
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
              <div className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Competitions ({chosen.length})</div>
              <div className="flex flex-wrap gap-[7px]">
                {chosen.map((c) => (
                  <span key={c.id} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: "rgba(var(--fp-primary-rgb),0.18)" }}>
                    {c.name}{c.team && <span style={{ color: theme.sub }}> · {teamScopeName ? `${teamScopeName} team` : "Team"}</span>}
                  </span>
                ))}
              </div>
            </div>
          </GlassPanel>
          {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
          <GlowBtn variant="gold" size="lg" className="w-full" loading={submitting} onClick={submit}>{submitting ? "Saving…" : "Save Changes"}</GlowBtn>
        </div>
      )}
      {submitting && <ProcessingOverlay label={busyLabel} />}
    </div>
  );
}
