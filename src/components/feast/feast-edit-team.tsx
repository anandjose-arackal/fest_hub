"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateTeam, deleteTeam } from "@/actions/team";
import { resolveCapScopeShakhaIds } from "@/lib/reg-cap-scope";
import { GlassPanel, GlowBtn, FeastTopBar, ProcessingOverlay, theme, useSubmitLock } from "./feast-shared";

const DEFAULT_MAX_TEAM_MEMBERS = 7;

interface Participant { id: string; name: string; houseName: string | null; }

export function FeastEditTeam({ slug, teamId }: { slug: string; teamId: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [compName, setCompName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState(DEFAULT_MAX_TEAM_MEMBERS);
  const [eligible, setEligible] = useState<Participant[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  // Save and delete share one lock: neither can start while the other runs.
  const { busy: submitting, run } = useSubmitLock(setServerError);
  const [busyLabel, setBusyLabel] = useState("Saving changes…");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: team } = await supabase
        .from("team_registrations")
        .select("team_name, shakha_id, feast_id, feast_competition_id, feast_competition:feast_competitions(competition:competitions(name, max_team_size))")
        .eq("id", teamId)
        .single();
      if (!team) { setLoaded(true); return; }
      setTeamName(team.team_name);
      const fc = Array.isArray(team.feast_competition) ? team.feast_competition[0] : team.feast_competition;
      const comp = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
      setCompName(comp?.name ?? "—");
      setMaxTeamSize(comp?.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS);

      // Members can come from any shakha in the team's cap scope (one team
      // per meghala/diocese at those hierarchy levels).
      const scopeShakhaIds = await resolveCapScopeShakhaIds(supabase, team.shakha_id);
      const [{ data: participants }, { data: memberRows }, { data: currentMembers }] = await Promise.all([
        supabase.from("participants").select("id, name, house_name").eq("feast_id", team.feast_id).in("shakha_id", scopeShakhaIds).order("name"),
        supabase.from("team_registration_members").select("participant_id, team_registration_id").eq("feast_competition_id", team.feast_competition_id),
        supabase.from("team_registration_members").select("participant_id").eq("team_registration_id", teamId),
      ]);
      const takenByOthers = new Set((memberRows ?? []).filter((r) => r.team_registration_id !== teamId).map((r) => r.participant_id));
      setEligible((participants ?? []).filter((p) => !takenByOthers.has(p.id)).map((p) => ({ id: p.id, name: p.name, houseName: p.house_name })));
      setPicked((currentMembers ?? []).map((m) => m.participant_id));
      setLoaded(true);
    })();
  }, [teamId]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxTeamSize ? p : [...p, id]));
  const canSave = teamName.trim() && picked.length > 0;

  function submit() {
    run(async () => {
      setBusyLabel("Saving changes…");
      setServerError("");
      const result = await updateTeam({ teamId, teamName: teamName.trim(), participantIds: picked });
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
      setBusyLabel("Deleting team…");
      setServerError("");
      const result = await deleteTeam(teamId);
      if (result.error) {
        setServerError(result.error);
        return "release";
      }
      router.push(`/feast/${slug}/registrations`);
      return "leaving";
    });
  }

  if (!loaded) return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;

  return (
    <div>
      <FeastTopBar title="Edit Team" onBack={() => router.push(`/feast/${slug}/registrations`)} />
      <GlassPanel className="mb-3.5 p-4">
        <p className="mb-3 text-xs" style={{ color: theme.faint }}>Competition: <strong style={{ color: theme.text }}>{compName}</strong></p>
        <label className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Team Name</label>
        <div className="mb-3 flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none" style={{ color: theme.text }} />
        </div>
        <p className="mb-2 text-sm" style={{ color: theme.sub }}>Update the team roster. Saving replaces all members.</p>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: theme.faint }}>Members</span>
          <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= maxTeamSize ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{picked.length} / {maxTeamSize}</span>
        </div>
        {eligible.map((p) => {
          const on = picked.includes(p.id);
          return (
            <div key={p.id} onClick={() => toggle(p.id)} className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl p-3" style={{ background: "var(--fp-input)", border: on ? `1px solid ${theme.lavender}` : "1px solid rgba(255,255,255,0.8)" }}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(var(--fp-primary-rgb),0.10)" }}><Users className="h-4 w-4" style={{ color: theme.lavender }} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>{p.name}</div>
                {p.houseName && <div className="text-[11px]" style={{ color: theme.sub }}>{p.houseName}</div>}
              </div>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={on ? { background: "linear-gradient(135deg,var(--fp-primary),var(--fp-accent))" } : { background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
                {on && <Check className="h-[15px] w-[15px] text-white" />}
              </div>
            </div>
          );
        })}
      </GlassPanel>

      {serverError && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
      <GlowBtn variant="gold" size="lg" className="w-full" disabled={!canSave} loading={submitting} onClick={submit}>{submitting ? "Saving…" : "Save Changes"}</GlowBtn>

      {!confirmingDelete ? (
        <button onClick={() => setConfirmingDelete(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-sm font-semibold" style={{ background: "#fee2e2", color: "#ef4444" }}>
          <Trash2 className="h-4 w-4" /> Delete Team Registration
        </button>
      ) : (
        <div className="mt-3 rounded-[14px] p-3" style={{ background: "#fee2e2" }}>
          <p className="mb-2 text-sm" style={{ color: "#b91c1c" }}>Delete this team permanently?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmingDelete(false)} className="flex-1 rounded-lg border border-[var(--fp-line-2)] bg-[var(--fp-surface)] py-1.5 text-sm text-[var(--fp-ink)]">Cancel</button>
            <button onClick={handleDelete} disabled={submitting} className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Yes, Delete</button>
          </div>
        </div>
      )}
      {submitting && <ProcessingOverlay label={busyLabel} />}
    </div>
  );
}
