"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetch-all";
import { updateParticipant } from "@/actions/feast";
import { updateTeam, deleteTeam } from "@/actions/team";
import { resolveCapScopeShakhaIds } from "@/lib/reg-cap-scope";
import { GlassPanel, GlowBtn, FeastTopBar, ProcessingOverlay, theme, useSubmitLock } from "./feast-shared";
import { DateField, GenderPicker, normGender, TextField } from "./feast-register";
import { ParticipantPhotoField } from "./participant-photo-field";
import { AddMemberPanel, personLine, type TeamPerson } from "./feast-team-members";
import { useOrgHierarchy } from "@/hooks/use-feast";

const DEFAULT_MAX_TEAM_MEMBERS = 7;

type Participant = TeamPerson;
interface MemberDraft {
  participantId: string;
  name: string;
  houseName: string;
  dob: string;
  gender: string;
  phone: string;
  photoUrl: string | null;
  originalPhotoUrl: string | null;
}

export function FeastEditTeam({ slug, teamId }: { slug: string; teamId: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [compName, setCompName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState(DEFAULT_MAX_TEAM_MEMBERS);
  const [compGender, setCompGender] = useState<string | null>(null);
  const [scopeShakhaIds, setScopeShakhaIds] = useState<string[]>([]);
  const hierarchy = useOrgHierarchy();
  const [eligible, setEligible] = useState<Participant[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  // Save and delete share one lock: neither can start while the other runs.
  const { busy: submitting, run } = useSubmitLock(setServerError);
  const [busyLabel, setBusyLabel] = useState("Saving changes…");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feast, setFeast] = useState<{ id: string; requires_dob: boolean; house_label: string; registration_edit_deadline: string | null } | null>(null);
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: team } = await supabase
        .from("team_registrations")
        .select("team_name, shakha_id, feast_id, feast_competition_id, feast:feasts(id, requires_dob, house_label, registration_edit_deadline), feast_competition:feast_competitions(competition:competitions(name, gender, max_team_size))")
        .eq("id", teamId)
        .single();
      if (!team) { setLoaded(true); return; }
      setTeamName(team.team_name);
      setFeast((Array.isArray(team.feast) ? team.feast[0] : team.feast) ?? null);
      const fc = Array.isArray(team.feast_competition) ? team.feast_competition[0] : team.feast_competition;
      const comp = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
      setCompName(comp?.name ?? "—");
      setMaxTeamSize(comp?.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS);
      setCompGender(comp?.gender ?? null);

      // Members can come from any shakha in the team's cap scope (one team
      // per meghala/diocese at those hierarchy levels).
      const scopeShakhaIds = await resolveCapScopeShakhaIds(supabase, team.shakha_id);
      setScopeShakhaIds(scopeShakhaIds);
      const [{ data: participants }, { data: memberRows }, { data: currentMembers }] = await Promise.all([
        fetchAll((from, to) => supabase.from("participants").select("id, name, house_name, registration_number, shakha_id").eq("feast_id", team.feast_id).in("shakha_id", scopeShakhaIds).order("name").order("id").range(from, to)),
        supabase.from("team_registration_members").select("participant_id, team_registration_id").eq("feast_competition_id", team.feast_competition_id),
        supabase.from("team_registration_members").select("participant_id").eq("team_registration_id", teamId),
      ]);
      const takenByOthers = new Set((memberRows ?? []).filter((r) => r.team_registration_id !== teamId).map((r) => r.participant_id));
      setEligible((participants ?? []).filter((p) => !takenByOthers.has(p.id)).map((p) => ({ id: p.id, name: p.name, houseName: p.house_name, regNo: p.registration_number, shakhaId: p.shakha_id })));
      setPicked((currentMembers ?? []).map((m) => m.participant_id));
      setLoaded(true);
    })();
  }, [teamId]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxTeamSize ? p : [...p, id]));
  const scopeShakhas = useMemo(() => {
    const ids = new Set(scopeShakhaIds);
    return hierarchy.shakhas.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  }, [scopeShakhaIds, hierarchy.shakhas]);
  const names = useMemo(() => (scopeShakhas.length > 1 ? new Map(scopeShakhas.map((s) => [s.id, s.name])) : null), [scopeShakhas]);
  const members = picked.map((id) => eligible.find((p) => p.id === id)).filter((p): p is Participant => !!p);
  const candidates = useMemo(() => eligible.filter((p) => !picked.includes(p.id)), [eligible, picked]);
  // From the search (existing participant) or just registered: on the team, and known to the list.
  function addPerson(p: Participant) {
    setEligible((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]));
    setPicked((list) => (list.includes(p.id) || list.length >= maxTeamSize ? list : [...list, p.id]));
  }
  const canSave = teamName.trim() && picked.length > 0;
  const canEditMembers = feast && (!feast.registration_edit_deadline || Date.now() < Date.parse(feast.registration_edit_deadline));

  function openMember(participantId: string) {
    if (!feast || !canEditMembers) return;
    run(async () => {
      setBusyLabel("Loading participant…");
      setServerError("");
      const { data, error } = await supabase
        .from("participants")
        .select("name, house_name, date_of_birth, gender, phone, photo_url")
        .eq("feast_id", feast.id)
        .eq("id", participantId)
        .single();
      if (error || !data) {
        setServerError("Could not load participant details.");
      } else {
        setMemberDraft({
          participantId,
          name: data.name,
          houseName: data.house_name ?? "",
          dob: data.date_of_birth ?? "",
          gender: normGender(data.gender) ?? data.gender ?? "",
          phone: data.phone ?? "",
          photoUrl: data.photo_url ?? null,
          originalPhotoUrl: data.photo_url ?? null,
        });
      }
      return "release";
    });
  }

  function changeMember(patch: Partial<MemberDraft>) {
    setMemberDraft((draft) => draft && { ...draft, ...patch });
  }

  function saveMember() {
    if (!memberDraft || !canEditMembers || photoBusy) return;
    const name = memberDraft.name.trim();
    if (!name || (feast.requires_dob && !memberDraft.dob)) return;
    run(async () => {
      setBusyLabel("Saving participant details…");
      setServerError("");
      const houseName = memberDraft.houseName.trim();
      const { originalPhotoUrl, photoUrl, ...details } = memberDraft;
      const result = await updateParticipant({
        ...details, name, houseName, photoUrl: photoUrl === originalPhotoUrl ? undefined : photoUrl,
      });
      if (result.error) {
        setServerError(result.error);
      } else {
        setEligible((people) => people.map((p) => p.id === memberDraft.participantId ? { ...p, name, houseName } : p));
        setMemberDraft(null);
      }
      return "release";
    });
  }

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
    <div className="mx-auto w-full max-w-[640px]">
      <FeastTopBar title="Edit Team" onBack={() => router.push(`/feast/${slug}/registrations`)} />
      <GlassPanel className="mb-3.5 p-4">
        <p className="mb-3 text-xs" style={{ color: theme.faint }}>Competition: <strong style={{ color: theme.text }}>{compName}</strong></p>
        <label className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Team Name</label>
        <div className="mb-3 flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none" style={{ color: theme.text }} />
        </div>
        <p className="mb-2 text-sm" style={{ color: theme.sub }}>Add or remove members, then save. Saving replaces the roster.</p>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: theme.faint }}>Members</span>
          <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={picked.length >= maxTeamSize ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{picked.length} / {maxTeamSize}</span>
        </div>
        {members.map((p) => {
          return (
            <div key={p.id} className="mb-2 rounded-xl" style={{ background: "var(--fp-input)", border: `1px solid ${theme.lavender}` }}>
              <div className="flex items-center gap-1 pr-2">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(var(--fp-primary-rgb),0.10)" }}><Users className="h-4 w-4" style={{ color: theme.lavender }} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold" style={{ color: theme.text }}>{p.name}</span>
                    <span className="block truncate text-[11px]" style={{ color: theme.sub }}>{personLine(p, names)}</span>
                  </span>
                </div>
                {canEditMembers && (
                  <button type="button" aria-label={`Edit details for ${p.name}`} aria-expanded={memberDraft?.participantId === p.id} onClick={() => openMember(p.id)} disabled={submitting || !!memberDraft} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--fp-link)] disabled:opacity-50">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                )}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)} disabled={submitting || !!memberDraft} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-50" style={{ background: theme.fillStrong }}>
                  <X className="h-4 w-4" style={{ color: theme.sub }} />
                </button>
              </div>
              {feast && memberDraft?.participantId === p.id && (
                <section aria-label={`Edit details for ${p.name}`} className="border-t border-[var(--fp-line-2)] p-3">
                  <TextField label="Full Name" placeholder="Participant name" value={memberDraft.name} onChange={(name) => changeMember({ name })} />
                  <TextField label={feast.house_label} placeholder={feast.house_label} value={memberDraft.houseName} onChange={(houseName) => changeMember({ houseName })} />
                  {feast.requires_dob && <DateField label="Date of Birth" value={memberDraft.dob} onChange={(dob) => changeMember({ dob })} />}
                  <GenderPicker value={memberDraft.gender} onChange={(gender) => changeMember({ gender })} />
                  <TextField label="Phone (optional)" placeholder="10-digit mobile" type="tel" value={memberDraft.phone} onChange={(phone) => changeMember({ phone: phone.replace(/\D/g, "").slice(0, 10) })} />
                  <ParticipantPhotoField feastId={feast.id} value={memberDraft.photoUrl} onChange={(photoUrl) => changeMember({ photoUrl })} onBusyChange={setPhotoBusy} personName={memberDraft.name} />
                  {serverError && <p role="alert" className="mt-2 text-xs text-[var(--fp-warn)]">{serverError}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <GlowBtn variant="primary" disabled={!canEditMembers || submitting || photoBusy || !memberDraft.name.trim() || (feast.requires_dob && !memberDraft.dob)} onClick={saveMember}>Save participant</GlowBtn>
                    <button type="button" disabled={submitting || photoBusy} onClick={() => { setMemberDraft(null); setServerError(""); }} className="rounded-lg px-3 text-sm font-semibold text-[var(--fp-ink)]">Cancel</button>
                  </div>
                </section>
              )}
            </div>
          );
        })}
        {feast && (
          <AddMemberPanel feast={{ id: feast.id, houseLabel: feast.house_label, requiresDob: feast.requires_dob }} candidates={candidates} full={picked.length >= maxTeamSize} maxTeam={maxTeamSize} scopeShakhas={scopeShakhas} defaultGender={compGender} disabled={submitting || !!memberDraft} onAdd={addPerson} />
        )}
      </GlassPanel>

      {serverError && !memberDraft && <p className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
      <GlowBtn variant="gold" size="lg" className="w-full" disabled={!canSave || !!memberDraft} loading={submitting} onClick={submit}>Save Team Changes</GlowBtn>

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
