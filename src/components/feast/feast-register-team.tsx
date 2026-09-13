"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Users } from "lucide-react";
import { useFeast, useFeastId } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { registerTeam } from "@/actions/team";
import { GlassPanel, GlowBtn, FeastTopBar, StepDots, theme } from "./feast-shared";

const STEPS = ["Competition", "Members", "Review"];
const DEFAULT_MAX_TEAM_MEMBERS = 7;

interface EligibleParticipant { id: string; name: string; houseName: string | null; }

export function FeastRegisterTeam({ slug }: { slug: string }) {
  const router = useRouter();
  const { feast } = useFeast(slug);
  const feastId = useFeastId(slug);
  const { session } = useAuth();
  const [adminShakha, setAdminShakha] = useState<{ id: string; name: string } | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);

  const [compId, setCompId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [takenCompIds, setTakenCompIds] = useState<Set<string>>(new Set());

  const [eligible, setEligible] = useState<EligibleParticipant[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("profiles").select("shakha_id, shakha:shakhas(id, name)").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (!data?.shakha_id) return;
      const sh = Array.isArray(data.shakha) ? data.shakha[0] : data.shakha;
      setAdminShakha({ id: data.shakha_id, name: sh?.name ?? "" });
    });
  }, [session]);

  useEffect(() => {
    if (adminShakha && !teamName) setTeamName(adminShakha.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminShakha]);

  useEffect(() => {
    if (!adminShakha || !feast) return;
    const teamCompIds = feast.competitions.filter((c) => c.cat === "Team").map((c) => c.id);
    if (teamCompIds.length === 0) return;
    supabase.from("team_registrations").select("feast_competition_id").eq("shakha_id", adminShakha.id).in("feast_competition_id", teamCompIds).then(({ data }) => {
      setTakenCompIds(new Set((data ?? []).map((r) => r.feast_competition_id)));
    });
  }, [adminShakha, feast]);

  useEffect(() => {
    if (!compId || !feastId || !adminShakha) { setEligible([]); return; }
    setLoadingEligible(true);
    setPicked([]);
    (async () => {
      const [{ data: participants }, { data: memberRows }] = await Promise.all([
        supabase.from("participants").select("id, name, house_name").eq("feast_id", feastId).eq("shakha_id", adminShakha.id),
        supabase.from("team_registration_members").select("participant_id").eq("feast_competition_id", compId),
      ]);
      const taken = new Set((memberRows ?? []).map((r) => r.participant_id));
      setEligible((participants ?? []).filter((p) => !taken.has(p.id)).map((p) => ({ id: p.id, name: p.name, houseName: p.house_name ?? null })));
      setLoadingEligible(false);
    })();
  }, [compId, feastId, adminShakha]);

  const maxTeamMembers = feast?.competitions.find((c) => c.id === compId)?.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxTeamMembers ? p : [...p, id]));

  const step0ok = !!(compId && teamName.trim());
  const step1ok = picked.length > 0;

  async function submit() {
    if (!adminShakha) return;
    setSubmitting(true);
    setServerError("");
    const result = await registerTeam({ feastId: feastId ?? "", feastCompetitionId: compId, shakhaId: adminShakha.id, teamName: teamName.trim(), participantIds: picked });
    setSubmitting(false);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setDone(true);
  }

  if (!feast) return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;

  if (done) {
    return (
      <div>
        <FeastTopBar title="Team Registered" onBack={() => router.push(`/feast/${slug}`)} />
        <GlassPanel strong className="mt-5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, #C026D3, #EC4899)" }}>
            <Check className="h-[26px] w-[26px] text-white" />
          </div>
          <p className="mb-1 text-[17px] font-bold" style={{ color: theme.text }}>Team Registered!</p>
          <p className="mb-5 text-[13px]" style={{ color: theme.sub }}>
            <strong>{teamName}</strong> has been entered for {feast.competitions.find((c) => c.id === compId)?.name}.
          </p>
          <div className="space-y-2.5">
            <GlowBtn variant="ghost" size="lg" className="w-full" onClick={() => { setDone(false); setStep(0); setCompId(""); setTeamName(""); }}>Register Another Team</GlowBtn>
            <GlowBtn variant="primary" size="lg" className="w-full" onClick={() => router.push(`/feast/${slug}`)}>Done</GlowBtn>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div>
      <FeastTopBar title={`Register Team · ${feast.name}`} onBack={() => (step === 0 ? router.push(`/feast/${slug}`) : setStep((s) => s - 1))} />
      <div className="mb-4"><StepDots steps={STEPS} current={step} /></div>

      {step === 0 && (
        <div>
          <GlassPanel className="mb-3.5 p-4">
            <label className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Competition</label>
            <div className="mb-3">
              {feast.competitions.filter((c) => c.cat === "Team").map((c) => {
                const on = compId === c.id;
                const taken = takenCompIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    disabled={taken}
                    onClick={() => setCompId(c.id)}
                    className="mb-2 flex w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left"
                    style={{ background: on ? `${theme.purple}1a` : "rgba(255,255,255,0.72)", border: `1px solid ${on ? theme.lavender : theme.hairline}`, opacity: taken ? 0.45 : 1, cursor: taken ? "not-allowed" : "pointer" }}
                  >
                    <span className="flex-1 text-[13.5px] font-semibold" style={{ color: theme.text }}>{c.name}</span>
                    {taken && <span className="text-[10.5px]" style={{ color: theme.faint }}>Team already registered</span>}
                    {on && <Check className="h-4 w-4" style={{ color: theme.purple }} />}
                  </button>
                );
              })}
              {feast.competitions.filter((c) => c.cat === "Team").length === 0 && <p className="py-4 text-center text-[12.5px]" style={{ color: theme.faint }}>No team competitions in this fest.</p>}
            </div>
            <label className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Team Name</label>
            <div className="flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${theme.hairline}` }}>
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Charity Warriors" className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none" style={{ color: theme.text }} />
            </div>
            {adminShakha && (
              <div className="mt-3 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5" style={{ background: theme.fillStrong, border: `1px solid ${theme.purple}22` }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: theme.purple }} />
                <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{adminShakha.name}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: theme.faint }}>Your Shakha</span>
              </div>
            )}
          </GlassPanel>
          <GlowBtn variant="pink" size="lg" className="w-full" disabled={!step0ok} onClick={() => setStep(1)}>Continue</GlowBtn>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] leading-relaxed" style={{ color: theme.sub }}>Pick up to {maxTeamMembers} registered participants from your Shakha.</p>
            <span className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= maxTeamMembers ? { background: "#fef3c7", color: "#b45309" } : { background: `${theme.purple}1a`, color: theme.purple }}>{picked.length} / {maxTeamMembers}</span>
          </div>
          {loadingEligible ? (
            <div className="flex justify-center py-10"><Loader2 className="h-[22px] w-[22px] animate-spin" style={{ color: theme.lavender }} /></div>
          ) : eligible.length === 0 ? (
            <div className="rounded-2xl py-10 text-center" style={{ background: theme.fill }}>
              <p className="mb-1 text-sm font-semibold" style={{ color: theme.sub }}>No eligible participants</p>
              <p className="text-xs" style={{ color: theme.faint }}>Register participants for your Shakha first, then form a team.</p>
            </div>
          ) : (
            eligible.map((p) => {
              const on = picked.includes(p.id);
              return (
                <GlassPanel key={p.id} pressable className="mb-2.5 flex cursor-pointer items-center gap-3 p-3" onClick={() => toggle(p.id)} style={{ border: on ? `1px solid ${theme.lavender}` : undefined, boxShadow: on ? `0 0 0 3px ${theme.purple}2e, ${theme.softShadow}` : undefined }}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${theme.purple}1a` }}>
                    <Users className="h-4 w-4" style={{ color: theme.lavender }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{p.name}</div>
                    {p.houseName && <div className="text-[11px]" style={{ color: theme.sub }}>{p.houseName}</div>}
                  </div>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,#C026D3,#EC4899)" } : { background: "rgba(255,255,255,0.72)", border: `1px solid ${theme.hairline}` }}>
                    {on && <Check className="h-[15px] w-[15px] text-white" />}
                  </div>
                </GlassPanel>
              );
            })
          )}
          <GlowBtn variant="pink" size="lg" className="mt-3.5 w-full" disabled={!step1ok} onClick={() => setStep(2)}>Review Team</GlowBtn>
        </div>
      )}

      {step === 2 && (
        <div>
          <GlassPanel strong className="mb-3.5 p-[18px]">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.gold }}>Confirm team details</div>
            {[["Team Name", teamName], ["Competition", feast.competitions.find((c) => c.id === compId)?.name ?? "—"], ["Shakha", adminShakha?.name ?? "—"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${theme.hairline}` }}>
                <span className="text-[12.5px]" style={{ color: theme.faint }}>{k}</span>
                <span className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{v}</span>
              </div>
            ))}
            <div className="mt-3">
              <div className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>Members ({picked.length})</div>
              <div className="flex flex-wrap gap-[7px]">
                {picked.map((id) => (
                  <span key={id} className="rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold" style={{ color: theme.text, background: `${theme.purple}2e`, border: `1px solid ${theme.purple}55` }}>{eligible.find((p) => p.id === id)?.name}</span>
                ))}
              </div>
            </div>
          </GlassPanel>
          {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
          <GlowBtn variant="gold" size="lg" className="w-full" disabled={submitting} loading={submitting} onClick={submit}>Confirm Team Registration</GlowBtn>
        </div>
      )}
    </div>
  );
}
