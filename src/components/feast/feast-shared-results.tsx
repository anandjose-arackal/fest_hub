"use client";

// Shared result-row rendering used by both the Details drill-down and the
// Results screen — one implementation instead of the source app's two
// near-duplicate copies.

import { gradeColor } from "./feast-shared";

export interface PublicResultRow {
  registrationId: string;
  name: string;
  houseName: string | null;
  shakha: string;
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

const MEDAL = { 1: { emoji: "🥇", disc: "#F5C542", bg: "#FFFBEB" }, 2: { emoji: "🥈", disc: "#9CA3AF", bg: "#F9FAFB" }, 3: { emoji: "🥉", disc: "#E0936A", bg: "#FFF7ED" } };

export function MedalBadge({ position }: { position: 1 | 2 | 3 }) {
  const m = MEDAL[position];
  return (
    <span
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[17px]"
      style={{ background: `linear-gradient(135deg, ${m.disc}, ${m.disc}88)`, boxShadow: `0 0 0 3px ${m.bg}, 0 4px 10px ${m.disc}66` }}
    >
      {m.emoji}
    </span>
  );
}

export function GradeChip({ grade }: { grade: "A" | "B" | "C" | null }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white"
      style={{ background: gradeColor(grade) }}
    >
      {grade ?? "-"}
    </span>
  );
}

export function ResultRow({ row }: { row: PublicResultRow }) {
  const isMedal = row.position != null && row.position <= 3;
  const medalBg = isMedal ? MEDAL[row.position as 1 | 2 | 3].bg : undefined;

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: medalBg }}>
      <div className="flex items-center gap-2.5">
        {isMedal ? <MedalBadge position={row.position as 1 | 2 | 3} /> : <span className="w-[34px] shrink-0 text-center text-xs text-neutral-400">{row.position ?? "—"}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold" style={{ color: "#1E1B4B", fontFamily: "var(--font-anek), sans-serif" }}>
            {row.name}
            {row.houseName && !row.isTeam && (
              <span className="ml-1 font-normal" style={{ color: "#DDD6FE" }}>
                {" | "}<span style={{ color: "#7C3AED" }}>{row.houseName}</span>
              </span>
            )}
          </p>
          <p className="truncate text-xs" style={{ color: "#6B6792" }}>⛪ {row.shakha}</p>
          {row.isTeam && row.houseName && <p className="mt-0.5 text-xs" style={{ color: "#6B46FF" }}>Members: {row.houseName}</p>}
        </div>
        <GradeChip grade={row.grade} />
      </div>
    </div>
  );
}

export function ResultTable({ title, rows, color }: { title: string; rows: PublicResultRow[]; color: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color }}>{title}</p>
      <div className="space-y-1.5">
        {rows.map((r) => <ResultRow key={r.registrationId} row={r} />)}
      </div>
    </div>
  );
}
