"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { UserCheck, Pencil, X, Download, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createParticipantAdmin, updateParticipant, deleteParticipant } from "@/actions/feast";
import { registerTeam, updateTeam, deleteTeam } from "@/actions/team";
import { fetchCompetitionCategories, getCategorySlug, CATEGORY_LABELS } from "@/lib/competition-categories";
import { DEFAULT_MAX_TEAM_MEMBERS } from "@/lib/feast-data";
import { openPrintWindow, PRINT_FALLBACK_BUTTON } from "@/lib/print-export";
import type { Competition, CompetitionCategory, Feast, FeastCompetition, Participant, Shakha } from "@/types";

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

export default function ParticipantsPage() {
  const [feasts, setFeasts] = useState<Feast[]>([]);
  const [feastId, setFeastId] = useState("");
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
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
    fetchCompetitionCategories().then(setCategories);
    supabase.from("shakhas").select("*").order("name").then(({ data }) => setShakhas(data ?? []));
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
  function openEditTeam(t: (typeof teams)[number]) {
    setEditTeamId(t.id);
    setTeamForm({ name: t.teamName, shakhaId: t.shakhaId, feastCompetitionId: t.feastCompetitionId, memberIds: [] });
    setTeamError(null);
    setTeamConfirmingDelete(false);
    // resolve member participant ids
    supabase
      .from("team_registration_members")
      .select("participant_id")
      .eq("team_registration_id", t.id)
      .then(({ data }) => setTeamForm((f) => ({ ...f, memberIds: (data ?? []).map((m) => m.participant_id) })));
    setTeamPanelOpen(true);
  }

  const [eligibleMembers, setEligibleMembers] = useState<Participant[]>([]);
  useEffect(() => {
    if (!teamPanelOpen || !teamForm.shakhaId) return;
    supabase
      .from("participants")
      .select("*")
      .eq("feast_id", feastId)
      .eq("shakha_id", teamForm.shakhaId)
      .then(({ data }) => setEligibleMembers(data ?? []));
  }, [teamPanelOpen, teamForm.shakhaId, feastId]);

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
    if (!editTeamId) return;
    setSaving(true);
    setTeamError(null);
    const result = await updateTeam({ teamId: editTeamId, teamName: teamForm.name, participantIds: teamForm.memberIds });
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
    const sections = compsToprint
      .map((fc) => {
        const rows = filtered.filter((p) => participantRegs[p.id]?.includes(fc.id));
        if (rows.length === 0) return "";
        const rowsHtml = rows
          .map(
            (p, i) =>
              `<tr><td>${i + 1}</td><td class="reg">${p.registration_number}</td><td>${p.name}</td><td>${p.house_name ?? ""}</td><td>${p.shakha?.name ?? ""}</td></tr>`
          )
          .join("");
        return `<div class="sheet">
          <div class="hdr">
            <div style="font-size:14px;color:#666;">Cherupushpa Mission League Kalpetta</div>
            <div style="font-size:18px;font-weight:700;">${fc.competition.name} - ${fc.competition.competition_category?.name ?? ""} - ${fc.competition.gender ?? "Common"}</div>
          </div>
          <table><thead><tr><th>SL</th><th>Reg No</th><th>Name</th><th>House Name</th><th>Shakha</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        </div>`;
      })
      .filter(Boolean);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: A4 portrait; margin: 14mm 10mm; }
      * { box-sizing: border-box; font-family: Arial, sans-serif; }
      .sheet { border-left: 3px double #7C3AED; border-right: 3px double #7C3AED; padding: 0 14px 16px; }
      .sheet:not(:last-child) { page-break-before: always; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 5px; font-size: 11px; text-align: left; }
      thead tr { background: #f0f0f0; text-transform: uppercase; }
      .reg { font-family: monospace; font-weight: 700; color: #4C1D95; }
      </style></head><body>${PRINT_FALLBACK_BUTTON}${sections.join("")}</body></html>`;
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
        <select className="input max-w-xs" value={shakhaFilter} onChange={(e) => setShakhaFilter(e.target.value)}>
          <option value="">All Shakhas</option>
          {shakhas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="input max-w-xs" value={compFilter} onChange={(e) => setCompFilter(e.target.value)}>
          <option value="">All Competitions</option>
          {individualFeastComps.map((c) => (
            <option key={c.id} value={c.id}>{c.competition.name}</option>
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
          <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white sm:block">
            <table className="min-w-[680px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
                  <th className="px-3 py-2">Reg No</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">House</th>
                  <th className="px-3 py-2">Shakha</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Events</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => {
                  const cat = categories.find((c) => c.id === p.competition_category_id);
                  const pill = categoryPill(cat?.name, p.gender);
                  return (
                    <tr key={p.id} className={`border-t border-neutral-100 hover:bg-[#ede9fe] ${i % 2 === 0 ? "bg-white" : "bg-[#f8f7ff]"}`}>
                      <td className="px-3 py-2 font-semibold" style={{ fontFamily: "var(--font-anek), sans-serif", color: "#92400E", background: "#FCD34D22" }}>
                        {p.registration_number}
                      </td>
                      <td className="px-3 py-2 font-bold text-[#1e1b4b]">{p.name}</td>
                      <td className="px-3 py-2 text-[#5B21B6]">{p.house_name}</td>
                      <td className="px-3 py-2 text-neutral-700">{p.shakha?.name}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: pill.color }}>{pill.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-bold text-white">{p.events}</span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => openEdit(p)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {pageRows.map((p) => {
              const cat = categories.find((c) => c.id === p.competition_category_id);
              const pill = categoryPill(cat?.name, p.gender);
              return (
                <div key={p.id} className="rounded-xl border-[1.5px] p-3" style={{ borderColor: "#ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-[#1e1b4b]">{p.name}</p>
                      <p className="font-semibold" style={{ fontFamily: "var(--font-anek), sans-serif", color: "#92400E" }}>{p.registration_number}</p>
                    </div>
                    <button onClick={() => openEdit(p)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-1 text-xs text-[#5B21B6]">{p.house_name}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-xs text-neutral-600">{p.shakha?.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: pill.color }}>{pill.label}</span>
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#4C1D95] text-[10px] font-bold text-white">{p.events}</span>
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
          <select className="input max-w-xs" value={teamCompFilter} onChange={(e) => setTeamCompFilter(e.target.value)}>
            <option value="">All Team Events</option>
            {teamFeastComps.map((c) => (
              <option key={c.id} value={c.id}>{c.competition.name}</option>
            ))}
          </select>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-[#1e1b4b] bg-white sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-neutral-500" style={{ background: "linear-gradient(90deg,#ede9fe,#f5f3ff)" }}>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Shakha</th>
                <th className="px-3 py-2">Competition</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-semibold">{t.teamName}</td>
                  <td className="px-3 py-2">{t.shakhaName}</td>
                  <td className="px-3 py-2 text-[#5B21B6]">{t.compName}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{t.members.join(", ")}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEditTeam(t)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 sm:hidden">
          {filteredTeams.map((t) => (
            <div key={t.id} className="rounded-xl border-[1.5px] p-3" style={{ borderColor: "#ddd6fe", boxShadow: "0 2px 8px rgba(107,70,255,0.08)" }}>
              <div className="flex items-start justify-between">
                <p className="font-bold text-black">{t.teamName}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{t.shakhaName}</span>
                  <button onClick={() => openEditTeam(t)} className="text-neutral-400 hover:text-neutral-700"><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-[#5B21B6]">{t.compName}</p>
              <p className="mt-1 text-xs text-neutral-500">{t.members.join(", ")}</p>
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
              <select className="input" value={form.shakhaId} onChange={(e) => setForm({ ...form, shakhaId: e.target.value })} disabled={!!editId}>
                <option value="">Select Shakha…</option>
                {shakhas.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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
              <h2 className="text-base font-semibold">Edit Team</h2>
              <button onClick={() => setTeamPanelOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">Competition: {teamComp?.competition.name}</p>
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
                </div>
              </div>
              {teamError && <p className="text-sm text-red-600">{teamError}</p>}
              <button onClick={handleSaveTeam} disabled={saving} className="w-full rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              {!teamConfirmingDelete && (
                <button onClick={() => setTeamConfirmingDelete(true)} className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600">
                  Delete Team Registration
                </button>
              )}
              {teamConfirmingDelete && (
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
