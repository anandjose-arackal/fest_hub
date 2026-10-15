// Which roles may call which server action — the backend half of role
// gating (admin/layout.tsx's redirects are only the UI half). Every
// exported action in src/actions/*.ts either calls requireRole(<key>)
// (src/lib/require-role.ts) with one of these keys or is listed in
// PUBLIC_ACTIONS below; src/lib/permissions.test.ts enforces that.
//
// Pure module with type-only imports, so `node --test` can load it directly.

import type { UserRole } from "@/types";

export type PermissionKey =
  /** Portal + admin registration of participants and teams (create/edit/delete). */
  | "registration.write"
  /** Attendance ticks and chance numbers (/admin/participation). */
  | "attendance.write"
  /** Live status board (/admin/competitions). */
  | "competitions.status"
  /** Draft scores — reading them before publish, and every scoring/publish write. */
  | "results.write"
  /** Shakhas, Meghalas, Dioceses, stages, org settings. */
  | "masterdata.write"
  /** Certificate designer + certificate rosters. */
  | "certificates.manage"
  /** Item "printed" status (feast_competition_prints). */
  | "printed.write"
  /** Trophy / certificate handover boards. */
  | "handover.read"
  /** Marking / undoing trophy and certificate handovers. */
  | "handover.write";

export const PERMISSIONS: Record<PermissionKey, readonly UserRole[]> = {
  // sa_admin registers and edits its own branch's entries from the public
  // Feast Portal; admin/me_admin do the same from /admin/participants.
  "registration.write": ["admin", "me_admin", "sa_admin"],
  "attendance.write": ["admin", "me_admin"],
  "competitions.status": ["admin"],
  "results.write": ["admin"],
  "masterdata.write": ["admin"],
  "certificates.manage": ["admin"],
  "printed.write": ["admin"],
  "handover.read": ["admin", "trophy_manager"],
  "handover.write": ["admin", "trophy_manager"],
};

export function isAllowed(role: UserRole | null | undefined, key: PermissionKey): boolean {
  return !!role && PERMISSIONS[key].includes(role);
}

// Exported functions in src/actions/*.ts that deliberately take no
// requireRole() guard:
// - public reads behind the Feast Portal, /results, /screen and the
//   standings pages (published data only — never drafts);
// - bootstrapFirstAdmin, which guards itself (only while profiles is empty);
// - server-only helpers exported for reuse between action files. They take
//   a SupabaseClient argument, which a browser can't serialize, so they
//   can't usefully be invoked as actions.
export const PUBLIC_ACTIONS: readonly string[] = [
  // activity.ts
  "getRecentActivity",
  // results.ts
  "getFeastStandings",
  "getOverallStandings",
  "getLeaderboard",
  "getOverallLeaderboard",
  "getMeghalaStandings",
  "getDioceseStandings",
  "getOverallMeghalaStandings",
  "getOverallDioceseStandings",
  "getStandingsGenderSplit",
  "getMeghalaLeaderboard",
  "getDioceseLeaderboard",
  "getOverallMeghalaLeaderboard",
  "getOverallDioceseLeaderboard",
  "getPublishedResults",
  "getLatestPublishedCompetition",
  "searchParticipantResults",
  "getGroupResults",
  "getScreenData",
  "getLatestResult",
  "getLatestPublishedResultsFeast",
  // team-results.ts
  "getPublishedTeamResults",
  // setup.ts
  "bootstrapFirstAdmin",
  // server-only helpers (SupabaseClient parameter)
  "isExternalFeast",
  "rebuildStandings",
];
