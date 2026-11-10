"use client";

// My Registrations → a team item with no team yet → "Add participants".
// Builds the team from the signed-in admin's own participants: search
// everyone registered in this fest under their shakha (or every shakha under
// their meghala/diocese), tap to add, up to the item's team size. Someone not
// registered yet can be created here and goes straight onto the team (see
// AddMemberPanel). The register page's own team flow is unchanged.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth-context";
import { getDescendantShakhaIds } from "@/lib/org-hierarchy";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { registerTeam } from "@/actions/team";
import { useFeast, useOrgHierarchy } from "@/hooks/use-feast";
import { GlassPanel, GlowBtn, FeastTopBar, ProcessingOverlay, theme, useSubmitLock } from "./feast-shared";
import { AddMemberPanel, personLine, type TeamPerson } from "./feast-team-members";

export function FeastNewTeam({ slug, feastCompetitionId }: { slug: string; feastCompetitionId: string }) {
  const router = useRouter();
  const { feast, loading: feastLoading } = useFeast(slug);
  const { session, adminScope } = useAuth();
  const hierarchy = useOrgHierarchy();
  const scopeShakhaIds = useMemo(
    () => (!adminScope || hierarchy.loading ? null : getDescendantShakhaIds(adminScope, hierarchy)),
    [adminScope, hierarchy],
  );
  const scopeShakhas = useMemo(() => {
    const ids = new Set(scopeShakhaIds ?? []);
    return hierarchy.shakhas.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  }, [scopeShakhaIds, hierarchy.shakhas]);
  const names = useMemo(() => (scopeShakhas.length > 1 ? new Map(scopeShakhas.map((s) => [s.id, s.name])) : null), [scopeShakhas]);
  const comp = feast?.competitions.find((c) => c.id === feastCompetitionId);
  const maxTeam = comp?.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS;

  const [loadedPeople, setPeople] = useState<TeamPerson[] | null>(null);
  const people = useMemo(() => (scopeShakhaIds?.length === 0 ? [] : loadedPeople), [scopeShakhaIds, loadedPeople]);
  const [members, setMembers] = useState<TeamPerson[]>([]);
  // null = not typed yet: defaults to the admin's shakha/diocese name.
  const [typedName, setTeamName] = useState<string | null>(null);
  const teamName = typedName ?? adminScope?.name ?? "";
  const [serverError, setServerError] = useState("");
  const { busy, run } = useSubmitLock(setServerError);

  // Everyone in the admin's scope registered in this fest, minus anyone
  // already on a team for this item.
  useEffect(() => {
    if (!feast || !scopeShakhaIds?.length) return;
    let cancelled = false;
    Promise.all([
      fetchAll((from, to) =>
        supabase.from("participants").select("id, name, house_name, registration_number, shakha_id").eq("feast_id", feast.id).in("shakha_id", scopeShakhaIds).order("name").order("id").range(from, to),
      ),
      supabase.from("team_registration_members").select("participant_id").eq("feast_competition_id", feastCompetitionId),
    ]).then(([{ data: rows, error }, { data: taken, error: takenErr }]) => {
      if (cancelled) return;
      if (error || takenErr) throw new Error(error ?? takenErr?.message);
      const onTeams = new Set((taken ?? []).map((t) => t.participant_id as string));
      setPeople(
        (rows as { id: string; name: string; house_name: string | null; registration_number: string | null; shakha_id: string }[])
          .filter((p) => !onTeams.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, houseName: p.house_name, regNo: p.registration_number, shakhaId: p.shakha_id })),
      );
    }).catch(() => { if (!cancelled) { setPeople([]); setServerError("Couldn't load participants. Check your connection and try again."); } });
    return () => { cancelled = true; };
  }, [feast, scopeShakhaIds, feastCompetitionId]);

  const candidates = useMemo(() => (people ?? []).filter((p) => !members.some((m) => m.id === p.id)), [people, members]);
  const add = (p: TeamPerson) => setMembers((prev) => (prev.some((m) => m.id === p.id) || prev.length >= maxTeam ? prev : [...prev, p]));

  function saveTeam() {
    if (!feast || members.length === 0) return;
    run(async () => {
      setServerError("");
      const res = await registerTeam({ feastId: feast.id, feastCompetitionId, shakhaId: members[0].shakhaId, teamName: teamName.trim(), participantIds: members.map((m) => m.id) });
      if (res.error) {
        setServerError(res.error);
        return "release";
      }
      router.push(`/feast/${slug}/registrations`);
      return "leaving";
    });
  }

  const back = () => router.push(`/feast/${slug}/registrations`);
  if (feastLoading || hierarchy.loading || (session && adminScope && people === null)) {
    return <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;
  }
  if (!session || !adminScope || !feast || !comp || comp.cat !== "Team") {
    return (
      <div>
        <FeastTopBar title="Add Team" onBack={back} />
        <p className="pt-10 text-center text-sm" style={{ color: theme.sub }}>{!session || !adminScope ? "Please log in as an admin to register a team." : "This team item wasn't found."}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <FeastTopBar title="Add Team" onBack={back} />
      <GlassPanel className="mb-3.5 p-4">
        <p className="mb-3 text-xs" style={{ color: theme.faint }}>Competition: <strong style={{ color: theme.text }}>{comp.name}</strong></p>
        <label className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Team Name</label>
        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] px-3.5" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="flex-1 border-none bg-transparent py-3 text-[14.5px] outline-none" style={{ color: theme.text }} />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: theme.faint }}>Members</span>
          <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={members.length >= maxTeam ? { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" } : { background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>{members.length} / {maxTeam}</span>
        </div>
        {members.length === 0 && <p className="mb-2 text-[12.5px]" style={{ color: theme.faint }}>No members yet. Add participants registered under {adminScope.name}.</p>}
        {members.map((p) => (
          <div key={p.id} className="mb-2 flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--fp-input)", border: `1px solid ${theme.lavender}` }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(var(--fp-primary-rgb),0.10)" }}><Users className="h-4 w-4" style={{ color: theme.lavender }} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{p.name}</span>
              <span className="block truncate text-[11px]" style={{ color: theme.sub }}>{personLine(p, names)}</span>
            </span>
            <button type="button" onClick={() => setMembers((prev) => prev.filter((m) => m.id !== p.id))} disabled={busy} aria-label={`Remove ${p.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: theme.fillStrong }}>
              <X className="h-4 w-4" style={{ color: theme.sub }} />
            </button>
          </div>
        ))}

        <AddMemberPanel feast={feast} candidates={candidates} full={members.length >= maxTeam} maxTeam={maxTeam} scopeShakhas={scopeShakhas} defaultGender={comp.gender ?? null} disabled={busy} onAdd={add} />
      </GlassPanel>

      {serverError && <p role="alert" className="mb-3 rounded-xl px-2 py-2 text-center text-xs" style={{ color: "#ef4444", background: "#fee2e2" }}>{serverError}</p>}
      <GlowBtn variant="gold" size="lg" className="w-full" disabled={!teamName.trim() || members.length === 0} loading={busy} onClick={saveTeam}>Register Team</GlowBtn>
      {busy && <ProcessingOverlay label="Saving team…" />}
    </div>
  );
}
