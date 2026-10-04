"use client";

// Shared result-row rendering used by both the Details drill-down and the
// Results screen — one implementation instead of the source app's two
// near-duplicate copies.

import { Award, Camera, Church, Loader2 } from "lucide-react";
import { getPublishedResults } from "@/actions/results";
import { getPublishedTeamResults } from "@/actions/team-results";
import { CATEGORY_LABELS, theme } from "./feast-shared";
import { GradeBadge, Medal, isMedalPos, toneStyle } from "./feast-ui";

export interface PublicResultRow {
  registrationId: string;
  name: string;
  houseName: string | null;
  shakha: string;
  meghalaName?: string | null;
  grade: "A" | "B" | "C" | null;
  position: number | null;
  totalPoints: number;
  isTeam?: boolean;
}

export function sortResults(rows: PublicResultRow[]): PublicResultRow[] {
  return [...rows].sort((a, b) => {
    const posA = a.position ?? 999;
    const posB = b.position ?? 999;
    if (posA !== posB) return posA - posB;
    const order = { A: 0, B: 1, C: 2 } as const;
    const gA = a.grade ? order[a.grade] : 3;
    const gB = b.grade ? order[b.grade] : 3;
    if (gA !== gB) return gA - gB;
    return a.name.localeCompare(b.name);
  });
}

export function ShakhaTag({ shakha, meghalaName, className }: { shakha: string; meghalaName?: string | null; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 font-extrabold ${className ?? ""}`} style={{ color: "var(--fp-link)" }}>
      <Church className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
      <span className="truncate">{shakha}{meghalaName ? ` · ${meghalaName}` : ""}</span>
    </span>
  );
}

export function ResultRow({ row, onGeneratePoster, delay }: { row: PublicResultRow; onGeneratePoster?: (row: PublicResultRow) => void; delay?: number }) {
  const pos = isMedalPos(row.position) ? row.position : null;
  // Team results don't carry a single winner photo/name to build a personal
  // poster from — the camera button only ever shows for individual entries.
  const showPosterButton = pos && !row.isTeam && onGeneratePoster;

  return (
    <li
      className="fp-fade-up flex items-center gap-3 rounded-[14px] px-3 py-[11px]"
      style={{ animationDelay: delay != null ? `${delay}s` : undefined, ...(pos === 1 ? toneStyle(1) : { background: theme.surface3, border: `1px solid ${theme.line}` }) }}
    >
      {pos ? (
        <Medal pos={pos} size={32} />
      ) : (
        <span className="fp-num w-8 shrink-0 text-center text-[15px]" style={{ color: theme.faint }} aria-label={row.position ? `Position ${row.position}` : "Graded"}>
          {row.position ?? "–"}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="fp-ml text-[15.5px] font-extrabold leading-tight" style={{ color: theme.text }}>{row.name}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold" style={{ color: theme.sub }}>
          {row.houseName && !row.isTeam && <span className="fp-ml">{row.houseName}</span>}
          <ShakhaTag shakha={row.shakha} meghalaName={row.meghalaName} />
        </span>
        {row.isTeam && row.houseName && (
          <span className="fp-ml text-[12px] font-semibold" style={{ color: theme.sub }}>
            <span className="font-extrabold">Members:</span> {row.houseName}
          </span>
        )}
      </span>
      {showPosterButton && (
        <button
          type="button"
          onClick={() => onGeneratePoster(row)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: theme.surface, border: `1px solid ${theme.line2}`, color: "var(--fp-link)" }}
          aria-label={`Make a winner poster for ${row.name}`}
        >
          <Camera className="h-[16px] w-[16px]" />
        </button>
      )}
      <GradeBadge grade={row.grade} size={34} />
    </li>
  );
}

export function ResultTable({ title, rows, color, onGeneratePoster }: { title: string; rows: PublicResultRow[]; color: string; onGeneratePoster?: (row: PublicResultRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="fp-cap mb-2 px-1 text-[10.5px]" style={{ color }}>{title}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {rows.map((r, i) => <ResultRow key={r.registrationId} row={r} onGeneratePoster={onGeneratePoster} delay={Math.min(i, 8) * 0.05} />)}
      </ol>
    </div>
  );
}

// ── One results implementation for every page that shows a competition's
// published results (Results page items and the fest page's accordion), so
// the two can't drift apart.

export function mapResultRow(r: Record<string, unknown>, isTeam: boolean): PublicResultRow {
  if (isTeam) {
    const teamReg = Array.isArray(r.team_registration) ? (r.team_registration as Record<string, unknown>[])[0] : (r.team_registration as Record<string, unknown> | undefined);
    const shakha = Array.isArray(teamReg?.shakha) ? (teamReg?.shakha as Record<string, unknown>[])[0] : (teamReg?.shakha as Record<string, unknown> | undefined);
    const shakhaMeghala = Array.isArray(shakha?.meghala) ? (shakha?.meghala as Record<string, unknown>[])[0] : (shakha?.meghala as Record<string, unknown> | undefined);
    const members = ((teamReg?.team_registration_members as Record<string, unknown>[] | undefined) ?? []).map((m) => {
      const p = Array.isArray(m.participant) ? (m.participant as Record<string, unknown>[])[0] : (m.participant as Record<string, unknown> | undefined);
      return (p?.name as string) ?? "";
    });
    return {
      registrationId: r.id as string,
      name: (teamReg?.team_name as string) ?? "Team",
      houseName: members.join(", "),
      shakha: (shakha?.name as string) ?? "—",
      meghalaName: (shakhaMeghala?.name as string | undefined) ?? null,
      grade: r.grade as PublicResultRow["grade"],
      position: r.position as number | null,
      totalPoints: r.total_points as number,
      isTeam: true,
    };
  }
  const partReg = Array.isArray(r.participant_registration) ? (r.participant_registration as Record<string, unknown>[])[0] : (r.participant_registration as Record<string, unknown> | undefined);
  const participant = Array.isArray(partReg?.participant) ? (partReg?.participant as Record<string, unknown>[])[0] : (partReg?.participant as Record<string, unknown> | undefined);
  const shakha = Array.isArray(participant?.shakha) ? (participant?.shakha as Record<string, unknown>[])[0] : (participant?.shakha as Record<string, unknown> | undefined);
  const shakhaMeghala = Array.isArray(shakha?.meghala) ? (shakha?.meghala as Record<string, unknown>[])[0] : (shakha?.meghala as Record<string, unknown> | undefined);
  return {
    registrationId: r.id as string,
    name: (participant?.name as string) ?? "—",
    houseName: (participant?.house_name as string) ?? null,
    shakha: (shakha?.name as string) ?? "—",
    meghalaName: (shakhaMeghala?.name as string | undefined) ?? null,
    grade: r.grade as PublicResultRow["grade"],
    position: r.position as number | null,
    totalPoints: r.total_points as number,
  };
}

export function genderLabel(g: string | null): "Girls" | "Boys" | null {
  return g === "girl" ? "Girls" : g === "boy" ? "Boys" : null;
}

export function competitionCategoryLabel(comp: { cat: string; competitionCategorySlug: string | null; gender: string | null }): string {
  return [CATEGORY_LABELS[comp.competitionCategorySlug ?? ""] ?? (comp.cat === "Team" ? "Team" : null), genderLabel(comp.gender)].filter(Boolean).join(" · ");
}

export async function loadCompetitionResults(comp: { id: string; cat: string }): Promise<PublicResultRow[]> {
  const isTeam = comp.cat === "Team";
  const rows = isTeam ? await getPublishedTeamResults(comp.id) : await getPublishedResults(comp.id);
  return sortResults(rows.map((r) => mapResultRow(r as unknown as Record<string, unknown>, isTeam)));
}

// Always-light "certificate" palette for the award card — it stays white in
// every theme, like the poster.
export const AWARD = { ink: "#1E1B4B", sub: "#5F5B8A", link: "#4B31B3", goldInk: "#9A6300", line: "#E4DEFA", soft: "#F4F1FD" };

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// The placed entries (1st–3rd) on the white award card. `header` and
// `footer` let the dashboard's "Latest result" add the item's title and a
// link; inside a results list the card only needs its "Final results" line.
export function AwardCard({ rows, accentColor, onPoster, header, footer }: {
  rows: PublicResultRow[];
  accentColor: string;
  onPoster?: (row: PublicResultRow) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-[24px]" style={{ background: "var(--fp-award-bg)", color: AWARD.ink, boxShadow: "var(--fp-award-shadow)" }}>
      <div aria-hidden="true" className="h-[5px]" style={{ background: `linear-gradient(90deg, ${accentColor}, #F5C542)` }} />
      {header ?? (
        <div className="flex items-center gap-1.5 px-4 pb-1 pt-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: AWARD.link }}>
          <Award className="h-[13px] w-[13px]" aria-hidden="true" />
          Final results
        </div>
      )}
      <ol className="m-0 flex list-none flex-col gap-[7px] px-2.5 pb-2.5 pt-2.5">
        {rows.map((w, i) => {
          const pos = isMedalPos(w.position) ? w.position : null;
          const first = pos === 1;
          return (
            <li
              key={w.registrationId}
              className="fp-fade-up relative flex items-center gap-3 overflow-hidden rounded-[18px] sm:gap-3.5"
              style={{
                animationDelay: `${0.1 + Math.min(i, 4) * 0.08}s`,
                padding: first ? "16px 12px" : "12px 12px 12px 14px",
                background: first ? "linear-gradient(120deg, #FFF6DA 0%, #FDE9A9 100%)" : AWARD.soft,
                border: `1px solid ${first ? "#F2D27A" : AWARD.line}`,
                boxShadow: first ? "0 10px 24px rgba(245,197,66,.28)" : undefined,
              }}
            >
              {first && (
                <span aria-hidden="true" className="fp-sheen pointer-events-none absolute inset-y-0 left-0 w-[30%]" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.7), rgba(255,255,255,0))", transform: "translateX(-160%) skewX(-18deg)" }} />
              )}
              {pos ? <Medal pos={pos} size={first ? 48 : 40} /> : <span className="w-10" />}
              <span className="relative flex min-w-0 flex-1 flex-col gap-[3px]">
                {first && <span className="fp-cap text-[9.5px] tracking-[0.2em]" style={{ color: AWARD.goldInk }}>Winner</span>}
                <span className="fp-ml font-extrabold leading-tight" style={{ fontSize: first ? 19 : 16.5, color: AWARD.ink }}>{w.name}</span>
                {w.houseName && !w.isTeam && <span className="fp-ml text-[13px] font-semibold" style={{ color: AWARD.sub }}>{w.houseName}</span>}
                {w.isTeam && w.houseName && <span className="fp-ml line-clamp-2 text-[12.5px] font-semibold" style={{ color: AWARD.sub }}>{w.houseName}</span>}
                <span className="mt-[3px] inline-flex min-w-0 items-center gap-1 text-[12.5px] font-extrabold" style={{ color: AWARD.link }}>
                  <Church className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{w.shakha}{w.meghalaName ? ` · ${w.meghalaName}` : ""}</span>
                </span>
              </span>
              {pos && !w.isTeam && onPoster && (
                <button
                  type="button"
                  onClick={() => onPoster(w)}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(255,255,255,.75)", border: `1px solid ${AWARD.line}`, color: AWARD.link }}
                  aria-label={`Make a winner poster for ${w.name}`}
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}
              <span className="relative flex flex-col items-center gap-[5px]">
                <GradeBadge grade={w.grade} size={first ? 44 : 36} variant="award" />
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "#625E8A" }}>Grade</span>
              </span>
            </li>
          );
        })}
      </ol>
      {footer}
    </article>
  );
}

// 1st–3rd on the white award card, then the graded entries in the regular
// list. Stacked on phones; side by side once the panel itself is wide
// (container query), so it behaves the same inside the full-width Results
// list and the fest page's half-width cards.
export function CompetitionResults({ rows, accentColor, onPoster }: {
  rows: PublicResultRow[] | undefined;
  accentColor: string;
  onPoster?: (row: PublicResultRow) => void;
}) {
  if (rows === undefined) {
    return (
      <div className="flex justify-center py-6" role="status" aria-label="Loading results">
        <Loader2 className="h-[18px] w-[18px] animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="m-0 rounded-[14px] py-5 text-center text-[13px] font-semibold" style={{ background: theme.surface3, color: theme.faint }}>No results recorded</p>;
  }
  const placed = rows.filter((r) => isMedalPos(r.position));
  const graded = rows.filter((r) => !isMedalPos(r.position) && r.grade !== null);
  return (
    <div className="@container">
      <div className={placed.length > 0 && graded.length > 0 ? "@2xl:grid @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] @2xl:items-start @2xl:gap-4" : undefined}>
        {placed.length > 0 && <AwardCard rows={placed} accentColor={accentColor} onPoster={onPoster} />}
        <div className={placed.length > 0 ? "mt-1 @2xl:mt-0" : undefined}>
          <ResultTable title="Graded entries" rows={graded} color={theme.sub} />
        </div>
      </div>
    </div>
  );
}
