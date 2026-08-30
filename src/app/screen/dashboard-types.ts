export type DashboardSection =
  | { kind: "overall" }
  | { kind: "feast"; feastSlug: string; feastName: string }
  | { kind: "stages"; feastSlug: string; feastName: string };

export function sectionKey(s: DashboardSection): string {
  if (s.kind === "overall") return "overall";
  if (s.kind === "feast") return `feast:${s.feastSlug}`;
  return `stages:${s.feastSlug}`;
}

export function sectionLabel(s: DashboardSection): string {
  if (s.kind === "overall") return "Overall";
  if (s.kind === "feast") return s.feastName;
  return "Stage Board";
}
