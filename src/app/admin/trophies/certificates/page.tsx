"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Award, ChevronDown, RotateCw, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCertificateBoard, markCertificateHandover, undoCertificateHandover, type CertificateBoard } from "@/actions/handover";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { theme } from "@/components/feast/feast-shared";
import { GradeBadge, Medal, ProgressBar } from "@/components/feast/feast-ui";
import { competitionCategoryLabel } from "@/components/feast/feast-shared-results";
import {
  ActionButton, Card, HandoverPanel, MarkDialog, PageHeading, SearchField, SelectField, StampLine, UndoDialog,
} from "@/components/admin/handover-ui";
import {
  buildCertificateUnits, certCoverage, compareFestsForDashboard, coveredViaMeghala, summarizeUnits,
  type CertEntry, type CertTally, type MeghalaUnitRow, type ShakhaUnitRow, type UnitStamp,
} from "@/lib/handover";

const POLL_MS = 30_000;

type Dialog =
  | { kind: "unit"; scope: "meghala" | "shakha"; unitId: string; name: string; pending: number }
  | { kind: "cert"; cert: CertEntry }
  | { kind: "undo"; handoverId: string; title: string; subtitle: string }
  | null;

function unitStatus(t: CertTally): { label: string; tone: "ok" | "warn" | "muted" } {
  if (t.total === 0) return { label: "No certificates", tone: "muted" };
  if (t.pending > 0) return { label: `${t.pending} pending`, tone: "warn" };
  if (t.total === t.notPrinted) return { label: "Not printed", tone: "muted" };
  const base = coveredViaMeghala(t) ? "Covered via Mekhala" : "Handed over";
  return { label: t.notPrinted > 0 ? `${base} · ${t.notPrinted} not printed` : base, tone: "ok" };
}

const TONE_STYLE = {
  ok: { background: "var(--fp-ok-bg)", color: "var(--fp-ok)" },
  warn: { background: "var(--fp-warn-bg)", color: "var(--fp-warn)" },
  muted: { background: "var(--fp-muted-bg)", color: "var(--fp-muted-fg)" },
} as const;

function StatusPill({ t }: { t: CertTally }) {
  const s = unitStatus(t);
  return <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold" style={TONE_STYLE[s.tone]}>{s.label}</span>;
}

function Stamps({ stamps, onUndo, unitName }: { stamps: UnitStamp[]; onUndo: (d: Dialog) => void; unitName: string }) {
  if (stamps.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {stamps.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StampLine stamp={s} verb={`${s.certificateCount} handed over`} />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11.5px] font-extrabold"
            style={{ color: "#DC2626" }}
            onClick={() => onUndo({ kind: "undo", handoverId: s.id, title: "Undo certificate handover?", subtitle: `${unitName} · ${s.certificateCount} certificates` })}
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        </li>
      ))}
    </ul>
  );
}

const COVERED_VIA = { trophy: "Given with trophy", individual: "Given individually", shakha: "Via Shakha", meghala: "Via Mekhala" } as const;

function CertList({ certs, units, onDialog }: { certs: CertEntry[]; units: UnitStamp[]; onDialog: (d: Dialog) => void }) {
  if (certs.length === 0) return <p className="px-1 py-2 text-[12.5px] font-semibold" style={{ color: theme.sub }}>No certificates.</p>;
  // Item by item; within an item, 1st–3rd first, then the graded entries.
  const sorted = [...certs].sort(
    (a, b) => a.competitionName.localeCompare(b.competitionName) || (a.position ?? 9) - (b.position ?? 9) || a.name.localeCompare(b.name)
  );
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((c) => {
        const cov = certCoverage(c, units);
        const label = competitionCategoryLabel({ cat: c.isTeam ? "Team" : "", competitionCategorySlug: c.categorySlug, gender: c.gender });
        return (
          <li key={`${c.isTeam ? "t" : "i"}:${c.resultId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2" style={{ background: theme.surface3 }}>
            {c.position ? <Medal pos={c.position} size={28} /> : <GradeBadge grade={c.grade} size={28} />}
            <span className="min-w-0 flex-1">
              <span className="fp-ml block text-[14px] font-extrabold leading-tight" style={{ color: theme.text }}>
                {c.name}{c.isTeam && c.count > 1 ? ` (${c.count})` : ""}
              </span>
              <span className="fp-ml block text-[12px] font-semibold" style={{ color: theme.sub }}>
                {c.competitionName}{label ? ` · ${label}` : ""}
              </span>
            </span>
            {cov.state === "covered" ? (
              <span className="flex items-center gap-2">
                <span className="text-[11.5px] font-extrabold" style={{ color: "var(--fp-ok)" }}>
                  ✓ {COVERED_VIA[cov.via]}
                </span>
                {cov.via === "individual" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11.5px] font-extrabold"
                    style={{ color: "#DC2626" }}
                    onClick={() => onDialog({ kind: "undo", handoverId: cov.handover.id, title: "Undo certificate handover?", subtitle: `${c.name} · ${c.competitionName}` })}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                )}
              </span>
            ) : cov.state === "not_printed" ? (
              <span className="text-[11.5px] font-extrabold" style={{ color: theme.faint }}>Not printed</span>
            ) : (
              <ActionButton tone="ghost" className="min-h-[32px] px-2.5" onClick={() => onDialog({ kind: "cert", cert: c })}>
                Mark individually
              </ActionButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ShakhaRowView({ row, units, onDialog, nested }: { row: ShakhaUnitRow; units: UnitStamp[]; onDialog: (d: Dialog) => void; nested: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={nested ? "" : "rounded-2xl"} style={{ borderTop: nested ? `1px solid ${theme.line}` : undefined }}>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: theme.faint }} />
          <span className="min-w-0">
            <span className="fp-ml block truncate text-[14.5px] font-extrabold" style={{ color: theme.text }}>{row.name}</span>
            <span className="block text-[11.5px] font-bold" style={{ color: theme.sub }}>
              {row.tally.total} certificate{row.tally.total === 1 ? "" : "s"}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2 pl-6 sm:pl-0">
          <StatusPill t={row.tally} />
          {row.canMark && row.shakhaId && (
            <ActionButton onClick={() => onDialog({ kind: "unit", scope: "shakha", unitId: row.shakhaId!, name: row.name, pending: row.tally.pending })} className="min-h-[34px]">
              Mark handed over
            </ActionButton>
          )}
        </div>
      </div>
      {row.handovers.length > 0 && (
        <div className="px-4 pb-2 pl-10">
          <Stamps stamps={row.handovers} onUndo={onDialog} unitName={row.name} />
        </div>
      )}
      {open && (
        <div className="px-4 pb-3 sm:pl-10">
          <CertList certs={row.certs} units={units} onDialog={onDialog} />
        </div>
      )}
    </li>
  );
}

function MeghalaCard({ row, units, onDialog, hideEmpty }: { row: MeghalaUnitRow; units: UnitStamp[]; onDialog: (d: Dialog) => void; hideEmpty: boolean }) {
  const shakhas = hideEmpty ? row.shakhas.filter((s) => s.tally.total > 0) : row.shakhas;
  return (
    <Card className="overflow-hidden">
      {row.name && (
        <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between" style={{ background: theme.surface3 }}>
          <div className="min-w-0">
            <p className="fp-ml truncate text-[16px] font-extrabold" style={{ color: theme.text }}>
              {row.name}
              {row.meghalaId && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.faint }}>Mekhala</span>}
            </p>
            <p className="text-[11.5px] font-bold" style={{ color: theme.sub }}>
              {row.tally.total} certificates · {row.shakhas.length} Shakhas
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill t={row.tally} />
            {row.canMark && row.meghalaId && (
              <ActionButton onClick={() => onDialog({ kind: "unit", scope: "meghala", unitId: row.meghalaId!, name: row.name, pending: row.tally.pending })} className="min-h-[34px]">
                Mark Mekhala handed over
              </ActionButton>
            )}
          </div>
        </div>
      )}
      {row.handovers.length > 0 && (
        <div className="px-4 py-2" style={{ borderTop: `1px solid ${theme.line}` }}>
          <Stamps stamps={row.handovers} onUndo={onDialog} unitName={row.name} />
        </div>
      )}
      {shakhas.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] font-semibold" style={{ color: theme.sub, borderTop: `1px solid ${theme.line}` }}>No certificates.</p>
      ) : (
        <ul>
          {shakhas.map((s) => <ShakhaRowView key={s.shakhaId ?? "none"} row={s} units={units} onDialog={onDialog} nested />)}
        </ul>
      )}
    </Card>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: theme.surface3 }}>
      <p className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: theme.faint }}>{label}</p>
      <p className="fp-num mt-1 text-[22px]" style={{ color: theme.text }}>{value}</p>
      {sub && <p className="text-[11px] font-bold" style={{ color: theme.sub }}>{sub}</p>}
    </div>
  );
}

interface FestOption { id: string; name: string; status: string; start_date: string | null }

function CertificateHandoverInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hierarchy = useOrgHierarchy();
  const [fests, setFests] = useState<FestOption[]>([]);
  const feastId = params.get("feast") ?? "";
  const [loaded, setLoaded] = useState<CertificateBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(false);

  const selectFeast = useCallback((id: string) => router.replace(`/admin/trophies/certificates?feast=${id}`), [router]);

  useEffect(() => {
    supabase
      .from("feasts")
      .select("id, name, status, start_date")
      .neq("status", "draft")
      .then(({ data }) => {
        const list = ((data ?? []) as FestOption[]).sort(compareFestsForDashboard);
        setFests(list);
        if (!feastId && list.length > 0) selectFeast(list[0].id);
      });
  }, [feastId, selectFeast]);

  const load = useCallback(async () => {
    if (!feastId) return;
    const res = await getCertificateBoard(feastId);
    if (res.error || !res.data) {
      setError(res.error ?? "Could not load certificates.");
      return;
    }
    setError(null);
    setLoaded(res.data);
  }, [feastId]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive && document.visibilityState === "visible") load();
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  // Ignore the previous fest's board while a newly selected one loads.
  const board = loaded && loaded.feast.id === feastId ? loaded : null;

  const rows = useMemo(() => {
    if (!board || hierarchy.loading) return [];
    return buildCertificateUnits(board.certs, board.units, {
      level: hierarchy.hierarchyLevel,
      dioceses: hierarchy.dioceses,
      meghalas: hierarchy.meghalas,
      shakhas: hierarchy.shakhas,
    });
  }, [board, hierarchy.loading, hierarchy.hierarchyLevel, hierarchy.dioceses, hierarchy.meghalas, hierarchy.shakhas]);
  const summary = useMemo(() => summarizeUnits(rows), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r) => {
        const meghalaMatch = !q || r.name.toLowerCase().includes(q);
        let shakhas = r.shakhas;
        if (q && !meghalaMatch) shakhas = shakhas.filter((s) => s.name.toLowerCase().includes(q));
        if (pendingOnly) shakhas = shakhas.filter((s) => s.tally.pending > 0);
        return { ...r, shakhas };
      })
      .filter((r) => r.shakhas.length > 0 && (!hideEmpty || r.shakhas.some((s) => s.tally.total > 0)));
  }, [rows, search, hideEmpty, pendingOnly]);

  const byDiocese = useMemo(() => {
    if (hierarchy.hierarchyLevel !== "diocese") return [{ id: "", name: "", rows: visibleRows }];
    const groups = hierarchy.dioceses.map((d) => ({ id: d.id, name: d.name, rows: visibleRows.filter((r) => r.dioceseId === d.id) }));
    const rest = visibleRows.filter((r) => !r.dioceseId || !hierarchy.dioceses.some((d) => d.id === r.dioceseId));
    if (rest.length > 0) groups.push({ id: "__rest__", name: "Other", rows: rest });
    return groups.filter((g) => g.rows.length > 0);
  }, [visibleRows, hierarchy.hierarchyLevel, hierarchy.dioceses]);

  const useMeghalas = hierarchy.hierarchyLevel !== "shakha";
  const c = summary.certificates;
  const printed = c.total - c.notPrinted;
  const pct = printed === 0 ? 0 : Math.round((c.covered / printed) * 100);

  return (
    <HandoverPanel>
      <Link href="/admin/trophies" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: "var(--fp-link)" }}>
        <ArrowLeft className="h-4 w-4" /> Trophy Dashboard
      </Link>
      <PageHeading
        icon={<Award className="h-5 w-5" />}
        title="Certificate Handover"
        sub={`1st–3rd and grade certificates, handed over in bulk per ${useMeghalas ? "Mekhala / Shakha" : "Shakha"}`}
        right={
          <ActionButton tone="ghost" busy={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
            {!refreshing && <RotateCw className="h-4 w-4" />} Refresh
          </ActionButton>
        }
      />

      <div className="mb-3">
        <SelectField label="Fest" value={feastId} onChange={selectFeast} className="w-full sm:w-auto sm:min-w-[320px]">
          {!feastId && <option value="">Select a fest…</option>}
          {fests.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </SelectField>
      </div>

      {error && <p className="mb-3 rounded-xl px-3 py-2 text-sm font-bold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>{error}</p>}

      {board && (
        <Card className="mb-3 p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {useMeghalas && <SummaryStat label="Mekhalas" value={`${summary.meghalas.covered} covered`} sub={`${summary.meghalas.pending} pending`} />}
            <SummaryStat label="Shakhas" value={`${summary.shakhas.covered} covered`} sub={`${summary.shakhas.pending} pending`} />
            <SummaryStat label="Certificates" value={`${c.covered} / ${printed}`} sub={`${c.pending} pending${c.notPrinted ? ` · ${c.notPrinted} not printed` : ""}`} />
            <SummaryStat label="Given with trophies" value={`${c.viaTrophy}`} sub="1st–3rd winners" />
          </div>
          <div className="mt-3">
            <ProgressBar pct={pct} fill={pct === 100 ? "var(--fp-ok)" : "var(--fp-btn)"} height={8} animate={false} />
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <SearchField value={search} onChange={setSearch} placeholder={useMeghalas ? "Search Mekhala or Shakha…" : "Search Shakha…"} />
        </div>
        <label className="inline-flex items-center gap-2 text-[12.5px] font-bold" style={{ color: theme.sub }}>
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} className="h-4 w-4" /> Pending only
        </label>
        <label className="inline-flex items-center gap-2 text-[12.5px] font-bold" style={{ color: theme.sub }}>
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="h-4 w-4" /> Hide units with no certificates
        </label>
      </div>

      {!board && !error ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl" style={{ background: theme.surface3 }} />)}
        </div>
      ) : board && visibleRows.length === 0 ? (
        <Card className="p-8 text-center text-sm font-semibold" style={{ color: theme.sub }}>
          {board.certs.length === 0 ? "No certificates published for this fest yet." : "Nothing matches these filters."}
        </Card>
      ) : (
        <div className="space-y-5">
          {byDiocese.map((g) => (
            <section key={g.id || "all"}>
              {g.name && <p className="fp-cap mb-2 px-1" style={{ color: theme.goldInk }}>{g.name}</p>}
              <div className="space-y-3">
                {g.rows.map((r) => (
                  <MeghalaCard key={r.meghalaId ?? "unassigned"} row={r} units={board?.units ?? []} onDialog={setDialog} hideEmpty={hideEmpty} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {dialog?.kind === "unit" && (
        <MarkDialog
          title={`Certificates — ${dialog.name}`}
          subtitle={<>{dialog.pending} certificate{dialog.pending === 1 ? "" : "s"} to hand over to this {dialog.scope === "meghala" ? "Mekhala" : "Shakha"}&apos;s representative.</>}
          receiverRequired
          onCancel={() => setDialog(null)}
          onConfirm={async (r) => {
            const res = await markCertificateHandover({ feastId, scope: dialog.scope, unitId: dialog.unitId, receiverName: r.receiverName, receiverPhone: r.receiverPhone });
            if (res.error) return res.error;
            setDialog(null);
            await load();
            return null;
          }}
        />
      )}
      {dialog?.kind === "cert" && (
        <MarkDialog
          title="Certificate handed over"
          subtitle={<><b>{dialog.cert.name}</b> · {dialog.cert.competitionName}</>}
          onCancel={() => setDialog(null)}
          onConfirm={async (r) => {
            const res = await markCertificateHandover({
              feastId,
              scope: "result",
              resultId: dialog.cert.resultId,
              isTeam: dialog.cert.isTeam,
              receiverName: r.receiverName,
              receiverPhone: r.receiverPhone,
            });
            if (res.error) return res.error;
            setDialog(null);
            await load();
            return null;
          }}
        />
      )}
      {dialog?.kind === "undo" && (
        <UndoDialog
          title={dialog.title}
          subtitle={dialog.subtitle}
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            const res = await undoCertificateHandover({ handoverId: dialog.handoverId, reason });
            if (res.error) return res.error;
            setDialog(null);
            await load();
            return null;
          }}
        />
      )}
    </HandoverPanel>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function CertificateHandoverPage() {
  return (
    <Suspense fallback={null}>
      <CertificateHandoverInner />
    </Suspense>
  );
}
