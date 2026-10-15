"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Lock, RotateCw, Trophy, Undo2 } from "lucide-react";
import { getTrophyBoard, markCertificateHandover, markTrophyHandover, undoTrophyHandover, type FeastHeader } from "@/actions/handover";
import { useOrgHierarchy } from "@/hooks/use-feast";
import { theme } from "@/components/feast/feast-shared";
import { Chip, Medal, ProgressBar } from "@/components/feast/feast-ui";
import { CATEGORY_LABELS } from "@/components/feast/feast-shared";
import { ShakhaTag, competitionCategoryLabel } from "@/components/feast/feast-shared-results";
import {
  ActionButton, BUTTON_CLASS, Card, GROUP_STYLE, GroupBadge, GroupLegend, HandoverPanel, MarkDialog, PageHeading,
  SearchField, SelectField, StampLine, UndoDialog, buttonStyle,
} from "@/components/admin/handover-ui";
import {
  GROUP_ORDER, filterItems, sortItems, trophyCounts, winnerCertificateGiven,
  type HandoverGroup, type Position, type TrophyItem, type WinnerEntry,
} from "@/lib/handover";

const POLL_MS = 30_000;
const PLACE = ["", "1st", "2nd", "3rd"];
const NOT_PRINTED_HINT = "This result isn't printed yet — trophies can be handed over once it's printed.";

type Dialog =
  | { kind: "mark"; item: TrophyItem; winner: WinnerEntry }
  | { kind: "undo"; item: TrophyItem; winner: WinnerEntry }
  | { kind: "cert"; item: TrophyItem; winner: WinnerEntry }
  | null;

function itemLabel(item: TrophyItem) {
  return competitionCategoryLabel({ cat: item.isTeam ? "Team" : "", competitionCategorySlug: item.categorySlug, gender: item.gender });
}

function WinnerIdentity({ w }: { w: WinnerEntry }) {
  return (
    <span className="flex min-w-0 flex-col gap-[3px]">
      <span className="fp-ml text-[15px] font-extrabold leading-tight" style={{ color: theme.text }}>{w.name}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold" style={{ color: theme.sub }}>
        {w.houseName && <span className="fp-ml">{w.houseName}</span>}
        <ShakhaTag shakha={w.shakhaName} meghalaName={w.meghalaName} />
      </span>
      {w.isTeam && w.members && (
        <span className="fp-ml text-[12px] font-semibold" style={{ color: theme.sub }}>
          <span className="font-extrabold">Members:</span> {w.members}
        </span>
      )}
    </span>
  );
}

/** Handover status + actions for one winner entry. */
function WinnerHandover({ item, w, onDialog }: { item: TrophyItem; w: WinnerEntry; onDialog: (d: Dialog) => void }) {
  const locked = !item.printedAt;
  if (!w.trophy) {
    return (
      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <ActionButton
          onClick={() => onDialog({ kind: "mark", item, winner: w })}
          disabled={locked}
          title={locked ? NOT_PRINTED_HINT : undefined}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />}
          Mark received
        </ActionButton>
        {locked && <span className="text-[11px] font-bold sm:text-right" style={{ color: theme.faint }}>Not printed</span>}
      </div>
    );
  }
  const certGiven = winnerCertificateGiven(w);
  const moved = w.trophy.position !== w.position;
  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold" style={{ background: "var(--fp-ok-bg)", color: "var(--fp-ok)" }}>
          ✓ Trophy given
        </span>
        <ActionButton tone="ghost" disabled={!w.trophy.id} onClick={() => onDialog({ kind: "undo", item, winner: w })} className="min-h-[32px] px-2.5">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </ActionButton>
      </div>
      <StampLine stamp={w.trophy} />
      {certGiven ? (
        !w.trophy.withCertificate && w.certificate && <StampLine stamp={w.certificate} verb="Certificate given" />
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="text-[11.5px] font-bold" style={{ color: "var(--fp-warn)" }}>Certificate still to give</span>
          <ActionButton tone="ghost" onClick={() => onDialog({ kind: "cert", item, winner: w })} className="min-h-[30px] px-2.5">
            Mark certificate
          </ActionButton>
        </div>
      )}
      {moved && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--fp-warn)" }}>
          <AlertTriangle className="h-3.5 w-3.5" /> Handed over as {PLACE[w.trophy.position] ?? w.trophy.position} — result has changed since
        </span>
      )}
    </div>
  );
}

function ItemCard({ item, group, onDialog }: { item: TrophyItem; group: HandoverGroup; onDialog: (d: Dialog) => void }) {
  const g = GROUP_STYLE[group];
  const label = itemLabel(item);
  const given = item.winners.filter((w) => w.trophy).length;
  return (
    <Card className="overflow-hidden" style={{ borderLeft: `5px solid ${g.accent}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <p className="fp-ml text-[16px] font-extrabold leading-tight" style={{ color: theme.text }}>{item.competitionName}</p>
          <p className="mt-0.5 text-[12px] font-bold" style={{ color: theme.sub }}>
            {label}
            {label && " · "}
            {given}/{item.winners.length} trophies given
          </p>
        </div>
        <GroupBadge group={group} small />
      </div>
      {group === "not_printed" && (
        <p className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold" style={{ background: "var(--fp-muted-bg)", color: "var(--fp-muted-fg)" }}>
          <Lock className="h-3.5 w-3.5 shrink-0" /> {NOT_PRINTED_HINT}
        </p>
      )}

      {/* Desktop: table */}
      <table className="hidden w-full text-left sm:table">
        <thead>
          <tr className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: theme.faint, borderTop: `1px solid ${theme.line}` }}>
            <th className="w-14 px-4 py-2">Place</th>
            <th className="px-2 py-2">Winner</th>
            <th className="px-4 py-2 text-right">Handover</th>
          </tr>
        </thead>
        <tbody>
          {item.winners.map((w) => (
            <tr key={w.resultId} style={{ borderTop: `1px solid ${theme.line}` }}>
              <td className="px-4 py-3 align-top"><Medal pos={w.position} size={30} /></td>
              <td className="px-2 py-3 align-top"><WinnerIdentity w={w} /></td>
              <td className="w-[46%] px-4 py-3 align-top"><WinnerHandover item={item} w={w} onDialog={onDialog} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked rows */}
      <ul className="sm:hidden">
        {item.winners.map((w) => (
          <li key={w.resultId} className="flex flex-col gap-2.5 px-4 py-3" style={{ borderTop: `1px solid ${theme.line}` }}>
            <div className="flex items-start gap-3">
              <Medal pos={w.position} size={30} />
              <WinnerIdentity w={w} />
            </div>
            <WinnerHandover item={item} w={w} onDialog={onDialog} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function TrophyHandoverPage({ params }: { params: Promise<{ feastId: string }> }) {
  const { feastId } = use(params);
  const hierarchy = useOrgHierarchy();
  const [feast, setFeast] = useState<FeastHeader | null>(null);
  const [items, setItems] = useState<TrophyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [meghalaId, setMeghalaId] = useState("");
  const [shakhaId, setShakhaId] = useState("");
  const [groupFilter, setGroupFilter] = useState<HandoverGroup | "">("");

  const load = useCallback(async () => {
    const res = await getTrophyBoard(feastId);
    if (res.error || !res.data) {
      setError(res.error ?? "Could not load results.");
      return;
    }
    setError(null);
    setFeast(res.data.feast);
    setItems(res.data.items);
  }, [feastId]);

  // Initial load, then poll while the tab is visible — several desks may be
  // handing over at once.
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

  // Optimistically reflects a write in local state (counts update at once),
  // then reloads for the real handover ids/names.
  const patchWinner = useCallback((resultId: string, patch: Partial<WinnerEntry>) => {
    setItems((prev) => prev?.map((it) => ({ ...it, winners: it.winners.map((w) => (w.resultId === resultId ? { ...w, ...patch } : w)) })) ?? prev);
  }, []);

  const counts = useMemo(() => trophyCounts(items ?? []), [items]);
  const filtered = useMemo(
    () => filterItems(items ?? [], { search, categorySlug: category || undefined, meghalaId: meghalaId || undefined, shakhaId: shakhaId || undefined }),
    [items, search, category, meghalaId, shakhaId]
  );
  const ordered = useMemo(() => sortItems(filtered), [filtered]);
  const groupCounts = useMemo(() => {
    const c: Record<HandoverGroup, number> = { ready: 0, not_printed: 0, done: 0 };
    for (const x of ordered) c[x.group]++;
    return c;
  }, [ordered]);
  const visible = groupFilter ? ordered.filter((x) => x.group === groupFilter) : ordered;

  const categoryOptions = useMemo(() => {
    const keys = new Set((items ?? []).filter((i) => i.winners.length > 0).map((i) => (i.isTeam ? "team" : i.categorySlug ?? "")));
    return [...keys].filter(Boolean).map((k) => ({ value: k, label: k === "team" ? "Team" : CATEGORY_LABELS[k] ?? k }));
  }, [items]);
  const showMeghala = hierarchy.hierarchyLevel !== "shakha" && hierarchy.meghalas.length > 0;
  const shakhaOptions = meghalaId ? hierarchy.shakhas.filter((s) => s.meghala_id === meghalaId) : hierarchy.shakhas;
  const filtersActive = !!(search || category || meghalaId || shakhaId || groupFilter);

  const pct = counts.total === 0 ? 0 : Math.round((counts.given / counts.total) * 100);

  return (
    <HandoverPanel>
      <Link href="/admin/trophies" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: "var(--fp-link)" }}>
        <ArrowLeft className="h-4 w-4" /> Trophy Dashboard
      </Link>
      <PageHeading
        icon={<Trophy className="h-5 w-5" />}
        title={feast?.name ?? "Trophy handover"}
        sub="Published results — mark each trophy as it's handed over"
        right={
          <div className="flex gap-2">
            <Link href={`/admin/trophies/certificates?feast=${feastId}`} className={BUTTON_CLASS} style={buttonStyle("ghost")}>
              Certificates
            </Link>
            <ActionButton tone="ghost" busy={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
              {!refreshing && <RotateCw className="h-4 w-4" />} Refresh
            </ActionButton>
          </div>
        }
      />

      {/* Counts */}
      <Card className="mb-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="fp-num text-[30px]" style={{ color: theme.text }}>{counts.given}</span>
            <span className="fp-num text-[17px]" style={{ color: theme.faint }}> / {counts.total}</span>
            <span className="ml-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: theme.sub }}>trophies given</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3] as Position[]).map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style={{ background: theme.surface3 }}>
                <Medal pos={p} size={20} />
                <span className="text-[12px] font-extrabold" style={{ color: theme.sub }}>{PLACE[p]}:</span>
                <span className="fp-num text-[15px]" style={{ color: theme.text }}>
                  {counts.byPosition[p].given}<span style={{ color: theme.faint }}>/{counts.byPosition[p].total}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar pct={pct} fill={pct === 100 ? "var(--fp-ok)" : "var(--fp-btn)"} height={8} animate={false} />
        </div>
      </Card>

      <Card className="mb-3 px-4 py-3">
        <GroupLegend />
      </Card>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <SearchField value={search} onChange={setSearch} placeholder="Search item or winner…" />
        </div>
        <SelectField label="Category" value={category} onChange={setCategory}>
          <option value="">All categories</option>
          {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
        {showMeghala && (
          <SelectField label="Mekhala" value={meghalaId} onChange={(v) => { setMeghalaId(v); setShakhaId(""); }}>
            <option value="">All Mekhalas</option>
            {hierarchy.meghalas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SelectField>
        )}
        <SelectField label="Shakha" value={shakhaId} onChange={setShakhaId} className={showMeghala ? "" : "col-span-1"}>
          <option value="">All Shakhas</option>
          {shakhaOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
      </div>
      <div className="fp-scroll -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip on={groupFilter === ""} onClick={() => setGroupFilter("")}>All · {ordered.length}</Chip>
        {GROUP_ORDER.map((g) => (
          <Chip key={g} on={groupFilter === g} onClick={() => setGroupFilter(g)} dot={GROUP_STYLE[g].accent}>
            {GROUP_STYLE[g].label} · {groupCounts[g]}
          </Chip>
        ))}
        {filtersActive && (
          <button
            type="button"
            className="shrink-0 px-2 text-[12.5px] font-extrabold"
            style={{ color: "var(--fp-link)" }}
            onClick={() => { setSearch(""); setCategory(""); setMeghalaId(""); setShakhaId(""); setGroupFilter(""); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-xl px-3 py-2 text-sm font-bold" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn)" }}>{error}</p>}

      {items === null && !error ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl" style={{ background: theme.surface3 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm font-semibold" style={{ color: theme.sub }}>
          {(items ?? []).length === 0 ? "No published results with 1st–3rd places yet." : "Nothing matches these filters."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(({ item, group }) => (
            <ItemCard key={item.feastCompetitionId} item={item} group={group} onDialog={setDialog} />
          ))}
        </div>
      )}

      {dialog?.kind === "mark" && (
        <MarkDialog
          title={`Trophy — ${PLACE[dialog.winner.position]} place`}
          subtitle={<><b>{dialog.winner.name}</b> · {dialog.item.competitionName}</>}
          certificateOption
          onCancel={() => setDialog(null)}
          onConfirm={async (r) => {
            const res = await markTrophyHandover({
              resultId: dialog.winner.resultId,
              isTeam: dialog.winner.isTeam,
              receiverName: r.receiverName,
              receiverPhone: r.receiverPhone,
              withCertificate: r.withCertificate,
            });
            if (res.error) return res.error;
            patchWinner(dialog.winner.resultId, {
              trophy: {
                id: "",
                handedOverAt: new Date().toISOString(),
                handedOverByName: null,
                receiverName: r.receiverName.trim() || null,
                receiverPhone: r.receiverPhone.trim() || null,
                position: dialog.winner.position,
                withCertificate: r.withCertificate,
              },
            });
            setDialog(null);
            load();
            return null;
          }}
        />
      )}
      {dialog?.kind === "cert" && (
        <MarkDialog
          title="Certificate handed over"
          subtitle={<><b>{dialog.winner.name}</b> · {dialog.item.competitionName}</>}
          onCancel={() => setDialog(null)}
          onConfirm={async (r) => {
            const res = await markCertificateHandover({
              feastId,
              scope: "result",
              resultId: dialog.winner.resultId,
              isTeam: dialog.winner.isTeam,
              receiverName: r.receiverName,
              receiverPhone: r.receiverPhone,
            });
            if (res.error) return res.error;
            patchWinner(dialog.winner.resultId, {
              certificate: { id: "", handedOverAt: new Date().toISOString(), handedOverByName: null, receiverName: r.receiverName.trim() || null, receiverPhone: r.receiverPhone.trim() || null },
            });
            setDialog(null);
            load();
            return null;
          }}
        />
      )}
      {dialog?.kind === "undo" && dialog.winner.trophy && (
        <UndoDialog
          title="Undo trophy handover?"
          subtitle={<><b>{dialog.winner.name}</b> · {dialog.item.competitionName} · {PLACE[dialog.winner.position]}</>}
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            const res = await undoTrophyHandover({ handoverId: dialog.winner.trophy!.id, reason });
            if (res.error) return res.error;
            patchWinner(dialog.winner.resultId, { trophy: null });
            setDialog(null);
            load();
            return null;
          }}
        />
      )}
    </HandoverPanel>
  );
}
