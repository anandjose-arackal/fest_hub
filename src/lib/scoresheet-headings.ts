// Column headings for printed judge score-sheets, keyed by competition name
// (optionally sub-keyed by category slug, with a "default" fallback). The
// source app backs this with an org-specific JSON file of hand-tuned
// headings per competition; this product ships a generic fallback since
// there's no fixed competition vocabulary across orgs. An org can extend
// this by editing HEADINGS below or wiring it to a DB table later.
const HEADINGS: Record<string, Record<string, string[]> | string[]> = {};

const GENERIC_HEADINGS = ["Content", "Presentation", "Language", "Overall"];

export function getScoreHeadings(competitionName: string, categorySlug: string): string[] {
  const entry = HEADINGS[competitionName];
  if (!entry) return GENERIC_HEADINGS;
  if (Array.isArray(entry)) return entry;
  return entry[categorySlug] ?? entry["default"] ?? GENERIC_HEADINGS;
}
