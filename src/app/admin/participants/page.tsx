"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { UserCheck, Pencil, X, Download, Printer, IdCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createParticipantAdmin, updateParticipant, deleteParticipant } from "@/actions/feast";
import { registerTeam, updateTeam, deleteTeam } from "@/actions/team";
import { fetchCompetitionCategories, getCategorySlug, CATEGORY_LABELS, formatCompetitionOptionLabel } from "@/lib/competition-categories";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import { getOrgSettings } from "@/lib/org-settings";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { HierarchyPicker } from "@/components/admin/hierarchy-picker";
import type { Competition, CompetitionCategory, Diocese, Feast, FeastCompetition, HierarchyLevel, Meghala, OrgSettings, Participant, Shakha } from "@/types";

type FCRow = FeastCompetition & { competition: Competition & { competition_category?: CompetitionCategory | null } };
type ParticipantRow = Participant & { shakha: Shakha | null; events: number };

const PER_PAGE = 30;

function normGender(g: string | null | undefined): "boy" | "girl" | "" {
  const v = (g ?? "").toLowerCase();
  if (v.startsWith("boy") || v === "male") return "boy";
  if (v.startsWith("girl") || v === "female") return "girl";
  return "";
}

function categoryPill(catName: string | undefined, gender: string | null) {
  const g = normGender(gender);
  const label = `${catName ?? "—"}${g ? `-${g === "boy" ? "Boy" : "Girl"}` : ""}`;
  const color = g === "boy" ? "#3B82F6" : g === "girl" ? "#EC4899" : "#6B46FF";
  return { label, color };
}

// Ticket-stub reg-no badge — matches cml-mission-hub's admin/participants table.
function RegNoBadge({ regNo }: { regNo: string | null }) {
  if (!regNo) return <span className="text-sm font-bold" style={{ color: "#6B7280" }}>—</span>;
  return (
    <span
      className="relative inline-flex items-center px-2.5 py-1 text-[12px] tracking-wide"
      style={{
        background: "#FCD34D",
        color: "#451A03",
        fontFamily: "var(--font-anek), sans-serif",
        fontWeight: 800,
        WebkitTextStroke: "0.3px #451A03",
        borderRadius: "5px",
        border: "1px dashed rgba(120,53,15,0.4)",
        boxShadow: "0 1px 3px rgba(120,53,15,0.25)",
      }}
    >
      <span className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(120,53,15,0.2)" }} aria-hidden="true" />
      {regNo}
      <span className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(120,53,15,0.2)" }} aria-hidden="true" />
    </span>
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CARDS_PER_PAGE = 8;
const PIN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B46FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const COMP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#6B46FF" style="flex-shrink:0"><path d="M12 2l2.9 6.9L22 9.3l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.9L2 9.3l7.1-.4L12 2z"/></svg>`;

// Cuttable A4 registration cards, 8 per page (2x4 grid) — the same
// landscape layout (name/regno side by side, icon-accented meta rows)
// scaled down to fit a half-width cell. Each card carries its own Shakha
// (+ Meghala/Diocese, if that level is enabled) name rather than relying
// on a page-level group header — once cards are cut apart for handout, a
// shared header would be lost, so every card has to be self-contained.
// Cards are still sorted Diocese > Meghala > Shakha > reg number so
// same-group cards land contiguously on the sheet, satisfying "group by"
// without needing fragile cross-page grid/section-header logic.
function buildRegistrationCardsHtml(
  rows: ParticipantRow[],
  org: OrgSettings | null,
  hierarchy: { shakhas: Shakha[]; meghalas: Meghala[]; dioceses: Diocese[]; hierarchyLevel: HierarchyLevel },
  participantRegs: Record<string, string[]>,
  individualFeastComps: FCRow[],
  categories: CompetitionCategory[]
): string {
  const compNameById = new Map(individualFeastComps.map((c) => [c.id, c.competition.name]));
  const shakhaById = new Map(hierarchy.shakhas.map((s) => [s.id, s]));
  const meghalaById = new Map(hierarchy.meghalas.map((m) => [m.id, m]));
  const dioceseNameById = new Map(hierarchy.dioceses.map((d) => [d.id, d.name]));

  // At the diocese (3-level) hierarchy, the full breadcrumb can run too long
  // for the card's narrow location line, so it prints as two lines — Diocese
  // name alone, then "Meghala | Shakha" — rather than one long pipe-joined
  // string. Shakha/Meghala-level orgs stay a single line, as before.
  function groupInfo(shakhaId: string | null): { sortKey: [string, string, string]; line1: string; line2: string | null } {
    const shakha = shakhaId ? shakhaById.get(shakhaId) : undefined;
    const shakhaName = shakha?.name ?? "—";
    const meghala = shakha?.meghala_id ? meghalaById.get(shakha.meghala_id) : undefined;
    const dioceseName = meghala?.diocese_id ? dioceseNameById.get(meghala.diocese_id) : undefined;

    if (hierarchy.hierarchyLevel === "diocese") {
      const line1 = dioceseName ?? shakhaName;
      const line2 = dioceseName ? [meghala?.name, shakhaName].filter(Boolean).join(" | ") : null;
      return { sortKey: [dioceseName ?? "", meghala?.name ?? "", shakhaName], line1, line2 };
    }
    if (hierarchy.hierarchyLevel === "meghala") {
      const line1 = [meghala?.name, shakhaName].filter(Boolean).join(" | ");
      return { sortKey: ["", meghala?.name ?? "", shakhaName], line1, line2: null };
    }
    return { sortKey: ["", "", shakhaName], line1: shakhaName, line2: null };
  }

  // "Senior Boy" / "Sub Junior Girl" — the age category alone doesn't say
  // which competitions a participant is eligible for without the gender
  // half too, so both are shown together, not gender alone.
  function categoryGenderLabel(p: ParticipantRow): string {
    const catName = categories.find((c) => c.id === p.competition_category_id)?.name;
    const gender = normGender(p.gender);
    const genderLabel = gender === "boy" ? "Boy" : gender === "girl" ? "Girl" : "";
    return [catName, genderLabel].filter(Boolean).join(" ") || "—";
  }

  const sorted = [...rows].sort((a, b) => {
    const ka = groupInfo(a.shakha_id).sortKey;
    const kb = groupInfo(b.shakha_id).sortKey;
    for (let i = 0; i < 3; i++) {
      const c = ka[i].localeCompare(kb[i]);
      if (c !== 0) return c;
    }
    return (a.registration_number ?? "").localeCompare(b.registration_number ?? "");
  });

  const orgName = org?.org_name_en ?? "";
  const areaName = org?.area_name_en ?? "";

  const cardHtml = (p: ParticipantRow) => {
    const regIds = participantRegs[p.id] ?? [];
    const compNames = regIds.map((id) => compNameById.get(id)).filter((n): n is string => !!n).slice(0, 2);
    const { line1, line2 } = groupInfo(p.shakha_id);
    const compsHtml =
      compNames.length > 0
        ? compNames.map((c) => `<span class="comp">${COMP_SVG}${esc(c)}</span>`).join("")
        : `<span class="comp muted">No individual events</span>`;
    return `<div class="card">
      <div class="hdr">
        ${orgName ? `<div class="org">${esc(orgName)}</div>` : ""}
        ${areaName ? `<div class="area">${esc(areaName)}</div>` : ""}
      </div>
      <div class="row-main">
        <div class="name-block">
          <div class="name">${esc(p.name)}</div>
          ${p.house_name ? `<div class="house">${esc(p.house_name)}</div>` : ""}
        </div>
        <div class="vdiv"></div>
        <div class="regno">${esc(p.registration_number ?? "—")}</div>
      </div>
      <div class="row-meta">
        <span>${esc(categoryGenderLabel(p))}</span>
        <span class="hdiv"></span>
        <span class="shakha">${PIN_SVG}<span class="shakha-text"><span>${esc(line1)}</span>${line2 ? `<span class="shakha-sub">${esc(line2)}</span>` : ""}</span></span>
      </div>
      <div class="row-comps">${compsHtml}</div>
    </div>`;
  };

  const pages: ParticipantRow[][] = [];
  for (let i = 0; i < sorted.length; i += CARDS_PER_PAGE) pages.push(sorted.slice(i, i + CARDS_PER_PAGE));

  const pagesHtml = pages
    .map((pageRows, i) => `<div class="page${i > 0 ? " brk" : ""}"><div class="grid">${pageRows.map(cardHtml).join("")}</div></div>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Registration Cards</title><style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, sans-serif; }
    body { margin: 0; }
    .page.brk { page-break-before: always; break-before: page; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-auto-rows: 65mm; gap: 4mm; padding: 0 5px; }
    .card { border: 1.5px solid #6B46FF; border-radius: 10px; padding: 10px; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; overflow: hidden; }
    .hdr { padding-bottom: 4px; margin-bottom: 7px; border-bottom: 1px solid #E5E7EB; }
    .org { font-size: 12px; font-weight: 800; color: #6B46FF; line-height: 1.2; }
    .area { font-size: 10px; font-weight: 600; color: #6B7280; margin-top: 1px; }
    .row-main { display: flex; align-items: center; gap: 6px; }
    .name-block { flex: 1; min-width: 0; }
    .name { font-size: 18.5px; font-weight: 800; color: #1E1B4B; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .house { font-size: 14px; font-weight: 800; color: #6B46FF; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .vdiv { width: 1px; align-self: stretch; background: #E5E7EB; }
    .regno { font-weight: 800; font-size: 28px; color: #4C1D95; background: #FDE68A; letter-spacing: 0.01em; padding: 5px 9px; border-radius: 8px; white-space: nowrap; flex-shrink: 0; }
    .row-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 16px; font-weight: 800; color: #1E1B4B; flex-wrap: wrap; }
    .shakha { display: flex; align-items: flex-start; gap: 4px; font-size: 12px; }
    .shakha-text { display: flex; flex-direction: column; gap: 1px; }
    .shakha-sub { font-size: 10.5px; font-weight: 700; color: #6B7280; }
    .row-comps { display: flex; flex: 1; flex-direction: column; align-items: flex-start; justify-content: center; gap: 7px; margin-top: 10px; padding-top: 7px; border-top: 1px solid #E5E7EB; }
    .comp { display: flex; align-items: center; gap: 5px; font-size: 13.5px; font-weight: 700; color: #1E1B4B; }
    .comp.muted { color: #9CA3AF; font-weight: 500; font-style: italic; }
    .hdiv { width: 1px; height: 12px; background: #D1D5DB; flex-shrink: 0; }
    </style></head><body>${PRINT_FALLBACK_BUTTON}${pagesHtml}</body></html>`;
}

export default function ParticipantsPage() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const hierarchy = useOrgHierarchy();
  const { shakhas } = hierarchy;
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  const [feastComps, setFeastComps] = useState<FCRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantRegs, setParticipantRegs] = useState<Record<string, string[]>>({}); // participantId -> feastCompetitionIds

  const [shakhaFilter, setShakhaFilter] = useState("");
  const [compFilter, setCompFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ shakhaId: "", name: "", houseName: "", dob: "", gender: "", phone: "" });
  const [selectedComps, setSelectedComps] = useState<string[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Team events
  const [teamCompFilter, setTeamCompFilter] = useState("");
  const [teams, setTeams] = useState<
    { id: string; teamName: string; shakhaId: string; shakhaName: string; feastCompetitionId: string; compName: string; members: string[] }[]
  >([]);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ name: "", shakhaId: "", feastCompetitionId: "", memberIds: [] as string[] });
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamConfirmingDelete, setTeamConfirmingDelete] = useState(false);

  useEffect(() => {
    getOrgSettings().then(setOrg);
    fetchCompetitionCategories().then(setCategories);
    supabase.from("feasts").select("*").order("start_date").then(({ data }) => {
      setFeasts(data ?? []);
      if (data && data.length > 0) setFeastId(data[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!feastId) return;
    setLoading(true);
    const [{ data: fcs }, { data: parts }, { data: regs }, { data: teamRows }] = await Promise.all([
      supabase.from("feast_competitions").select("*, competition:competitions(*, competition_category:competition_categories(*))").eq("feast_id", feastId).order("display_order"),
      supabase.from("participants").select("*, shakha:shakhas(*)").eq("feast_id", feastId).order("created_at"),
      supabase.from("participant_registrations").select("participant_id, feast_competition_id"),
      supabase.from("team_registrations").select("id, team_name, shakha:shakhas(id,name), feast_competition:feast_competitions(id, competition:competitions(name)), team_registration_members(participant:participants(name))").eq("feast_id", feastId),
    ]);
    const fcRows = (fcs ?? []) as unknown as FCRow[];
    setFeastComps(fcRows);

    const regByParticipant: Record<string, string[]> = {};
    for (const r of regs ?? []) {
      (regByParticipant[r.participant_id] ??= []).push(r.feast_competition_id);
    }
    setParticipantRegs(regByParticipant);

    setParticipants(
      (parts ?? []).map((p) => ({ ...p, events: regByParticipant[p.id]?.length ?? 0 }))
    );

    setTeams(
      (teamRows ?? []).map((t) => {
        const shakha = Array.isArray(t.shakha) ? t.shakha[0] : t.shakha;
        const fc = Array.isArray(t.feast_competition) ? t.feast_competition[0] : t.feast_competition;
        const comp = Array.isArray(fc?.competition) ? fc?.competition[0] : fc?.competition;
        const members = (t.team_registration_members ?? []).map((m) => {
          const p = Array.isArray(m.participant) ? m.participant[0] : m.participant;
          return p?.name ?? "";
        });
        return {
          id: t.id,
          teamName: t.team_name,
          shakhaId: shakha?.id ?? "",
          shakhaName: shakha?.name ?? "—",
          feastCompetitionId: fc?.id ?? "",
          compName: comp?.name ?? "—",
          members,
        };
      })
    );

    setLoading(false);
  }, [feastId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [feastId, shakhaFilter, compFilter, search]);

  const individualFeastComps = feastComps.filter((c) => c.competition.type !== "group");
  const teamFeastComps = feastComps.filter((c) => c.competition.type === "group");

  const filtered = useMemo(() => {
    let rows = participants;
    if (shakhaFilter) rows = rows.filter((p) => p.shakha_id === shakhaFilter);
    if (compFilter) rows = rows.filter((p) => participantRegs[p.id]?.includes(compFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.registration_number ?? "").toLowerCase().includes(q) ||
          (p.shakha?.name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [participants, shakhaFilter, compFilter, search, participantRegs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const filteredTeams = useMemo(() => {
    let rows = teams;
    if (teamCompFilter) rows = rows.filter((t) => t.feastCompetitionId === teamCompFilter);
    if (shakhaFilter) rows = rows.filter((t) => t.shakhaId === shakhaFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((t) => t.teamName.toLowerCase().includes(q) || t.members.some((m) => m.toLowerCase().includes(q)));
    return rows;
  }, [teams, teamCompFilter, shakhaFilter, search]);

  // ── Individual panel ────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm({ shakhaId: "", name: "", houseName: "", dob: "", gender: "", phone: "" });
    setSelectedComps([]);
    setPanelError(null);
    setConfirmingDelete(false);
    setPanelOpen(true);
  }

  function openEdit(p: ParticipantRow) {
    setEditId(p.id);
    setForm({
      shakhaId: p.shakha_id ?? "",
      name: p.name,
      houseName: p.house_name ?? "",
      dob: p.date_of_birth ?? "",
      gender: p.gender ?? "",
      phone: p.phone ?? "",
    });
    setSelectedComps(participantRegs[p.id] ?? []);
    setPanelError(null);
    setConfirmingDelete(false);
    setPanelOpen(true);
  }

  const catSlug = getCategorySlug(form.dob, categories);
  const eligibleComps = individualFeastComps.filter((c) => {
    const compCatSlug = c.competition.competition_category?.slug;
    const compGender = normGender(c.competition.gender);
    const genderOk = !compGender || compGender === normGender(form.gender);
    const catOk = !compCatSlug || compCatSlug === catSlug;
    return genderOk && catOk;
  });

  function toggleComp(id: string) {
    setSelectedComps((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  function handleDobOrGenderChange(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    setSelectedComps([]);
  }

  async function handleSaveParticipant() {
    if (!form.name.trim() || !form.dob || !form.gender || !form.shakhaId) {
      setPanelError("Name, DOB, gender and shakha are required.");
      return;
    }
    setSaving(true);
    setPanelError(null);
    const result = editId
      ? await updateParticipant({
          participantId: editId,
          name: form.name,
          houseName: form.houseName,
          dob: form.dob,
          gender: form.gender,
          phone: form.phone,
          feastCompetitionIds: selectedComps,
        })
      : await createParticipantAdmin({
          feastId,
          shakhaId: form.shakhaId,
          name: form.name,
          houseName: form.houseName,
          dob: form.dob,
          gender: form.gender,
          phone: form.phone,
          feastCompetitionIds: selectedComps,
        });
    setSaving(false);
    if (result.error) {
      setPanelError(result.error);
      return;
    }
    setPanelOpen(false);
    load();
  }

  async function handleDeleteParticipant() {
    if (!editId) return;
    await deleteParticipant(editId);
    setPanelOpen(false);
    load();
  }

  // ── Team panel ───────────────────────────────────────────────────────────
  function openCreateTeam() {
    setEditTeamId(null);
    setTeamForm({ name: "", shakhaId: "", feastCompetitionId: "", memberIds: [] });
    setTeamError(null);
    setTeamConfirmingDelete(false);
    setQuickAddOpen(false);
    setTeamPanelOpen(true);
  }

  function openEditTeam(t: (typeof teams)[number]) {
    setEditTeamId(t.id);
    setTeamForm({ name: t.teamName, shakhaId: t.shakhaId, feastCompetitionId: t.feastCompetitionId, memberIds: [] });
    setTeamError(null);
    setTeamConfirmingDelete(false);
    setQuickAddOpen(false);
    // resolve member participant ids
    supabase
      .from("team_registration_members")
      .select("participant_id")
      .eq("team_registration_id", t.id)
      .then(({ data }) => setTeamForm((f) => ({ ...f, memberIds: (data ?? []).map((m) => m.participant_id) })));
    setTeamPanelOpen(true);
  }

  const [eligibleMembers, setEligibleMembers] = useState<Participant[]>([]);
  const loadEligibleMembers = useCallback(async () => {
    if (!teamForm.shakhaId) return;
    const { data } = await supabase.from("participants").select("*").eq("feast_id", feastId).eq("shakha_id", teamForm.shakhaId);
    setEligibleMembers(data ?? []);
  }, [teamForm.shakhaId, feastId]);
  useEffect(() => {
    if (!teamPanelOpen || !teamForm.shakhaId) return;
    loadEligibleMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamPanelOpen, teamForm.shakhaId, feastId]);

  // Quick-add — for when the person being added to a team hasn't been
  // registered as a participant yet. Creates a bare participant (shakha
  // inherited from the team form, no gender/individual-competition entry —
  // this is purely to unblock team member selection) and slots them
  // straight into the eligible list + the team roster.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", houseName: "", dob: "" });
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  function openQuickAdd() {
    setQuickAddForm({ name: "", houseName: "", dob: "" });
    setQuickAddError(null);
    setQuickAddOpen(true);
  }

  async function handleQuickAddParticipant() {
    if (!teamForm.shakhaId) return;
    if (!quickAddForm.name.trim() || !quickAddForm.dob) {
      setQuickAddError("Name and DOB are required.");
      return;
    }
    setQuickAddSaving(true);
    setQuickAddError(null);
    const result = await createParticipantAdmin({
      feastId,
      shakhaId: teamForm.shakhaId,
      name: quickAddForm.name,
      houseName: quickAddForm.houseName,
      dob: quickAddForm.dob,
      gender: "",
      feastCompetitionIds: [],
    });
    setQuickAddSaving(false);
    if (result.error || !result.participantId) {
      setQuickAddError(result.error ?? "Failed to add participant.");
      return;
    }
    await loadEligibleMembers();
    toggleMember(result.participantId);
    setQuickAddOpen(false);
  }

  const teamComp = feastComps.find((c) => c.id === teamForm.feastCompetitionId);
  const maxTeamSize = teamComp?.competition.max_team_size ?? DEFAULT_MAX_TEAM_MEMBERS;

  function toggleMember(id: string) {
    setTeamForm((f) => {
      if (f.memberIds.includes(id)) return { ...f, memberIds: f.memberIds.filter((x) => x !== id) };
      if (f.memberIds.length >= maxTeamSize) return f;
      return { ...f, memberIds: [...f.memberIds, id] };
    });
  }

  async function handleSaveTeam() {
    if (!editTeamId && (!teamForm.shakhaId || !teamForm.feastCompetitionId || !teamForm.name.trim())) {
      setTeamError("Shakha, competition and team name are required.");
      return;
    }
    setSaving(true);
    setTeamError(null);
    const result = editTeamId
      ? await updateTeam({ teamId: editTeamId, teamName: teamForm.name, participantIds: teamForm.memberIds })
      : await registerTeam({
          feastId,
          feastCompetitionId: teamForm.feastCompetitionId,
          shakhaId: teamForm.shakhaId,
          teamName: teamForm.name,
          participantIds: teamForm.memberIds,
        });
    setSaving(false);
    if (result.error) {
      setTeamError(result.error);
      return;
    }
    setTeamPanelOpen(false);
    load();
  }

  async function handleDeleteTeam() {
    if (!editTeamId) return;
    await deleteTeam(editTeamId);
    setTeamPanelOpen(false);
    load();
  }

  // ── Exports ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["Reg No", "Name", "House Name", "Shakha", "Gender", "Category", "Events", "Phone", "Registered"];
    const rows = filtered.map((p) => {
      const cat = categories.find((c) => c.id === p.competition_category_id);
      return [
        p.registration_number ?? "",
        p.name,
        p.house_name ?? "",
        p.shakha?.name ?? "",
        p.gender ?? "",
        cat?.name ?? "",
        String(p.events),
        p.phone ?? "",
        new Date(p.created_at).toLocaleDateString("en-IN"),
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "participants.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const compsToprint = compFilter ? feastComps.filter((c) => c.id === compFilter) : feastComps;
    const orgLine = [org?.org_name_en, org?.area_name_en].filter(Boolean).join(" — ");
    const sections = compsToprint
      .map((fc) => {
        const rows = filtered.filter((p) => participantRegs[p.id]?.includes(fc.id));
        if (rows.length === 0) return "";
        const rowsHtml = rows
          .map(
            (p, i) =>
              `<tr><td>${i + 1}</td><td class="reg">${p.registration_number}</td><td class="name">${p.name}</td><td>${p.house_name ?? ""}</td><td>${p.shakha?.name ?? ""}</td><td class="remarks"></td></tr>`
          )
          .join("");
        const sub = [fc.competition.competition_category?.name, fc.competition.gender && fc.competition.gender !== "common" ? (fc.competition.gender === "boy" ? "Boys" : fc.competition.gender === "girl" ? "Girls" : fc.competition.gender) : null]
          .filter(Boolean)
          .join(" · ");
        return `<div class="sheet">
          <div class="hdr">
            ${orgLine ? `<div class="org">${orgLine}</div>` : ""}
            <div class="comp-name">${fc.competition.name}</div>
            ${sub ? `<div class="comp-sub">${sub}</div>` : ""}
          </div>
          <table><thead><tr><th>SL</th><th>Reg No</th><th>Name</th><th>House Name</th><th>Shakha</th><th>Remarks</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        </div>`;
      })
      .filter(Boolean);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
      @page { size: A4 portrait; margin: 16mm 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Poppins', Arial, sans-serif; margin: 0; }
      .sheet { border: 1px solid #D4D4D8; border-radius: 10px; padding: 12px 16px 20px; }
      .sheet:not(:last-child) { page-break-before: always; }
      .hdr { text-align: center; padding-bottom: 12px; margin-bottom: 10px; border-bottom: 2px solid #7C3AED; }
      .org { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #6B7280; }
      .comp-name { font-size: 25px; font-weight: 800; color: #1e1b4b; margin-top: 4px; }
      .comp-sub { font-size: 14px; font-weight: 600; color: #7C3AED; margin-top: 3px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1.5px solid #999; padding: 9px 8px; font-size: 13.5px; text-align: left; }
      thead tr { background: #EDE9FE; }
      th { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #4C1D95; }
      td.name { font-weight: 700; color: #1e1b4b; }
      td.remarks { min-width: 120px; }
      .reg { font-family: monospace; font-weight: 700; color: #4C1D95; }
      </style></head><body>${PRINT_FALLBACK_BUTTON}${sections.join("")}</body></html>`;
    openPrintWindow(html);
  }

  function exportRegistrationCards() {
    const html = buildRegistrationCardsHtml(filtered, org, hierarchy, participantRegs, individualFeastComps, categories);
    openPrintWindow(html);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#A855F7] text-white">
            <UserCheck className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-neutral-800">Participants</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={exportPDF} className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold">
            <Printer className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={exportRegistrationCards} className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold">
            <IdCard className="h-3.5 w-3.5" /> Cards
          </button>
          <button onClick={openCreate} className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9]">
            Register
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-xs" value={feastId} onChange={(e) => setFeastId(e.target.value)}>
          {feasts.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <HierarchyPicker value={shakhaFilter} onChange={setShakhaFilter} hierarchy={hierarchy} className="input max-w-xs" emptyLabel="All Shakhas" />
        <select className="input max-w-xs" value={compFilter} onChange={(e) => setCompFilter(e.target.value)}>
          <option value="">All Competitions</option>
          {individualFeastComps.map((c) => (
            <option key={c.id} value={c.id}>
              {formatCompetitionOptionLabel(c.competition.name, c.competition.gender, c.competition.competition_category?.name)}
            </option>
          ))}
        </select>
        <div className="relative">
          <input className="input pr-7" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white shadow-md sm:block">
            <table className="min-w-[680px] w-full text-sm">
              <thead style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
                <tr className="border-b-2" style={{ borderColor: "#c4b5fd" }}>
                  {["Reg No", "Name", "House", "Shakha", "Category", "Events", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: "#1e1b4b" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => {
                  const cat = categories.find((c) => c.id === p.competition_category_id);
                  const pill = categoryPill(cat?.name, p.gender);
                  const isEven = i % 2 === 0;
                  return (
                    <tr
                      key={p.id}
                      className="border-b transition-colors"
                      style={{ borderColor: "#e5e7eb", background: isEven ? "#fff" : "#f8f7ff" }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = "#ede9fe")}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = isEven ? "#fff" : "#f8f7ff")}
                    >
                      <td className="whitespace-nowrap px-3 py-3"><RegNoBadge regNo={p.registration_number} /></td>
                      <td className="px-3 py-3"><p className="text-[14px] font-bold leading-tight" style={{ color: "#1e1b4b" }}>{p.name}</p></td>
                      <td className="whitespace-nowrap px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#5B21B6" }}>{p.house_name || "—"}</span></td>
                      <td className="whitespace-nowrap px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#374151" }}>{p.shakha?.name ?? "—"}</span></td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className="inline-block rounded-lg px-2.5 py-1 text-[12px] font-black text-white" style={{ background: pill.color }}>{pill.label}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-xs font-black text-white">{p.events}</span>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => openEdit(p)} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-purple-50 hover:text-[#7C3AED]"><Pencil className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 sm:hidden">
            {pageRows.map((p) => {
              const cat = categories.find((c) => c.id === p.competition_category_id);
              const pill = categoryPill(cat?.name, p.gender);
              return (
                <div key={p.id} className="overflow-hidden rounded-xl bg-white" style={{ border: "1.5px solid #ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
                  <div className="px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-black leading-tight" style={{ color: "#1e1b4b" }}>{p.name}</p>
                        {p.house_name && <p className="mt-0.5 text-[12px] font-black" style={{ color: "#5B21B6" }}>{p.house_name}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">{p.events}</span>
                        <button onClick={() => openEdit(p)} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-purple-50 hover:text-[#7C3AED]"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <RegNoBadge regNo={p.registration_number} />
                      <span className="text-[12px] font-bold" style={{ color: "#374151" }}>{p.shakha?.name ?? "—"}</span>
                      <span className="rounded-lg px-2 py-1 text-[11px] font-black text-white" style={{ background: pill.color }}>{pill.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 disabled:opacity-40">Prev</button>
              <span className="text-neutral-500">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {/* Team Events */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">Team Events</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input max-w-xs" value={teamCompFilter} onChange={(e) => setTeamCompFilter(e.target.value)}>
              <option value="">All Team Events</option>
              {teamFeastComps.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatCompetitionOptionLabel(c.competition.name, c.competition.gender, c.competition.competition_category?.name)}
                </option>
              ))}
            </select>
            <button onClick={openCreateTeam} className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9]">
              Register Team
            </button>
          </div>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white shadow-md sm:block">
          <table className="w-full text-sm">
            <thead style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
              <tr className="border-b-2" style={{ borderColor: "#c4b5fd" }}>
                {["Team", "Shakha", "Competition", "Members", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: "#1e1b4b" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((t, i) => {
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={t.id}
                    className="border-b transition-colors"
                    style={{ borderColor: "#e5e7eb", background: isEven ? "#fff" : "#f8f7ff" }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "#ede9fe")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = isEven ? "#fff" : "#f8f7ff")}
                  >
                    <td className="px-3 py-3"><p className="text-[14px] font-bold leading-tight" style={{ color: "#1e1b4b" }}>{t.teamName}</p></td>
                    <td className="whitespace-nowrap px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#374151" }}>{t.shakhaName}</span></td>
                    <td className="whitespace-nowrap px-3 py-3"><span className="text-[13px] font-semibold" style={{ color: "#5B21B6" }}>{t.compName}</span></td>
                    <td className="px-3 py-3"><span className="text-[12.5px]" style={{ color: "#6B7280" }}>{t.members.join(", ") || "—"}</span></td>
                    <td className="px-3 py-3">
                      <button onClick={() => openEditTeam(t)} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-purple-50 hover:text-[#7C3AED]"><Pencil className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2.5 sm:hidden">
          {filteredTeams.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-xl bg-white" style={{ border: "1.5px solid #ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
              <div className="px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-black leading-tight" style={{ color: "#1e1b4b" }}>{t.teamName}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[12px] font-bold" style={{ color: "#374151" }}>{t.shakhaName}</span>
                    <button onClick={() => openEditTeam(t)} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-purple-50 hover:text-[#7C3AED]"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="mt-1 text-[12px] font-semibold" style={{ color: "#5B21B6" }}>{t.compName}</p>
                {t.members.length > 0 && <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "#6B7280" }}>{t.members.join(", ")}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Register/Edit slide-over */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setPanelOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editId ? "Edit Participant" : "Register Participant"}</h2>
              <button onClick={() => setPanelOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>

            <div className="space-y-3">
              <HierarchyPicker
                value={form.shakhaId}
                onChange={(shakhaId) => setForm({ ...form, shakhaId })}
                hierarchy={hierarchy}
                disabled={!!editId}
              />
              <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="input" placeholder="House Name" value={form.houseName} onChange={(e) => setForm({ ...form, houseName: e.target.value })} />
              <div>
                <input type="date" className="input" value={form.dob} onChange={(e) => handleDobOrGenderChange({ dob: e.target.value })} />
                {catSlug && <p className="mt-1 text-xs text-neutral-500">{CATEGORY_LABELS[catSlug]}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDobOrGenderChange({ gender: "boy" })}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold"
                  style={form.gender === "boy" ? { background: "#3B82F6", color: "#fff" } : { background: "#f3f4f6", color: "#374151" }}
                >
                  Boy
                </button>
                <button
                  onClick={() => handleDobOrGenderChange({ gender: "girl" })}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold"
                  style={form.gender === "girl" ? { background: "#EC4899", color: "#fff" } : { background: "#f3f4f6", color: "#374151" }}
                >
                  Girl
                </button>
              </div>
              <input className="input" placeholder="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-600">Competitions</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selectedComps.length >= 2 ? "bg-amber-50 text-amber-600" : "bg-neutral-100 text-neutral-500"}`}>
                    {selectedComps.length} / 2 selected
                  </span>
                </div>
                {selectedComps.length >= 2 && <p className="mb-1.5 text-[11px] text-amber-600">Maximum 2 competitions allowed. Deselect one to change.</p>}
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                  {eligibleComps.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedComps.includes(c.id)} onChange={() => toggleComp(c.id)} />
                      {c.competition.name}
                    </label>
                  ))}
                  {eligibleComps.length === 0 && <p className="text-xs text-neutral-400">No eligible competitions for this category/gender.</p>}
                </div>
              </div>

              {panelError && <p className="text-sm text-red-600">{panelError}</p>}

              <button onClick={handleSaveParticipant} disabled={saving} className="w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>

              {editId && !confirmingDelete && (
                <button onClick={() => setConfirmingDelete(true)} className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600">
                  Delete Registration
                </button>
              )}
              {editId && confirmingDelete && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="mb-2 text-sm text-red-700">Permanently delete this registration?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmingDelete(false)} className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-sm">Cancel</button>
                    <button onClick={handleDeleteParticipant} className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white">Yes, Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Team edit slide-over */}
      {teamPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setTeamPanelOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editTeamId ? "Edit Team" : "Register Team"}</h2>
              <button onClick={() => setTeamPanelOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              {editTeamId ? (
                <p className="text-xs text-neutral-500">Competition: {teamComp?.competition.name}</p>
              ) : (
                <>
                  <HierarchyPicker
                    value={teamForm.shakhaId}
                    onChange={(shakhaId) => setTeamForm({ ...teamForm, shakhaId, memberIds: [] })}
                    hierarchy={hierarchy}
                  />
                  <select
                    className="input"
                    value={teamForm.feastCompetitionId}
                    onChange={(e) => setTeamForm({ ...teamForm, feastCompetitionId: e.target.value, memberIds: [] })}
                  >
                    <option value="">Select Competition…</option>
                    {teamFeastComps.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCompetitionOptionLabel(c.competition.name, c.competition.gender, c.competition.competition_category?.name)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <input className="input" placeholder="Team name" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-600">Members</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">{teamForm.memberIds.length} / {maxTeamSize} selected</span>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                  {eligibleMembers.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={teamForm.memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                      {m.name}
                    </label>
                  ))}
                  {eligibleMembers.length === 0 && <p className="text-xs text-neutral-400">{teamForm.shakhaId ? "No participants registered for this Shakha yet." : "Select a Shakha to see eligible participants."}</p>}
                </div>

                {teamForm.shakhaId && !quickAddOpen && (
                  <button onClick={openQuickAdd} className="mt-1.5 text-xs font-semibold text-[#7C3AED] hover:underline">
                    + Person not in this list? Add them
                  </button>
                )}

                {quickAddOpen && (
                  <div className="mt-2 space-y-2 rounded-lg border border-[#ddd6fe] bg-[#faf8ff] p-3">
                    <p className="text-xs font-semibold text-neutral-600">Quick-add participant · {shakhas.find((s) => s.id === teamForm.shakhaId)?.name}</p>
                    <input className="input" placeholder="Name" value={quickAddForm.name} onChange={(e) => setQuickAddForm({ ...quickAddForm, name: e.target.value })} />
                    <input className="input" placeholder="House Name" value={quickAddForm.houseName} onChange={(e) => setQuickAddForm({ ...quickAddForm, houseName: e.target.value })} />
                    <input type="date" className="input" value={quickAddForm.dob} onChange={(e) => setQuickAddForm({ ...quickAddForm, dob: e.target.value })} />
                    {quickAddError && <p className="text-xs text-red-600">{quickAddError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setQuickAddOpen(false)} className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-semibold">Cancel</button>
                      <button onClick={handleQuickAddParticipant} disabled={quickAddSaving} className="flex-1 rounded-lg bg-[#7C3AED] py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                        {quickAddSaving ? "Adding…" : "Save & Add to Team"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {teamError && <p className="text-sm text-red-600">{teamError}</p>}
              <button onClick={handleSaveTeam} disabled={saving} className="w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              {editTeamId && !teamConfirmingDelete && (
                <button onClick={() => setTeamConfirmingDelete(true)} className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600">
                  Delete Team Registration
                </button>
              )}
              {editTeamId && teamConfirmingDelete && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="mb-2 text-sm text-red-700">Permanently delete this team?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setTeamConfirmingDelete(false)} className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-sm">Cancel</button>
                    <button onClick={handleDeleteTeam} className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white">Yes, Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.8125rem; width: 100%; }
      `}</style>
    </div>
  );
}
