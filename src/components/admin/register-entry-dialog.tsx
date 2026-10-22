"use client";

// /admin/results' "Register" button: add someone missing from the selected
// item without leaving the page. Individual items first search the fest's
// existing registrations (Mekhala / Shakha / text filters, limited by default
// to the item's age category and gender); picking one opens
// their registration for editing with this item added — no duplicate
// participant. Only someone not registered at all goes through "New".
// Team items register a missing team for a Shakha.
//
// The parent keeps this mounted while closed, so anything half-typed here
// survives closing and reopening; forms reset only after a successful save.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Search, UserPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetch-all";
import { addParticipantToCompetition, createParticipantAdmin, updateParticipant } from "@/actions/feast";
import { ParticipantPhotoField } from "@/components/feast/participant-photo-field";
import { registerTeam } from "@/actions/team";
import { CATEGORY_LABELS, fetchCompetitionCategories, formatCompetitionOptionLabel, getCategorySlug } from "@/lib/competition-categories";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { HierarchyPicker } from "@/components/admin/hierarchy-picker";
import type { CompetitionCategory } from "@/types";

export interface RegisterTarget {
  /** feast_competitions.id */
  id: string;
  feastId: string;
  isGroup: boolean;
  isPublished: boolean;
  name: string;
  gender: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  maxTeamSize: number | null;
}

/** What the results list needs to show the new row straight away. */
export interface AddedEntry {
  regId: string;
  regNo: string;
  name: string;
  sub: string;
  shakhaId: string;
  shakhaName: string;
  participantId?: string;
  members?: { name: string; houseName: string }[];
}

interface FestParticipant {
  id: string;
  name: string;
  house_name: string | null;
  registration_number: string | null;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  shakha_id: string | null;
  competition_category_id: string | null;
  photo_url: string | null;
}

// "*" rather than a column list: photo_url only exists after migration 018,
// and naming it on an older database would fail the whole read.
const PARTICIPANT_COLS = "*";
const MAX_LIST = 60;
const INPUT = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-[#6B46FF] focus:outline-none";
const LABEL = "mb-1 block text-xs font-semibold text-neutral-600";

function normGender(g: string | null | undefined): "boy" | "girl" | "" {
  const v = (g ?? "").toLowerCase();
  if (v.startsWith("boy") || v === "male") return "boy";
  if (v.startsWith("girl") || v === "female") return "girl";
  return "";
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

type Form = { name: string; houseName: string; dob: string; gender: string; phone: string };
const EMPTY_FORM: Form = { name: "", houseName: "", dob: "", gender: "", phone: "" };

export function RegisterEntryDialog({
  open,
  onClose,
  target,
  enteredParticipantIds,
  enteredShakhaIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  target: RegisterTarget;
  enteredParticipantIds: Set<string>;
  enteredShakhaIds: Set<string>;
  onAdded: (entry: AddedEntry) => void;
}) {
  const hierarchy = useOrgHierarchy();
  const targetGender = normGender(target.gender);
  const defaultForm: Form = { ...EMPTY_FORM, gender: targetGender };

  const [participants, setParticipants] = useState<FestParticipant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);

  const [view, setView] = useState<"find" | "edit" | "new">("find");
  const [meghalaFilter, setMeghalaFilter] = useState("");
  const [shakhaFilter, setShakhaFilter] = useState("");
  const [query, setQuery] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY_FORM);
  const [editItems, setEditItems] = useState<{ fcId: string; label: string }[] | null>(null);

  const [newShakhaId, setNewShakhaId] = useState("");
  const [newForm, setNewForm] = useState<Form>(defaultForm);

  const [teamShakhaId, setTeamShakhaId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");

  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The fest's participants — loaded the first time the dialog opens.
  useEffect(() => {
    if (!open || participants !== null) return;
    let cancelled = false;
    fetchCompetitionCategories().then((c) => !cancelled && setCategories(c));
    fetchAll<FestParticipant>((from, to) =>
      supabase.from("participants").select(PARTICIPANT_COLS).eq("feast_id", target.feastId).order("id").range(from, to)
    ).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setLoadError(err);
      setParticipants(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, participants, target.feastId]);

  const shakhaById = useMemo(() => new Map(hierarchy.shakhas.map((s) => [s.id, s])), [hierarchy.shakhas]);
  const meghalaById = useMemo(() => new Map(hierarchy.meghalas.map((m) => [m.id, m])), [hierarchy.meghalas]);
  const showMeghala = hierarchy.hierarchyLevel !== "shakha" && hierarchy.meghalas.length > 0;
  const shakhaLabel = (shakhaId: string | null) => {
    const s = shakhaId ? shakhaById.get(shakhaId) : undefined;
    if (!s) return "—";
    const m = showMeghala && s.meghala_id ? meghalaById.get(s.meghala_id) : undefined;
    return m ? `${s.name} · ${m.name}` : s.name;
  };

  const categorySlugOf = (catId: string | null, dob: string | null): string => {
    const byId = catId ? categories.find((c) => c.id === catId)?.slug : undefined;
    return byId ?? getCategorySlug(dob ?? "", categories);
  };

  // Soft warnings only — the admin may know better (e.g. an approved exception).
  function eligibilityWarnings(catSlug: string, gender: string): string[] {
    const out: string[] = [];
    if (target.categorySlug && catSlug && catSlug !== target.categorySlug) {
      out.push(`Age category is ${CATEGORY_LABELS[catSlug] ?? catSlug}, this item is ${target.categoryName ?? CATEGORY_LABELS[target.categorySlug] ?? target.categorySlug}.`);
    }
    const g = normGender(gender);
    if (targetGender && g && g !== targetGender) out.push(`This item is for ${targetGender === "boy" ? "boys" : "girls"}.`);
    return out;
  }

  // ── find ──────────────────────────────────────────────────────────────
  const shakhaOptions = meghalaFilter ? hierarchy.shakhas.filter((s) => s.meghala_id === meghalaFilter) : hierarchy.shakhas;
  // By default the list holds only people who fit the item: its age category
  // (none for all-ages items) and its gender (both for common items). Someone
  // whose category or gender isn't known yet stays listed. "Show everyone"
  // brings the rest back for an approved exception.
  const hasEligibility = !!target.categorySlug || !!targetGender;
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const { matches, hiddenCount } = useMemo(() => {
    const q = norm(query);
    const found = (participants ?? [])
      .filter((p) => !shakhaFilter || p.shakha_id === shakhaFilter)
      .filter((p) => !meghalaFilter || (p.shakha_id && shakhaById.get(p.shakha_id)?.meghala_id === meghalaFilter))
      .filter((p) => !q || [p.name, p.house_name, p.registration_number].some((v) => norm(v).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!eligibleOnly || !hasEligibility) return { matches: found, hiddenCount: 0 };
    const fits = (p: FestParticipant) => {
      if (target.categorySlug && categories.length > 0) {
        const cat = (p.competition_category_id && categories.find((c) => c.id === p.competition_category_id)?.slug) || getCategorySlug(p.date_of_birth ?? "", categories);
        if (cat && cat !== target.categorySlug) return false;
      }
      const g = normGender(p.gender);
      return !targetGender || !g || g === targetGender;
    };
    const eligible = found.filter(fits);
    return { matches: eligible, hiddenCount: found.length - eligible.length };
  }, [participants, query, shakhaFilter, meghalaFilter, shakhaById, eligibleOnly, hasEligibility, target.categorySlug, targetGender, categories]);
  const eligibilityLabel = [
    target.categoryName ?? (target.categorySlug ? CATEGORY_LABELS[target.categorySlug] ?? target.categorySlug : null),
    targetGender === "boy" ? "Boys" : targetGender === "girl" ? "Girls" : null,
  ].filter(Boolean).join(" · ");

  function openEdit(p: FestParticipant) {
    setEditId(p.id);
    setEditForm({ name: p.name, houseName: p.house_name ?? "", dob: p.date_of_birth ?? "", gender: normGender(p.gender) || (p.gender ?? ""), phone: p.phone ?? "" });
    setEditPhoto(p.photo_url ?? null);
    setEditItems(null);
    setError(null);
    setNotice(null);
    setView("edit");
    supabase
      .from("participant_registrations")
      .select("feast_competition_id, feast_competition:feast_competitions(competition:competitions(name, gender, competition_category:competition_categories(name)))")
      .eq("participant_id", p.id)
      .then(({ data }) => {
        setEditItems(
          (data ?? []).map((r) => {
            const fc = Array.isArray(r.feast_competition) ? r.feast_competition[0] : r.feast_competition;
            const comp = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
            const cat = Array.isArray(comp?.competition_category) ? comp?.competition_category[0] : comp?.competition_category;
            return { fcId: r.feast_competition_id, label: comp ? formatCompetitionOptionLabel(comp.name, comp.gender, cat?.name) : "Competition" };
          })
        );
      });
  }

  const editing = editId ? participants?.find((p) => p.id === editId) ?? null : null;

  async function saveEdit() {
    if (!editing || saving) return;
    if (!editForm.name.trim() || !editForm.dob || !editForm.gender) {
      setError("Name, date of birth and gender are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const added = await addParticipantToCompetition({ participantId: editing.id, feastCompetitionId: target.id });
    if (added.error || !added.registrationId) {
      setSaving(false);
      setError(added.error ?? "Could not add the entry.");
      return;
    }
    // Details edited too → save them on the same registration (their other
    // items stay as they are, plus this one).
    const changed =
      editForm.name.trim() !== editing.name ||
      editForm.houseName.trim() !== (editing.house_name ?? "") ||
      editForm.dob !== (editing.date_of_birth ?? "") ||
      editForm.gender !== (normGender(editing.gender) || (editing.gender ?? "")) ||
      editForm.phone.trim() !== (editing.phone ?? "") ||
      editPhoto !== (editing.photo_url ?? null);
    let detailsError: string | null = null;
    if (changed) {
      const fcIds = [...new Set([...(editItems ?? []).map((i) => i.fcId), target.id])];
      const res = editItems
        ? await updateParticipant({
            participantId: editing.id,
            name: editForm.name.trim(),
            houseName: editForm.houseName.trim(),
            dob: editForm.dob,
            gender: editForm.gender,
            phone: editForm.phone.trim(),
            feastCompetitionIds: fcIds,
            photoUrl: editPhoto,
          })
        : { error: "their current items hadn't loaded yet" };
      detailsError = res.error ?? null;
    }
    setSaving(false);
    const name = changed && !detailsError ? editForm.name.trim() : editing.name;
    const house = changed && !detailsError ? editForm.houseName.trim() : editing.house_name ?? "";
    if (changed && !detailsError) {
      setParticipants((prev) =>
        prev?.map((p) =>
          p.id === editing.id ? { ...p, name, house_name: house || null, date_of_birth: editForm.dob, gender: editForm.gender, phone: editForm.phone.trim() || null, photo_url: editPhoto } : p
        ) ?? prev
      );
    }
    onAdded({
      regId: added.registrationId,
      regNo: editing.registration_number ?? "—",
      name,
      sub: house,
      shakhaId: editing.shakha_id ?? "",
      shakhaName: editing.shakha_id ? shakhaById.get(editing.shakha_id)?.name ?? "—" : "—",
      participantId: editing.id,
    });
    setEditId(null);
    setView("find");
    if (detailsError) setNotice(`${editing.name} was added, but their details weren't updated: ${detailsError}`);
  }

  // ── new ───────────────────────────────────────────────────────────────
  // Same name already registered in the chosen Shakha → offer to edit that
  // registration instead of creating a duplicate.
  const possibleDuplicates = useMemo(() => {
    const n = norm(newForm.name);
    if (n.length < 3) return [];
    return (participants ?? [])
      .filter((p) => (!newShakhaId || p.shakha_id === newShakhaId) && (norm(p.name) === n || norm(p.name).includes(n) || n.includes(norm(p.name))))
      .slice(0, 4);
  }, [participants, newForm.name, newShakhaId]);

  async function saveNew() {
    if (saving) return;
    if (!newShakhaId || !newForm.name.trim() || !newForm.dob || !newForm.gender) {
      setError("Shakha, name, date of birth and gender are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createParticipantAdmin({
      feastId: target.feastId,
      shakhaId: newShakhaId,
      name: newForm.name.trim(),
      houseName: newForm.houseName.trim(),
      dob: newForm.dob,
      gender: newForm.gender,
      phone: newForm.phone.trim(),
      feastCompetitionIds: [target.id],
      photoUrl: newPhoto,
    });
    setSaving(false);
    const regId = res.registrationIds?.[target.id];
    if (res.error || !res.participantId || !regId) {
      setError(res.error ?? "Could not register.");
      return;
    }
    const created: FestParticipant = {
      id: res.participantId,
      name: newForm.name.trim(),
      house_name: newForm.houseName.trim() || null,
      registration_number: res.regNo ?? null,
      gender: newForm.gender,
      date_of_birth: newForm.dob,
      phone: newForm.phone.trim() || null,
      shakha_id: newShakhaId,
      competition_category_id: categories.find((c) => c.slug === getCategorySlug(newForm.dob, categories))?.id ?? null,
      photo_url: newPhoto,
    };
    setParticipants((prev) => (prev ? [...prev, created] : prev));
    onAdded({
      regId,
      regNo: res.regNo ?? "—",
      name: created.name,
      sub: created.house_name ?? "",
      shakhaId: newShakhaId,
      shakhaName: shakhaById.get(newShakhaId)?.name ?? "—",
      participantId: created.id,
    });
    setNewForm(defaultForm);
    setNewPhoto(null);
    setNewShakhaId("");
    setView("find");
  }

  // ── team ──────────────────────────────────────────────────────────────
  const maxTeam = target.maxTeamSize ?? DEFAULT_MAX_TEAM_MEMBERS;
  const teamShakhaTaken = !!teamShakhaId && enteredShakhaIds.has(teamShakhaId);
  const shakhaPeople = useMemo(() => {
    const q = norm(memberQuery);
    return (participants ?? [])
      .filter((p) => p.shakha_id === teamShakhaId)
      .filter((p) => teamMembers.includes(p.id) || !q || [p.name, p.house_name, p.registration_number].some((v) => norm(v).includes(q)))
      .sort((a, b) => Number(teamMembers.includes(b.id)) - Number(teamMembers.includes(a.id)) || a.name.localeCompare(b.name));
  }, [participants, teamShakhaId, memberQuery, teamMembers]);

  function pickTeamShakha(id: string) {
    setTeamShakhaId(id);
    setTeamMembers([]);
    // Prefill the usual team name (the Shakha's) unless one was typed.
    if (!teamName.trim() || hierarchy.shakhas.some((s) => s.name === teamName)) setTeamName(shakhaById.get(id)?.name ?? "");
  }

  function toggleMember(id: string) {
    setTeamMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= maxTeam ? prev : [...prev, id]));
  }

  async function saveTeam() {
    if (saving) return;
    if (!teamShakhaId || !teamName.trim() || teamMembers.length === 0) {
      setError("Pick a Shakha, a team name and at least one member.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await registerTeam({ feastId: target.feastId, feastCompetitionId: target.id, shakhaId: teamShakhaId, teamName: teamName.trim(), participantIds: teamMembers });
    setSaving(false);
    if (res.error || !res.teamId) {
      setError(res.error ?? "Could not register the team.");
      return;
    }
    const members = teamMembers
      .map((id) => participants?.find((p) => p.id === id))
      .filter((p): p is FestParticipant => !!p)
      .map((p) => ({ name: p.name, houseName: p.house_name ?? "" }));
    onAdded({
      regId: res.teamId,
      regNo: teamName.trim(),
      name: teamName.trim(),
      sub: members.map((m) => m.name).join(", "),
      shakhaId: teamShakhaId,
      shakhaName: shakhaById.get(teamShakhaId)?.name ?? "—",
      members,
    });
    setTeamShakhaId("");
    setTeamName("");
    setTeamMembers([]);
    setMemberQuery("");
  }

  if (!open) return null;

  const editWarnings = editing ? eligibilityWarnings(categorySlugOf(null, editForm.dob) || categorySlugOf(editing.competition_category_id, editing.date_of_birth), editForm.gender) : [];
  const newWarnings = eligibilityWarnings(getCategorySlug(newForm.dob, categories), newForm.gender);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Register for this item"
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-neutral-800">{target.isGroup ? "Register a team" : "Register for this item"}</p>
            <p className="truncate text-xs font-semibold" style={{ color: "#6B46FF" }}>
              {formatCompetitionOptionLabel(target.name, target.gender, target.categoryName)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode switch (individual items) */}
        {!target.isGroup && view !== "edit" && (
          <div className="flex gap-1 border-b border-neutral-200 px-5 py-2">
            {([
              ["find", "Existing registration"],
              ["new", "New participant"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => { setView(v); setError(null); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === v ? "bg-[#6B46FF]/10 text-[#6B46FF]" : "text-neutral-500 hover:bg-neutral-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {target.isPublished && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Results for this item are published — unpublish before adding entries.
            </p>
          )}
          {notice && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{notice}</p>}
          {loadError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Couldn&apos;t load registrations: {loadError}</p>}

          {/* ── Individual: search existing registrations ── */}
          {!target.isGroup && view === "find" && (
            <>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {showMeghala && (
                  <select className={INPUT} value={meghalaFilter} onChange={(e) => { setMeghalaFilter(e.target.value); setShakhaFilter(""); }} aria-label="Mekhala">
                    <option value="">All Mekhalas</option>
                    {hierarchy.meghalas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                <select className={`${INPUT} ${showMeghala ? "" : "sm:col-span-2"}`} value={shakhaFilter} onChange={(e) => setShakhaFilter(e.target.value)} aria-label="Shakha">
                  <option value="">All Shakhas</option>
                  {shakhaOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input className={`${INPUT} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, house name or reg no…" autoFocus />
                </label>
                {hasEligibility && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-neutral-600 sm:col-span-2">
                    <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} className="h-4 w-4" />
                    Only {eligibilityLabel}
                    {eligibleOnly && hiddenCount > 0 && <span className="font-normal text-neutral-500">({hiddenCount} others hidden)</span>}
                  </label>
                )}
              </div>

              {participants === null ? (
                <p className="flex items-center gap-2 py-6 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading registrations…</p>
              ) : matches.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-neutral-500">No {eligibleOnly && hasEligibility ? `${eligibilityLabel} ` : ""}registration matches.</p>
                  {hiddenCount > 0 && (
                    <button type="button" onClick={() => setEligibleOnly(false)} className="mx-auto mt-1 block text-sm font-semibold text-neutral-600 underline">
                      Show {hiddenCount} outside this item&apos;s category / gender
                    </button>
                  )}
                  <button type="button" onClick={() => { setView("new"); setNewForm((f) => ({ ...f, name: f.name || query.trim() })); if (shakhaFilter) setNewShakhaId(shakhaFilter); }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[#6B46FF]">
                    <UserPlus className="h-4 w-4" /> Register as a new participant
                  </button>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                    {matches.slice(0, MAX_LIST).map((p) => {
                      const inItem = enteredParticipantIds.has(p.id);
                      const warn = eligibilityWarnings(categorySlugOf(p.competition_category_id, p.date_of_birth), p.gender ?? "");
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={inItem || target.isPublished}
                            onClick={() => openEdit(p)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#6B46FF]/5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
                          >
                            <span className="shrink-0 rounded-md bg-[#4C1D95] px-2 py-0.5 font-mono text-[12px] font-black text-white">{p.registration_number ?? "—"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-neutral-800">{p.name}</span>
                              <span className="block truncate text-xs text-neutral-500">
                                {[p.house_name, shakhaLabel(p.shakha_id)].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            {inItem ? (
                              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">Already in this item</span>
                            ) : warn.length > 0 ? (
                              <span title={warn.join(" ")} className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" /> Check
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {matches.length > MAX_LIST && (
                    <p className="mt-2 text-xs text-neutral-500">Showing {MAX_LIST} of {matches.length} — narrow it down with the filters or search.</p>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Individual: edit an existing registration to add this item ── */}
          {!target.isGroup && view === "edit" && editing && (
            <div className="space-y-3">
              <button type="button" onClick={() => { setView("find"); setError(null); }} className="inline-flex items-center gap-1 text-sm font-semibold text-[#6B46FF]">
                <ArrowLeft className="h-4 w-4" /> Back to search
              </button>
              <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm">
                <p className="font-bold text-neutral-800">
                  <span className="mr-2 rounded-md bg-[#4C1D95] px-2 py-0.5 font-mono text-[12px] font-black text-white">{editing.registration_number ?? "—"}</span>
                  {shakhaLabel(editing.shakha_id)}
                </p>
                <p className="mt-1.5 text-xs text-neutral-600">
                  <span className="font-semibold">Already registered for: </span>
                  {editItems === null ? "loading…" : editItems.length === 0 ? "no items yet" : editItems.map((i) => i.label).join(", ")}
                </p>
                <p className="mt-1 text-xs font-semibold" style={{ color: "#6B46FF" }}>Saving adds this item to the same registration — no new participant is created.</p>
              </div>
              <PersonFields form={editForm} onChange={setEditForm} />
              <div>
                <span className={LABEL}>Photo</span>
                <ParticipantPhotoField feastId={target.feastId} value={editPhoto} onChange={setEditPhoto} onBusyChange={setPhotoBusy} personName={editForm.name} variant="admin" />
              </div>
              {editWarnings.map((w) => <Warning key={w} text={w} />)}
            </div>
          )}

          {/* ── Individual: brand-new participant ── */}
          {!target.isGroup && view === "new" && (
            <div className="space-y-3">
              <div>
                <span className={LABEL}>Shakha <span className="text-red-500">*</span></span>
                <HierarchyPicker value={newShakhaId} onChange={setNewShakhaId} hierarchy={hierarchy} className={INPUT} required />
              </div>
              <PersonFields form={newForm} onChange={setNewForm} />
              <div>
                <span className={LABEL}>Photo</span>
                <ParticipantPhotoField feastId={target.feastId} value={newPhoto} onChange={setNewPhoto} onBusyChange={setPhotoBusy} personName={newForm.name} variant="admin" />
              </div>
              {possibleDuplicates.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-bold text-amber-800">Already registered? Edit their registration instead of creating a duplicate:</p>
                  <ul className="mt-1.5 space-y-1">
                    {possibleDuplicates.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-neutral-800">
                          <b>{p.name}</b> {p.house_name && `· ${p.house_name}`} · {shakhaLabel(p.shakha_id)}
                        </span>
                        {enteredParticipantIds.has(p.id) ? (
                          <span className="shrink-0 text-[11px] font-semibold text-neutral-500">Already in this item</span>
                        ) : (
                          <button type="button" onClick={() => openEdit(p)} className="shrink-0 text-xs font-bold text-[#6B46FF]">Edit this one</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {newWarnings.map((w) => <Warning key={w} text={w} />)}
            </div>
          )}

          {/* ── Team item ── */}
          {target.isGroup && (
            <div className="space-y-3">
              <div>
                <span className={LABEL}>Shakha <span className="text-red-500">*</span></span>
                <HierarchyPicker value={teamShakhaId} onChange={pickTeamShakha} hierarchy={hierarchy} className={INPUT} required />
                {teamShakhaTaken && <Warning text="This Shakha already has a team in this item." />}
              </div>
              <div>
                <span className={LABEL}>Team name <span className="text-red-500">*</span></span>
                <input className={INPUT} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
              </div>
              {teamShakhaId && (
                <div>
                  <span className={LABEL}>Members ({teamMembers.length}/{maxTeam}) <span className="text-red-500">*</span></span>
                  <input className={`${INPUT} mb-2`} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search this Shakha's registrations…" />
                  {participants === null ? (
                    <p className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
                  ) : shakhaPeople.length === 0 ? (
                    <p className="text-sm text-neutral-500">No registrations from this Shakha{memberQuery ? " match" : " yet"}.</p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
                      {shakhaPeople.map((p) => {
                        const on = teamMembers.includes(p.id);
                        return (
                          <li key={p.id}>
                            <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${on ? "bg-[#6B46FF]/5" : ""}`}>
                              <input type="checkbox" checked={on} disabled={!on && teamMembers.length >= maxTeam} onChange={() => toggleMember(p.id)} className="h-4 w-4" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-neutral-800">{p.name}</span>
                                <span className="block truncate text-xs text-neutral-500">{[p.house_name, p.registration_number].filter(Boolean).join(" · ")}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        {(target.isGroup || view !== "find") && (
          <div className="flex gap-2 border-t border-neutral-200 px-5 py-3">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700">
              Close
            </button>
            <button
              type="button"
              onClick={target.isGroup ? saveTeam : view === "edit" ? saveEdit : saveNew}
              disabled={saving || photoBusy || target.isPublished || (target.isGroup && teamShakhaTaken)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#6B46FF,#A855F7)" }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {target.isGroup ? "Register team" : view === "edit" ? "Add to this item" : "Register & add"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonFields({ form, onChange }: { form: Form; onChange: (f: Form) => void }) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={LABEL}>Name <span className="text-red-500">*</span></span>
        <input className={INPUT} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" />
      </label>
      <label className="sm:col-span-2">
        <span className={LABEL}>House name</span>
        <input className={INPUT} value={form.houseName} onChange={(e) => set({ houseName: e.target.value })} placeholder="House name" />
      </label>
      <label>
        <span className={LABEL}>Date of birth <span className="text-red-500">*</span></span>
        <input type="date" className={INPUT} value={form.dob} onChange={(e) => set({ dob: e.target.value })} />
      </label>
      <label>
        <span className={LABEL}>Gender <span className="text-red-500">*</span></span>
        <select className={INPUT} value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
          <option value="">Select…</option>
          <option value="boy">Boy</option>
          <option value="girl">Girl</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={LABEL}>Phone</span>
        <input type="tel" inputMode="tel" className={INPUT} value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone (optional)" />
      </label>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-amber-700">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {text}
    </p>
  );
}
