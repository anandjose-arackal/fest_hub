"use client";

// Shared by Add Team (feast-new-team.tsx) and Edit Team (feast-edit-team.tsx):
// while the team is under its size cap, "Add participant" opens a search over
// the admin's own participants; anyone not registered yet can be created
// here (createParticipantAdmin) and goes straight onto the team.

import { useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { createParticipantAdmin } from "@/actions/feast";
import { GlowBtn, theme } from "./feast-shared";
import { DateField, GenderPicker, TextField } from "./feast-register";

export interface TeamPerson { id: string; name: string; houseName: string | null; regNo: string | null; shakhaId: string }
interface NewPerson { name: string; houseName: string; dob: string; gender: string; phone: string; shakhaId: string }

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
const MAX_LIST = 40;

/** "House · Shakha · Reg no" line (shakha only when the admin covers several). */
export function personLine(p: TeamPerson, shakhaName: Map<string, string> | null): string {
  return [p.houseName, shakhaName?.get(p.shakhaId), p.regNo].filter(Boolean).join(" · ");
}

export function AddMemberPanel({ feast, candidates, full, maxTeam, scopeShakhas, defaultGender, disabled, onAdd }: {
  feast: { id: string; houseLabel: string; requiresDob: boolean };
  /** Participants who may still join: in scope, not on this or another team. */
  candidates: TeamPerson[];
  full: boolean;
  maxTeam: number;
  /** Shakhas a new participant may belong to (a picker shows when there are several). */
  scopeShakhas: { id: string; name: string }[];
  defaultGender: string | null;
  disabled?: boolean;
  /** Adds someone to the team — an existing candidate or a just-registered person. */
  onAdd: (person: TeamPerson) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<NewPerson | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const multi = scopeShakhas.length > 1;
  const names = useMemo(() => (multi ? new Map(scopeShakhas.map((s) => [s.id, s.name])) : null), [multi, scopeShakhas]);

  const matches = useMemo(() => {
    const q = norm(query);
    return candidates.filter((p) => !q || [p.name, p.houseName, p.regNo].some((v) => norm(v).includes(q)));
  }, [candidates, query]);

  function pick(p: TeamPerson) {
    onAdd(p);
    setQuery("");
    setSearching(false);
  }

  function openNew() {
    setDraft({ name: query.trim(), houseName: "", dob: "", gender: defaultGender === "boy" || defaultGender === "girl" ? defaultGender : "", phone: "", shakhaId: scopeShakhas.length === 1 ? scopeShakhas[0].id : "" });
    setSearching(false);
    setError("");
  }

  async function saveNew() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await createParticipantAdmin({
        feastId: feast.id, shakhaId: draft.shakhaId, name: draft.name.trim(), houseName: draft.houseName.trim(),
        dob: draft.dob, gender: draft.gender, phone: draft.phone || undefined, feastCompetitionIds: [],
      });
      if (res.error || !res.participantId) {
        setError(res.error ?? "Couldn't register the participant.");
        return;
      }
      onAdd({ id: res.participantId, name: draft.name.trim(), houseName: draft.houseName.trim() || null, regNo: res.regNo ?? null, shakhaId: draft.shakhaId });
      setDraft(null);
    } catch {
      setError("Couldn't register the participant. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (full && !draft) return <p className="mt-2 text-[12px]" style={{ color: theme.faint }}>Team is full ({maxTeam} members).</p>;

  if (draft) {
    const valid = draft.name.trim() && draft.gender && draft.shakhaId && (!feast.requiresDob || draft.dob);
    return (
      <section aria-label="New participant" className="mt-3 rounded-xl p-3" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
        <p className="mb-2 text-[13px] font-bold" style={{ color: theme.text }}>New participant</p>
        <TextField label="Full Name" placeholder="Participant name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <TextField label={feast.houseLabel} placeholder={feast.houseLabel} value={draft.houseName} onChange={(houseName) => setDraft({ ...draft, houseName })} />
        {feast.requiresDob && <DateField label="Date of Birth" value={draft.dob} onChange={(dob) => setDraft({ ...draft, dob })} />}
        <GenderPicker value={draft.gender} onChange={(gender) => setDraft({ ...draft, gender })} />
        <TextField label="Phone (optional)" placeholder="10-digit mobile" type="tel" value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone: phone.replace(/\D/g, "").slice(0, 10) })} />
        {multi && (
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.sub }}>Shakha</span>
            <select value={draft.shakhaId} onChange={(e) => setDraft({ ...draft, shakhaId: e.target.value })} className="w-full rounded-[14px] px-3.5 py-3 text-[14px] outline-none" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}`, color: theme.text }}>
              <option value="">Select shakha</option>
              {[...scopeShakhas].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-[var(--fp-warn)]">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <GlowBtn variant="primary" disabled={!valid || saving || disabled} loading={saving} onClick={saveNew}>Register &amp; add</GlowBtn>
          <button type="button" disabled={saving} onClick={() => { setDraft(null); setError(""); }} className="rounded-lg px-3 text-sm font-semibold text-[var(--fp-ink)]">Cancel</button>
        </div>
      </section>
    );
  }

  if (!searching) {
    return (
      <button type="button" onClick={() => setSearching(true)} disabled={disabled} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple, border: `1px dashed ${theme.lavender}` }}>
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Add participant
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl p-2.5" style={{ background: "var(--fp-input)", border: `1px solid ${theme.hairline}` }}>
      <div className="flex items-center gap-2 px-1.5">
        <Search className="h-4 w-4 shrink-0" style={{ color: theme.faint }} aria-hidden="true" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, house name or reg no" aria-label="Search participants" className="flex-1 border-none bg-transparent py-2 text-[14px] outline-none" style={{ color: theme.text }} />
        <button type="button" onClick={() => { setSearching(false); setQuery(""); }} aria-label="Close search" className="p-1"><X className="h-4 w-4" style={{ color: theme.faint }} /></button>
      </div>
      <ul className="mt-1 max-h-[320px] overflow-y-auto">
        {matches.slice(0, MAX_LIST).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => pick(p)} disabled={disabled} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[rgba(var(--fp-primary-rgb),0.06)]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{p.name}</span>
                <span className="block truncate text-[11px]" style={{ color: theme.sub }}>{personLine(p, names)}</span>
              </span>
              <Check className="h-4 w-4 shrink-0 opacity-40" style={{ color: theme.purple }} aria-hidden="true" />
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-2 py-3 text-[12.5px]" style={{ color: theme.faint }}>No participant found.</li>}
        {matches.length > MAX_LIST && <li className="px-2 py-2 text-[11.5px]" style={{ color: theme.faint }}>Showing {MAX_LIST} of {matches.length}. Type to narrow it down.</li>}
      </ul>
      <button type="button" onClick={openNew} className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-bold" style={{ background: "rgba(var(--fp-primary-rgb),0.10)", color: theme.purple }}>
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Not in the list? Add a new participant
      </button>
    </div>
  );
}
