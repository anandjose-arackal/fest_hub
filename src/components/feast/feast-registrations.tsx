"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, UserX, Lock, Pencil, Download } from "lucide-react";
import { useFeast, useOrgHierarchy } from "@/hooks/use-feast";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getDescendantShakhaIds } from "@/lib/org-hierarchy";
import { CATEGORY_LABELS, CATEGORY_COLORS, FeastTopBar, theme } from "./feast-shared";

interface ParticipantRow {
  id: string;
  name: string;
  house_name: string | null;
  shakha_id: string | null;
  registration_number: string | null;
  gender: string | null;
  shakha: { name: string } | null;
}
interface RegRow { id: string; feast_competition_id: string; participant: ParticipantRow | null; }
interface TeamRow { id: string; feast_competition_id: string; team_name: string; memberNames: string[]; }

function normGender(g: string | null | undefined) {
  if (!g) return null;
  if (g === "boy") return "boys";
  if (g === "girl") return "girls";
  return "common";
}
function genderLetter(g: string | null | undefined) {
  if (!g) return "";
  if (g === "boy") return "B";
  if (g === "girl") return "G";
  return "";
}
const CATEGORY_ORDER = ["sub_junior", "junior", "senior", "super_senior", "elder"] as const;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const GENDER_STYLE: Record<string, { label: string; color: string }> = {
  boys: { label: "Boys", color: "#1d4ed8" },
  girls: { label: "Girls", color: "#be185d" },
  common: { label: "Common", color: "#15803d" },
};
const ICON_GRADS = [["#7C3AED", "#A855F7"], ["#EC4899", "#F472B6"], ["#F59E0B", "#FCD34D"], ["#10B981", "#34D399"], ["#3B82F6", "#60A5FA"]];

function AccordionRow({ compName, gender, catSlug, regs, idx, onEdit, editLocked }: {
  compName: string; gender: string | null | undefined; catSlug: string | null | undefined; regs: RegRow[]; idx: number; onEdit: (id: string) => void; editLocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ng = normGender(gender);
  const gStyle = ng ? GENDER_STYLE[ng] : null;
  const catLabel = catSlug ? CATEGORY_LABELS[catSlug] : null;
  const catColor = catSlug ? CATEGORY_COLORS[catSlug] : null;
  const [a, b] = ICON_GRADS[idx % ICON_GRADS.length];

  return (
    <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: theme.glassStrong.background, border: `1px solid ${theme.hairline}` }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left">
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl text-[16px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: `0 6px 16px ${a}40` }}>{idx + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-snug" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>
            {compName}
            {gStyle && <span style={{ color: gStyle.color }}> · {gStyle.label}</span>}
            {catLabel && catColor && <span style={{ color: catColor }}> · {catLabel}</span>}
          </div>
        </div>
        <div className="mr-1 shrink-0 rounded-full px-2.5 py-1 text-[13px] font-black" style={{ background: regs.length > 0 ? `${a}22` : theme.fill, color: regs.length > 0 ? a : theme.faint }}>{regs.length}</div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform" style={{ background: a, transform: open ? "rotate(180deg)" : undefined }}><ChevronDown className="h-4 w-4 text-white" strokeWidth={3} /></div>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${theme.hairline}` }}>
          {regs.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-5"><UserX className="h-[22px] w-[22px]" style={{ color: theme.faint }} /><p className="text-[12.5px]" style={{ color: theme.faint }}>No registrations from your shakha</p></div>
          ) : (
            regs.map((r, ri) => {
              if (!r.participant) return null;
              const p = r.participant;
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: ri < regs.length - 1 ? `1px solid ${theme.hairline}` : undefined, background: ri % 2 === 1 ? "rgba(var(--fp-primary-rgb),0.05)" : undefined }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-extrabold leading-snug" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{p.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold" style={{ color: theme.sub, fontFamily: "var(--font-anek), sans-serif" }}>
                      {p.house_name && <span>{p.house_name}</span>}
                      {p.house_name && p.shakha?.name && <span style={{ color: theme.faint }}>·</span>}
                      {p.shakha?.name && <span>{p.shakha.name}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.registration_number && <span className="rounded-[5px] border border-dashed px-2.5 py-1 text-[13px] font-extrabold tracking-wide" style={{ background: "#FCD34D", color: "#451A03", fontFamily: "var(--font-anek), sans-serif", borderColor: "rgba(120,53,15,0.4)" }}>{p.registration_number}</span>}
                    {!editLocked && (
                      <button onClick={(e) => { e.stopPropagation(); onEdit(p.id); }} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: theme.fillStrong }}>
                        <Pencil className="h-[13px] w-[13px]" style={{ color: theme.purple }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function TeamAccordionRow({ compName, gender, catSlug, team, idx, onEditTeam, editLocked }: {
  compName: string; gender: string | null | undefined; catSlug: string | null | undefined; team: TeamRow | null; idx: number; onEditTeam: (id: string) => void; editLocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ng = normGender(gender);
  const gStyle = ng ? GENDER_STYLE[ng] : null;
  const catLabel = catSlug ? CATEGORY_LABELS[catSlug] : null;
  const catColor = catSlug ? CATEGORY_COLORS[catSlug] : null;
  const [a, b] = ICON_GRADS[idx % ICON_GRADS.length];

  return (
    <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: theme.glassStrong.background, border: `1px solid ${theme.hairline}` }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left">
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl text-[16px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: `0 6px 16px ${a}40` }}>{idx + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-snug" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>
            {compName}
            {gStyle && <span style={{ color: gStyle.color }}> · {gStyle.label}</span>}
            {catLabel && catColor && <span style={{ color: catColor }}> · {catLabel}</span>}
            <span style={{ color: theme.faint }}> · Team</span>
          </div>
        </div>
        <div className="mr-1 shrink-0 rounded-full px-2.5 py-1 text-[13px] font-black" style={{ background: team ? `${a}22` : theme.fill, color: team ? a : theme.faint }}>{team ? 1 : 0}</div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform" style={{ background: a, transform: open ? "rotate(180deg)" : undefined }}><ChevronDown className="h-4 w-4 text-white" strokeWidth={3} /></div>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${theme.hairline}` }}>
          {!team ? (
            <div className="flex flex-col items-center gap-1.5 py-5"><UserX className="h-[22px] w-[22px]" style={{ color: theme.faint }} /><p className="text-[12.5px]" style={{ color: theme.faint }}>No team registered from your shakha</p></div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-extrabold leading-snug" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{team.team_name}</div>
                <p className="mt-1 text-xs font-semibold leading-snug" style={{ color: theme.sub, fontFamily: "var(--font-anek), sans-serif" }}>{team.memberNames.join(", ") || "No members yet"}</p>
              </div>
              {!editLocked && (
                <button onClick={(e) => { e.stopPropagation(); onEditTeam(team.id); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: theme.fillStrong }}>
                  <Pencil className="h-[13px] w-[13px]" style={{ color: theme.purple }} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FeastRegistrations({ slug }: { slug: string }) {
  const router = useRouter();
  const { feast, loading: feastLoading } = useFeast(slug);
  const { session, adminScope } = useAuth();
  const orgHierarchy = useOrgHierarchy();
  // Generalizes the old single myShakhaId: a shakha-scoped admin still
  // covers just themselves, but a meghala/diocese-scoped admin now covers
  // every shakha beneath their node — see src/lib/org-hierarchy.ts.
  // undefined = still resolving (auth or hierarchy loading), null = signed
  // out or no scope at all, array = ready (possibly empty).
  const scopeShakhaIds = useMemo(() => {
    if (!session || !adminScope) return null;
    if (orgHierarchy.loading) return undefined;
    return getDescendantShakhaIds(adminScope, orgHierarchy);
  }, [session, adminScope, orgHierarchy.loading, orgHierarchy.meghalas, orgHierarchy.shakhas]);
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [teamRegs, setTeamRegs] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const retry = () => { setLoadError(null); setLoading(true); setRetryTick((t) => t + 1); };

  useEffect(() => {
    if (!feast || scopeShakhaIds === undefined) return;
    const individualIds = feast.competitions.filter((c) => c.cat !== "Team").map((c) => c.id);
    const teamIds = feast.competitions.filter((c) => c.cat === "Team").map((c) => c.id);
    if (individualIds.length === 0 && teamIds.length === 0) { setLoading(false); return; }

    Promise.all([
      individualIds.length === 0
        ? Promise.resolve({ data: [] })
        : supabase.from("participant_registrations").select("id, feast_competition_id, participant:participants(id, name, house_name, shakha_id, registration_number, gender, shakha:shakhas(name))").in("feast_competition_id", individualIds),
      !scopeShakhaIds?.length || teamIds.length === 0
        ? Promise.resolve({ data: [] })
        : supabase.from("team_registrations").select("id, feast_competition_id, team_name, members:team_registration_members(participant:participants(name))").in("shakha_id", scopeShakhaIds).in("feast_competition_id", teamIds),
    ])
      .then(([{ data: regData }, { data: teamData }]) => {
        const all = (regData ?? []).map((row) => {
          const r = row as unknown as { id: string; feast_competition_id: string; participant: ParticipantRow | ParticipantRow[] | null };
          const p = Array.isArray(r.participant) ? r.participant[0] : r.participant;
          if (p) p.shakha = Array.isArray(p.shakha) ? (p.shakha as unknown as { name: string }[])[0] ?? null : p.shakha;
          return { id: r.id, feast_competition_id: r.feast_competition_id, participant: p } as RegRow;
        });
        const filtered = scopeShakhaIds?.length ? all.filter((r) => scopeShakhaIds.includes(r.participant?.shakha_id ?? "")) : all;
        setRegs(filtered);

        const teams = (teamData ?? []).map((row) => {
          const t = row as unknown as { id: string; feast_competition_id: string; team_name: string; members: { participant: { name: string } | { name: string }[] | null }[] };
          const memberNames = (t.members ?? [])
            .map((m) => { const p = Array.isArray(m.participant) ? m.participant[0] : m.participant; return p?.name ?? null; })
            .filter((n): n is string => !!n);
          return { id: t.id, feast_competition_id: t.feast_competition_id, team_name: t.team_name, memberNames };
        });
        setTeamRegs(teams);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setLoadError("Couldn't load registrations. Check your connection and try again."); });
  }, [feast, scopeShakhaIds, retryTick]);

  const editLocked = !!feast?.registrationEditDeadline && new Date() >= new Date(feast.registrationEditDeadline);

  const errorState = (
    <div>
      <FeastTopBar title="My Registrations" onBack={() => router.push(`/feast/${slug}`)} />
      <div className="flex flex-col items-center justify-center gap-4 px-6 pb-8 pt-16">
        <p className="text-center text-[13px] leading-relaxed" style={{ color: theme.sub }}>{loadError}</p>
        <button onClick={retry} className="rounded-full px-6 py-2.5 text-[13px] font-semibold" style={{ background: theme.fillStrong, color: theme.purple }}>Retry</button>
      </div>
    </div>
  );

  if (scopeShakhaIds === undefined) {
    return loadError ? errorState : <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;
  }

  if (!session || scopeShakhaIds === null) {
    return (
      <div>
        <FeastTopBar title="My Registrations" onBack={() => router.push(`/feast/${slug}`)} />
        <div className="flex flex-col items-center justify-center gap-5 pb-8 pt-16">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, rgba(var(--fp-primary-rgb),0.13), rgba(var(--fp-primary-rgb),0.20))", border: "1.5px solid rgba(var(--fp-primary-rgb),0.20)" }}><Lock className="h-[30px] w-[30px]" style={{ color: theme.purple }} /></div>
          <div className="text-center">
            <p className="mb-1.5 text-[17px] font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>Not Authorised</p>
            <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed" style={{ color: theme.sub }}>{!session ? "Please log in as an admin to view registrations." : "Your account is not linked to a shakha. Contact your administrator."}</p>
          </div>
          <button onClick={() => router.push(`/feast/${slug}`)} className="rounded-full px-6 py-2.5 text-[13px] font-semibold" style={{ background: theme.fillStrong, color: theme.purple }}>Go Back</button>
        </div>
      </div>
    );
  }

  if (feastLoading || loading) {
    return loadError ? errorState : <div className="flex justify-center pt-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.lavender }} /></div>;
  }
  if (!feast) return null;

  const regsByComp: Record<string, RegRow[]> = {};
  for (const r of regs) (regsByComp[r.feast_competition_id] ??= []).push(r);
  const teamByComp: Record<string, TeamRow> = {};
  for (const t of teamRegs) teamByComp[t.feast_competition_id] = t;

  const totalRegs = regs.length;
  const shakhaLabel = adminScope?.name ?? "Your Shakha";

  function downloadRegistrationsPDF() {
    if (!feast || totalRegs === 0) return;
    const compById: Record<string, { name: string; catSlug: string | null }> = {};
    for (const c of feast.competitions) compById[c.id] = { name: c.name, catSlug: c.competitionCategorySlug ?? null };

    const buckets: Record<string, RegRow[]> = {};
    for (const r of regs) {
      if (!r.participant) continue;
      const catSlug = compById[r.feast_competition_id]?.catSlug ?? "other";
      (buckets[catSlug] ??= []).push(r);
    }

    let sl = 0;
    const sectionsHtml = [...CATEGORY_ORDER, "other"]
      .filter((s) => buckets[s]?.length)
      .map((s) => {
        const label = s === "other" ? "Other" : CATEGORY_LABELS[s] ?? s;
        const rows = buckets[s]
          .map((r) => {
            const p = r.participant!;
            sl += 1;
            const compName = compById[r.feast_competition_id]?.name ?? "";
            return `<tr><td class="sl">${sl}</td><td class="reg">${esc(p.registration_number ?? "—")}</td><td class="name">${esc(p.name)}</td><td class="house">${esc(p.house_name ?? "—")}</td><td class="bg">${esc(genderLetter(p.gender))}</td><td class="comp">${esc(compName)}</td></tr>`;
          })
          .join("");
        return `<tr class="cat-head"><td colspan="6">${esc(label)}</td></tr>${rows}`;
      })
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Registrations — ${esc(shakhaLabel)}</title><style>
      @page { size: A4 portrait; margin: 16mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; border-left: 3px solid #6B46FF; border-right: 3px solid #6B46FF; padding: 0 12px; }
      .hdr { text-align: center; margin-bottom: 16px; }
      .hdr .feast { font-size: 24px; font-weight: 900; color: #4C1D95; margin: 10px 0 4px; }
      .hdr .shakha { font-size: 14px; font-weight: 700; color: #333; display: inline-block; background: #f0edff; padding: 4px 12px; border-radius: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #333; padding: 5px 6px; text-align: left; font-size: 12.5px; }
      thead th { background: #f0f0f0; font-size: 11px; text-transform: uppercase; }
      td.sl, td.bg { text-align: center; font-weight: 700; }
      td.reg { font-family: "Courier New", monospace; font-weight: 700; }
      tr.cat-head td { background: #e5e0ff; font-weight: 800; text-transform: uppercase; font-size: 12px; }
      @media print { .noprint { display: none; } }
      .noprint { text-align: center; margin: 18px 0; }
      </style></head><body>
      <div class="hdr"><p class="feast">${esc(feast.name)}</p><p class="shakha">Registrations for ${esc(shakhaLabel)}</p></div>
      <table><thead><tr><th>SL</th><th>Reg No</th><th>Participant Name</th><th>House Name</th><th>B/G</th><th>Competition</th></tr></thead><tbody>${sectionsHtml}</tbody></table>
      <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      setPdfError("Allow pop-ups to download the registration sheet.");
      setTimeout(() => setPdfError(null), 3000);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div>
      <FeastTopBar title="My Registrations" onBack={() => router.push(`/feast/${slug}`)} />

      <div className="mb-4 flex items-center gap-4 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(var(--fp-primary-rgb),0.09), rgba(var(--fp-primary-rgb),0.07))", border: "1px solid rgba(var(--fp-primary-rgb),0.13)" }}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${theme.purple}, ${theme.lavender})` }}><span className="text-[20px] font-bold text-white">{totalRegs}</span></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold" style={{ color: theme.text, fontFamily: "var(--font-anek), sans-serif" }}>{shakhaLabel}</div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: theme.sub }}>{totalRegs === 0 ? "No registrations yet" : `${totalRegs} registration${totalRegs > 1 ? "s" : ""} across ${feast.name}`}</div>
        </div>
        <button onClick={downloadRegistrationsPDF} disabled={totalRegs === 0} className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2.5 disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${theme.purple}, ${theme.lavender})` }}>
          <Download className="h-[15px] w-[15px] text-white" strokeWidth={2.5} /><span className="text-[12.5px] font-bold text-white">Download</span>
        </button>
      </div>
      {pdfError && <div className="mb-3 px-1 text-[12.5px] font-medium" style={{ color: "#EF4444" }}>{pdfError}</div>}

      {feast.competitions.map((c, i) =>
        c.cat === "Team" ? (
          <TeamAccordionRow key={c.id} compName={c.name} gender={c.gender} catSlug={c.competitionCategorySlug} team={teamByComp[c.id] ?? null} idx={i} onEditTeam={(id) => router.push(`/feast/${slug}/registrations/edit-team/${id}`)} editLocked={editLocked} />
        ) : (
          <AccordionRow key={c.id} compName={c.name} gender={c.gender} catSlug={c.competitionCategorySlug} regs={regsByComp[c.id] ?? []} idx={i} onEdit={(id) => router.push(`/feast/${slug}/registrations/edit/${id}`)} editLocked={editLocked} />
        )
      )}
    </div>
  );
}
