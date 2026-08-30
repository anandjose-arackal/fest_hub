// Printed "subject" line (essay/poem/speech topic) for judge sheets, keyed
// by competition name (optionally by category slug). Same rationale as
// scoresheet-headings.ts: generic empty fallback for a multi-org product
// with no fixed competition vocabulary.
const SUBJECTS: Record<string, Record<string, string> | string> = {};

export function getCompetitionSubject(competitionName: string, categorySlug: string): string {
  const entry = SUBJECTS[competitionName];
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry[categorySlug] ?? entry["default"] ?? "";
}
