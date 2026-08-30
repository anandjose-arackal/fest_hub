// Pure calculation functions — no DB, no side effects.
// Safe to import in both client and server components.

export type Grade = "A" | "B" | "C" | null;

export interface GradeResult {
  grade: Grade;
  gradePoints: number;
}

export interface PositionResult {
  position: number | null; // null = beyond 3rd
  positionPoints: number;
}

export interface CalcEntry {
  id: string; // participant_registration_id
  score: number;
}

export interface FullResult extends CalcEntry {
  grade: Grade;
  gradePoints: number;
  position: number | null;
  positionPoints: number;
  totalPoints: number;
}

// ── Point scales ───────────────────────────────────────────────────────────
// Individual competitions use the default (5/3/1) scale for both grade and
// position points. Group/team competitions use a bigger 10/5/3 scale —
// pass GROUP_GRADE_POINTS / GROUP_POSITION_POINTS explicitly for those.

export interface GradePointScale { A: number; B: number; C: number; }
export interface PositionPointScale { first: number; second: number; third: number; }

export const DEFAULT_GRADE_POINTS: GradePointScale = { A: 5, B: 3, C: 1 };
export const DEFAULT_POSITION_POINTS: PositionPointScale = { first: 5, second: 3, third: 1 };

export const GROUP_GRADE_POINTS: GradePointScale = { A: 5, B: 3, C: 1 };
export const GROUP_POSITION_POINTS: PositionPointScale = { first: 10, second: 5, third: 3 };

// ── Grade ──────────────────────────────────────────────────────────────────

export function calcGrade(score: number, maxScore: number, points: GradePointScale = DEFAULT_GRADE_POINTS): GradeResult {
  if (maxScore <= 0) return { grade: null, gradePoints: 0 };
  const pct = (score / maxScore) * 100;
  if (pct >= 60) return { grade: "A", gradePoints: points.A };
  if (pct >= 50) return { grade: "B", gradePoints: points.B };
  if (pct >= 40) return { grade: "C", gradePoints: points.C };
  return { grade: null, gradePoints: 0 };
}

// ── Position ───────────────────────────────────────────────────────────────
// Dense ranking: ties share the same rank, and the next distinct score always
// takes the very next position number — no position is ever skipped (1,1,2
// not 1,1,3).
// Only 1st, 2nd, 3rd earn position points (scale below).
// Beyond 3rd: position = null, positionPoints = 0.

export function calcPositions(
  entries: CalcEntry[],
  points: PositionPointScale = DEFAULT_POSITION_POINTS
): Map<string, PositionResult> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const result = new Map<string, PositionResult>();

  let currentPos = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].score < sorted[i - 1].score) {
      currentPos += 1; // dense ranking: advance by one, no gap after ties
    }
    const pos: number | null = currentPos <= 3 ? currentPos : null;
    const positionPoints = pos === 1 ? points.first : pos === 2 ? points.second : pos === 3 ? points.third : 0;
    result.set(sorted[i].id, { position: pos, positionPoints });
  }

  return result;
}

// ── Combined ───────────────────────────────────────────────────────────────

export function calcAllResults(
  entries: CalcEntry[],
  maxScore: number,
  gradeScale: GradePointScale = DEFAULT_GRADE_POINTS,
  positionScale: PositionPointScale = DEFAULT_POSITION_POINTS
): FullResult[] {
  const posMap = calcPositions(entries, positionScale);
  return entries.map((e) => {
    const { grade, gradePoints } = calcGrade(e.score, maxScore, gradeScale);
    const { position, positionPoints } = posMap.get(e.id) ?? {
      position: null,
      positionPoints: 0,
    };
    return {
      ...e,
      grade,
      gradePoints,
      position,
      positionPoints,
      totalPoints: gradePoints + positionPoints,
    };
  });
}

// ── Grade label helper ─────────────────────────────────────────────────────

export function gradeColor(grade: Grade): string {
  if (grade === "A") return "#16A34A";
  if (grade === "B") return "#D97706";
  if (grade === "C") return "#6B46FF";
  return "#9CA3AF";
}

export function positionLabel(pos: number | null): string {
  if (pos === 1) return "1st";
  if (pos === 2) return "2nd";
  if (pos === 3) return "3rd";
  return "—";
}
